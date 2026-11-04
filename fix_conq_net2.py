with open('js/games/conquista.js','r',encoding='utf-8-sig') as f:
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
    if (inScene && config.escenaCapa) {
      config.escenaCapa.appendChild(mapEl);
    } else {
      mapEl.style.position='relative';
      mapEl.style.maxWidth='620px';
      mapEl.style.margin='10px auto 0';
      mapEl.style.display='grid';
      mapEl.style.gap='6px';
      mapEl.style.gridTemplateColumns='repeat('+colsM0+',1fr)';
      root.appendChild(mapEl);
    }

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
              const g=cnv.getContext('2d'); if(g && App.avatars.drawIcon) App.avatars.drawIcon(g,5,5,1,ch,'right'); btn.appendChild(cnv);
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
      const tipo = preg.tipo || (est && est.pendiente && est.pendiente.tipo) || 'turno';
      card.appendChild(ui.el('div','text-xs text-slate-400 mb-1', tipo==='defensa'?'🛡️ Defensa':'⚔️ Ataque'));
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
      if(!puedo && est && est.espera){ const lista=(est&&est.asientos)?est.asientos:[]; const nom=lista[est.espera.asiento]?lista[est.espera.asiento].nombre:''; qArea.appendChild(ui.el('p','text-xs text-slate-400 mt-2', tipo==='defensa' ? ('Esperando defensa de '+escFn(nom)+'…') : (escFn(nom)+' está respondiendo…'))); }
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
      if((config.rol||(NET.rol?NET.rol():''))==='docente'){ const saltar = ui.el('button','btn-ghost w-full mt-2','⏭ Saltar turno'); saltar.addEventListener('click',()=>NET.saltar().then((r)=>{ if(r&&!r.ok && ui.toast) ui.toast(r.mensaje||r.error,'warn'); })); const cerr=ui.el('button','btn-ghost w-full mt-2','✕ Cerrar sala'); cerr.addEventListener('click',()=>{ if(confirm('¿Cerrar la sala?')) NET.cerrar().then(()=>App.go('inicio')); }); qArea.appendChild(saltar); qArea.appendChild(cerr); }
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
        if(config.rol==='docente'){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Vista del docente')); return; }
        if(esMiTurno()){ qArea.appendChild(ui.el('p','text-sm mb-2','Elige una zona adyacente a las tuyas o neutral para atacar')); qArea.appendChild(ui.el('p','text-xs text-slate-400','Selecciona una zona en el mapa')); }
        else { const lista=(est&&est.asientos)?est.asientos:[]; const nom=est.espera&&lista[est.espera.asiento]?lista[est.espera.asiento].nombre:''; qArea.appendChild(ui.el('p','text-sm text-slate-400',escFn(nom)+' está eligiendo zona…')); }
      }else if(est.fase==='responder' || est.fase==='defensa'){
        if(config.rol==='docente'){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Vista del docente')); return; }
        if(preg && preg.v === est.v){ mostrarPregunta(); }
        else { qArea.appendChild(ui.el('p','text-sm text-slate-400','Cargando pregunta…')); }
      }else if(est.fase==='defendiendo'){
        if(config.rol==='docente'){ qArea.appendChild(ui.el('p','text-sm text-slate-400','Vista del docente')); return; }
        if(preg && preg.v === est.v){ mostrarPregunta(); }
        else {
          const lista=(est&&est.asientos)?est.asientos:[]; const nom=est.espera&&lista[est.espera.asiento]?lista[est.espera.asiento].nombre:'';
          qArea.appendChild(ui.el('p','text-sm text-slate-400','Esperando defensa de '+escFn(nom)+'…'));
        }
      }
    }

    mapEl.addEventListener('click',(e)=>{
      if(config.rol==='docente') return;
      const btn = e.target.closest('.cq-zone');
      if(!btn) return;
      if(!est || est.fase!=='elegir') return;
      const yo = () => (NET.yo?NET.yo():null);
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
'''

s2 = before + initnet + '\n\n' + "  return { init, initNet, MODE };\n})(App.ui);\n"
with open('js/games/conquista.js','w',encoding='utf-8') as f:
    f.write(s2)
print('ok')
