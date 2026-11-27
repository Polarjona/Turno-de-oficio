-- 0001_init.sql · esquema físico del Turno de Oficio
--
-- Fuente: entregables/BBDD/Modelo_ER_DDL_TOF-2026-012.pdf, §3 (DDL borrador),
-- más la tabla PARAMETRO que el propio documento añade aparte de las 14 entidades.
-- Se aplica sola al crear el volumen (el directorio va montado en
-- /docker-entrypoint-initdb.d) y también desde scripts/dev-up.sh.
--
-- Tres diferencias conscientes con el PDF, porque aquí manda el contrato
-- (entregables/Backend/openapi.yaml) y el código ya lo implementa así:
--   1. guardia.origen usa el vocabulario del contrato:
--      planificacion | manual | urgente | refuerzo | cobertura_hueco.
--   2. usuario.rol usa los cuatro roles del contrato y de Keycloak:
--      letrado | coordinacion | junta | admin.
--   3. cuadrante_id puede ser nulo mientras la guardia está en 'planificada':
--      POST /guardias crea la franja antes de asociarla a un cuadrante.
--
-- Además de las columnas de cada entidad, todas las tablas llevan los campos
-- comunes del modelo: creado_en, creado_por, modificado_en y version (el ETag
-- de la API sale de version).
--
-- Idempotente: se puede volver a ejecutar sobre el mismo volumen.

begin;

-- btree_gist hace falta para el EXCLUDE por solapamiento (RN-04).
create extension if not exists btree_gist;

-- Roles del modelo: uno para migrar y otro para la aplicación.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'migration_owner') then
    create role migration_owner nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_role') then
    create role app_role nologin;
  end if;
exception
  when insufficient_privilege then
    raise notice 'Sin permiso para crear roles; se omiten (solo prototipo).';
end $$;

-- El esquema anterior de esta migración era un andamio de tres tablas
-- (especialidad, letrado, guardia con columna `tipo`). Si existe, se retira:
-- nada de lo que sigue puede convivir con él.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'guardia' and column_name = 'tipo'
  ) then
    drop table guardia cascade;
  end if;
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'letrado'
  ) then
    drop table letrado cascade;
  end if;
end $$;

-- ─── Identidad ──────────────────────────────────────────────────────────────

create table if not exists usuario (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  apellidos     text not null,
  email         text not null unique,
  password_hash text not null,
  rol           text not null check (rol in ('letrado', 'coordinacion', 'junta', 'admin')),
  estado        text not null default 'activo' check (estado in ('activo', 'bloqueado', 'inactivo')),
  fecha_alta    date not null default current_date,
  ultimo_acceso timestamptz,
  creado_en     timestamptz not null default now(),
  creado_por    uuid,
  modificado_en timestamptz not null default now(),
  version       int not null default 1 check (version > 0)
);

create table if not exists abogado (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null unique references usuario (id) on delete restrict,
  num_colegiado   text not null unique,
  telefono_guardia text,
  orden_turno     int not null default 0,
  fecha_alta_turno date not null default current_date,
  activo          boolean not null default true,
  zona            text,
  creado_en       timestamptz not null default now(),
  creado_por      uuid,
  modificado_en   timestamptz not null default now(),
  version         int not null default 1 check (version > 0)
);

create table if not exists especialidad (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique,
  nombre             text not null,
  descripcion        text,
  requiere_formacion boolean not null default false,
  activa             boolean not null default true,
  creado_en          timestamptz not null default now(),
  creado_por         uuid,
  modificado_en      timestamptz not null default now(),
  version            int not null default 1 check (version > 0)
);

-- Si el volumen viene del andamio, `especialidad` existe sin estas columnas.
alter table especialidad add column if not exists descripcion text;
alter table especialidad add column if not exists requiere_formacion boolean not null default false;
alter table especialidad add column if not exists activa boolean not null default true;
alter table especialidad add column if not exists creado_en timestamptz not null default now();
alter table especialidad add column if not exists creado_por uuid;
alter table especialidad add column if not exists modificado_en timestamptz not null default now();
alter table especialidad add column if not exists version int not null default 1;

