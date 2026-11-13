const alertBox = document.querySelector('#alertBox');
const customerAlert = document.querySelector('#customerAlert');
const usuariosRows = document.querySelector('#usuariosRows');
const productosRows = document.querySelector('#productosRows');
let catalogProducts = [];
let cartItems = [];
let currentCustomer = null;

function showAlert(message, type = 'success') {
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type === 'success' ? 'success' : 'danger'}`;
}

function showCustomerAlert(message, type = 'success') {
  customerAlert.textContent = message;
  customerAlert.className = `alert alert-${type === 'success' ? 'success' : 'danger'}`;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud.');
  return result;
}

function addCell(row, value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value ?? '';
  if (className) cell.className = className;
  row.append(cell);
}

function showEmptyRow(container, colspan, message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  cell.className = 'text-center text-secondary py-5';
  cell.textContent = message;
  row.append(cell);
  container.replaceChildren(row);
}

function makeDeleteButton(type, id, confirmation) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-outline-danger';
  button.textContent = 'Eliminar';
  button.dataset.deleteType = type;
  button.dataset.recordId = id;
  button.dataset.confirmation = confirmation;
  return button;
}

function makeEditButton(type, record) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-sm btn-outline-primary me-1';
  button.textContent = 'Editar';
  button.dataset.editType = type;
  button.dataset.record = JSON.stringify(record);
  return button;
}

function renderUsuarios(usuarios) {
  document.querySelector('#usuariosCount').textContent = usuarios.length;
  if (!usuarios.length) return showEmptyRow(usuariosRows, 6, 'No hay usuarios registrados.');

  const rows = usuarios.map((usuario) => {
    const row = document.createElement('tr');
    addCell(row, usuario.id_usuario);
    addCell(row, usuario.nombre, 'fw-semibold');
    addCell(row, usuario.apellidos);
    addCell(row, usuario.email);
    addCell(row, usuario.direccion);
    const action = document.createElement('td');
    action.append(makeEditButton('usuarios', usuario));
    action.append(makeDeleteButton('usuarios', usuario.id_usuario, '¿Eliminar este usuario? También se eliminarán sus pedidos asociados.'));
    row.append(action);
    return row;
  });
  usuariosRows.replaceChildren(...rows);
}

function renderProductos(productos) {
  catalogProducts = productos;
  document.querySelector('#productosCount').textContent = productos.length;
  renderProductChoices();
  if (!productos.length) return showEmptyRow(productosRows, 5, 'No hay productos registrados.');

  const rows = productos.map((producto) => {
    const row = document.createElement('tr');
    addCell(row, producto.id_producto);
    addCell(row, producto.nombre, 'fw-semibold');
    addCell(row, `S/ ${Number(producto.precio).toFixed(2)}`);
    addCell(row, producto.stock);
    const action = document.createElement('td');
    action.append(makeEditButton('productos', producto));
    action.append(makeDeleteButton('productos', producto.id_producto, '¿Eliminar este producto?'));
    row.append(action);
    return row;
  });
  productosRows.replaceChildren(...rows);
}

async function loadData() {
  const [usuarios, productos] = await Promise.all([
    requestJson('/api/usuarios'),
    requestJson('/api/productos')
  ]);
  renderUsuarios(usuarios);
  renderProductos(productos);
}

function renderProductChoices() {
  const select = document.querySelector('#cartProduct');
  const currentValue = select.value;
  const options = [new Option('Selecciona un producto', '')];
  for (const product of catalogProducts) {
    if (Number(product.stock) > 0) {
      options.push(new Option(`${product.nombre} · S/ ${Number(product.precio).toFixed(2)} · stock ${product.stock}`, product.id_producto));
    }
  }
  select.replaceChildren(...options);
  if (options.some((option) => option.value === currentValue)) select.value = currentValue;
  select.disabled = options.length === 1;
}

function renderCart() {
  const rows = cartItems.map((item) => {
    const row = document.createElement('tr');
    addCell(row, item.nombre);
    addCell(row, item.cantidad);
    addCell(row, `S/ ${(item.precio * item.cantidad).toFixed(2)}`);
    const action = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-sm btn-outline-secondary';
    remove.textContent = 'Quitar';
    remove.dataset.removeCartId = item.id_producto;
    action.append(remove);
    row.append(action);
    return row;
  });
  if (rows.length) {
    document.querySelector('#cartRows').replaceChildren(...rows);
  } else {
    showEmptyRow(document.querySelector('#cartRows'), 4, 'Aún no agregas productos.');
  }
  const total = cartItems.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  document.querySelector('#cartTotal').textContent = `S/ ${total.toFixed(2)}`;
  document.querySelector('#placeOrderButton').disabled = cartItems.length === 0;
}

function displayCustomer(customer) {
  currentCustomer = customer;
  document.querySelector('#customerLoginCard').classList.toggle('d-none', Boolean(customer));
  document.querySelector('#customerAccount').classList.toggle('d-none', !customer);
  if (customer) {
    document.querySelector('#customerName').textContent = `${customer.nombre} ${customer.apellidos}`;
    loadMyOrders().catch((error) => showCustomerAlert(error.message, 'error'));
  }
}

async function loadMyOrders() {
  const orders = await requestJson('/api/mis-pedidos');
  const container = document.querySelector('#ordersList');
  if (!orders.length) {
    const empty = document.createElement('p');
    empty.className = 'text-secondary';
    empty.textContent = 'Todavía no tienes pedidos.';
    container.replaceChildren(empty);
    return;
  }
  const cards = orders.map((order) => {
    const card = document.createElement('article');
    card.className = 'border rounded-3 p-3 mb-3';
    const heading = document.createElement('div');
    heading.className = 'd-flex justify-content-between gap-3';
    const title = document.createElement('strong');
    title.textContent = `Pedido #${order.id_pedido}`;
    const date = document.createElement('span');
    date.className = 'text-secondary small';
    date.textContent = String(order.fecha_pedido).slice(0, 10);
    heading.append(title, date);
    const items = document.createElement('ul');
    items.className = 'my-2 ps-3';
    for (const detail of order.detalles) {
      const line = document.createElement('li');
      line.textContent = `${detail.nombre_producto} × ${detail.cantidad} · S/ ${(Number(detail.precio_unitario) * Number(detail.cantidad)).toFixed(2)}`;
      items.append(line);
    }
    const total = document.createElement('div');
    total.className = 'fw-bold text-end';
    total.textContent = `Total: S/ ${Number(order.total).toFixed(2)}`;
    card.append(heading, items, total);
    return card;
  });
  container.replaceChildren(...cards);
}

