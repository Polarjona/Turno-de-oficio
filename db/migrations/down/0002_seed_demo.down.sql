-- 0002_seed_demo.down.sql · retira los datos de demostración de 0002_seed_demo.sql
--
--   psql -U turno -d turno -f db/migrations/down/0002_seed_demo.down.sql
--
-- Solo borra lo que sembró la migración: la franja del tipo «PEN-DIA» y su
-- catálogo. Si esa franja ya tiene solicitudes encima, la FK lo impide a
-- propósito: son datos de trabajo, no de demostración.

begin;

delete from guardia
 where tipo_guardia_id in (select id from tipo_guardia where codigo = 'PEN-DIA');

delete from tipo_guardia where codigo = 'PEN-DIA';
delete from cuadrante where id = '00000000-0000-4000-8000-000000000201';
delete from especialidad where codigo = 'PEN';

commit;
