with open('js/games/batalla.js','r',encoding='utf-8-sig') as f:
    s = f.read()

start = s.find('  function initNet')
if start == -1:
    print('no')
    exit()
end_marker = "  return { init, initNet, MODE };"
end = s.find(end_marker)
if end == -1:
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

    const colors = ['rojo','azul'];
    const inScene = !!config.escenaCapa;
    const arena = ui.el('div', 'ba-arena' + (inScene ? ' ba-en-escena' : ''), '');
    arena.innerHTML = '<div class="ba-fighter"><canvas id="ba-canvas-a" class="avatar-canvas ba-canvas"></canvas><div class="ba-pose" id="ba-pose-a"></div></div><div class="ba-vs">⚔️<br>VS</div><div class="ba-fighter"><canvas id="ba-canvas-b" class="avatar-canvas ba-canvas"></canvas><div class="ba-pose" id="ba-pose-b"></div></div>';
    if (inScene && config.escenaCapa) config.escenaCapa.appendChild(arena); else root.appendChild(arena);

    function renderArenaNet(){
      const lista = (est && est.asientos) ? est.asientos : [];
      const equipos = (est && est.equipos) ? est.equipos : [[0],[1]];
      const eqHp = (est && est.equipoHp) ? est.equipoHp : [0,0];
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
        // draw first member avatar if exists
        const members = equipos[ei]||[];
        if(members.length>0){
          const mIdx = members[0];
          const p = lista[mIdx];
          if(p){
            g.save(); g.translate(cx,144); g.translate(-cx,-144);
            if(App.avatars && App.avatars.drawBody) App.avatars.drawBody(g,bx,by,ps,p.avatar||App.avatars.pick(mIdx),'idle', ei===0?'right':'left');
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
      const eqHp = (est && est.equipoHp) ? est.equipoHp : [0,0];
      const maxA = eqHp[0]>0?eqHp[0]:1, maxB = eqHp[1]>0?eqHp[1]:1;
      const ha = document.getElementById('ba-hp-a'); const hb = document.getElementById('ba-hp-b');
      if(ha) ha.style.width = Math.max(0,Math.min(100,(eqHp[0]/maxA)*100))+'%';
      if(hb) hb.style.width = Math.max(0,Math.min(100,(eqHp[1]/maxB)*100))+'%';
    }

    function pintarTurno(){
      const lista=(est&&est.asientos)?est.asientos:[];
      const turno=(est&&typeof est.turno==='number')?est.turno:0;
      const p = lista[turno]||{};
      turnInfo.innerHTML = 'Turno del portavoz: <b>'+escFn(p.nombre||('Jugador '+(turno+1)))+'</b> · Solo el portavoz puede responder';
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
      if(!puedo && est && est.espera){ const lista2=(est&&est.asientos)?est.asientos:[]; const nom=lista2[est.espera.asiento]?lista2[est.espera.asiento].nombre:''; qArea.appendChild(ui.el('p','text-xs text-slate-400 mt-2','Solo el portavoz ('+escFn(nom)+') puede responder')); }
    }

    function pintarPodioNet(){
      qArea.innerHTML='';
      const lista=(est&&est.asientos)?est.asientos:[];
      const eqHp = (est && est.equipoHp) ? est.equipoHp : [0,0];
      const ganador = eqHp[0]>eqHp[1]?0:(eqHp[1]>eqHp[0]?1:((est&&est.ganador)||0));
      qArea.appendChild(ui.el('div','fin-title','🏆 Equipo '+(ganador===0?'A':'B')));
      qArea.appendChild(ui.el('p','text-sm text-slate-400 text-center','Victoria por vida restante'));
      const volver = ui.el('button','btn-primary w-full mt-3','Volver al inicio');
      volver.addEventListener('click',()=>{ limpiarNet(); const rolc=config.rol||(NET.rol?NET.rol():'alumno'); App.go(rolc==='docente'?'inicio':'red'); });
      qArea.appendChild(volver);
      if((config.rol||(NET.rol?NET.rol():''))==='docente'){ const cerr=ui.el('button','btn-ghost w-full mt-2','Cerrar sala'); cerr.addEventListener('click',()=>NET.cerrar().then(()=>App.go('inicio'))); qArea.appendChild(cerr); }
    }

    function pintarNet(){
      if(!vivo||!document.body.contains(root)){ limpiarNet(); return; }
      renderArenaNet(); pintarBarras(); pintarTurno();
      const finNow = fin || (est && est.fase==='terminada');
      if(finNow){ qArea.innerHTML=''; pintarPodioNet(); return; }
      qArea.innerHTML='';
      if(!est){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Esperando el estado de la partida…')); return; }
      const yo = () => (config.rol==='docente'?null:(NET.yo?NET.yo():null));
      const esMiTurno = () => est && est.espera && est.espera.asiento === yo();
      if(est.fase==='preguntar' || est.fase==='responder'){
        if(preg && preg.v === est.v){ mostrarPregunta(); }
        else { qArea.appendChild(ui.el('p','text-sm text-slate-400','Cargando pregunta…')); }
      }else if(est.fase==='accion'){
        if(esMiTurno()){
          const b = ui.el('button','btn-primary w-full','Atacar');
          b.addEventListener('click',()=>{ if(enviando)return; enviando=true; b.disabled=true; NET.accion({tipo:'atacar'}).then((r)=>{ enviando=false; if(!r||!r.ok){b.disabled=false; if(ui.toast)ui.toast((r&&(r.mensaje||r.error))||'No se pudo atacar','error');}}); });
          qArea.appendChild(b);
        }else{
          const lista=(est&&est.asientos)?est.asientos:[]; const nom=est.espera&&lista[est.espera.asiento]?lista[est.espera.asiento].nombre:'';
          qArea.appendChild(ui.el('p','text-sm text-slate-400','Espera al portavoz: '+escFn(nom)));
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

s2 = before + initnet + '\n\n' + '  return { init, initNet, MODE };\n})(App.ui);\n'
with open('js/games/batalla.js','w',encoding='utf-8') as f:
    f.write(s2)
print('ok')