create table if not exists habilitacion (
  id                 uuid primary key default gen_random_uuid(),
  abogado_id         uuid not null references abogado (id) on delete restrict,
  especialidad_id    uuid not null references especialidad (id) on delete restrict,
  fecha_habilitacion date not null default current_date,
  caducidad          date,
  estado             text not null default 'vigente'
                     check (estado in ('vigente', 'caducada', 'suspendida', 'pendiente')),
  soporte            text,
  creado_en          timestamptz not null default now(),
  creado_por         uuid,
  modificado_en      timestamptz not null default now(),
  version            int not null default 1 check (version > 0),
  check (caducidad is null or caducidad >= fecha_habilitacion)
);

-- Una sola acreditación vigente por abogado y materia.
create unique index if not exists ux_habilitacion_vigente
  on habilitacion (abogado_id, especialidad_id)
  where estado = 'vigente';

-- ─── Planificación ──────────────────────────────────────────────────────────

create table if not exists tipo_guardia (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,
  especialidad_id     uuid not null references especialidad (id) on delete restrict,
  modalidad           text not null check (modalidad in ('localizada', 'presencial', 'telefonica')),
  hora_inicio         time not null,
  hora_fin            time not null,
  cruza_medianoche    boolean not null default false,
  letrados_previstos  int not null default 1 check (letrados_previstos > 0),
  peso_computo        numeric(4, 2) not null default 1.00 check (peso_computo >= 0),
  descanso_posterior_h int not null default 0 check (descanso_posterior_h >= 0),
  es_detenido         boolean not null default false,
  creado_en           timestamptz not null default now(),
  creado_por          uuid,
  modificado_en       timestamptz not null default now(),
  version             int not null default 1 check (version > 0),
  -- Permite la FK compuesta desde guardia: la materia no puede divergir.
  unique (id, especialidad_id)
);

create table if not exists cuadrante (
  id                uuid primary key default gen_random_uuid(),
  anio              int not null,
  periodo           text not null,
  version           int not null default 1 check (version > 0),
  estado            text not null default 'borrador'
                    check (estado in ('borrador', 'en_alegaciones', 'publicado', 'congelado', 'cerrado')),
  fecha_publicacion timestamptz,
  publicado_por     uuid references usuario (id),
  motivo_cambio     text,
  creado_en         timestamptz not null default now(),
  creado_por        uuid,
  modificado_en     timestamptz not null default now(),
  unique (anio, periodo, version)
);

-- ─── La guardia (centro del modelo) ─────────────────────────────────────────

create table if not exists guardia (
  id               uuid primary key default gen_random_uuid(),
  cuadrante_id     uuid references cuadrante (id) on delete restrict,
  tipo_guardia_id  uuid not null,
  especialidad_id  uuid not null,
  abogado_id       uuid references abogado (id) on delete restrict,
  fecha            date not null,
  hora_inicio      time not null,
  hora_fin         time not null,
  cruza_medianoche boolean not null default false,
  -- Derivadas de la propia franja: no se insertan ni pueden quedar incoherentes.
  inicio_en        timestamptz generated always as
                     ((fecha + hora_inicio) at time zone 'Europe/Madrid') stored,
  fin_en           timestamptz generated always as
                     (((fecha + hora_fin)
                       + case when cruza_medianoche then interval '1 day' else interval '0' end)
                       at time zone 'Europe/Madrid') stored,
  estado           text not null default 'planificada'
                   check (estado in ('planificada', 'propuesta', 'publicada', 'confirmada',
                                     'en_revision', 'descubierta', 'en_curso', 'realizada',
                                     'validada', 'anulada')),
  origen           text not null default 'planificacion'
                   check (origen in ('planificacion', 'manual', 'urgente', 'refuerzo', 'cobertura_hueco')),
  motivo_asignacion text,
  es_detenido      boolean not null default false,
  creado_en        timestamptz not null default now(),
  creado_por       uuid,
  modificado_en    timestamptz not null default now(),
  version          int not null default 1 check (version > 0),
  foreign key (tipo_guardia_id, especialidad_id)
    references tipo_guardia (id, especialidad_id) on delete restrict,
  check (fin_en > inicio_en),
  -- RN-39: lo urgente va fuera de cuadrante y todo lo demás dentro; una guardia
  -- recién planificada aún no tiene cuadrante asignado.
  check (
    (origen = 'urgente' and cuadrante_id is null)
    or (origen <> 'urgente' and (cuadrante_id is not null or estado = 'planificada'))
  )
);

