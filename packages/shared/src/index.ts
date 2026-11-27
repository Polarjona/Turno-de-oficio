import { z } from 'zod';

/** Roles del sistema: los cuatro de `x-roles` en el contrato (OpenAPI v0.1). */
export const RolSchema = z.enum(['letrado', 'coordinacion', 'junta', 'admin']);
export type Rol = z.infer<typeof RolSchema>;

/** Estados de la guardia: los diez de `EstadoGuardia` en el contrato. */
export const EstadoGuardiaSchema = z.enum([
  'planificada',
  'propuesta',
  'publicada',
  'confirmada',
  'en_revision',
  'descubierta',
  'en_curso',
  'realizada',
  'validada',
  'anulada',
]);
export type EstadoGuardia = z.infer<typeof EstadoGuardiaSchema>;

/** Cómo llegó la guardia a su titular (contrato, `Guardia.origen`). */
export const OrigenGuardiaSchema = z.enum([
  'planificacion',
  'manual',
  'urgente',
  'refuerzo',
  'cobertura_hueco',
]);
export type OrigenGuardia = z.infer<typeof OrigenGuardiaSchema>;

export const FechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha en formato AAAA-MM-DD');

/** Hora local en formato HH:MM, como en el contrato. */
export const HoraSchema = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'hora en formato HH:MM');

export const UsuarioSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  colegiado: z.string().min(1),
  rol: RolSchema,
});
export type Usuario = z.infer<typeof UsuarioSchema>;

export const GuardiaSchema = z.object({
  id: z.string().uuid(),
  cuadrante_id: z.string().uuid().nullable(),
  tipo_guardia_id: z.string().uuid(),
  especialidad_id: z.string().uuid(),
  abogado_id: z.string().uuid().nullable(),
  fecha: FechaSchema,
  hora_inicio: HoraSchema,
  hora_fin: HoraSchema,
  estado: EstadoGuardiaSchema,
  origen: OrigenGuardiaSchema,
  motivo_asignacion: z.string().nullable(),
  es_detenido: z.boolean(),
  version: z.number().int().nonnegative(),
  creado_en: z.string().datetime(),
  modificado_en: z.string().datetime(),
});
export type Guardia = z.infer<typeof GuardiaSchema>;

/** Cuerpo de `POST /guardias` (contrato, `GuardiaRequest`). */
export const GuardiaRequestSchema = z.object({
  tipo_guardia_id: z.string().uuid(),
  especialidad_id: z.string().uuid(),
  fecha: FechaSchema,
  hora_inicio: HoraSchema,
  hora_fin: HoraSchema,
  es_detenido: z.boolean().default(false),
});
export type GuardiaRequest = z.infer<typeof GuardiaRequestSchema>;

/** Datos ilustrativos: el proyecto no trata datos reales del Colegio. */
export const USUARIO_DEMO: Usuario = {
  id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Coordinación de guardias',
  colegiado: 'ICAT-0001',
  rol: 'coordinacion',
};

const TIPO_GUARDIA_DEMO = '00000000-0000-4000-8000-000000000301';
const ESPECIALIDAD_DEMO = '00000000-0000-4000-8000-000000000401';

export const GUARDIAS_DEMO: Guardia[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    cuadrante_id: null,
    tipo_guardia_id: TIPO_GUARDIA_DEMO,
    especialidad_id: ESPECIALIDAD_DEMO,
    abogado_id: '00000000-0000-4000-8000-000000000201',
    fecha: '2026-11-30',
    hora_inicio: '09:00',
    hora_fin: '20:00',
    estado: 'publicada',
    origen: 'planificacion',
    motivo_asignacion: null,
    es_detenido: false,
    version: 1,
    creado_en: '2026-11-20T08:00:00.000Z',
    modificado_en: '2026-11-20T08:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    cuadrante_id: null,
    tipo_guardia_id: TIPO_GUARDIA_DEMO,
    especialidad_id: ESPECIALIDAD_DEMO,
    abogado_id: null,
    fecha: '2026-12-01',
    hora_inicio: '09:00',
    hora_fin: '20:00',
    estado: 'propuesta',
    origen: 'planificacion',
    motivo_asignacion: null,
    es_detenido: false,
    version: 1,
    creado_en: '2026-11-20T08:00:00.000Z',
    modificado_en: '2026-11-20T08:00:00.000Z',
  },
];
