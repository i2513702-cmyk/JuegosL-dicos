/* ============================================================
 * LudoApp core/sync.js
 * Capa de sincronización entre NAVEGADORES vía el servidor local.
 *   - Mientras el servidor esté activo (http://localhost:8787),
 *     las SALAS (lobbies) y las FICHAS DE JUGADOR (players) se
 *     comparten entre Edge y Opera GX de esta misma PC.
 *   - users queda local a cada navegador (login demo por navegador).
 *   - Si se abre por file:// o sin servidor, la app sigue igual y
 *     esta capa queda desactivada.
 *
 * Protocolo:
 *   push : cada mutación local encola un envío (400ms) del estado
 *          de lobbies/players + "tombstones" de salas borradas.
 *   poll : cada 1.5s consulta v; si cambió, aplica y avisa con el
 *          evento "ludo:synced" para re-renderizar la vista.
 * ============================================================ */
window.App = window.App || {};
App.sync = (function () {
  const SHARED = ['lobbies', 'players'];
  const PREFIX = 'ludoApp:';
  const API = '/api/sync';
  const POLL_MS = 1500;
  const PUSH_MS = 400;

  let enabled = false;
  let inFlight = false;
  let lastV = -1;
  let ackedV = -1; // última v confirmada por nuestro propio push
  let tombstones = {}; // { col: { id: timestamp } }
  let dirty = {}; // { col: { id: true } }  cambios locales aún sin confirmar
  let deb = null;
  let pollTimer = null;
  let readyResolve = null;
  const ready = new Promise((res) => { readyResolve = res; });

  function cache(col) {
    try {
      const raw = localStorage.getItem(PREFIX + col);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveCache(col, items) {
    localStorage.setItem(PREFIX + col, JSON.stringify(items));
  }

  function dirtySet(col) { return (dirty[col] = dirty[col] || {}); }

  function mark(col, id) {
    if (SHARED.indexOf(col) === -1) return;
    if (id !== undefined && id !== null) dirtySet(col)[id] = true;
    clearTimeout(deb);
    deb = setTimeout(flush, PUSH_MS);
  }

  function tomb(col, id) {
    if (SHARED.indexOf(col) === -1) return;
    tombstones[col] = tombstones[col] || {};
    tombstones[col][id] = new Date().toISOString();
    dirtySet(col)[id] = true;
    clearTimeout(deb);
    deb = setTimeout(flush, PUSH_MS);
  }

  function tsOf(r) { return (r && (r.updatedAt || r.createdAt)) || ''; }

  function mergeShallow(base, incoming) {
    const byId = new Map();
    (base || []).forEach((r) => { if (r && r.id !== undefined) byId.set(r.id, r); });
    (incoming || []).forEach((r) => {
      if (!r || r.id === undefined) return;
      const old = byId.get(r.id);
      if (!old) { byId.set(r.id, r); return; }
      if (tsOf(r) >= tsOf(old)) byId.set(r.id, r);
    });
    return Array.from(byId.values());
  }

  /* evita duplicar fichas del mismo estudiante (mismo nombre) al fusionar */
  function dedupePlayers(list) {
    const m = new Map();
    (list || []).forEach((r) => {
      if (!r) return;
      const k = String(r.nombre || '').toLowerCase() + '|' + (r.rol || '');
      const old = m.get(k);
      if (!old) { m.set(k, r); return; }
      if (tsOf(r) >= tsOf(old)) m.set(k, r);
    });
    return Array.from(m.values());
  }

  function applyRemote(res) {
    const fresh = (res.v != null) && (res.v >= ackedV);
    const hasDirty = Object.keys(dirty).some((c) => Object.keys(dirty[c]).length);

    /* salas: autoridad del servidor (respeta borrados) pero sin perder cambios propios no confirmados */
    if (Array.isArray(res.lobbies)) {
      const remoteL = res.lobbies.slice();
      let localL = cache('lobbies');
      if (hasDirty && (dirty.lobbies || {})) {
        localL = localL.filter((r) => !(dirty.lobbies || {})[r.id]);
        localL = mergeShallow(localL, remoteL);
      } else {
        localL = fresh ? remoteL : mergeShallow(localL, remoteL);
      }
      saveCache('lobbies', localL);
    }

    /* jugadores: siempre fusión por id + dedupe por nombre (nunca se pierde identidad) */
    if (Array.isArray(res.players)) {
      const merged = dedupePlayers(mergeShallow(cache('players'), res.players));
      saveCache('players', merged);
    }

    lastV = res.v != null ? res.v : lastV;
    emit();
  }

  function emit() {
    try {
      if (window.dispatchEvent) window.dispatchEvent(new window.CustomEvent('ludo:synced'));
    } catch (e) {}
  }

  function flush() {
    deb = null;
    if (!enabled || inFlight) return;
    inFlight = true;
    const body = {
      lobbies: cache('lobbies'),
      players: cache('players'),
      deleted: tombstones
    };
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then((r) => r.json())
      .then((res) => {
        if (res && res.ok) {
          tombstones = {};
          dirty = {};
          ackedV = res.v != null ? res.v : ackedV;
          lastV = Math.max(lastV, ackedV);
        }
      })
      .catch(() => {})
      .then(() => {
        inFlight = false;
        if (deb) { const d = deb; deb = null; setTimeout(d, 0); }
        pollTick();
      });
  }

  function pollTick() {
    if (!enabled) return;
    if (inFlight) { pollTimer = setTimeout(pollTick, 500); return; }
    fetch(API)
      .then((r) => r.json())
      .then((res) => {
        if (!res || !res.ok) return;
        if (res.v !== lastV) applyRemote(res);
      })
      .catch(() => {})
      .then(() => { pollTimer = setTimeout(pollTick, POLL_MS); });
  }

  function init() {
    fetch(API)
      .then((r) => r.json())
      .then((res) => {
        if (res && res.ok) {
          enabled = true;
          applyRemote(res);
        }
      })
      .catch(() => {})
      .then(() => {
        if (readyResolve) readyResolve();
        pollTimer = setTimeout(pollTick, POLL_MS);
      });
    return ready;
  }

  function isEnabled() { return enabled; }

  return { init, isEnabled, readySync: () => ready, mark, tomb, SHARED };
})();