-- RN-04: un abogado no puede tener dos guardias solapadas. Lo impone el motor.
alter table guardia drop constraint if exists ux_guardia_solape;
alter table guardia add constraint ux_guardia_solape exclude using gist (
  abogado_id with =,
  tstzrange(inicio_en, fin_en) with &&
) where (estado <> 'anulada' and abogado_id is not null);

create index if not exists ix_guardia_fecha_materia on guardia (fecha, especialidad_id, estado);
create index if not exists ix_guardia_abogado_fecha on guardia (abogado_id, fecha);

-- ─── Movilidad y control ────────────────────────────────────────────────────

create table if not exists disponibilidad (
  id            uuid primary key default gen_random_uuid(),
  abogado_id    uuid not null references abogado (id) on delete restrict,
  fecha_inicio  date not null,
  fecha_fin     date not null,
  tipo          text not null check (tipo in ('vacaciones', 'baja', 'permiso', 'formacion', 'otros')),
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'validada', 'rechazada', 'anulada')),
  observaciones text,
  validada_por  uuid references usuario (id),
  creado_en     timestamptz not null default now(),
  creado_por    uuid,
  modificado_en timestamptz not null default now(),
  version       int not null default 1 check (version > 0),
  check (fecha_fin >= fecha_inicio)
);

create index if not exists ix_disponibilidad_abogado_rango
  on disponibilidad (abogado_id, fecha_inicio, fecha_fin);

create table if not exists solicitud (
  id                uuid primary key default gen_random_uuid(),
  guardia_id        uuid not null references guardia (id) on delete restrict,
  tipo              text not null check (tipo in ('excusa', 'permuta', 'sustitucion')),
  solicitante_id    uuid not null references abogado (id) on delete restrict,
  sustituto_id      uuid references abogado (id) on delete restrict,
  -- Vocabulario único y general: sin diagnóstico (RGPD art. 9 / RN-23).
  motivo            text not null
                    check (motivo in ('enfermedad', 'asunto_propio', 'conciliacion', 'fuerza_mayor', 'otro')),
  detalle           text,
  estado            text not null default 'comunicada'
                    check (estado in ('comunicada', 'en_revision', 'oferta_enviada',
                                      'pendiente_validacion', 'estimada', 'desestimada')),
  extemporanea      boolean not null default false,
  sobrevenida       boolean not null default false,
  fecha_solicitud   timestamptz not null default now(),
  fecha_resolucion  timestamptz,
  resuelta_por      uuid references usuario (id),
  motivo_resolucion text,
  creado_en         timestamptz not null default now(),
  creado_por        uuid,
  modificado_en     timestamptz not null default now(),
  version           int not null default 1 check (version > 0)
);

-- Solo una solicitud abierta por guardia.
create unique index if not exists ux_solicitud_activa
  on solicitud (guardia_id)
  where estado in ('comunicada', 'en_revision', 'oferta_enviada', 'pendiente_validacion');

create table if not exists incidencia (
  id             uuid primary key default gen_random_uuid(),
  guardia_id     uuid not null references guardia (id) on delete restrict,
  categoria      text not null check (categoria in ('localizacion', 'cobertura', 'escalado', 'material', 'otro')),
  gravedad       text not null check (gravedad in ('baja', 'media', 'alta')),
  descripcion    text not null,
  abierta_por    uuid not null references usuario (id),
  fecha_apertura timestamptz not null default now(),
  fecha_cierre   timestamptz,
  resolucion     text,
  creado_en      timestamptz not null default now(),
  creado_por     uuid,
  modificado_en  timestamptz not null default now(),
  version        int not null default 1 check (version > 0)
);