async function submitForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await requestJson(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    form.reset();
    await loadData();
    showAlert(result.message);
  } catch (error) {
    showAlert(error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

document.querySelector('#usuarioForm').addEventListener('submit', submitForm);
document.querySelector('#productoForm').addEventListener('submit', submitForm);

document.querySelector('#customerLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const customer = await requestJson(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    form.reset();
    document.querySelector('#customerAlert').classList.add('d-none');
    displayCustomer(customer);
  } catch (error) {
    showCustomerAlert(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#cartAddForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const id = document.querySelector('#cartProduct').value;
  const quantity = Number(document.querySelector('#cartQuantity').value);
  const product = catalogProducts.find((candidate) => String(candidate.id_producto) === id);
  if (!product || !Number.isInteger(quantity) || quantity < 1) return;
  const existing = cartItems.find((item) => String(item.id_producto) === id);
  const newQuantity = quantity + (existing?.cantidad || 0);
  if (newQuantity > Number(product.stock)) {
    showCustomerAlert(`Solo hay ${product.stock} unidades disponibles de ${product.nombre}.`, 'error');
    return;
  }
  if (existing) existing.cantidad = newQuantity;
  else cartItems.push({ id_producto: product.id_producto, nombre: product.nombre, precio: Number(product.precio), cantidad: quantity });
  showCustomerAlert(`${product.nombre} se agregó al pedido.`);
  renderCart();
});

document.querySelector('#cartRows').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove-cart-id]');
  if (!button) return;
  cartItems = cartItems.filter((item) => String(item.id_producto) !== button.dataset.removeCartId);
  renderCart();
});

