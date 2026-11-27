-- 0001_init.down.sql · revierte 0001_init.sql
--
--   psql -U turno -d turno -f db/migrations/down/0001_init.down.sql
--
-- Deja la base como estaba antes de la migración (sin tablas del modelo).
-- Los roles se dejan creados a propósito: son del cluster, no de la base, y
-- volver a crearlos en la siguiente migración es inocuo.

begin;

drop table if exists parametro cascade;
drop table if exists idempotencia_guardia cascade;
drop table if exists auditoria cascade;
drop table if exists notificacion cascade;
drop table if exists justificante cascade;
drop table if exists parte_guardia cascade;
drop table if exists incidencia cascade;
drop table if exists solicitud cascade;
drop table if exists disponibilidad cascade;
drop table if exists guardia cascade;
drop table if exists cuadrante cascade;
drop table if exists tipo_guardia cascade;
drop table if exists habilitacion cascade;
drop table if exists especialidad cascade;
drop table if exists abogado cascade;
drop table if exists usuario cascade;

commit;
