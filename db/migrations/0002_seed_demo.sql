-- 0002_seed_demo.sql · datos de demostración
--
-- Una materia, una plantilla de guardia y una franja futura para que el
-- vertical de solicitudes funcione de punta a punta sin cargar nada a mano.
-- Son datos inventados: el proyecto no trata datos reales del Colegio.
--
-- Idempotente: se puede volver a aplicar sobre el mismo volumen.

begin;

insert into especialidad (id, codigo, nombre, descripcion)
values (
  '00000000-0000-4000-8000-000000000401',
  'PEN',
  'Penal',
  'Turno de oficio penal (asistencia al detenido y defensa)'
)
on conflict (codigo) do nothing;

insert into tipo_guardia (
  id, codigo, especialidad_id, modalidad, hora_inicio, hora_fin, letrados_previstos
)
select
  '00000000-0000-4000-8000-000000000301',
  'PEN-DIA',
  e.id,
  'presencial',
  '09:00',
  '20:00',
  1
from especialidad e
where e.codigo = 'PEN'
on conflict (codigo) do nothing;

-- El letrado de demo es el titular de la franja. Su `abogado_id` lo fija el
-- realm (`00000000-0000-4000-8000-000000000201`), que es lo que el token pone
-- en el claim; aquí hace falta el usuario porque `abogado.usuario_id` no admite
-- nulos. Sin titular, GET /guardias no le devuelve nada y la pantalla de
-- solicitudes se queda sin guardias que elegir.
insert into usuario (id, nombre, apellidos, email, password_hash, rol)
values (
  '00000000-0000-4000-8000-000000000101',
  'Lucía',
  'Demostración',
  'letrado.demo@example.test',
  '-',
  'letrado'
)
on conflict (id) do nothing;

insert into abogado (id, usuario_id, num_colegiado)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'ICAT-0101'
)
on conflict (id) do nothing;

-- La franja vive dentro de un cuadrante: RN-39 solo deja sin cuadrante las
-- urgentes y las que aún están planificadas, y una guardia resuelta deja de
-- estarlo.
insert into cuadrante (id, anio, periodo, estado, fecha_publicacion)
values (
  '00000000-0000-4000-8000-000000000201',
  extract(year from current_date + 10)::int,
  'demo',
  'publicado',
  now()
)
on conflict (id) do nothing;

-- Una franja a diez días vista: dentro de plazo, para que la excusa no se
-- marque como extemporánea.
insert into guardia (
  tipo_guardia_id, especialidad_id, abogado_id, cuadrante_id, fecha, hora_inicio,
  hora_fin, es_detenido, estado, origen
)
select
  t.id, t.especialidad_id, '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000201', current_date + 10,
  '09:00', '20:00', false, 'publicada', 'planificacion'
from tipo_guardia t
where t.codigo = 'PEN-DIA'
  and not exists (
    select 1 from guardia g
    where g.fecha = current_date + 10 and g.tipo_guardia_id = t.id
  );

-- Sobre un volumen que ya tenía la semilla antigua, la franja existe sin
-- titular: se le asigna ahora.
update guardia g
   set abogado_id = '00000000-0000-4000-8000-000000000201'
  from tipo_guardia t
 where t.id = g.tipo_guardia_id
   and t.codigo = 'PEN-DIA'
   and g.fecha = current_date + 10
   and g.abogado_id is null;

commit;
