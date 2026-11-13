require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { supabase } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const activeSessions = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

function getCookie(req, name) {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function getSignedInUserId(req) {
  const token = getCookie(req, 'tienda_session');
  return token ? activeSessions.get(token) : null;
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `tienda_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`);
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.get('/api/usuarios', asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre, apellidos, email, direccion')
    .order('apellidos')
    .order('nombre');
  if (error) throw error;
  res.json(data);
}));

app.get('/api/productos', asyncRoute(async (req, res) => {
  const { data, error } = await supabase
    .from('productos')
    .select('id_producto, nombre, precio, stock')
    .order('nombre');
  if (error) throw error;
  res.json(data);
}));

app.post('/api/sesion', asyncRoute(async (req, res) => {
  const { id_usuario, email } = req.body;
  if (!/^\d{8}$/.test(id_usuario || '') || !email?.trim()) {
    return res.status(400).json({ error: 'Ingresa tu ID de 8 cifras y el email registrado.' });
  }
  const { data, error } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre, apellidos, email')
    .eq('id_usuario', id_usuario)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
    return res.status(401).json({ error: 'El ID y el email no coinciden con un usuario registrado.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, data.id_usuario);
  setSessionCookie(res, token);
  res.json({ id_usuario: data.id_usuario, nombre: data.nombre, apellidos: data.apellidos });
}));

app.get('/api/sesion', asyncRoute(async (req, res) => {
  const idUsuario = getSignedInUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  const { data, error } = await supabase
    .from('usuarios')
    .select('id_usuario, nombre, apellidos')
    .eq('id_usuario', idUsuario)
    .maybeSingle();
  if (error) throw error;
  if (!data) return res.status(401).json({ error: 'La cuenta ya no está disponible.' });
  res.json(data);
}));

app.delete('/api/sesion', (req, res) => {
  const token = getCookie(req, 'tienda_session');
  if (token) activeSessions.delete(token);
  res.setHeader('Set-Cookie', 'tienda_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ message: 'Sesión cerrada.' });
});

app.get('/api/mis-pedidos', asyncRoute(async (req, res) => {
  const idUsuario = getSignedInUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Inicia sesión para ver tus pedidos.' });
  const { data: pedidos, error: pedidosError } = await supabase
    .from('pedidos')
    .select('id_pedido, fecha_pedido, estado, total')
    .eq('id_usuario', idUsuario)
    .order('fecha_pedido', { ascending: false });
  if (pedidosError) throw pedidosError;
  if (!pedidos.length) return res.json([]);

  const idsPedidos = pedidos.map((pedido) => pedido.id_pedido);
  const { data: detalles, error: detallesError } = await supabase
    .from('detalle_pedidos')
    .select('id_pedido, id_producto, cantidad, precio_unitario')
    .in('id_pedido', idsPedidos);
  if (detallesError) throw detallesError;
  const idsProductos = [...new Set(detalles.map((detalle) => detalle.id_producto))];
  const { data: productos, error: productosError } = idsProductos.length
    ? await supabase.from('productos').select('id_producto, nombre').in('id_producto', idsProductos)
    : { data: [], error: null };
  if (productosError) throw productosError;

  const productosPorId = new Map(productos.map((producto) => [String(producto.id_producto), producto.nombre]));
  const detallesPorPedido = new Map();
  for (const detalle of detalles) {
    const lineas = detallesPorPedido.get(String(detalle.id_pedido)) || [];
    lineas.push({ ...detalle, nombre_producto: productosPorId.get(String(detalle.id_producto)) || 'Producto' });
    detallesPorPedido.set(String(detalle.id_pedido), lineas);
  }
  res.json(pedidos.map((pedido) => ({ ...pedido, detalles: detallesPorPedido.get(String(pedido.id_pedido)) || [] })));
}));

app.post('/api/pedidos', asyncRoute(async (req, res) => {
  const idUsuario = getSignedInUserId(req);
  if (!idUsuario) return res.status(401).json({ error: 'Inicia sesión para realizar un pedido.' });
  const items = req.body.items;
  if (!Array.isArray(items) || items.length === 0 || items.some((item) =>
    !item || !/^\d{8}$/.test(String(item.id_producto || '')) || !Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) <= 0
  )) {
    return res.status(400).json({ error: 'Agrega al menos un producto y cantidades enteras mayores que cero.' });
  }

  const { data, error } = await supabase.rpc('crear_pedido', {
    p_id_usuario: idUsuario,
    p_detalles: items.map((item) => ({ id_producto: Number(item.id_producto), cantidad: Number(item.cantidad) }))
  });
  if (error) throw error;
  res.status(201).json({ message: 'Pedido realizado correctamente.', id_pedido: data });
}));

app.post('/api/usuarios', asyncRoute(async (req, res) => {
  const { id_usuario, nombre, apellidos, email, direccion } = req.body;
  if (!/^\d{8}$/.test(id_usuario || '') || !nombre?.trim() || nombre.trim().length > 50 ||
      !apellidos?.trim() || apellidos.trim().length > 50 ||
      !email?.trim() || email.trim().length > 50 || !direccion?.trim() || direccion.trim().length > 50) {
    return res.status(400).json({ error: 'El ID debe tener exactamente 8 cifras. Completa nombre, apellidos, email y dirección (máximo 50 caracteres cada uno).' });
  }

  const { error } = await supabase.from('usuarios').insert({
    id_usuario,
    nombre: nombre.trim(),
    apellidos: apellidos.trim(),
    email: email.trim(),
    direccion: direccion.trim()
  });
  if (error) throw error;
  res.status(201).json({ message: 'Usuario registrado correctamente.' });
}));

app.patch('/api/usuarios/:id', asyncRoute(async (req, res) => {
  if (!/^\d{8}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'El ID de usuario debe tener exactamente 8 cifras.' });
  }
  const { nombre, apellidos, email, direccion } = req.body;
  if (!nombre?.trim() || nombre.trim().length > 50 || !apellidos?.trim() || apellidos.trim().length > 50 ||
      !email?.trim() || email.trim().length > 50 || !direccion?.trim() || direccion.trim().length > 50) {
    return res.status(400).json({ error: 'Completa nombre, apellidos, email y dirección (máximo 50 caracteres cada uno).' });
  }
  const { error } = await supabase.from('usuarios').update({
    nombre: nombre.trim(),
    apellidos: apellidos.trim(),
    email: email.trim(),
    direccion: direccion.trim()
  }).eq('id_usuario', req.params.id);
  if (error) throw error;
  res.json({ message: 'Usuario actualizado correctamente.' });
}));