document.querySelector('#placeOrderButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await requestJson('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cartItems.map(({ id_producto, cantidad }) => ({ id_producto, cantidad })) })
    });
    cartItems = [];
    renderCart();
    await Promise.all([loadData(), loadMyOrders()]);
    showCustomerAlert(`${result.message} Número de pedido: ${result.id_pedido}.`);
  } catch (error) {
    showCustomerAlert(error.message, 'error');
  } finally {
    button.disabled = cartItems.length === 0;
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try {
    await requestJson('/api/sesion', { method: 'DELETE' });
  } finally {
    cartItems = [];
    renderCart();
    displayCustomer(null);
  }
});

const adminPanel = document.querySelector('#adminPanel');
const customerPanel = document.querySelector('#customerPanel');
const adminModeButton = document.querySelector('#adminModeButton');
const customerModeButton = document.querySelector('#customerModeButton');

function setMode(mode) {
  const isAdmin = mode === 'admin';
  adminPanel.hidden = !isAdmin;
  customerPanel.hidden = isAdmin;
  adminModeButton.classList.toggle('active', isAdmin);
  customerModeButton.classList.toggle('active', !isAdmin);
}

adminModeButton.addEventListener('click', () => setMode('admin'));
customerModeButton.addEventListener('click', () => setMode('customer'));

requestJson('/api/sesion').then(displayCustomer).catch(() => {});
renderCart();

const editForm = document.querySelector('#editForm');
const editModal = new bootstrap.Modal(document.querySelector('#editModal'));
let editingType = null;
let editingId = null;

function openEditModal(type, record) {
  editingType = type;
  editingId = type === 'usuarios' ? record.id_usuario : record.id_producto;
  editForm.reset();
  document.querySelector('#editModalTitle').textContent = type === 'usuarios' ? 'Editar usuario' : 'Editar producto';
  document.querySelector('#edit_user_id').value = type === 'usuarios' ? record.id_usuario : '';
  document.querySelector('#edit_product_id').value = type === 'productos' ? record.id_producto : '';
  document.querySelector('#edit_nombre').value = record.nombre;

  if (type === 'usuarios') {
    document.querySelector('#edit_apellidos').value = record.apellidos;
    document.querySelector('#edit_email').value = record.email;
    document.querySelector('#edit_direccion').value = record.direccion;
  } else {
    document.querySelector('#edit_precio').value = record.precio;
    document.querySelector('#edit_stock').value = record.stock;
  }

  document.querySelectorAll('[data-edit-user], [data-edit-product]').forEach((group) => {
    const isActive = type === 'usuarios' ? group.hasAttribute('data-edit-user') : group.hasAttribute('data-edit-product');
    group.hidden = !isActive;
    const field = group.querySelector('input');
    field.disabled = !isActive;
  });
  editModal.show();
}

editForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = editForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await requestJson(`/api/${editingType}/${encodeURIComponent(editingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(editForm)))
    });
    editModal.hide();
    await loadData();
    showAlert(result.message);
  } catch (error) {
    showAlert(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

document.addEventListener('click', async (event) => {
  const editButton = event.target.closest('button[data-edit-type]');
  if (editButton) {
    openEditModal(editButton.dataset.editType, JSON.parse(editButton.dataset.record));
    return;
  }
  const button = event.target.closest('button[data-delete-type]');
  if (!button || !window.confirm(button.dataset.confirmation)) return;

  button.disabled = true;
  try {
    const result = await requestJson(`/api/${button.dataset.deleteType}/${encodeURIComponent(button.dataset.recordId)}`, { method: 'DELETE' });
    await loadData();
    showAlert(result.message);
  } catch (error) {
    showAlert(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

loadData().catch((error) => showAlert(error.message, 'error'));
