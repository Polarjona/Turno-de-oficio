-- 0001_init.sql · esquema mínimo del cuadrante de guardias
-- El modelo completo está en entregables/BBDD/Modelo_ER_DDL_TOF-2026-012.pdf;
-- esta migración cubre las tres primeras entidades para arrancar el entorno.

begin;

create table if not exists especialidad (
  id     uuid primary key,
  codigo text not null unique,
  nombre text not null
);

create table if not exists letrado (
  id        uuid primary key,
  colegiado text not null unique,
  nombre    text not null,
  email     text,
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

create table if not exists guardia (
  id         uuid primary key,
  fecha      date not null,
  tipo       text not null check (tipo in ('ordinaria', 'refuerzo', 'festivo')),
  estado     text not null check (estado in ('borrador', 'propuesta', 'publicada', 'cerrada', 'anulada')),
  letrado_id uuid references letrado (id),
  creada_en  timestamptz not null default now(),
  unique (fecha, tipo)
);

create index if not exists guardia_fecha_idx on guardia (fecha);

commit;
