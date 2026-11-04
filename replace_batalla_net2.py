with open('js/games/batalla.js','r',encoding='utf-8-sig') as f:
    s = f.read()

start = s.find('  function initNet')
end = s.find("  return { init, initNet, MODE };")
if start==-1 or end==-1:
    print('bad')
    exit()
before = s[:start]

initnet = r'''
  function initNet(config) {
    const NET = App.net;
    const escFn = esc;
    if (!NET) {
      if (config.container) config.container.appendChild(ui.el('p','text-sm text-slate-400','La partida en red no está disponible.'));
      return;
    }
    const root = config.container;
    root.innerHTML = '';
    root.appendChild(ui.el('div', 'ba-title text-center text-xl font-extrabold text-slate-900 mb-2', '⚔️ Batalla de Preguntas'));

    let est = NET.estado ? JSON.parse(JSON.stringify(NET.estado())) : null;
    let preg = NET.pregunta ? NET.pregunta() : null;
    let fin = NET.fin ? NET.fin() : null;
    let registro = NET.registro ? NET.registro() : null;
    let enviando = false;
    let vivo = true;

    const inScene = !!config.escenaCapa;
    const arena = ui.el('div', 'ba-arena' + (inScene ? ' ba-en-escena' : ''), '');
    arena.innerHTML = '<div class="ba-fighter"><canvas id="ba-canvas-a" class="avatar-canvas ba-canvas"></canvas><div class="ba-pose" id="ba-pose-a"></div></div><div class="ba-vs">⚔️<br>VS</div><div class="ba-fighter"><canvas id="ba-canvas-b" class="avatar-canvas ba-canvas"></canvas><div class="ba-pose" id="ba-pose-b"></div></div>';
    if (inScene && config.escenaCapa) config.escenaCapa.appendChild(arena); else if (root.parentNode) { /* will be in side */ root.appendChild(arena); } else root.appendChild(arena);
    if (inScene && config.escenaCapa && arena.parentNode !== config.escenaCapa) {
      try { config.escenaCapa.appendChild(arena); } catch(e) {}
    } else if (!inScene && arena.parentNode !== root) {
      try { root.appendChild(arena); } catch(e) {}
    }

    function renderArenaNet(){
      const lista = (est && est.asientos) ? est.asientos : [];
      const equipos = (est && est.equipos) ? est.equipos : [[0],[1]];
      for(let ei=0; ei<2; ei++){
        const cnv = arena.querySelector('#ba-canvas-'+(ei===0?'a':'b'));
        if(!cnv) continue;
        const W=160,H=160,ps=8,bx=16,by=32;
        cnv.width=W; cnv.height=H;
        const g=cnv.getContext('2d'); if(!g) continue;
        g.clearRect(0,0,W,H);
        const cx=W/2;
        g.beginPath(); g.arc(cx,H/2,H/2-4,0,Math.PI*2);
        g.fillStyle = ei===0?'rgba(220,38,38,0.08)':'rgba(37,99,235,0.08)'; g.fill();
        g.strokeStyle = ei===0?'rgba(220,38,38,0.4)':'rgba(37,99,235,0.4)'; g.lineWidth=2; g.stroke();
        const members = equipos[ei]||[];
        if(members.length>0){
          const mIdx = members[0];
          const p = lista[mIdx];
          if(p && App.avatars){
            g.save(); g.translate(cx,144); g.translate(-cx,-144);
            if(App.avatars.drawBody) App.avatars.drawBody(g,bx,by,ps,p.avatar||App.avatars.pick(mIdx),'idle', ei===0?'right':'left');
            g.restore();
          }
        }
      }
    }
    renderArenaNet();

    const bars = ui.el('div','flex items-center justify-between gap-4 mt-3','');
    bars.innerHTML = '<div class="flex-1"><div class="text-xs font-bold text-red-600">Equipo A</div><div class="w-full bg-slate-200 h-3 rounded"><div id="ba-hp-a" class="bg-red-500 h-3 rounded" style="width:100%"></div></div></div><div class="flex-1 text-right"><div class="text-xs font-bold text-blue-600">Equipo B</div><div class="w-full bg-slate-200 h-3 rounded"><div id="ba-hp-b" class="bg-blue-500 h-3 rounded" style="width:100%"></div></div></div>';
    root.appendChild(bars);

    const turnInfo = ui.el('div','text-center text-sm mt-2','');
    root.appendChild(turnInfo);
    const qArea = ui.el('div','mt-2','');
    root.appendChild(qArea);

    function pintarBarras(){
      const eqHp = (est && est.equipoHp) ? est.equipoHp : [100,100];
      const maxA = Math.max(1, (est && est.asientos && est.equipos && est.equipos[0]) ? est.equipos[0].length * ((est.hpTotal)||100) : eqHp[0] || 1);
      const maxB = Math.max(1, (est && est.asientos && est.equipos && est.equipos[1]) ? est.equipos[1].length * ((est.hpTotal)||100) : eqHp[1] || 1);
      const ha = document.getElementById('ba-hp-a'); const hb = document.getElementById('ba-hp-b');
      if(ha) ha.style.width = Math.max(0,Math.min(100,(eqHp[0]/maxA)*100))+'%';
      if(hb) hb.style.width = Math.max(0,Math.min(100,(eqHp[1]/maxB)*100))+'%';
    }

    function pintarTurno(){
      const lista=(est&&est.asientos)?est.asientos:[];
      const portavoz = (est && est.espera) ? est.espera.asiento : ((est && typeof est.portavoz === 'number') ? est.portavoz : 0);
      const p = lista[portavoz]||{};
      turnInfo.innerHTML = 'Turno del vocero: <b>'+escFn(p.nombre||('Jugador '+(portavoz+1)))+'</b>';
      pintarBarras();
    }

    function mostrarPregunta(){
      qArea.innerHTML='';
      if(!preg || !preg.enunciado){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Cargando pregunta…')); return; }
      const card = ui.el('div','q-card','');
      card.appendChild(ui.el('div','text-xs text-slate-400 mb-1','Pregunta del equipo'));
      card.appendChild(ui.el('h3','q-text text-slate-900',escFn(preg.enunciado)));
      const list = ui.el('div','grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4','');
      const yo = () => (config.rol==='docente'?null:(NET.yo?NET.yo():null));
      const yoSeat = yo();
      const portavoz = (est && est.espera) ? est.espera.asiento : ((est && typeof est.portavoz === 'number') ? est.portavoz : null);
      const esVocero = (portavoz !== null && yoSeat !== null && portavoz === yoSeat);
      const puedo = esVocero;
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
      if(!puedo){
        const lista2=(est&&est.asientos)?est.asientos:[];
        const nom = (portavoz!==null && lista2[portavoz]) ? lista2[portavoz].nombre : '';
        const yoEq = (yoSeat!==null && est && est.asientos && est.asientos[yoSeat]) ? est.asientos[yoSeat].equipo : null;
        const vocEq = (portavoz!==null && est && est.asientos && est.asientos[portavoz]) ? est.asientos[portavoz].equipo : null;
        if(yoEq !== null && vocEq !== null && yoEq !== vocEq){
          qArea.appendChild(ui.el('p','text-xs text-slate-400 mt-2','Turno del otro equipo'));
        }else{
          qArea.appendChild(ui.el('p','text-xs text-slate-400 mt-2','Responde '+escFn(nom)));
        }
      }
    }

    function pintarPodioNet(){
      qArea.innerHTML='';
      const eqHp = (est && est.equipoHp) ? est.equipoHp : [0,0];
      const ganador = eqHp[0]>eqHp[1]?0:(eqHp[1]>eqHp[0]?1:0);
      qArea.appendChild(ui.el('div','fin-title','🏆 Equipo '+(ganador===0?'A':'B')));
      qArea.appendChild(ui.el('p','text-sm text-slate-400 text-center','Victoria'));
      if(registro){ qArea.appendChild(ui.el('p','text-sm text-center mt-2','Respondiste bien <b>'+((registro.respuestas||[]).filter((r)=>r.correcto).length)+'</b> de <b>'+((registro.respuestas||[]).length)+'</b> preguntas.')); }
      const volver = ui.el('button','btn-primary w-full mt-3','Volver al inicio');
      volver.addEventListener('click',()=>{ limpiarNet(); const rolc=config.rol||(NET.rol?NET.rol():'alumno'); App.go(rolc==='docente'?'inicio':'red'); });
      qArea.appendChild(volver);
      if((config.rol||(NET.rol?NET.rol():''))==='docente'){ const saltar = ui.el('button','btn-ghost w-full mt-2','⏭ Saltar turno'); saltar.addEventListener('click',()=>NET.saltar().then((r)=>{ if(r&&!r.ok && ui.toast) ui.toast(r.mensaje||r.error,'warn'); })); const cerr=ui.el('button','btn-ghost w-full mt-2','✕ Cerrar sala'); cerr.addEventListener('click',()=>{ if(confirm('¿Cerrar la sala?')) NET.cerrar().then(()=>App.go('inicio')); }); qArea.appendChild(saltar); qArea.appendChild(cerr); }
    }

    function pintarNet(){
      if(!vivo||!document.body.contains(root)){ limpiarNet(); return; }
      renderArenaNet(); pintarBarras(); pintarTurno();
      const finNow = fin || (est && est.fase==='terminada');
      if(finNow){ qArea.innerHTML=''; pintarPodioNet(); return; }
      qArea.innerHTML='';
      if(!est){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Esperando el estado de la partida…')); return; }
      if((config.rol||(NET.rol?NET.rol():''))==='docente'){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Vista del docente')); return; }
      const yo = () => (NET.yo?NET.yo():null);
      const yoSeat = yo();
      const portavoz = (est && est.espera) ? est.espera.asiento : ((est && typeof est.portavoz === 'number') ? est.portavoz : null);
      const esVocero = (portavoz !== null && yoSeat !== null && portavoz === yoSeat);
      if(est.fase==='preguntar' || est.fase==='responder'){
        if(preg && preg.v === est.v){ mostrarPregunta(); }
        else { qArea.appendChild(ui.el('p','text-sm text-slate-400','Cargando pregunta…')); }
      }else if(est.fase==='accion'){
        if(esVocero){
          const fila = ui.el('div','flex gap-2','');
          const atacar = ui.el('button','btn-primary flex-1','Atacar');
          atacar.addEventListener('click',()=>{ if(enviando)return; enviando=true; atacar.disabled=true; NET.accion({tipo:'atacar'}).then((r)=>{ enviando=false; if(!r||!r.ok){ atacar.disabled=false; if(ui.toast) ui.toast((r&&(r.mensaje||r.error))||'No se pudo atacar','error'); }}); });
          const defender = ui.el('button','btn-ghost flex-1','Defender');
          defender.addEventListener('click',()=>{ if(enviando)return; enviando=true; defender.disabled=true; NET.accion({tipo:'defender'}).then((r)=>{ enviando=false; if(!r||!r.ok){ defender.disabled=false; if(ui.toast) ui.toast((r&&(r.mensaje||r.error))||'No se pudo defender','error'); }}); });
          fila.append(atacar, defender);
          qArea.appendChild(fila);
        }else{
          const lista=(est&&est.asientos)?est.asientos:[]; const nom = (portavoz!==null && lista[portavoz]) ? lista[portavoz].nombre : '';
          const yoEq = (yoSeat!==null && est && est.asientos && est.asientos[yoSeat]) ? est.asientos[yoSeat].equipo : null;
          const vocEq = (portavoz!==null && est && est.asientos && est.asientos[portavoz]) ? est.asientos[portavoz].equipo : null;
          if(yoEq !== null && vocEq !== null && yoEq !== vocEq){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Turno del otro equipo')); }
          else { qArea.appendChild(ui.el('p','text-sm text-slate-400','Responde '+escFn(nom))); }
        }
      }
    }

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
'''

s2 = before + initnet + '\n\n' + "  return { init, initNet, MODE };\n})(App.ui);\n"
with open('js/games/batalla.js','w',encoding='utf-8') as f:
    f.write(s2)
print('ok')
