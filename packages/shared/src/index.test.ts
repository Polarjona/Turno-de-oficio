import { describe, expect, it } from 'vitest';

import { GUARDIAS_DEMO, GuardiaSchema, USUARIO_DEMO, UsuarioSchema } from './index';

describe('esquemas compartidos', () => {
  it('valida el usuario de demostración', () => {
    expect(UsuarioSchema.parse(USUARIO_DEMO)).toEqual(USUARIO_DEMO);
  });

  it('valida las guardias de demostración', () => {
    for (const guardia of GUARDIAS_DEMO) {
      expect(() => GuardiaSchema.parse(guardia)).not.toThrow();
    }
  });

  it('rechaza una fecha que no es AAAA-MM-DD', () => {
    const mal = { ...GUARDIAS_DEMO[0], fecha: '30/11/2026' };
    expect(() => GuardiaSchema.parse(mal)).toThrow();
  });
});
