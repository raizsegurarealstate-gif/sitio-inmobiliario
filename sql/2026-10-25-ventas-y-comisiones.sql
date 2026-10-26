-- Aplicada el 2026-10-25 al proyecto kfeffcdrmsdwgrfmgkdk (migración aditiva: crea la tabla `ventas`).
-- Seguimiento de ventas: directa o en colaboración, y comisión compartida.
create table if not exists ventas (
  id                          uuid primary key default gen_random_uuid(),
  cliente_id                  uuid not null references clientes_inmobiliaria(id),
  propiedad_id                uuid references propiedades(id),
  cita_id                     uuid references citas(id),
  tipo_operacion              text not null default 'venta'
    check (tipo_operacion in ('venta','renta','construccion','inversion')),
  estado                      text not null default 'en_proceso'
    check (estado in ('en_proceso','cerrada','cancelada')),
  fecha_cierre                date,
  monto_operacion             numeric,
  tipo_venta                  text not null default 'directa'
    check (tipo_venta in ('directa','colaboracion')),
  asesor_colaborador_id       uuid references asesores(id),
  colaborador_nombre          text,
  comision_porcentaje         numeric,
  comision_total_monto        numeric,
  porcentaje_colaborador      numeric,
  comision_colaborador_monto  numeric,
  comision_ale_monto          numeric,
  notas                       text,
  creado_en                   timestamptz not null default now(),
  actualizado_en              timestamptz not null default now(),
  check (tipo_venta = 'directa' or asesor_colaborador_id is not null or colaborador_nombre is not null)
);
create index if not exists ventas_cliente_idx on ventas (cliente_id);
create index if not exists ventas_estado_idx on ventas (estado, fecha_cierre desc);
alter table ventas enable row level security;
