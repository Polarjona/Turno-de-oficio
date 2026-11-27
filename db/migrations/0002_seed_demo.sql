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

-- Una franja a diez días vista: dentro de plazo, para que la excusa no se
-- marque como extemporánea.
insert into guardia (
  tipo_guardia_id, especialidad_id, fecha, hora_inicio, hora_fin, es_detenido, estado, origen
)
select t.id, t.especialidad_id, current_date + 10, '09:00', '20:00', false, 'planificada', 'planificacion'
from tipo_guardia t
where t.codigo = 'PEN-DIA'
  and not exists (
    select 1 from guardia g
    where g.fecha = current_date + 10 and g.tipo_guardia_id = t.id
  );

commit;
