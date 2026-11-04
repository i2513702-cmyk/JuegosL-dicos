'use strict';
/* ============================================================
 * LudoApp servidor/partidas.js
 * Partidas en red: el SERVIDOR es la autoridad. Los clientes envían acciones
 * y reciben el estado para dibujarlo. Todo en memoria (una sola réplica).
 *
 *   require('./servidor/partidas').attach(io, { HOST_KEY });
 *
 * Docente → servidor : partida:crear · partida:docente-volver · partida:iniciar
 *                      partida:expulsar{asiento} · partida:saltar-turno · partida:cerrar
 * Alumno  → servidor : partida:unirse · partida:accion · partida:salir
 * Servidor → clientes: partida:sala · partida:estado · partida:pregunta · partida:fin
 *                      partida:registro · partida:expulsado · partida:cerrada
 *
 * Seguridad: la respuesta correcta nunca sale (solo aparece en el evento
 * `respondida`, ya contestada). El `pid` (credencial de reconexión) solo se
 * entrega a su dueño: nunca viaja en partida:sala ni en partida:estado.
 * Node >= 18.
 * ============================================================ */
const crypto = require('node:crypto');
const Preguntas = require('./preguntas');
const JUEGOS = require('./juegos');

const ALFABETO = 'BCDFGHJKLMNPQRSTVWXZ';   // 4 consonantes: no choca con PIN (6 dígitos) ni con códigos de observación (5)
const LIMITES = {
  maxSalas: 60, maxBanco: 100,
  turnoMin: 10, turnoMax: 300, turnoPorDefecto: 90,
  tiempoMin: 60, tiempoMax: 7200,
  graciaSeg: 25,                          // turno de un jugador desconectado: espera esto y se salta
  accionesPorSeg: 8,
  fallosPorMin: 15,
  inactivaMs: 3 * 3600e3, terminadaMs: 30 * 60e3
};

const limpiar = (s, n) => String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const iguales = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const ack = (cb, o) => { if (typeof cb === 'function') cb(o); };
const err = (cb, error, mensaje) => ack(cb, { ok: false, error: error, mensaje: mensaje });

