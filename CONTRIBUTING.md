# CONTRIBUTING · Turno de Oficio

Convenciones para las cuatro personas del equipo (ETL/DevOps · Backend · Frontend
· Database). Objetivo: que nadie se pise y que el trabajo de un rol se entienda en otro.

## Ramas

- `produccion` — lo que se entrega al cliente: solo la versión final y revisada.
  Aquí no se trabaja; se actualiza desde `develop` cuando el entregable está cerrado.
- `develop` — rama por defecto y base de todo. Aquí se juntan los cuatro roles.
- Una rama por rol, donde cada persona hace push de lo suyo:
  - `etl-devops` — Pol (ETL y DevOps)
  - `backend` — Yazan
  - `frontend` — Dhruva
  - `database` — Akram
- Si un cambio es grande o arriesgado, `feature/<descripcion>` sale de la rama del
  rol y vuelve a ella. Sin ramas `test`, `wip` ni nombres personales.

## Flujo de una tarjeta

1. **To do → Doing** al empezarla (moverla, no asignarse). Una persona, una tarjeta.
2. Commits pequeños y frecuentes en tu rama de rol; cada commit puede verse solo.
3. **PR de la rama del rol contra `develop`**, con la tarjeta de Trello enlazada en
   la descripción. El PR y el merge los hace Pol; el autor del cambio no mergea el suyo.
4. **Doing → Review** cuando el entregable está listo. Acompañarlo de un comentario
   en la tarjeta con qué se ha hecho y dónde está el fichero.
5. **Review → Done solo tras la revisión** de otra persona (la revisión de Yazan
   en el mapa normativo es el ejemplo a seguir). Sin revisión, la tarjeta se queda
   en Review aunque el plazo haya pasado: el plazo atrasado se comenta, no se esconde.
6. `produccion` se actualiza solo con un PR de `develop`, cuando el entregable está
   cerrado y revisado.

## Commits

- Mensaje breve, en imperativo: «Añade el calendario oficial al inventario de fuentes».
- Si toca documento, cita su referencia en el asunto: «Mapa: corrige la fila RGPD (TOF-2026-003)».
- Nada de `wip`, `tmp` ni mensajes vacíos.

## Documentos

- Todo documento nuevo sigue la **plantilla corporativa Inetum 2026** (`doc/plantilla/`)
  y nace como HTML en `doc/entregables/`; el PDF se renderiza con el script del
  proyecto y termina en `entregables/`.
- Cada documento lleva su referencia **TOF-2026-00x** en pie y la bonita
  (`entregables/<Nombre>.pdf`). La numeración no se reutiliza.
- Las cifras y los nombres de los ejemplos son **ilustrativos**: el proyecto no
  trata datos reales del Colegio (es un encargo descartado reutilizado como ejercicio).
- Si una ley no fija un dato, se fija como **supuesto parametrizado** y se declara
  en el documento y en la tarjeta; no se bloquea esperando una respuesta que no va a llegar.

## Issues

Al abrir un issue se usa la **plantilla de `.github/ISSUE_TEMPLATE/tarjeta.md`**
(tipo, rol, objetivo, entregable, referencia TOF y tarjeta de Trello; si va en
`.github/ISSUE_TEMPLATE/tarjeta.md`, GitHub la reconoce en el selector de
plantillas y no pega la cabecera en el cuerpo). Si no la rellenas, el issue se
cierra sin revisar.

## RGPD, corriendo un poco

- Datos personales solo los mínimos y con una finalidad declarada (art. 9 RGPD:
  una baja es indisponibilidad, nunca motivo clínico).
- Nada de secretos ni de datos reales en este repositorio: están en el entorno
  que corresponda, no en el git.
