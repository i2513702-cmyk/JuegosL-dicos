with open('js/games/batalla.js','r',encoding='utf-8-sig') as f:
    s = f.read()

if 'initNet' in s:
    print('skip')
    exit()

esc = "  const esc = function(x){ return String(x == null ? '' : x).replace(/[&<>\"']/g, function(c){ var map={'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}; return map[c] || c; }); };\n"
if 'const esc' not in s:
    s = s.replace("  const MODE = 'batalla';\n", "  const MODE = 'batalla';\n" + esc)

initnet = r'''

  function initNet(config) {
    const NET = App.net;
    const escFn = (typeof esc === 'function') ? esc : function(x){ return String(x==null?'':x).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];}); };
    if (!NET) {
      if (config.container) config.container.appendChild(ui.el('p','text-sm text-slate-400','La partida en red no está disponible.'));
      return;
    }
    const root = config.container;
    root.innerHTML = '';
    const title = ui.el('div','text-center text-xl font-extrabold text-slate-900 mb-2','⚔️ Batalla');
    root.appendChild(title);

    let est = NET.estado ? NET.estado() : null;
    let preg = NET.pregunta ? NET.pregunta() : null;
    let fin = NET.fin ? NET.fin() : null;
    let registro = NET.registro ? NET.registro() : null;
    let enviando = false;
    let vivo = true;

    const info = ui.el('div','flex flex-wrap gap-2 justify-center mb-3','');
    root.appendChild(info);
    const act = ui.el('div','mt-2','');
    root.appendChild(act);

    function pintar() {
      if (!vivo) return;
      info.innerHTML = '';
      const lista = (est && est.asientos) ? est.asientos : (NET.sala() ? NET.sala().jugadores : []);
      const eq = est && est.equipos ? est.equipos : [];
      lista.forEach((a,i)=>{
        const chip = ui.el('div','l-chip'+(est && est.espera && est.espera.asiento===i?' l-chip-active':''),'');
        if (App.avatars && App.avatars.badge) chip.appendChild(App.avatars.badge(a.avatar,22));
        chip.appendChild(ui.el('span','text-xs',escFn(a.nombre)+' PV:'+(a.hp||0)+(eq[i]?(' Eq'+eq[i]):'')));
        info.appendChild(chip);
      });
      act.innerHTML = '';
      if (fin || (est && est.fase==='terminada')) {
        act.appendChild(ui.el('div','font-bold', est && est.ganador!==null && est.ganador!==undefined ? ('Ganador equipo: '+est.ganador) : 'Partida terminada'));
        const volver = ui.el('button','btn-primary w-full mt-2','Volver al inicio');
        volver.addEventListener('click', ()=>{ limpiar(); const rolc=config.rol||(NET.rol?NET.rol():'alumno'); App.go(rolc==='docente'?'inicio':'red'); });
        act.appendChild(volver);
        if ((config.rol||(NET.rol?NET.rol():''))==='docente'){ const cerr=ui.el('button','btn-ghost w-full mt-2','Cerrar sala'); cerr.addEventListener('click',()=>NET.cerrar().then(()=>App.go('inicio'))); act.appendChild(cerr); }
        return;
      }
      if (!est) { act.appendChild(ui.el('p','text-sm text-slate-400','Esperando estado…')); return; }
      const yo = () => (config.rol==='docente'?null:(NET.yo?NET.yo():null));
      const esMiTurno = () => est && est.espera && est.espera.asiento === yo();
      if (est.fase === 'preguntar' || est.fase === 'responder') {
        if (preg && preg.v === est.v) {
          const card = ui.el('div','q-card','');
          card.appendChild(ui.el('div','text-xs text-slate-400 mb-1','Pregunta del equipo'));
          card.appendChild(ui.el('h3','q-text text-slate-900',escFn(preg.enunciado)));
          const list = ui.el('div','grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4','');
          const puedo = esMiTurno();
          (preg.opciones||[]).forEach((op,i)=>{
            const btn = ui.el('button','opt-btn s'+i,'<span class="opt-label">'+escFn(op)+'</span>');
            if (!puedo) btn.disabled=true;
            btn.addEventListener('click',()=>{
              if (enviando) return; enviando=true; list.querySelectorAll('.opt-btn').forEach((x)=>{x.disabled=true;});
              NET.accion({tipo:'responder', eleccion:i}).then((r)=>{ enviando=false; if(!r||!r.ok){ if(ui.toast) ui.toast((r&&(r.mensaje||r.error))||'Error','error'); pintar(); }});
            });
            list.appendChild(btn);
          });
          card.appendChild(list);
          act.appendChild(card);
          if (!puedo && est.espera){ const nom = lista[est.espera.asiento]?lista[est.espera.asiento].nombre:''; act.appendChild(ui.el('p','text-xs text-slate-400 mt-2','Solo el portavoz ('+escFn(nom)+') puede responder')); }
        } else {
          act.appendChild(ui.el('p','text-sm text-slate-400','Cargando pregunta…'));
        }
      } else if (est.fase === 'accion') {
        if (esMiTurno()) {
          const b = ui.el('button','btn-primary w-full','Atacar');
          b.addEventListener('click',()=>{ if(enviando)return; enviando=true; b.disabled=true; NET.accion({tipo:'atacar'}).then((r)=>{ enviando=false; if(!r||!r.ok){b.disabled=false;if(ui.toast)ui.toast((r&&(r.mensaje||r.error))||'Error','error');}}); });
          act.appendChild(b);
        } else {
          const nom = est.espera && lista[est.espera.asiento]?lista[est.espera.asiento].nombre:'';
          act.appendChild(ui.el('p','text-sm text-slate-400','Espera a '+escFn(nom)));
        }
      }
    }

    const offs=[];
    function limpiar(){ if(!vivo)return; vivo=false; offs.forEach((fn)=>{try{fn();}catch(e){}); }
    offs.push(NET.on('estado',(p)=>{ if(!p)return; est = p.estado||est; pintar(); }));
    offs.push(NET.on('pregunta',(q)=>{ preg=q; enviando=false; pintar(); }));
    offs.push(NET.on('sala',()=>pintar()));
    offs.push(NET.on('fin',(f)=>{fin=f;pintar();}));
    offs.push(NET.on('registro',(r)=>{registro=r;pintar();}));
    try{ offs.push(NET.on('cerrada',()=>{limpiar(); if(ui.toast)ui.toast('El docente cerró la sala','warn'); App.go('inicio');})); }catch(e){}
    try{ offs.push(NET.on('expulsado',()=>{limpiar(); if(ui.toast)ui.toast('El docente te sacó de la sala','warn'); App.go('red');})); }catch(e){}
    pintar();
  }
'''

old_ret = "  return { init, MODE };"
new_ret = "  return { init, initNet, MODE };"
if old_ret in s and 'initNet' not in s:
    s2 = s.replace(old_ret, initnet + '\n\n' + new_ret)
    with open('js/games/batalla.js','w',encoding='utf-8') as f:
        f.write(s2)
    print('ok')
else:
    print('skip')