function attach(io, opts) {
  opts = opts || {};
  const HOST_KEY = opts.HOST_KEY || '';
  const lim = Object.assign({}, LIMITES, opts.limites || {});
  const rng = opts.rng || Math.random;
  const salas = new Map();

  /* ---------- utilidades ---------- */
  function nuevoCodigo() {
    let c;
    do { c = ''; for (let i = 0; i < 4; i++) c += ALFABETO[Math.floor(rng() * ALFABETO.length)]; } while (salas.has(c));
    return c;
  }
  const claveOk = (k) => !HOST_KEY || (typeof k === 'string' && iguales(k, HOST_KEY));

  function bloqueado(s) {
    const t = Date.now(), f = (s.data.fallos || []).filter((x) => t - x < 60000);
    s.data.fallos = f;
    return f.length >= lim.fallosPorMin;
  }
  const registrarFallo = (s) => { (s.data.fallos = s.data.fallos || []).push(Date.now()); };

  function colorDe(r, i) { const C = r.modulo.COLORES; return C ? C[i % C.length] : null; }
  function jugadorEn(r, asiento) { return r.jugadores.get(r.orden[asiento]); }
  function asientoDe(r, pid) { return r.orden.indexOf(pid); }

  function vistaSala(r) {
    return {
      codigo: r.codigo, juego: r.juego, fase: r.fase, min: r.modulo.min, max: r.modulo.max,
      jugadores: r.orden.map((pid, i) => {
        const p = r.jugadores.get(pid);
        return { asiento: i, nombre: p.nombre, avatar: p.avatar, color: colorDe(r, i), online: p.online };   // sin pid
      })
    };
  }
  const emitSala = (r) => io.to(r.codigo).emit('partida:sala', vistaSala(r));

  function payloadEstado(r, eventos) {
    return {
      v: r.estado.v, estado: r.modulo.view(r.estado, null), eventos: eventos || [],
      turnoVence: r.turnoVence || null, partidaVence: r.partidaVence || null, ahora: Date.now()
    };
  }

  /* La pregunta pendiente va al jugador que debe responder (y al docente).
   * En Batalla (equipos) va a todo el equipo en turno; solo el vocero puede actuar. */
  function emitPregunta(r, soloSid) {
    const e = r.estado;
    if (r.fase !== 'jugando' || !e || !e.espera) return;
    if (!e.pendiente) {
      // intentar inicializar para juegos que lo necesiten
      if (r.juego === 'batalla' && (e.fase === 'preguntar' || e.fase === 'responder') && e.espera && e.espera.asiento != null) {
        try {
          if (r.mazo && typeof r.mazo.sacar === 'function') {
            e.pendiente = { qid: r.mazo.sacar().id, tipo: 'turno' };
          }
        } catch (ex) {}
      }
    }
    if (!e.pendiente) return;
    const asientoEsp = e.espera.asiento;
    const p = jugadorEn(r, asientoEsp);
    const msg = Object.assign(
      { v: e.v, tipo: e.pendiente.tipo || 'turno', asiento: asientoEsp, vence: r.turnoVence || null, ahora: Date.now() },
      r.mazo.publica(e.pendiente.qid)
    );
    if (soloSid) {
      // comprobar si debe recibirla
      if (soloSid === r.hostSid) { io.to(soloSid).emit('partida:pregunta', msg); return; }
      if (r.juego === 'batalla' && p) {
        const equipo = asientoEsp % 2;
        // enviar a todo el equipo
        for (let i = 0; i < r.orden.length; i++) {
          if (i % 2 === equipo) {
            const pj = jugadorEn(r, i);
            if (pj && pj.online && pj.sid === soloSid) { io.to(soloSid).emit('partida:pregunta', msg); return; }
          }
        }
        return;
      }
      if (soloSid === (p && p.sid)) { io.to(soloSid).emit('partida:pregunta', msg); return; }
      return;
    }
    if (r.juego === 'batalla') {
      const equipo = asientoEsp % 2;
      for (let i = 0; i < r.orden.length; i++) {
        if (i % 2 === equipo) {
          const pj = jugadorEn(r, i);
          if (pj && pj.online && pj.sid) io.to(pj.sid).emit('partida:pregunta', msg);
        }
      }
      if (r.hostSid) io.to(r.hostSid).emit('partida:pregunta', msg);
      return;
    }
    if (p && p.online && p.sid) io.to(p.sid).emit('partida:pregunta', msg);
    if (r.hostSid) io.to(r.hostSid).emit('partida:pregunta', msg);
  }

  /* ---------- relojes ---------- */
  function limpiarTimers(r) { clearTimeout(r.timerTurno); clearTimeout(r.timerPartida); r.turnoVence = null; }

  function armarTimerTurno(r) {
    clearTimeout(r.timerTurno);
    r.turnoVence = null;
    if (r.fase !== 'jugando') return;
    const p = jugadorEn(r, r.estado.espera.asiento);
    const seg = p.online ? r.turnoSeg : Math.min(lim.graciaSeg, r.turnoSeg || lim.graciaSeg);
    if (!seg) return;
    r.turnoVence = Date.now() + seg * 1000;
    const v = r.estado.v;
    r.timerTurno = setTimeout(() => {
      if (r.fase !== 'jugando' || r.estado.v !== v) return;
      const quien = jugadorEn(r, r.estado.espera.asiento);
      aplicar(r, r.modulo.saltar(r.estado, quien && quien.online ? 'tiempo' : 'desconexion'));
    }, seg * 1000);
    if (r.timerTurno.unref) r.timerTurno.unref();
  }

  /* ---------- pipeline común tras cada cambio de estado ---------- */
  function aplicar(r, res) {
    if (!res || res.error) return res;
    r.estado = res.estado;
    r.ultima = Date.now();
    res.eventos.forEach((ev) => {
      if (ev.t !== 'respondida') return;
      const m = r.mazo.meta(ev.qid);
      r.registro[ev.asiento].push({ ref: m.ref, categoria: m.categoria, dificultadId: m.dificultadId, correcto: ev.correcto });
    });
    if (r.estado.fase === 'terminada') {
      r.fase = 'terminada';
      r.terminadaEn = Date.now();
      limpiarTimers(r);
      const fin = res.eventos.filter((x) => x.t === 'fin').pop();
      r.fin = { ganador: r.estado.ganador, motivo: r.estado.motivoFin, clasificacion: fin ? fin.clasificacion : [] };
      io.to(r.codigo).emit('partida:estado', payloadEstado(r, res.eventos));
      io.to(r.codigo).emit('partida:fin', r.fin);
      r.orden.forEach((pid, i) => { const p = r.jugadores.get(pid); if (p.online && p.sid) io.to(p.sid).emit('partida:registro', registroDe(r, i)); });
      emitSala(r);
      return res;
    }
    armarTimerTurno(r);
    io.to(r.codigo).emit('partida:estado', payloadEstado(r, res.eventos));
    emitPregunta(r);
    return res;
  }
  const registroDe = (r, i) => ({ respuestas: r.registro[i], gano: r.estado.ganador === i });

  /* ---------- ciclo de vida ---------- */
  function cerrarSala(r, aviso) {
    limpiarTimers(r);
    if (aviso !== false) io.to(r.codigo).emit('partida:cerrada', {});
    io.in(r.codigo).socketsLeave(r.codigo);
    salas.delete(r.codigo);
  }
  const barrido = setInterval(() => {
    const t = Date.now();
    salas.forEach((r) => {
      if (t - r.ultima > lim.inactivaMs || (r.terminadaEn && t - r.terminadaEn > lim.terminadaMs)) cerrarSala(r);
    });
  }, 600e3);
  if (barrido.unref) barrido.unref();

  /* ---------- conexión ---------- */
  io.on('connection', (s) => {
    s.data = s.data || {};
    const salaDocente = () => { const r = s.data.hostCodigo && salas.get(s.data.hostCodigo); return r && r.hostSid === s.id ? r : null; };
    const alumno = () => {
      const r = s.data.codigo && salas.get(s.data.codigo);
      const p = r && r.jugadores.get(s.data.pid);
      return r && p ? { r: r, p: p } : null;
    };

    /* ===== DOCENTE ===== */
    s.on('partida:crear', (d, cb) => {
      d = d || {};
      if (bloqueado(s)) return err(cb, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera un minuto.');
      if (!claveOk(d.key)) { registrarFallo(s); return err(cb, 'CLAVE_INCORRECTA', 'Clave de docente incorrecta'); }
      if (typeof d.juego !== 'string' || !Object.prototype.hasOwnProperty.call(JUEGOS, d.juego)) return err(cb, 'JUEGO_DESCONOCIDO', 'Juego no disponible');
      if (s.data.hostCodigo && salas.has(s.data.hostCodigo)) return err(cb, 'YA_TIENES_SALA', 'Ya tienes una sala abierta: ' + s.data.hostCodigo);
      if (salas.size >= lim.maxSalas) return err(cb, 'SERVIDOR_LLENO', 'Hay demasiadas salas abiertas');
      const banco = Preguntas.normalizarBanco(d.banco, { max: lim.maxBanco });
      if (!banco.preguntas.length) return err(cb, 'SIN_PREGUNTAS', 'No hay preguntas válidas');

      const a = d.ajustes && typeof d.ajustes === 'object' ? d.ajustes : {};
      const turnoSeg = d.turnoSeg === undefined ? lim.turnoPorDefecto : (+d.turnoSeg ? Math.min(lim.turnoMax, Math.max(lim.turnoMin, +d.turnoSeg | 0)) : 0);
      const tiempoSeg = d.tiempoSeg !== undefined ? (+d.tiempoSeg ? Math.min(lim.tiempoMax, Math.max(lim.tiempoMin, +d.tiempoSeg | 0)) : 0) : (+a.timeSeconds ? Math.min(lim.tiempoMax, Math.max(lim.tiempoMin, +a.timeSeconds | 0)) : 0);
      // Validar ajustes por juego
      const ajustes = {};
      if (a.trackLength !== undefined) { const v = Math.max(5, Math.min(50, +a.trackLength | 0)); ajustes.trackLength = v; }
      if (a.rows !== undefined) { const v = Math.max(4, Math.min(12, +a.rows | 0)); ajustes.rows = v; }
      if (a.cols !== undefined) { const v = Math.max(4, Math.min(12, +a.cols | 0)); ajustes.cols = v; }
      if (a.hpTotal !== undefined) { const v = Math.max(50, Math.min(500, +a.hpTotal | 0)); ajustes.hpTotal = v; }
      const codigo = nuevoCodigo(), token = crypto.randomBytes(12).toString('hex');
      const modulo = JUEGOS[d.juego];
      const r = {
        codigo: codigo, juego: d.juego, modulo: modulo, token: token, hostSid: s.id,
        fase: 'sala', estado: null, fin: null,
        mazo: Preguntas.crearMazo(banco.preguntas, { rng: rng, mezclarOpciones: a.mezclarOpciones !== false }),
        bancoPreguntas: banco.preguntas,
        ajustes: ajustes,
        turnoSeg: turnoSeg, tiempoSeg: tiempoSeg, turnoVence: null, partidaVence: null,
        jugadores: new Map(), orden: [], registro: [],
        creada: Date.now(), ultima: Date.now(), terminadaEn: null, timerTurno: null, timerPartida: null
      };
      salas.set(codigo, r);
      s.join(codigo);
      s.data.hostCodigo = codigo;
      ack(cb, { ok: true, codigo: codigo, token: token, juego: d.juego, min: modulo.min, max: modulo.max,
        aceptadas: banco.preguntas.length, descartadas: banco.descartadas, turnoSeg: turnoSeg, tiempoSeg: tiempoSeg });
    });

    s.on('partida:configurar', (d, cb) => {
      const r = salaDocente();
      if (!r) return err(cb, 'SALA_NO_EXISTE', 'No eres el docente de una sala');
      if (r.fase !== 'sala') return err(cb, 'PARTIDA_EMPEZADA', 'Solo se puede configurar antes de empezar');
      d = d || {};
      if (typeof d.juego === 'string') {
        if (!Object.prototype.hasOwnProperty.call(JUEGOS, d.juego)) return err(cb, 'JUEGO_DESCONOCIDO', 'Juego no disponible');
        const nuevoModulo = JUEGOS[d.juego];
        if (r.orden.length < nuevoModulo.min) return err(cb, 'MIN_JUGADORES', 'Faltan jugadores para ese juego (mínimo ' + nuevoModulo.min + ')');
        if (r.orden.length > nuevoModulo.max) return err(cb, 'SALA_LLENA', 'Demasiados jugadores para ese juego (máximo ' + nuevoModulo.max + ')');
        r.juego = d.juego;
        r.modulo = nuevoModulo;
      }
      if (Array.isArray(d.banco) || Array.isArray(d.preguntas)) {
        const banco = Preguntas.normalizarBanco(d.banco || d.preguntas, { max: lim.maxBanco });
        if (!banco.preguntas.length) return err(cb, 'SIN_PREGUNTAS', 'No hay preguntas válidas');
        r.bancoPreguntas = banco.preguntas;
        r.mazo = Preguntas.crearMazo(banco.preguntas, { rng: rng, mezclarOpciones: (d.ajustes && d.ajustes.mezclarOpciones) !== false });
      }
      const a = d.ajustes && typeof d.ajustes === 'object' ? d.ajustes : {};
      const ajustes = Object.assign({}, r.ajustes || {});
      if (a.trackLength !== undefined) { const v = Math.max(5, Math.min(50, +a.trackLength | 0)); ajustes.trackLength = v; }
      if (a.rows !== undefined) { const v = Math.max(4, Math.min(12, +a.rows | 0)); ajustes.rows = v; }
      if (a.cols !== undefined) { const v = Math.max(4, Math.min(12, +a.cols | 0)); ajustes.cols = v; }
      if (a.hpTotal !== undefined) { const v = Math.max(50, Math.min(500, +a.hpTotal | 0)); ajustes.hpTotal = v; }
      r.ajustes = ajustes;
      if (d.turnoSeg !== undefined) {
        r.turnoSeg = d.turnoSeg ? Math.min(lim.turnoMax, Math.max(lim.turnoMin, +d.turnoSeg | 0)) : 0;
      }
      if (d.tiempoSeg !== undefined) {
        r.tiempoSeg = d.tiempoSeg ? Math.min(lim.tiempoMax, Math.max(lim.tiempoMin, +d.tiempoSeg | 0)) : 0;
      } else if (a.timeSeconds !== undefined) {
        r.tiempoSeg = a.timeSeconds ? Math.min(lim.tiempoMax, Math.max(lim.tiempoMin, +a.timeSeconds | 0)) : 0;
      }
      emitSala(r);
      ack(cb, { ok: true, juego: r.juego, ajustes: r.ajustes, turnoSeg: r.turnoSeg, tiempoSeg: r.tiempoSeg });
    });

    s.on('partida:docente-volver', (d, cb) => {
      d = d || {};
      if (bloqueado(s)) return err(cb, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera un minuto.');
      const r = typeof d.codigo === 'string' ? salas.get(d.codigo.toUpperCase().slice(0, 4)) : null;
      if (!r || typeof d.token !== 'string' || !iguales(d.token, r.token)) { registrarFallo(s); return err(cb, 'SALA_NO_EXISTE', 'Sala o token no válidos'); }
      r.hostSid = s.id; s.join(r.codigo); s.data.hostCodigo = r.codigo;
      ack(cb, { ok: true, sala: vistaSala(r), estado: r.estado ? payloadEstado(r, []) : null, fin: r.fin });
      emitPregunta(r, s.id);
    });

    s.on('partida:iniciar', (_d, cb) => {
      const r = salaDocente();
      if (!r) return err(cb, 'SALA_NO_EXISTE', 'No eres el docente de una sala');
      if (r.fase !== 'sala') return err(cb, 'PARTIDA_EMPEZADA', 'La partida ya empezó');
      if (r.orden.length < r.modulo.min) return err(cb, 'MIN_JUGADORES', 'Faltan jugadores (mínimo ' + r.modulo.min + ')');
      r.estado = r.modulo.create({
        asientos: r.orden.map((pid, i) => { const p = r.jugadores.get(pid); return { id: 's' + i, nombre: p.nombre, avatar: p.avatar }; }),   // id público: nunca el pid
        ajustes: r.ajustes
      });
      r.registro = r.orden.map(() => []);
      r.fase = 'jugando';
      r.ultima = Date.now();
      if (r.tiempoSeg) {
        r.partidaVence = Date.now() + r.tiempoSeg * 1000;
        r.timerPartida = setTimeout(() => { if (r.fase === 'jugando') aplicar(r, r.modulo.terminarPorTiempo(r.estado)); }, r.tiempoSeg * 1000);
        if (r.timerPartida.unref) r.timerPartida.unref();
      }
      armarTimerTurno(r);
      emitSala(r);
      io.to(r.codigo).emit('partida:estado', payloadEstado(r, []));
      emitPregunta(r);
      ack(cb, { ok: true });
    });

    s.on('partida:expulsar', (d, cb) => {
      const r = salaDocente();
      if (!r) return err(cb, 'SALA_NO_EXISTE', 'No eres el docente de una sala');
      if (r.fase !== 'sala') return err(cb, 'PARTIDA_EMPEZADA', 'Solo se puede expulsar antes de empezar');
      const pid = r.orden[d && d.asiento];
      if (!pid) return err(cb, 'JUGADOR_NO_EXISTE', 'Ese asiento no existe');
      const p = r.jugadores.get(pid);
      r.jugadores.delete(pid); r.orden.splice(r.orden.indexOf(pid), 1);
      const sock = p.sid && io.sockets.sockets.get(p.sid);
      if (sock) { sock.emit('partida:expulsado', {}); sock.leave(r.codigo); sock.data.codigo = null; sock.data.pid = null; }
      emitSala(r);
      ack(cb, { ok: true });
    });

    s.on('partida:saltar-turno', (_d, cb) => {
      const r = salaDocente();
      if (!r) return err(cb, 'SALA_NO_EXISTE', 'No eres el docente de una sala');
      if (r.fase !== 'jugando') return err(cb, 'FASE_INCORRECTA', 'No hay partida en curso');
      aplicar(r, r.modulo.saltar(r.estado, 'docente'));
      ack(cb, { ok: true });
    });

    s.on('partida:cerrar', (_d, cb) => {
      const r = salaDocente();
      if (!r) return err(cb, 'SALA_NO_EXISTE', 'No eres el docente de una sala');
      cerrarSala(r);
      s.data.hostCodigo = null;
      ack(cb, { ok: true });
    });

    /* ===== ALUMNO ===== */
    s.on('partida:unirse', (d, cb) => {
      d = d || {};
      if (bloqueado(s)) return err(cb, 'DEMASIADOS_INTENTOS', 'Demasiados intentos. Espera un minuto.');
      const r = typeof d.codigo === 'string' ? salas.get(d.codigo.trim().toUpperCase().slice(0, 4)) : null;
      if (!r) { registrarFallo(s); return err(cb, 'SALA_NO_EXISTE', 'Código no encontrado'); }

      let p = typeof d.pid === 'string' ? r.jugadores.get(d.pid) : null;
      if (p) {                                       // reconexión: retoma su lugar
        p.sid = s.id; p.online = true;
      } else {
        if (r.fase !== 'sala') return err(cb, 'PARTIDA_EMPEZADA', 'La partida ya empezó');
        const nombre = limpiar(d.nombre, 14);
        if (nombre.length < 2) return err(cb, 'NOMBRE_CORTO', 'Escribe un nombre (mínimo 2 letras)');
        if ([...r.jugadores.values()].some((x) => x.nombre.toLowerCase() === nombre.toLowerCase())) return err(cb, 'NOMBRE_USADO', 'Ese nombre ya está en uso');
        if (r.orden.length >= r.modulo.max) return err(cb, 'SALA_LLENA', 'La sala está llena');
        const pid = crypto.randomBytes(9).toString('base64url');
        p = { pid: pid, nombre: nombre, avatar: (+d.avatar | 0) % 16, sid: s.id, online: true };
        r.jugadores.set(pid, p); r.orden.push(pid);
      }
      s.join(r.codigo);
      s.data.codigo = r.codigo; s.data.pid = p.pid;
      r.ultima = Date.now();
      const asiento = asientoDe(r, p.pid);
      ack(cb, { ok: true, pid: p.pid, codigo: r.codigo, juego: r.juego, fase: r.fase,
        yo: { asiento: asiento, color: colorDe(r, asiento), nombre: p.nombre } });
      emitSala(r);
      if (r.fase !== 'sala') {
        s.emit('partida:estado', payloadEstado(r, []));
        emitPregunta(r, s.id);
        if (r.fase === 'jugando' && r.estado.espera.asiento === asiento) armarTimerTurno(r);
        if (r.fase === 'terminada') { s.emit('partida:fin', r.fin); s.emit('partida:registro', registroDe(r, asiento)); }
      }
    });

    s.on('partida:accion', (d, cb) => {
      const x = alumno();
      if (!x) return err(cb, 'SALA_NO_EXISTE', 'No estás en una sala');
      const r = x.r, p = x.p;
      if (p.sid !== s.id) return err(cb, 'SESION_REEMPLAZADA', 'Entraste desde otro dispositivo');
      if (r.fase !== 'jugando') return err(cb, 'FASE_INCORRECTA', r.fase === 'sala' ? 'La partida no ha empezado' : 'La partida terminó');
      const t = Date.now(), w = s.data.acc || (s.data.acc = { t0: t, n: 0 });
      if (t - w.t0 > 1000) { w.t0 = t; w.n = 0; }
      if (++w.n > lim.accionesPorSeg) return err(cb, 'DEMASIADAS_ACCIONES', 'Más despacio');

      d = d && typeof d === 'object' ? d : {};
      const accion = {};
      if (typeof d.tipo === 'string') accion.tipo = d.tipo.slice(0, 24);
      if (d.eleccion !== undefined) accion.eleccion = d.eleccion;
      if (d.zona !== undefined) accion.zona = d.zona;
      if (d.idx !== undefined) accion.idx = d.idx;
      if (d.casilla !== undefined) accion.casilla = d.casilla;
      const res = r.modulo.act(r.estado, asientoDe(r, p.pid), accion, { rng: rng, mazo: r.mazo });
      if (res.error) return err(cb, res.error.codigo, res.error.mensaje);
      aplicar(r, res);
      ack(cb, { ok: true });
    });

    s.on('partida:salir', (_d, cb) => {
      const x = alumno();
      if (!x) return ack(cb, { ok: true });
      const r = x.r, p = x.p;
      s.leave(r.codigo);
      s.data.codigo = null; s.data.pid = null;
      if (r.fase === 'sala') { r.jugadores.delete(p.pid); r.orden.splice(r.orden.indexOf(p.pid), 1); }
      else { p.online = false; if (r.fase === 'jugando' && jugadorEn(r, r.estado.espera.asiento) === p) armarTimerTurno(r); }
      emitSala(r);
      ack(cb, { ok: true });
    });

    s.on('disconnect', () => {
      const x = alumno();
      if (!x || x.p.sid !== s.id) return;
      x.p.online = false;
      emitSala(x.r);
      if (x.r.fase === 'jugando' && jugadorEn(x.r, x.r.estado.espera.asiento) === x.p) armarTimerTurno(x.r);   // arranca la gracia por desconexión
    });
  });

  return {
    salas: salas,
    stats: () => ({ salas: salas.size, jugadores: [...salas.values()].reduce((n, r) => n + r.jugadores.size, 0) }),
    cerrarTodas: () => { clearInterval(barrido); [...salas.values()].forEach((r) => cerrarSala(r, false)); }
  };
}

module.exports = { attach, LIMITES };
