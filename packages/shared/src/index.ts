import { z } from 'zod';

/** Roles del sistema: los cuatro de `x-roles` en el contrato (OpenAPI v0.1). */
export const RolSchema = z.enum(['letrado', 'coordinacion', 'junta', 'admin']);
export type Rol = z.infer<typeof RolSchema>;

export const EstadoGuardiaSchema = z.enum([
  'borrador',
  'propuesta',
  'publicada',
  'cerrada',
  'anulada',
]);
export type EstadoGuardia = z.infer<typeof EstadoGuardiaSchema>;

export const TipoGuardiaSchema = z.enum(['ordinaria', 'refuerzo', 'festivo']);
export type TipoGuardia = z.infer<typeof TipoGuardiaSchema>;

export const UsuarioSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().min(1),
  colegiado: z.string().min(1),
  rol: RolSchema,
});
export type Usuario = z.infer<typeof UsuarioSchema>;

export const GuardiaSchema = z.object({
  id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha en formato AAAA-MM-DD'),
  tipo: TipoGuardiaSchema,
  estado: EstadoGuardiaSchema,
  letradoId: z.string().uuid().nullable(),
});
export type Guardia = z.infer<typeof GuardiaSchema>;

/** Datos ilustrativos: el proyecto no trata datos reales del Colegio. */
export const USUARIO_DEMO: Usuario = {
  id: '00000000-0000-4000-8000-000000000001',
  nombre: 'Coordinación de guardias',
  colegiado: 'ICAT-0001',
  rol: 'coordinacion',
};

export const GUARDIAS_DEMO: Guardia[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    fecha: '2026-11-30',
    tipo: 'ordinaria',
    estado: 'publicada',
    letradoId: '00000000-0000-4000-8000-000000000201',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    fecha: '2026-12-01',
    tipo: 'refuerzo',
    estado: 'propuesta',
    letradoId: null,
  },
];
