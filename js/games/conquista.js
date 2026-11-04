/* ============================================================
 * LudoApp games/conquista.js
 * CONQUISTA DE TERRITORIOS: mapa en zonas; responder bien
 * conquista una zona neutral o ataca una zona rival; el rival
 * puede defender respondiendo. Vista de mapa con color por
 * equipo y contador de zonas controladas.
 * ============================================================ */
window.App = window.App || {};
App.games = App.games || {};
App.games.conquista = (function (ui) {
  const MODE = 'conquista';
  const esc = function(x){ return String(x == null ? '' : x).replace(/[&<>"']/g, function(c){ var map={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}; return map[c] || c; }); };

  function init(config) {
    const root = config.container;
    const engine = App.questionEngine.createEngine({
      courseId: config.courseId,
      categoryId: config.categoryId,
      difficultyId: config.difficultyId
    });
    /* la retícula del SVG terreno-de-conquista.svg es 8x8 (ver SCENE abajo);
       6x6 dejaba las columnas/filas derechas del tablero sin parcelas */
    const ROWS = config.rows || 8;
    const COLS = config.cols || 8;
    const TOTAL = ROWS * COLS;
    const MAJORITY = Math.floor(TOTAL / 2) + 1;
    const colors = ['rojo', 'verde', 'azul', 'amarillo'];

    const players = config.players.map((p, i) => ({
      ...p, color: colors[i % 4], zonas: 0, streak: 0, pendHint: false, pendComodin: false
    }));
    const baseCells = [[0, 0], [0, COLS - 1], [ROWS - 1, COLS - 1], [ROWS - 1, 0]];

    const zones = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) zones.push({ r, c, owner: null });
    }
    players.forEach((_, pi) => {
      const [br, bc] = baseCells[pi % baseCells.length];
      if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) zones[br * COLS + bc].owner = pi;
    });
    const state = { turn: 0, ended: false, target: null, busy: false };
    const mapaInit = zones.map((z)=> z.owner);
    const est = { asientos: players, turno: state.turn, fase: 'elegir', rows: ROWS, cols: COLS, mapa: mapaInit, espera: { asiento: state.turn, que: 'elegir' } };

    root.innerHTML = '';
    root.appendChild(ui.el('div', 'text-center text-xl font-extrabold text-slate-900 mb-2', '🗺️ Conquista de Territorios'));
    root.appendChild(ui.el('div', 'text-center text-xs text-slate-500 mb-3', 'Meta: controlar <b>' + MAJORITY + '</b> de ' + TOTAL + ' zonas · Responde bien para conquistar una zona adyacente'));

    const counters = ui.el('div', 'flex flex-wrap gap-2 justify-center mb-3', '');
    root.appendChild(counters);
/* geometria de la escena (SVG terreno-de-conquista.svg, viewBox 680x380):
   el tablero dibujado en la imagen va de x=40..640 e y=20..360, en 8x8 celdas.
   Si el modo no usa escenario (o cambia de tamaño), se cae a un tablero propio. */
const SCENE = { W: 680, H: 380, BOARD_X: 40, BOARD_Y: 20, CELL_W: 75, CELL_H: 42.5 };

const mapEl = ui.el('div', 'cq-map', '');
const inScene = !!config.escenaCapa;
if (inScene) {
  config.escenaCapa.appendChild(mapEl);   /* las parcelas viven DENTRO de la imagen */
} else {
  mapEl.style.position = 'relative';
  mapEl.style.maxWidth = '620px';
  mapEl.style.margin = '10px auto 0';
  mapEl.style.display = 'grid';
  mapEl.style.gap = '6px';
  mapEl.style.gridTemplateColumns = 'repeat(' + COLS + ', 1fr)';
  mapEl.style.gridTemplateRows = 'repeat(' + ROWS + ', 1fr)';
  root.appendChild(mapEl);
}

    function paintCounters() {
      const lista = (est && est.asientos) ? est.asientos : players;
      const rowsM = (est && est.rows) ? est.rows : ROWS;
      const colsM = (est && est.cols) ? est.cols : COLS;
      const totalM = rowsM * colsM;
      const turno = (est && typeof est.turno === 'number') ? est.turno : state.turn;
      if (App.gamekit && App.gamekit.renderChips) {
        App.gamekit.renderChips(counters, lista, {
          activeIdx: turno,
          extra: (p) => (p.zonas || 0) + ' zonas (' + Math.round((p.zonas || 0) / totalM * 100) + '%)'
        });
      } else {
        counters.innerHTML = '';
        lista.forEach((p,i)=>{
          const chip = ui.el('div','l-chip'+(turno===i?' l-chip-active':''),'');
          chip.appendChild(ui.el('span','text-xs', esc(p.nombre)+' '+(p.zonas||0)));
          counters.appendChild(chip);
        });
      }
    }

    function legalTargets(pi) {
      const owned = zones.filter((z) => z.owner === pi);
      const ok = [];
      zones.forEach((z) => {
        if (z.owner === pi) return;
        const adj = owned.some((o) => Math.abs(o.r - z.r) + Math.abs(o.c - z.c) === 1);
        if (adj) ok.push(z);
      });
      return ok;
    }

    function paintMap() {
      mapEl.innerHTML = '';
      const listaAs = (est && est.asientos) ? est.asientos : players;
      const mapa = (est && est.mapa) ? est.mapa : zones.map((z)=> z.owner);
      const rowsM = (est && est.rows) ? est.rows : ROWS;
      const colsM = (est && est.cols) ? est.cols : COLS;
      for (let r = 0; r < rowsM; r++) {
        for (let c = 0; c < colsM; c++) {
          const idx = r * colsM + c;
          const owner = mapa[idx];
          const btn = ui.el('button', 'cq-zone' + (owner === null || owner === undefined ? ' cq-neutral' : ''), '');
          if (inScene) {
            btn.style.left = (SCENE.BOARD_X + c * SCENE.CELL_W) / SCENE.W * 100 + '%';
            btn.style.top = (SCENE.BOARD_Y + r * SCENE.CELL_H) / SCENE.H * 100 + '%';
            btn.style.width = SCENE.CELL_W / SCENE.W * 100 + '%';
            btn.style.height = SCENE.CELL_H / SCENE.H * 100 + '%';
          } else {
            btn.style.position = 'static';
            btn.style.width = '100%';
            btn.style.height = '100%';
          }
          if (owner === null || owner === undefined) {
            btn.appendChild(ui.el('span', 'cq-flag', '🌫️'));
          } else {
            const pOwner = listaAs[owner] || players[owner];
            if (pOwner) {
              const ch = pOwner.avatar || (App.avatars && App.avatars.pick ? App.avatars.pick(owner) : null);
              const cnv = document.createElement('canvas');
              cnv.width = cnv.height = 26;
              cnv.className = 'avatar-canvas';
              const g = cnv.getContext('2d');
              if (g && ch && App.avatars && App.avatars.drawIcon) App.avatars.drawIcon(g, 5, 5, 1, ch, 'right');
              btn.appendChild(cnv);
              const sStyle = ui.teamStyle ? ui.teamStyle(pOwner.color) : { color: '#94a3b8' };
              btn.style.background = (sStyle.color || '#94a3b8') + '38';
              btn.style.boxShadow = 'inset 0 0 0 2px ' + (sStyle.color || '#94a3b8');
              btn.title = pOwner.nombre || '';
            }
          }
          if (state.target === idx) btn.classList.add('cq-target');
          btn.addEventListener('click', () => { if (state.ended) return; selectZone(idx); });
          mapEl.appendChild(btn);
        }
      }
    }

    function selectZone(idx) {
      if (state.ended || state.busy) return;
      const z = zones[idx];
      const pi = state.turn;
      if (z.owner === pi) return;
      const legal = legalTargets(pi).some((x) => zones.indexOf(x) === idx);
      if (!legal) { ui.toast('Debes elegir una zona adyacente a las tuyas', 'warn'); return; }
      state.target = idx;
      paintMap();
      paintCounters();
      ui.toast('🎯 Atacando ' + (z.owner === null ? 'zona neutral' : 'zona de ' + players[z.owner].nombre), 'info');
      resolveTurn(pi, idx);
    }

    /* ---- pregunta ---- */
    const qArea = ui.el('div', 'mt-2', '');
    root.appendChild(qArea);
    const hud = ui.el('div', 'flex flex-wrap items-center justify-between gap-2 mb-2', '');
    hud.innerHTML = '<div class="text-sm font-bold" id="cq-turn"></div><div id="cq-skills" class="flex flex-wrap gap-2"></div>';
    root.appendChild(hud);
    const turnEl = hud.querySelector('#cq-turn');
    const skillsEl = hud.querySelector('#cq-skills');

    const profileOf = (id) => App.storage.getById('players', id);

    function setTurnUI() {
      const p = players[state.turn];
      turnEl.innerHTML = '';
      turnEl.appendChild(App.avatars.badge(p.avatar || App.avatars.pick(state.turn), 26));
      turnEl.appendChild(document.createTextNode(' Turno de '));
      turnEl.appendChild(ui.el('b', '', p.nombre));
      turnEl.appendChild(document.createTextNode(' · elige una zona'));
      renderSkills(p);
      paintCounters();
    }

    function renderSkills(p) {
      const pr = profileOf(p.id);
      if (!pr) { skillsEl.innerHTML = ''; return; }
      const list = [['pista', '💡', 'Pista'], ['comodin', '🃏', 'Comodín']];
      App.gamekit.renderSkills(skillsEl, list.map(([sk, ic, nm]) => ({
        key: sk, icono: ic, nombre: nm, amount: (pr.skills || {})[sk] || 0
      })), (sk) => {
        if (state.ended) return;
        App.progression.useSkill(pr, sk);
        if (sk === 'pista') p.pendHint = true;
        if (sk === 'comodin') p.pendComodin = true;
        ui.sound('dice');
        renderSkills(p);
      }, state.ended);
    }

    function askPlayer(p) {
      if (p.pendComodin) {
        p.pendComodin = false;
        const q = engine.draw();
        const res = App.progression.recordAnswer(profileOf(p.id), {
          question: q, selectedIndex: q.respuesta_correcta,
          difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId
        });
        return Promise.resolve({ correct: true, achievements: res.achievements });
      }
      const q = engine.draw();
      const ctx = { engine, question: q, extraBadges: [] };
      let hinted = p.pendHint;
      p.pendHint = false;
      return new Promise((resolve) => {
        ui.question(ctx, qArea, {
          onHint: () => { if (hinted) { hinted = false; return true; } return false; },
          onAnswered: (r) => {
            const res = App.progression.recordAnswer(profileOf(p.id), {
              question: q, selectedIndex: r.selectedIndex,
              difficultyId: q.difficulty_id, mode: MODE, courseId: config.courseId
            });
            resolve({ correct: res.correct, achievements: res.achievements });
          }
        });
      });
    }

    async function conquer(pi, idx) {
      zones[idx].owner = pi;
      players[pi].zonas++;
      state.target = null;
      paintMap();
      paintCounters();
      ui.sound('correct');
      ui.confetti(mapEl);
      ui.toast('🏴 ' + players[pi].nombre + ' conquistó el territorio', 'success');
      if (players[pi].zonas >= MAJORITY) return endGame(pi);
      nextTurn(pi);
    }

    async function defend(attacker, rivalIdx, idx) {
      ui.toast('🛡️ ' + players[rivalIdx].nombre + ' tiene derecho a defender', 'info');
      qArea.innerHTML = '';
      const dflabel = ui.el('div', 'text-center text-sm font-bold mb-2', '🛡️ La defensa de ' + players[rivalIdx].nombre);
      qArea.appendChild(dflabel);
      const res = await askPlayer(players[rivalIdx]);
      if (res.correct) {
        ui.sound('correct');
        players[rivalIdx].streak++;
        ui.toast('✅ Territorio defendido por ' + players[rivalIdx].nombre, 'success');
        state.target = null;
        paintMap();
        return nextTurn(attacker);
      }
      await conquer(attacker, idx);
    }

    async function resolveTurn(pi, idx) {
      const z = zones[idx];
      state.busy = true;
      setTurnUI();
      qArea.innerHTML = '';
      qArea.appendChild(ui.el('div', 'text-center text-sm font-bold mb-2',
        '⚔️ ' + players[pi].nombre + ' ataca ' + (z.owner === null ? 'zona neutral de la casilla ' + (idx + 1) : 'el territorio de ' + players[z.owner].nombre)));
      const res = await askPlayer(players[pi]);
      if (state.ended) return;
      if (res.correct) {
        res.achievements.forEach((a) => ui.toast('🏅 Logro: ' + a.titulo, 'success'));
        if (z.owner === null) {
          players[pi].streak++;
          await conquer(pi, idx);
        } else {
          await defend(pi, z.owner, idx);
        }
      } else {
        players[pi].streak = 0;
        ui.sound('wrong');
        ui.toast(players[pi].nombre + ' falló: no hay conquista', 'error');
        state.target = null;
        paintMap();
        const next = ui.el('button', 'btn-primary w-full mt-3', 'Siguiente turno →');
        next.addEventListener('click', () => nextTurn(state.turn));
        qArea.appendChild(next);
      }
    }

    function nextTurn(fromIdx) {
      if (state.ended) return;
      state.turn = (fromIdx + 1) % players.length;
      state.target = null;
      state.busy = false;
      setTurnUI();
      paintMap();
      ui.toast('🗺️ Le toca a ' + players[state.turn].nombre + ': elige una zona', 'info');
      qArea.innerHTML = '';
    }

    function standings() {
      return players.slice().sort((a, b) => b.zonas - a.zonas || b.id.localeCompare(a.id));
    }

    function bonusOf(winner) {
      return App.gamekit.bonusForPlayer(winner, profileOf, MODE);
    }

    function endGame(winIdx) {
      if (state.ended) return;
      state.ended = true;
      state.busy = true;
      const win = players[winIdx];
      const bonus = bonusOf(win);
      const st = players.map((p, i) => ({ id: p.id, nombre: p.nombre, color: p.color, puntos: p.zonas, subtitulo: p.zonas + ' zonas' }));
      if (App.session && App.session.record) App.session.record(config, st, MODE);
      App.gamekit.podium(root, st.map((s, i) => ({
        nombre: s.nombre, icono: '🗺️', rank: i + 1, subtitulo: s.subtitulo,
        campo1Label: 'Zonas', campo1: s.puntos, campo2Label: 'Meta ', campo2: MAJORITY
      })), { title: '🏆 ¡' + win.nombre + ' conquistó el mapa!', subtitle: win.nombre + ' controla ' + win.zonas + ' de ' + TOTAL + ' zonas', bonus });
    }

    function startTimer() {
      App.gamekit.timerBox(root, config.timeSeconds, () => {
        if (state.ended) return;
        state.ended = true;
        state.busy = true;
        const ranked = standings();
        const win = ranked[0];
        const bonus = bonusOf(win);
        const st = ranked.map((p) => ({
          id: p.id, nombre: p.nombre, color: p.color,
          puntos: p.zonas, subtitulo: p.zonas + ' zonas'
        }));
        if (App.session && App.session.record) App.session.record(config, st, MODE);
        App.gamekit.podium(root, st.map((s, i) => ({
          nombre: s.nombre, icono: '🗺️', rank: i + 1,
          subtitulo: s.subtitulo, campo1Label: 'Zonas', campo1: s.puntos, campo2Label: 'Meta ', campo2: MAJORITY
        })), { title: '⏱️ Tiempo agotado', subtitle: 'Gana quien controla más zonas', bonus });
      });
    }

    startTimer();
    setTurnUI();
    paintMap();
  }




  function initNet(config) {
    const NET = App.net;
    const escFn = esc;
    if (!NET) {
      if (config.container) config.container.appendChild(ui.el('p','text-sm text-slate-400','La partida en red no está disponible.'));
      return;
    }
    const root = config.container;
    root.innerHTML = '';
    root.appendChild(ui.el('div', 'text-center text-xl font-extrabold text-slate-900 mb-2', '🗺️ Conquista de Territorios'));

    let est = NET.estado ? JSON.parse(JSON.stringify(NET.estado())) : null;
    let preg = NET.pregunta ? NET.pregunta() : null;
    let fin = NET.fin ? NET.fin() : null;
    let registro = NET.registro ? NET.registro() : null;
    let enviando = false;
    let vivo = true;

    const rowsM0 = (est && est.rows) || (config.rows||8);
    const colsM0 = (est && est.cols) || (config.cols||8);
    const TOTAL0 = rowsM0*colsM0;
    const MAJ0 = Math.floor(TOTAL0/2)+1;
    root.appendChild(ui.el('div','text-center text-xs text-slate-500 mb-3','Meta: controlar <b>'+MAJ0+'</b> de '+TOTAL0+' zonas'));

    const counters = ui.el('div', 'flex flex-wrap gap-2 justify-center mb-3', '');
    root.appendChild(counters);
    const SCENE = { W: 680, H: 380, BOARD_X: 40, BOARD_Y: 20, CELL_W: 75, CELL_H: 42.5 };
    const mapEl = ui.el('div', 'cq-map', '');
    const inScene = !!config.escenaCapa;
    if (inScene) config.escenaCapa.appendChild(mapEl);
    else { mapEl.style.position='relative'; mapEl.style.maxWidth='620px'; mapEl.style.margin='10px auto 0'; mapEl.style.display='grid'; mapEl.style.gap='6px'; mapEl.style.gridTemplateColumns='repeat('+colsM0+',1fr)'; root.appendChild(mapEl); }

    const hud = ui.el('div','flex flex-wrap items-center justify-between gap-2 mb-2','');
    hud.innerHTML = '<div class="text-sm font-bold" id="cq-turn-n"></div>';
    root.appendChild(hud);
    const turnEl = hud.querySelector('#cq-turn-n');
    const qArea = ui.el('div','mt-2','');
    root.appendChild(qArea);

    function paintCountersNet(){
      const lista = (est && est.asientos)?est.asientos:(NET.sala()?NET.sala().jugadores:[]);
      const rowsM=(est&&est.rows)||rowsM0, colsM=(est&&est.cols)||colsM0, totalM=rowsM*colsM;
      const turno=(est&&typeof est.turno==='number')?est.turno:0;
      counters.innerHTML='';
      if (App.gamekit && App.gamekit.renderChips){
        try{ App.gamekit.renderChips(counters, lista, {activeIdx:turno, extra:(p)=> (p.zonas||0)+' zonas ('+Math.round((p.zonas||0)/totalM*100)+'%)'}); return; }catch(e){}
      }
      lista.forEach((p,i)=>{
        const chip = ui.el('div','l-chip'+(turno===i?' l-chip-active':''),'');
        chip.appendChild(ui.el('span','text-xs', escFn(p.nombre)+' '+(p.zonas||0)));
        counters.appendChild(chip);
      });
    }

    function paintMapNet(){
      mapEl.innerHTML='';
      const lista = (est && est.asientos)?est.asientos:(NET.sala()?NET.sala().jugadores:[]);
      const mapa = (est && est.mapa)?est.mapa:[];
      const rowsM=(est&&est.rows)||rowsM0, colsM=(est&&est.cols)||colsM0;
      if(!inScene){ mapEl.style.gridTemplateColumns='repeat('+colsM+',1fr)'; }
      for(let r=0;r<rowsM;r++){
        for(let c=0;c<colsM;c++){
          const idx=r*colsM+c;
          const owner = mapa[idx];
          const btn = ui.el('button','cq-zone'+(owner===null||owner===undefined?' cq-neutral':''),'');
          if(inScene){
            btn.style.left=(SCENE.BOARD_X+c*SCENE.CELL_W)/SCENE.W*100+'%';
            btn.style.top=(SCENE.BOARD_Y+r*SCENE.CELL_H)/SCENE.H*100+'%';
            btn.style.width=SCENE.CELL_W/SCENE.W*100+'%';
            btn.style.height=SCENE.CELL_H/SCENE.H*100+'%';
          }else{ btn.style.position='static'; btn.style.width='100%'; btn.style.height='100%'; }
          if(owner===null||owner===undefined){ btn.appendChild(ui.el('span','cq-flag','🌫️')); }
          else {
            const pOwner = lista[owner];
            if(pOwner && App.avatars){
              const ch = pOwner.avatar || App.avatars.pick(owner);
              const cnv=document.createElement('canvas'); cnv.width=cnv.height=26; cnv.className='avatar-canvas';
              const g=cnv.getContext('2d'); if(g) App.avatars.drawIcon(g,5,5,1,ch,'right'); btn.appendChild(cnv);
            }
            const sStyle = ui.teamStyle ? ui.teamStyle((lista[owner]&&lista[owner].color)||'rojo') : {color:'#94a3b8'};
            btn.style.background=(sStyle.color||'#94a3b8')+'38'; btn.style.boxShadow='inset 0 0 0 2px '+(sStyle.color||'#94a3b8');
            if(lista[owner]) btn.title=lista[owner].nombre||'';
          }
          mapEl.appendChild(btn);
        }
      }
    }

    function setTurnUINet(){
      const lista = (est && est.asientos)?est.asientos:(NET.sala()?NET.sala().jugadores:[]);
      const turno=(est&&typeof est.turno==='number')?est.turno:0;
      const p = lista[turno]||lista[0]||{};
      turnEl.innerHTML='';
      if(App.avatars && App.avatars.badge) turnEl.appendChild(App.avatars.badge(p.avatar || (App.avatars.pick?App.avatars.pick(turno):null),24));
      turnEl.appendChild(document.createTextNode(' Turno: '));
      turnEl.appendChild(ui.el('b','', escFn(p.nombre)));
      paintCountersNet();
      paintMapNet();
    }

    function mostrarPregunta(){
      qArea.innerHTML='';
      if(!preg || !preg.enunciado){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Cargando pregunta…')); return; }
      const card = ui.el('div','q-card','');
      card.appendChild(ui.el('div','text-xs text-slate-400 mb-1',(preg.tipo==='defensa'?'🛡️ Defensa':'⚔️ Ataque')+(preg.categoria?' · '+escFn(preg.categoria):'')+(preg.dificultad?' · '+escFn(preg.dificultad):'')));
      card.appendChild(ui.el('h3','q-text text-slate-900',escFn(preg.enunciado)));
      const list = ui.el('div','grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4','');
      const yo = () => (config.rol==='docente'?null:(NET.yo?NET.yo():null));
      const esMiTurno = () => est && est.espera && est.espera.asiento === yo();
      const puedo = esMiTurno();
      (preg.opciones||[]).forEach((op,i)=>{
        const b = ui.el('button','opt-btn s'+i,'<span class="opt-label">'+escFn(op)+'</span>');
        if(!puedo) b.disabled=true;
        b.addEventListener('click',()=>{
          if(enviando) return; enviando=true; list.querySelectorAll('.opt-btn').forEach((x)=>{x.disabled=true;});
          NET.accion({tipo:'responder', eleccion:i}).then((r)=>{ enviando=false; if(!r||!r.ok){ if(ui.toast) ui.toast((r&&(r.mensaje||r.error))||'No se pudo responder','error'); pintarNet(); }});
        });
        list.appendChild(b);
      });
      card.appendChild(list);
      qArea.appendChild(card);
      if(!puedo && est && est.espera){ const lista=(est&&est.asientos)?est.asientos:[]; const nom=lista[est.espera.asiento]?lista[est.espera.asiento].nombre:''; qArea.appendChild(ui.el('p','text-xs text-slate-400 mt-2',escFn(nom)+(preg.tipo==='defensa'?' está defendiendo…':' está respondiendo…'))); }
    }

    function pintarPodioNet(){
      qArea.innerHTML='';
      const lista=(est&&est.asientos)?est.asientos:(NET.sala()?NET.sala().jugadores:[]);
      const sorted = lista.slice().sort((a,b)=>(b.zonas||0)-(a.zonas||0));
      sorted.slice(0,4).forEach((p,i)=>{
        const row = ui.el('div','fin-row','');
        row.appendChild(ui.el('span','text-lg',['🥇','🥈','🥉','🏅'][i]||'🏅'));
        row.appendChild(ui.el('div','flex-1','<b>'+escFn(p.nombre)+'</b><span class="text-xs text-slate-400"> '+(p.zonas||0)+' zonas</span>'));
        qArea.appendChild(row);
      });
      if(registro){ qArea.appendChild(ui.el('p','text-sm text-center mt-2','Respondiste bien <b>'+((registro.respuestas||[]).filter((r)=>r.correcto).length)+'</b> de <b>'+((registro.respuestas||[]).length)+'</b> preguntas.')); }
      const volver = ui.el('button','btn-primary w-full mt-3','Volver al inicio');
      volver.addEventListener('click',()=>{ limpiarNet(); const rolc=config.rol||(NET.rol?NET.rol():'alumno'); App.go(rolc==='docente'?'inicio':'red'); });
      qArea.appendChild(volver);
      if((config.rol||(NET.rol?NET.rol():''))==='docente'){ const cerr=ui.el('button','btn-ghost w-full mt-2','Cerrar sala'); cerr.addEventListener('click',()=>NET.cerrar().then(()=>App.go('inicio'))); qArea.appendChild(cerr); }
    }

    function pintarNet(){
      if(!vivo||!document.body.contains(root)){ limpiarNet(); return; }
      paintMapNet(); paintCountersNet(); setTurnUINet();
      const finNow = fin || (est && est.fase==='terminada');
      if(finNow){ qArea.innerHTML=''; pintarPodioNet(); return; }
      qArea.innerHTML='';
      if(!est){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Esperando el estado de la partida…')); return; }
      const yo = () => (config.rol==='docente'?null:(NET.yo?NET.yo():null));
      const esMiTurno = () => est && est.espera && est.espera.asiento === yo();
      if(est.fase==='elegir'){
        if(esMiTurno()){
          qArea.appendChild(ui.el('p','text-sm mb-2','Elige una zona adyacente a las tuyas o neutral para atacar'));
          const lista=(est&&est.asientos)?est.asientos:[]; const mapa=est.mapa||[];
          // find a legal zone quickly? just pick first legal by rules not necessary, allow clicking any adjacent? server validates
          qArea.appendChild(ui.el('p','text-xs text-slate-400','Selecciona una zona en el mapa (el servidor valida adyacencia)'));
        }else{
          const lista=(est&&est.asientos)?est.asientos:[]; const nom=est.espera&&lista[est.espera.asiento]?lista[est.espera.asiento].nombre:'';
          qArea.appendChild(ui.el('p','text-sm text-slate-400',escFn(nom)+' está eligiendo zona…'));
        }
      }else if(est.fase==='responder' || est.fase==='defensa'){
        if(preg && preg.v === est.v){ mostrarPregunta(); }
        else { qArea.appendChild(ui.el('p','text-sm text-slate-400','Cargando pregunta…')); }
      }
    }

    // allow clicking zones to elegir
    mapEl.addEventListener('click',(e)=>{
      const btn = e.target.closest('.cq-zone');
      if(!btn) return;
      if(!est || est.fase!=='elegir') return;
      const yo = () => (config.rol==='docente'?null:(NET.yo?NET.yo():null));
      if(est.espera && est.espera.asiento !== yo()) return;
      const rowsM=(est&&est.rows)||rowsM0, colsM=(est&&est.cols)||colsM0;
      const nodes = Array.from(mapEl.querySelectorAll('.cq-zone'));
      const idx = nodes.indexOf(btn);
      if(idx<0) return;
      if(enviando) return;
      enviando=true;
      NET.accion({tipo:'elegir', zona:idx}).then((r)=>{ enviando=false; if(!r||!r.ok){ if(ui.toast) ui.toast((r&&(r.mensaje||r.error))||'No se puede elegir esa zona','warn'); }});
    });

    const offs=[]; let tickNet=null;
    function limpiarNet(){ if(!vivo)return; vivo=false; offs.forEach((fn)=>{try{fn();}catch(e){}); if(tickNet) clearInterval(tickNet); }
    function alCerrarNet(){ limpiarNet(); if(ui.toast)ui.toast('El docente cerró la sala','warn'); App.go((config.rol||(NET.rol?NET.rol():''))==='docente'?'inicio':'red'); }
    function alExpulsarNet(){ limpiarNet(); if(ui.toast)ui.toast('El docente te sacó de la sala','warn'); App.go('red'); }

    offs.push(NET.on('estado',(p)=>{ if(!p)return; est = p.estado ? JSON.parse(JSON.stringify(p.estado)) : est; pintarNet(); }));
    offs.push(NET.on('pregunta',(q)=>{ preg=q; enviando=false; pintarNet(); }));
    offs.push(NET.on('sala',()=>pintarNet()));
    offs.push(NET.on('fin',(f)=>{fin=f;pintarNet();}));
    offs.push(NET.on('registro',(r)=>{registro=r;pintarNet();}));
    try{offs.push(NET.on('cerrada',alCerrarNet));}catch(e){}
    try{offs.push(NET.on('expulsado',alExpulsarNet));}catch(e){}

    tickNet = setInterval(()=>{ if(!vivo||!document.body.contains(root)){limpiarNet();return;} }, 250);
    pintarNet();
  }


  return { init, initNet, MODE };
})(App.ui);
