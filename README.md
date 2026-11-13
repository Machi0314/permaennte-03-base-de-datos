# Tienda Virtual

Aplicación con `public/index.html`, JavaScript externo en `public/app.js`, Express y Supabase.

## Configuración

1. En Supabase abre **SQL Editor** y ejecuta el contenido de `supabase_setup.sql` para crear las tablas y políticas que usa la aplicación.
2. Copia `.env.example` como `.env`. El archivo de ejemplo ya incluye el proyecto y la clave pública proporcionados; mantenlos como variables de entorno y no los incluyas en código cliente.
3. En una terminal, desde esta carpeta, ejecuta `npm install` y luego `npm start`. Visita `http://localhost:3000`.

La aplicación usa `usuarios(id_usuario, nombre, apellidos, email, direccion)` y `productos(id_producto, nombre, precio, stock)`, además de `pedidos` y `detalle_pedidos` según los modelos compartidos. Los IDs de usuario y producto se ingresan manualmente en los formularios y deben tener exactamente 8 cifras. Precio y stock ingresados deben ser mayores que cero; el stock puede llegar a cero cuando los pedidos descuentan las existencias. El administrador puede editar y eliminar usuarios y productos. El cliente puede identificarse con su ID y email, armar un pedido con varios productos y ver su historial. La función SQL `crear_pedido` registra el pedido y sus detalles de forma atómica y descuenta stock.

El acceso de cliente por ID y email es una verificación de demostración, no autenticación segura; tampoco hay autenticación configurada para el administrador. Las políticas `anon` habilitan operaciones desde la aplicación sin cuentas seguras. Antes de publicar el sitio, integra Supabase Auth y limita las políticas RLS a usuarios autorizados.

La página principal es `public/index.html`; Express la sirve en `http://localhost:3000`. Si las tablas ya existen, confirma que tengan esos nombres de columna y habilita políticas RLS equivalentes para lectura, inserción y eliminación.
