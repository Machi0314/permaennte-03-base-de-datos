-- Esquema PostgreSQL para ejecutar en Supabase > SQL Editor.
-- Los IDs de usuarios y productos se ingresan desde la página web.

create table if not exists public.usuarios (
  id_usuario bigint primary key check (id_usuario between 10000000 and 99999999),
  nombre varchar(50) not null,
  apellidos varchar(50) not null default '',
  email varchar(50) not null unique,
  direccion varchar(50) not null
);

alter table public.usuarios
  add column if not exists apellidos varchar(50) not null default '';

create table if not exists public.productos (
  id_producto bigint primary key constraint productos_id_producto_8_digitos
    check (id_producto between 10000000 and 99999999),
  nombre varchar(50) not null,
  precio numeric(10, 2) not null check (precio > 0),
  stock integer not null check (stock >= 0)
);

alter table public.productos drop constraint if exists productos_stock_check;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'productos_stock_no_negativo'
      and conrelid = 'public.productos'::regclass
  ) then
    alter table public.productos
      add constraint productos_stock_no_negativo check (stock >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'productos_id_producto_8_digitos'
      and conrelid = 'public.productos'::regclass
  ) then
    alter table public.productos
      add constraint productos_id_producto_8_digitos
      check (id_producto between 10000000 and 99999999);
  end if;
end $$;

create table if not exists public.pedidos (
  id_pedido bigint generated always as identity primary key,
  fecha_pedido date not null default current_date,
  estado char(1) not null default 'P' check (estado in ('P', 'E', 'C')),
  total numeric(10, 2) not null default 0.00 check (total >= 0),
  id_usuario bigint not null references public.usuarios(id_usuario) on delete cascade
);

create table if not exists public.detalle_pedidos (
  id_detalle_pedido bigint generated always as identity primary key,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(10, 2) not null check (precio_unitario > 0),
  id_pedido bigint not null references public.pedidos(id_pedido) on delete cascade,
  id_producto bigint not null references public.productos(id_producto) on delete restrict
);

create index if not exists idx_pedidos_usuario on public.pedidos(id_usuario);
create index if not exists idx_detalle_pedido on public.detalle_pedidos(id_pedido);
create index if not exists idx_detalle_producto on public.detalle_pedidos(id_producto);

alter table public.usuarios enable row level security;
alter table public.productos enable row level security;

drop policy if exists "anon puede consultar usuarios" on public.usuarios;
create policy "anon puede consultar usuarios"
  on public.usuarios for select to anon using (true);
drop policy if exists "anon puede registrar usuarios" on public.usuarios;
create policy "anon puede registrar usuarios"
  on public.usuarios for insert to anon with check (true);
drop policy if exists "anon puede eliminar usuarios" on public.usuarios;
create policy "anon puede eliminar usuarios"
  on public.usuarios for delete to anon using (true);
drop policy if exists "anon puede actualizar usuarios" on public.usuarios;
create policy "anon puede actualizar usuarios"
  on public.usuarios for update to anon using (true) with check (true);
drop policy if exists "anon puede consultar productos" on public.productos;
create policy "anon puede consultar productos"
  on public.productos for select to anon using (true);
drop policy if exists "anon puede registrar productos" on public.productos;
create policy "anon puede registrar productos"
  on public.productos for insert to anon with check (true);
drop policy if exists "anon puede eliminar productos" on public.productos;
create policy "anon puede eliminar productos"
  on public.productos for delete to anon using (true);
drop policy if exists "anon puede actualizar productos" on public.productos;
create policy "anon puede actualizar productos"
  on public.productos for update to anon using (true) with check (true);

grant select, insert, update, delete on public.usuarios to anon;
grant select, insert, update, delete on public.productos to anon;

-- Permite consultar pedidos desde la página de cliente.
alter table public.pedidos enable row level security;
alter table public.detalle_pedidos enable row level security;
drop policy if exists "anon puede consultar pedidos" on public.pedidos;
create policy "anon puede consultar pedidos"
  on public.pedidos for select to anon using (true);
drop policy if exists "anon puede consultar detalle pedidos" on public.detalle_pedidos;
create policy "anon puede consultar detalle pedidos"
  on public.detalle_pedidos for select to anon using (true);
grant select on public.pedidos to anon;
grant select on public.detalle_pedidos to anon;

-- Crea cada pedido y sus líneas en una única transacción, y descuenta stock.
drop function if exists public.crear_pedido(varchar, jsonb);
create or replace function public.crear_pedido(p_id_usuario bigint, p_detalles jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id bigint;
  v_total numeric(10, 2) := 0;
  v_item jsonb;
  v_producto public.productos%rowtype;
  v_cantidad integer;
  v_id_producto bigint;
begin
  if not exists (select 1 from public.usuarios where id_usuario = p_id_usuario) then
    raise exception 'No se encontró el usuario.' using errcode = 'P0001';
  end if;
  if p_detalles is null or jsonb_typeof(p_detalles) is distinct from 'array' then
    raise exception 'El pedido debe incluir al menos un producto.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_detalles) = 0 then
    raise exception 'El pedido debe incluir al menos un producto.' using errcode = 'P0001';
  end if;

  insert into public.pedidos (id_usuario, total)
  values (p_id_usuario, 0)
  returning id_pedido into v_pedido_id;

  for v_item in select value from jsonb_array_elements(p_detalles)
  loop
    v_id_producto := (v_item->>'id_producto')::bigint;
    v_cantidad := (v_item->>'cantidad')::integer;
    if v_cantidad <= 0 then
      raise exception 'La cantidad debe ser mayor que cero.' using errcode = 'P0001';
    end if;

    select * into v_producto
    from public.productos
    where id_producto = v_id_producto
    for update;
    if not found then
      raise exception 'Uno de los productos ya no existe.' using errcode = 'P0001';
    end if;
    if v_producto.stock < v_cantidad then
      raise exception 'Stock insuficiente para el producto: %.', v_producto.nombre using errcode = 'P0001';
    end if;

    insert into public.detalle_pedidos (cantidad, precio_unitario, id_pedido, id_producto)
    values (v_cantidad, v_producto.precio, v_pedido_id, v_id_producto);
    update public.productos
    set stock = stock - v_cantidad
    where id_producto = v_id_producto;
    v_total := v_total + (v_producto.precio * v_cantidad);
  end loop;

  update public.pedidos set total = v_total where id_pedido = v_pedido_id;
  return v_pedido_id;
end;
$$;

grant execute on function public.crear_pedido(bigint, jsonb) to anon;

notify pgrst, 'reload schema';
