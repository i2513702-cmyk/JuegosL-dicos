'use strict';
/* ============================================================
 * LudoApp servidor/preguntas.js
 * Banco de preguntas que ENVÍA EL DOCENTE al crear la sala.
 *  - normalizarBanco: limpia y valida lo que llega por el socket.
 *  - crearMazo: reparte sin repetir hasta agotar y rebaraja (como questionEngine).
 * La respuesta correcta vive solo aquí. Lo que sale hacia los clientes
 * es publica(id): enunciado y opciones, nunca la correcta.
 * Acepta el formato del quiz (dificultad: 'Fácil'/'Media'/'Difícil') y el de
 * la app (difficulty_id: 'dif_facil'...). Node >= 18.
 * ============================================================ */

const DIFICULTADES = { dif_facil: 'Fácil', dif_media: 'Media', dif_dificil: 'Difícil' };
const LIM = { enunciado: 500, opcion: 200, categoria: 60, ref: 64, minOpciones: 2, maxOpciones: 6 };

const limpiar = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n);
const sinTildes = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function dificultadId(q) {
  if (typeof q.difficulty_id === 'string' && DIFICULTADES[q.difficulty_id]) return q.difficulty_id;
  const t = sinTildes(q.dificultad);
  if (t === 'media') return 'dif_media';
  if (t === 'dificil') return 'dif_dificil';
  return 'dif_facil';
}

/* entrada: array de { enunciado, opciones[], respuesta_correcta, dificultad|difficulty_id?, categoria?, id? }
 * -> { preguntas: [{ idx, ref, enunciado, opciones, correcta, dificultadId, dificultad, categoria }], descartadas } */
function normalizarBanco(entrada, opts) {
  const max = (opts && opts.max) || 100;
  const preguntas = [];
  let descartadas = 0;
  if (!Array.isArray(entrada)) return { preguntas, descartadas };
  for (const q of entrada) {
    if (preguntas.length >= max) { descartadas++; continue; }
    if (!q || typeof q !== 'object' || !Array.isArray(q.opciones)) { descartadas++; continue; }
    const enunciado = limpiar(q.enunciado, LIM.enunciado);
    const opciones = q.opciones.map((o) => limpiar(o, LIM.opcion));
    const c = q.respuesta_correcta;
    const valida = enunciado
      && opciones.length >= LIM.minOpciones && opciones.length <= LIM.maxOpciones
      && opciones.every((o) => o.length > 0)
      && typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < opciones.length;
    if (!valida) { descartadas++; continue; }
    const dId = dificultadId(q);
    preguntas.push({
      idx: preguntas.length,
      ref: limpiar(q.id !== undefined ? q.id : q.ref, LIM.ref),     // id de la pregunta en el perfil del docente (opcional)
      enunciado: enunciado, opciones: opciones, correcta: c,
      dificultadId: dId, dificultad: DIFICULTADES[dId],
      categoria: limpiar(q.categoria, LIM.categoria)
    });
  }
  return { preguntas, descartadas };
}

/* Mazo con la interfaz que esperan las reglas: sacar / esCorrecta / correcta.
 * opts: { rng?, mezclarOpciones? (por defecto true) } */
function crearMazo(preguntas, opts) {
  if (!Array.isArray(preguntas) || !preguntas.length) throw new Error('El mazo necesita al menos una pregunta');
  const rng = (opts && opts.rng) || Math.random;
  const mezclar = !(opts && opts.mezclarOpciones === false);
  const MAX_SALIDAS = 64;

  const barajar = (a) => {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = b[i]; b[i] = b[j]; b[j] = t; }
    return b;
  };
  let baraja = barajar(preguntas.map((_, i) => i)), cursor = 0, n = 0;
  const salidas = new Map();      // id de salida -> { q, opciones (ya barajadas), correcta (índice tras barajar) }

  function sacar() {
    if (cursor >= baraja.length) { baraja = barajar(baraja); cursor = 0; }
    const q = preguntas[baraja[cursor++]];
    let orden = q.opciones.map((_, i) => i);
    if (mezclar) orden = barajar(orden);
    const id = 'd' + (++n);
    const s = { q: q, opciones: orden.map((i) => q.opciones[i]), correcta: orden.indexOf(q.correcta) };
    salidas.set(id, s);
    if (salidas.size > MAX_SALIDAS) salidas.delete(salidas.keys().next().value);
    return { id: id, opciones: s.opciones.slice() };
  }
  const get = (id) => { const s = salidas.get(id); if (!s) throw new Error('Pregunta desconocida: ' + id); return s; };

  return {
    sacar: sacar,
    esCorrecta: (id, eleccion) => get(id).correcta === eleccion,
    correcta: (id) => get(id).correcta,
    /* lo único que se manda a los clientes */
    publica: (id) => { const s = get(id); return { qid: id, enunciado: s.q.enunciado, opciones: s.opciones.slice(), categoria: s.q.categoria, dificultad: s.q.dificultad }; },
    /* para el registro de respuestas (solo servidor) */
    meta: (id) => { const s = get(id); return { ref: s.q.ref, dificultadId: s.q.dificultadId, categoria: s.q.categoria }; },
    get tamano() { return preguntas.length; }
  };
}

module.exports = { normalizarBanco, crearMazo, DIFICULTADES };
