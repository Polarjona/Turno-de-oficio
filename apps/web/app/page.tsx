import { GUARDIAS_DEMO } from '@turno/shared';

export default function Home() {
  return (
    <main style={{ padding: '3rem 1.5rem', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.25rem' }}>Turno de Oficio</h1>
      <p style={{ color: '#555', marginTop: 0 }}>
        Esqueleto del monorepo: la web lee los datos de demostración del paquete compartido.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '2rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
            <th style={{ padding: '0.5rem 0' }}>Fecha</th>
            <th style={{ padding: '0.5rem 0' }}>Horario</th>
            <th style={{ padding: '0.5rem 0' }}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {GUARDIAS_DEMO.map((guardia) => (
            <tr key={guardia.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
              <td style={{ padding: '0.5rem 0' }}>{guardia.fecha}</td>
              <td style={{ padding: '0.5rem 0' }}>
                {guardia.hora_inicio}–{guardia.hora_fin}
              </td>
              <td style={{ padding: '0.5rem 0' }}>{guardia.estado}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ color: '#777', fontSize: 14, marginTop: '2rem' }}>
        Datos ilustrativos: el proyecto no trata datos reales del Colegio.
      </p>
    </main>
  );
}
