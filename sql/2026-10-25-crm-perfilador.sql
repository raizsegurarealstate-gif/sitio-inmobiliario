-- Migración ADITIVA (solo agrega; no borra ni cambia nada existente).
-- Para: CRM del panel, perfilador (comprar / construir / invertir) y aviso de privacidad.
-- Proyecto Supabase: raizsegurarealstate-gif's Project (kfeffcdrmsdwgrfmgkdk).

alter table clientes_inmobiliaria
  add column if not exists correo text,
  add column if not exists perfil jsonb,               -- respuestas del perfilador
  add column if not exists aviso_aceptado_en timestamptz; -- cuándo aceptó el aviso de privacidad

-- tipo_operacion (comprar | construir | invertir) ya existe como text sin restricción.

create index if not exists clientes_inmo_tipo_idx on clientes_inmobiliaria (tipo_operacion);
create index if not exists clientes_inmo_creado_idx on clientes_inmobiliaria (creado_en desc);