app.delete('/api/usuarios/:id', asyncRoute(async (req, res) => {
  if (!/^\d{8}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'El ID de usuario debe tener exactamente 8 cifras.' });
  }
  const { error } = await supabase.from('usuarios').delete().eq('id_usuario', req.params.id);
  if (error) throw error;
  res.json({ message: 'Usuario eliminado correctamente.' });
}));

app.post('/api/productos', asyncRoute(async (req, res) => {
  const { id_producto, nombre, precio, stock } = req.body;
  const precioNumero = Number(precio);
  const stockNumero = Number(stock);
  if (!/^\d{8}$/.test(id_producto || '') || !nombre?.trim() || nombre.trim().length > 50 ||
      !Number.isFinite(precioNumero) || precioNumero <= 0 ||
      !/^\d+$/.test(String(stock ?? '')) || stockNumero <= 0) {
    return res.status(400).json({ error: 'El ID del producto debe tener exactamente 8 cifras. Ingresa un nombre válido, precio mayor que 0 y stock entero mayor que 0.' });
  }

  const { error } = await supabase.from('productos').insert({
    id_producto: Number(id_producto),
    nombre: nombre.trim(),
    precio: precioNumero,
    stock: stockNumero
  });
  if (error) throw error;
  res.status(201).json({ message: 'Producto registrado correctamente.' });
}));

app.patch('/api/productos/:id', asyncRoute(async (req, res) => {
  if (!/^\d{8}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'El ID de producto debe tener exactamente 8 cifras.' });
  }
  const { nombre, precio, stock } = req.body;
  const precioNumero = Number(precio);
  const stockNumero = Number(stock);
  if (!nombre?.trim() || nombre.trim().length > 50 || !Number.isFinite(precioNumero) || precioNumero <= 0 ||
      !/^\d+$/.test(String(stock ?? '')) || stockNumero <= 0) {
    return res.status(400).json({ error: 'Ingresa un nombre válido, precio mayor que 0 y stock entero mayor que 0.' });
  }
  const { error } = await supabase.from('productos').update({
    nombre: nombre.trim(),
    precio: precioNumero,
    stock: stockNumero
  }).eq('id_producto', req.params.id);
  if (error) throw error;
  res.json({ message: 'Producto actualizado correctamente.' });
}));

app.delete('/api/productos/:id', asyncRoute(async (req, res) => {
  if (!/^\d{8}$/.test(req.params.id)) {
    return res.status(400).json({ error: 'El ID de producto debe tener exactamente 8 cifras.' });
  }
  const { error } = await supabase.from('productos').delete().eq('id_producto', req.params.id);
  if (error) throw error;
  res.json({ message: 'Producto eliminado correctamente.' });
}));

app.use((error, req, res, next) => {
  console.error('Error Supabase/servidor:', error.message);
  if (req.path.startsWith('/api/')) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un registro con ese ID o email.' });
    }
    if (error.code === '23503') {
      return res.status(409).json({ error: 'No se puede eliminar este producto porque está asociado a un pedido.' });
    }
    if (error.code === 'P0001') {
      return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: 'No se pudo completar la operación. Revisa la terminal y la conexión a Supabase.' });
  }
  next(error);
});

app.listen(port, () => console.log(`Aplicación disponible en http://localhost:${port}`));
