'use client';

import type { Guardia, PaginaGuardias, PaginaSolicitudes, Solicitud } from '@turno/shared';
import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3101';
const KEYCLOAK = process.env.NEXT_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8081';
const MAILPIT = process.env.NEXT_PUBLIC_MAILPIT_URL ?? 'http://localhost:8025';

/** Token de un usuario de demo por *direct access grant* (solo desarrollo). */
async function tokenDemo(usuario: string, contrasena: string): Promise<string> {
  const respuesta = await fetch(`${KEYCLOAK}/realms/tof/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'tof-web',
      username: usuario,
      password: contrasena,
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`Keycloak respondió ${respuesta.status}: ¿está el stack levantado?`);
  }

  const datos = (await respuesta.json()) as { access_token: string };
  return datos.access_token;
}

export default function Solicitudes() {
  const [tokenLetrado, setTokenLetrado] = useState<string>();
  const [tokenCoordinacion, setTokenCoordinacion] = useState<string>();
  const [guardias, setGuardias] = useState<Guardia[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [guardiaId, setGuardiaId] = useState('');
  const [tipo, setTipo] = useState<'excusa' | 'permuta' | 'sustitucion'>('excusa');
  const [motivo, setMotivo] = useState<
    'enfermedad' | 'asunto_propio' | 'conciliacion' | 'fuerza_mayor' | 'otro'
  >('enfermedad');
  const [detalle, setDetalle] = useState('');
  const [seleccionada, setSeleccionada] = useState<string>();
  const [decision, setDecision] = useState<'estimar' | 'desestimar'>('estimar');
  const [motivoResolucion, setMotivoResolucion] = useState('');
  const [aviso, setAviso] = useState<string>();
  const [error, setError] = useState<string>();

  const conectar = async (): Promise<void> => {
    setError(undefined);
    try {
      const [letrado, coordinacion] = await Promise.all([
        tokenDemo('letrado.demo', 'demo-letrado'),
        tokenDemo('coordinacion.demo', 'demo-coordinacion'),
      ]);
      setTokenLetrado(letrado);
      setTokenCoordinacion(coordinacion);
      await Promise.all([cargarGuardias(letrado), cargarSolicitudes(coordinacion)]);
    } catch (fallo) {
      setError((fallo as Error).message);
    }
  };

  const cargarGuardias = async (token = tokenLetrado): Promise<void> => {
    if (!token) return;
    const respuesta = await fetch(`${API}/guardias?limit=50`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const pagina = (await respuesta.json()) as PaginaGuardias;
    setGuardias(pagina.data);
    if (!guardiaId && pagina.data[0]) setGuardiaId(pagina.data[0].id);
  };

  const cargarSolicitudes = async (token = tokenCoordinacion): Promise<void> => {
    if (!token) return;
    const respuesta = await fetch(`${API}/solicitudes?limit=50`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const pagina = (await respuesta.json()) as PaginaSolicitudes;
    setSolicitudes(pagina.data);
  };

  const crear = async (): Promise<void> => {
    setError(undefined);
    setAviso(undefined);
    try {
      const respuesta = await fetch(`${API}/solicitudes`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${tokenLetrado}`,
        },
        body: JSON.stringify({
          guardia_id: guardiaId,
          tipo,
          motivo,
          detalle: detalle || undefined,
          sobrevenida: false,
        }),
      });

      if (!respuesta.ok) {
        const problema = (await respuesta.json()) as { message?: string; detail?: string };
        throw new Error(problema.detail ?? problema.message ?? `HTTP ${respuesta.status}`);
      }

      setAviso('Solicitud registrada en estado comunicada.');
      setDetalle('');
      await cargarSolicitudes();
    } catch (fallo) {
      setError((fallo as Error).message);
    }
  };

  const resolver = async (): Promise<void> => {
    if (!seleccionada) return;
    setError(undefined);
    setAviso(undefined);
    try {
      const respuesta = await fetch(`${API}/solicitudes/${seleccionada}/resolucion`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${tokenCoordinacion}`,
        },
        body: JSON.stringify({
          decision,
          motivo_resolucion: motivoResolucion,
          justificar_hueco: false,
        }),
      });

      if (!respuesta.ok) {
        const problema = (await respuesta.json()) as { message?: string };
        throw new Error(
          typeof problema.message === 'string' ? problema.message : `HTTP ${respuesta.status}`,
        );
      }

      setAviso(
        'Solicitud resuelta. El aviso queda en el outbox y sale hacia Mailpit en unos segundos.',
      );
      setSeleccionada(undefined);
      setMotivoResolucion('');
      await cargarSolicitudes();
    } catch (fallo) {
      setError((fallo as Error).message);
    }
  };

  const conectado = Boolean(tokenLetrado && tokenCoordinacion);

  return (
    <main style={{ padding: '3rem 1.5rem', maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Solicitudes</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Excusa, permuta o sustitución, y su resolución con motivación obligatoria. Cada resolución
        deja un aviso en el outbox que se envía a Mailpit.
      </p>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: 18 }}>1. Sesión</h2>
        <button onClick={() => void conectar()} style={{ padding: '0.5rem 1rem' }}>
          Conectar con letrado y coordinación de demo
        </button>
        {conectado && (
          <span style={{ marginLeft: 12, color: '#2e7d32', fontSize: 14 }}>
            Sesión iniciada como letrado.demo y coordinacion.demo
          </span>
        )}
      </section>

      {conectado && (
        <>
          <section style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: 18 }}>2. Nueva solicitud (letrado)</h2>
            <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
              <label>
                Guardia
                <select
                  value={guardiaId}
                  onChange={(evento) => setGuardiaId(evento.target.value)}
                  style={{ display: 'block', width: '100%', padding: '0.4rem' }}
                >
                  {guardias.map((guardia) => (
                    <option key={guardia.id} value={guardia.id}>
                      {guardia.fecha} · {guardia.hora_inicio}–{guardia.hora_fin} · {guardia.estado}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Tipo
                <select
                  value={tipo}
                  onChange={(evento) => setTipo(evento.target.value as typeof tipo)}
                  style={{ display: 'block', width: '100%', padding: '0.4rem' }}
                >
                  <option value="excusa">excusa</option>
                  <option value="permuta">permuta</option>
                  <option value="sustitucion">sustitución</option>
                </select>
              </label>

              <label>
                Motivo
                <select
                  value={motivo}
                  onChange={(evento) => setMotivo(evento.target.value as typeof motivo)}
                  style={{ display: 'block', width: '100%', padding: '0.4rem' }}
                >
                  <option value="enfermedad">enfermedad</option>
                  <option value="asunto_propio">asunto propio</option>
                  <option value="conciliacion">conciliación</option>
                  <option value="fuerza_mayor">fuerza mayor</option>
                  <option value="otro">otro</option>
                </select>
              </label>

              <label>
                Detalle (sin diagnósticos ni datos clínicos)
                <textarea
                  value={detalle}
                  onChange={(evento) => setDetalle(evento.target.value)}
                  rows={2}
                  style={{ display: 'block', width: '100%', padding: '0.4rem' }}
                />
              </label>

              <button
                onClick={() => void crear()}
                disabled={!guardiaId}
                style={{ padding: '0.5rem 1rem', justifySelf: 'start' }}
              >
                Registrar solicitud
              </button>
            </div>
          </section>

          <section style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: 18 }}>3. Bandeja (coordinación)</h2>
            {solicitudes.length === 0 ? (
              <p style={{ color: '#777' }}>No hay solicitudes todavía.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                    <th style={{ padding: '0.5rem 0' }}>Guardia</th>
                    <th style={{ padding: '0.5rem 0' }}>Tipo</th>
                    <th style={{ padding: '0.5rem 0' }}>Motivo</th>
                    <th style={{ padding: '0.5rem 0' }}>Estado</th>
                    <th style={{ padding: '0.5rem 0' }} />
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.map((solicitud) => (
                    <tr key={solicitud.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '0.5rem 0', fontSize: 13 }}>
                        {solicitud.guardia_id.slice(0, 8)}…
                      </td>
                      <td style={{ padding: '0.5rem 0' }}>{solicitud.tipo}</td>
                      <td style={{ padding: '0.5rem 0' }}>{solicitud.motivo}</td>
                      <td style={{ padding: '0.5rem 0' }}>
                        {solicitud.estado}
                        {solicitud.extemporanea ? ' · extemporánea' : ''}
                      </td>
                      <td style={{ padding: '0.5rem 0' }}>
                        {solicitud.estado === 'comunicada' && (
                          <button onClick={() => setSeleccionada(solicitud.id)}>Resolver</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {seleccionada && (
            <section
              style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: '#f7f7f7',
                borderRadius: 8,
              }}
            >
              <h2 style={{ fontSize: 18, marginTop: 0 }}>4. Resolución</h2>
              <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
                <label>
                  Decisión
                  <select
                    value={decision}
                    onChange={(evento) => setDecision(evento.target.value as typeof decision)}
                    style={{ display: 'block', width: '100%', padding: '0.4rem' }}
                  >
                    <option value="estimar">estimar</option>
                    <option value="desestimar">desestimar</option>
                  </select>
                </label>

                <label>
                  Motivo de la resolución (obligatorio)
                  <textarea
                    value={motivoResolucion}
                    onChange={(evento) => setMotivoResolucion(evento.target.value)}
                    rows={2}
                    style={{ display: 'block', width: '100%', padding: '0.4rem' }}
                  />
                </label>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => void resolver()}
                    disabled={motivoResolucion.trim().length === 0}
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    Confirmar resolución
                  </button>
                  <button
                    onClick={() => setSeleccionada(undefined)}
                    style={{ padding: '0.5rem 1rem' }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </section>
          )}

          <section style={{ marginTop: '2rem', fontSize: 14 }}>
            <a href={MAILPIT} target="_blank" rel="noreferrer">
              Abrir Mailpit
            </a>
            <span style={{ color: '#777' }}> — el aviso de cada resolución llega aquí.</span>
          </section>
        </>
      )}

      {aviso && (
        <p
          style={{
            marginTop: '1.5rem',
            color: '#2e7d32',
            background: '#e8f5e9',
            padding: '0.75rem',
          }}
        >
          {aviso}
        </p>
      )}
      {error && (
        <p
          style={{
            marginTop: '1.5rem',
            color: '#b71c1c',
            background: '#ffebee',
            padding: '0.75rem',
          }}
        >
          {error}
        </p>
      )}

      <p style={{ color: '#777', fontSize: 14, marginTop: '2rem' }}>
        Datos ilustrativos: el proyecto no trata datos reales del Colegio. Los motivos son
        categorías generales, sin diagnósticos (RGPD art. 9).
      </p>
    </main>
  );
}