create table if not exists parte_guardia (
  id             uuid primary key default gen_random_uuid(),
  guardia_id     uuid not null unique references guardia (id) on delete restrict,
  realizada      boolean not null default false,
  hora_entrada   time,
  hora_salida    time,
  actuaciones    text,
  observaciones  text,
  validado       boolean not null default false,
  validado_por   uuid references usuario (id),
  creado_en      timestamptz not null default now(),
  creado_por     uuid,
  modificado_en  timestamptz not null default now(),
  version        int not null default 1 check (version > 0),
  -- RN-18: no se valida un parte sin horas ni actuaciones.
  check (not validado or (hora_entrada is not null and hora_salida is not null and actuaciones is not null))
);

create table if not exists justificante (
  id                 uuid primary key default gen_random_uuid(),
  solicitud_id       uuid references solicitud (id) on delete restrict,
  disponibilidad_id  uuid references disponibilidad (id) on delete restrict,
  referencia_fichero text not null,
  tipo_documento     text not null
                     check (tipo_documento in ('medico', 'formacion', 'colegiacion', 'otro')),
  fecha_subida       timestamptz not null default now(),
  acceso_restringido boolean not null default true,
  creado_en          timestamptz not null default now(),
  creado_por         uuid,
  modificado_en      timestamptz not null default now(),
  version            int not null default 1 check (version > 0),
  check (solicitud_id is not null or disponibilidad_id is not null)
);

create table if not exists notificacion (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references usuario (id) on delete restrict,
  tipo            text not null
                  check (tipo in ('designacion', 'cambio', 'incidencia', 'cuadrante', 'recordatorio')),
  referencia_tipo text not null,
  referencia_id   uuid,
  canal           text not null check (canal in ('email', 'sms', 'in_app')),
  estado_entrega  text not null default 'pendiente'
                  check (estado_entrega in ('pendiente', 'enviada', 'entregada', 'error')),
  fecha_envio     timestamptz,
  fecha_lectura   timestamptz,
  leida           boolean not null default false,
  creado_en       timestamptz not null default now(),
  creado_por      uuid,
  modificado_en   timestamptz not null default now(),
  version         int not null default 1 check (version > 0),
  -- Idempotencia evento–destinatario–canal: un reintento no duplica el envío.
  unique (referencia_tipo, referencia_id, usuario_id, canal)
);

create index if not exists ix_notificacion_estado_entrega on notificacion (estado_entrega);

create table if not exists auditoria (
  id              uuid primary key default gen_random_uuid(),
  entidad         text not null,
  entidad_id      uuid not null,
  accion          text not null
                  check (accion in ('crear', 'modificar', 'publicar', 'resolver', 'cerrar', 'consultar')),
  estado_anterior text,
  estado_nuevo    text,
  motivo          text,
  actor_id        uuid not null references usuario (id),
  fecha           timestamptz not null default now(),
  origen          text not null default 'aplicacion'
                  check (origen in ('aplicacion', 'etl', 'migracion', 'manual')),
  creado_en       timestamptz not null default now(),
  creado_por      uuid,
  modificado_en   timestamptz not null default now(),
  version         int not null default 1 check (version > 0)
);

create index if not exists ix_auditoria_entidad on auditoria (entidad, entidad_id);
create index if not exists ix_auditoria_actor_fecha on auditoria (actor_id, fecha);
create index if not exists ix_auditoria_fecha on auditoria (fecha);

-- Registro append-only: la aplicación no actualiza ni borra asientos.
do $$
begin
  revoke update, delete, truncate on auditoria from app_role;
exception
  when undefined_object then
    raise notice 'El rol app_role no existe; se omite el REVOKE de auditoria.';
end $$;

-- ─── Parámetros versionados (RN-27) ─────────────────────────────────────────

create table if not exists parametro (
  id            uuid primary key default gen_random_uuid(),
  clave         text not null,
  valor         jsonb not null,
  version       int not null default 1 check (version > 0),
  vigente_desde date not null default current_date,
  vigente_hasta date,
  creado_en     timestamptz not null default now(),
  creado_por    uuid,
  modificado_en timestamptz not null default now(),
  unique (clave, version),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);

commit;
