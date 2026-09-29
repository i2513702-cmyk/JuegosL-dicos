-- ============================================================================
-- LudoApp · Script de base de datos para Supabase (PostgreSQL 15+)
-- ----------------------------------------------------------------------------
-- Migra la capa localStorage (js/core/storage.js) a Postgres/Supabase.
-- Replica las colecciones:
--   courses · categories · difficulties · questions   (catálogo educativo)
--   players · app_users · sessions · attempts · lobbies
-- Incluye triggers (updated_at, alta automática de jugador), RLS y seed.
-- Ejecutar TODO el archivo en el SQL Editor de Supabase (un solo patch).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLAS (catálogo educativo)
-- ---------------------------------------------------------------------------

create table courses (
  id          text primary key,
  nombre      text not null,
  descripcion text,
  created_at  timestamptz not null default now()
);

create table categories (
  id        text primary key,
  course_id text not null references courses(id) on delete cascade,
  nombre    text not null,
  created_at timestamptz not null default now()
);

create table difficulties (
  id          text primary key,
  nombre      text not null,
  peso_puntos int not null default 1 check (peso_puntos > 0),
  created_at  timestamptz not null default now()
);

create table questions (
  id                 text primary key,
  course_id          text not null references courses(id) on delete cascade,
  category_id        text not null references categories(id) on delete cascade,
  difficulty_id      text not null references difficulties(id),
  enunciado          text not null,
  opciones           text[] not null check (array_length(opciones, 1) = 4),
  respuesta_correcta int not null check (respuesta_correcta between 0 and 3),
  feedback           text,
  ejemplo_aplicado   text,
  activa             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. JUEGO · jugadores, usuarios de la app, sesiones, intentos, salas
-- ---------------------------------------------------------------------------

-- Tabla pública de jugadores (progresión + gamificación).
-- Un usuario autenticado de Supabase se vincula por players.user_id.
create table players (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users(id) on delete cascade,
  nombre       text not null,
  rol          text not null default 'estudiante' check (rol in ('docente', 'estudiante')),
  avatar_id    text,
  xp           int not null default 0,
  monedas      int not null default 60,
  puntos       int not null default 0,
  correctas    int not null default 0,
  incorrectas  int not null default 0,
  racha        int not null default 0,
  racha_max    int not null default 0,
  nivel        int not null default 1,
  logros       jsonb not null default '[]'::jsonb,
  modos_ganados jsonb not null default '[]'::jsonb,
  skills       jsonb not null default '{
    "pista": 1, "comodin": 0, "doble_dano": 1, "escudo": 1, "impulso": 0, "cura": 0
  }'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Usuarios de la app (nombre de usuario + rol). La clave NO vive aquí:
-- la autenticación es 100% de Supabase (auth.users / auth.uid()).
-- app_users.usuario conserva el login legible y player_id une a la ficha.
create table app_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete cascade,
  player_id  uuid unique references players(id) on delete set null,
  nombre     text not null,
  usuario    text not null unique,
  rol        text not null default 'estudiante' check (rol in ('docente', 'estudiante')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sesión de juego creada por el docente con un código para la sala.
create table sessions (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null,
  course_id  text references courses(id) on delete set null,
  modo       text,
  estado     text not null default 'abierta' check (estado in ('abierta', 'en_curso', 'cerrada')),
  docente_id uuid references players(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index sessions_codigo_key on sessions (codigo);
create index sessions_estado_idx on sessions (estado, created_at desc);

-- Participantes de una sesión y su resultado final (pódium).
create table session_members (
  session_id uuid not null references sessions(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  posicion   int,
  puntos     int not null default 0,
  subtitulo  text,
  created_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

-- Cada respuesta (intento) del alumno ante una pregunta.
create table attempts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references sessions(id) on delete set null,
  player_id    uuid not null references players(id) on delete cascade,
  question_id  text not null references questions(id),
  difficulty_id text references difficulties(id),
  mode         text,
  selected_index int,
  correct      boolean not null default false,
  puntos       int not null default 0,
  created_at   timestamptz not null default now()
);
create index attempts_player_idx on attempts (player_id, created_at desc);
create index attempts_session_idx on attempts (session_id);
create index attempts_difficulty_idx on attempts (difficulty_id);

-- Salas rápidas abiertas por cualquier jugador (equivalente a lobbies).
create table lobbies (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  nombre     text not null,
  codigo     text not null,
  estado     text not null default 'abierta' check (estado in ('abierta', 'en_juego', 'cerrada')),
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index lobbies_codigo_key on lobbies (codigo);

-- ---------------------------------------------------------------------------
-- 3. TRIGGERS · updated_at y alta automática al registrarse
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

create trigger questions_updated_at before update on questions
  for each row execute function public.set_updated_at();
create trigger players_updated_at before update on players
  for each row execute function public.set_updated_at();
create trigger app_users_updated_at before update on app_users
  for each row execute function public.set_updated_at();
create trigger sessions_updated_at before update on sessions
  for each row execute function public.set_updated_at();
create trigger lobbies_updated_at before update on lobbies
  for each row execute function public.set_updated_at();

-- Al crear un usuario en auth.users se crean automáticamente su ficha de
-- jugador y su app_users. El rol se lee de raw_user_meta_data->>'rol'
-- (el form de registro debe mandar { nombre, rol }).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1));
  v_rol    text := case when coalesce(new.raw_user_meta_data ->> 'rol', 'estudiante') = 'docente'
                        then 'docente' else 'estudiante' end;
  v_pid    uuid;
begin
  insert into players (user_id, nombre, rol) values (new.id, v_nombre, v_rol) returning id into v_pid;
  insert into app_users (user_id, player_id, nombre, usuario, rol)
    values (new.id, v_pid, v_nombre, coalesce(new.email, new.id::text), v_rol);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table courses        enable row level security;
alter table categories     enable row level security;
alter table difficulties   enable row level security;
alter table questions      enable row level security;
alter table players        enable row level security;
alter table app_users      enable row level security;
alter table sessions       enable row level security;
alter table session_members enable row level security;
alter table attempts       enable row level security;
alter table lobbies        enable row level security;

-- Catálogo educativo: lectura para cualquier usuario autenticado.
create policy cat_read on courses for select
  to authenticated using (true);
create policy cat_read on categories for select
  to authenticated using (true);
create policy cat_read on difficulties for select
  to authenticated using (true);
create policy cat_read on questions for select
  to authenticated using (true);

-- Jugadores: todo autenticado lee (rankings y salas), cada uno edita su ficha.
create policy players_read on players for select
  to authenticated using (true);
create policy players_update_own on players for update
  to authenticated using (auth.uid() = user_id);
create policy players_insert_own on players for insert
  to authenticated with check (auth.uid() = user_id);

-- Usuarios de la app: solo lectura/edición del propio registro.
create policy app_users_read_own on app_users for select
  to authenticated using (auth.uid() = user_id);
create policy app_users_update_own on app_users for update
  to authenticated using (auth.uid() = user_id);

-- Sesiones: lectura para todos; creación por cualquier autenticado;
-- edición para docentes (docente_id apunta a la ficha con rol docente).
create policy sessions_read on sessions for select
  to authenticated using (true);
create policy sessions_insert on sessions for insert
  to authenticated with check (true);
create policy sessions_update_docente on sessions for update
  to authenticated using (
    (select rol from players where id = docente_id) = 'docente'
  );

create policy session_members_read on session_members for select
  to authenticated using (true);
create policy session_members_insert on session_members for insert
  to authenticated with check (true);
create policy session_members_update on session_members for update
  to authenticated with check (true);

-- Intentos: cada alumno registra y consulta los suyos.
-- (consultas agregadas/ranking usan vistas del catálogo).
create policy attempts_insert_own on attempts for insert
  to authenticated with check (
    auth.uid() = (select user_id from players where id = player_id)
  );
create policy attempts_read_own on attempts for select
  to authenticated using (
    auth.uid() = (select user_id from players where id = player_id)
  );

-- Salas: leer cualquier sala (para unirse por código), editar solo la propia.
create policy lobbies_read on lobbies for select
  to authenticated using (true);
create policy lobbies_insert_own on lobbies for insert
  to authenticated with check (
    auth.uid() = (select user_id from players where id = player_id)
  );
create policy lobbies_update_own on lobbies for update
  to authenticated using (
    auth.uid() = (select user_id from players where id = player_id)
  );

-- ---------------------------------------------------------------------------
-- 5. VISTAS · espejan los endpoints REST de storage.js
--   GET /questions   -> questions (activas)
--   GET /ranking     -> ranking_global
--   POST /answers    -> insert into attempts (capa endpoint del cliente)
-- ---------------------------------------------------------------------------

create view ranking_global as
  select id, nombre, avatar_id, xp, nivel, monedas, puntos,
         correctas, incorrectas, racha_max, logros, modos_ganados
  from players
  where rol = 'estudiante'
  order by xp desc;

create view sesiones_recientes as
  select s.id, s.codigo, s.modo, s.estado, s.docente_id, s.created_at,
         c.nombre as curso
  from sessions s
  left join courses c on c.id = s.course_id
  order by s.created_at desc;

-- Puntaje por dificultad acumulado por alumno (para reportes del docente).
create view resumen_por_dificultad as
  select d.id as difficulty_id, d.nombre as dificultad,
         count(*) as total, count(*) filter (where a.correct) as correctas,
         sum(a.puntos) as puntos
  from attempts a
  join difficulties d on d.id = a.difficulty_id
  group by d.id, d.nombre;

-- ---------------------------------------------------------------------------
-- 6. SEED · catálogo del curso (mismo contenido que js/core/data.js)
-- ---------------------------------------------------------------------------

insert into courses (id, nombre, descripcion) values
  ('cur_ing', 'Introducción a la Ingeniería Empresarial',
   'Inventos históricos que transformaron la ingeniería (Unidad 1).')
on conflict (id) do nothing;

insert into categories (id, course_id, nombre) values
  ('cat_ant', 'cur_ing', 'Antigüedad y Mecánica'),
  ('cat_industrial', 'cur_ing', 'Revolución Industrial'),
  ('cat_comunicaciones', 'cur_ing', 'Comunicaciones y Datos'),
  ('cat_electricidad', 'cur_ing', 'Electrificación y Energía'),
  ('cat_semiconductores', 'cur_ing', 'Semiconductores y Computación'),
  ('cat_procesos', 'cur_ing', 'Procesos, Materiales y Bioprocesos'),
  ('cat_empresarial', 'cur_ing', 'Ingeniería Empresarial y Futuro')
on conflict (id) do nothing;

insert into difficulties (id, nombre, peso_puntos) values
  ('dif_facil', 'Fácil', 1),
  ('dif_media', 'Media', 2),
  ('dif_dificil', 'Difícil', 3)
on conflict (id) do nothing;

insert into questions (id, course_id, category_id, difficulty_id, enunciado, opciones, respuesta_correcta, feedback, ejemplo_aplicado) values
  ('q01', 'cur_ing', 'cat_ant', 'dif_facil',
   '¿Qué invento redujo drásticamente el rozamiento permitiendo transportar cargas pesadas con menor esfuerzo energético?',
   ARRAY['La rueda y el eje', 'El reloj mecánico', 'La palanca simple', 'La polea fija'], 0,
   'La rueda introdujo la transformación del movimiento y la reducción de fricción, base de la mecánica.',
   'En la ingeniería empresarial equivale a reducir cuellos de botella para optimizar el flujo de un proceso.'),
  ('q02', 'cur_ing', 'cat_ant', 'dif_facil',
   '¿Qué principio físico clave aplicaron los acueductos romanos para transportar el agua por gravedad?',
   ARRAY['La pendiente constante del canal', 'El uso de bombas hidráulicas', 'La presión del vapor', 'La flotación de los caudales'], 0,
   'Los romanos dominaron la pendiente por gravedad y el arco de medio punto para estabilidad estructural.',
   'Hoy se replica en sistemas modernos de saneamiento urbano y distribución de agua potable.'),
  ('q03', 'cur_ing', 'cat_ant', 'dif_facil',
   '¿Qué instrumento permitió orientarse en mar abierto sin depender de las estrellas?',
   ARRAY['La brújula magnética', 'El astrolabio solar', 'El cronómetro marino', 'La veleta'], 0,
   'La brújula usó el magnetismo terrestre para abrir rutas comerciales transoceánicas sostenidas.',
   'Conceptualmente es el ancestro del GPS y la logística satelital de flotas.'),
  ('q04', 'cur_ing', 'cat_ant', 'dif_facil',
   '¿Cuál es la unidad básica de información en los sistemas de cómputo actuales?',
   ARRAY['El bit (0 y 1)', 'El byte octal', 'El pulso eléctrico continuo', 'La señal analógica'], 0,
   'El bit es la unidad binaria que sustenta toda la informática moderna.',
   'Protocolos de comunicación y almacenamiento digital trabajan sobre secuencias de bits.'),
  ('q05', 'cur_ing', 'cat_industrial', 'dif_facil',
   '¿Qué tecnología de 1440 estandarizó la producción masiva de libros?',
   ARRAY['La imprenta de tipos móviles de Gutenberg', 'El papiro egipcio', 'La litografía a color', 'La fotocopiadora'], 0,
   'Sustituyó la copia manual por un proceso modular y replicable de producción bibliográfica masiva.',
   'Antecedente directo del software modular y los sistemas ERP en las empresas.'),
  ('q06', 'cur_ing', 'cat_industrial', 'dif_media',
   '¿Quién transformó la energía térmica en trabajo mecánico añadiendo un condensador separado a la máquina de vapor?',
   ARRAY['James Watt', 'Thomas Edison', 'James Hargreaves', 'Isambard Brunel'], 0,
   'Watt mejoró la eficiencia del vapor, independizando la producción de los ríos.',
   'Antecedente de la automatización de plantas térmicas y la conversión de energía.'),
  ('q07', 'cur_ing', 'cat_industrial', 'dif_media',
   '¿Cómo revolucionó Henry Ford el flujo de procesos industriales en 1913?',
   ARRAY['Llevó el trabajo al operario en una línea de ensamblaje móvil', 'Inventó la búsqueda en cadena', 'Creó el primer robot industrial', 'Estandarizó el vapor de alta presión'], 0,
   'Redujo tiempos de ciclo, eliminó desplazamientos y dividió el trabajo de forma especializada.',
   'Base de las metodologías Lean Manufacturing y las líneas automatizadas.'),
  ('q08', 'cur_ing', 'cat_comunicaciones', 'dif_facil',
   '¿Qué sistema codificó los mensajes en impulsos eléctricos discretos (Código Morse)?',
   ARRAY['El telégrafo eléctrico', 'La radio de amplitud modulada', 'El fax óptico', 'El teléfono de baquelita'], 0,
   'Fue el primer sistema de transmisión digital a distancia mediante circuitos eléctricos.',
   'Fundamento de los protocolos binarios de las redes de telecomunicación.'),
  ('q09', 'cur_ing', 'cat_comunicaciones', 'dif_media',
   '¿Qué principio del telégrafo se considera el antecesor de las redes de datos digitales?',
   ARRAY['Enviar información codificada a distancia por impulsos discretos', 'La transmisión de voz analógica', 'El almacenamiento en cintas magnéticas', 'La modulación de señales de radio FM'], 0,
   'Demostró que la información puede codificarse y transmitirse de forma discreta a distancia.',
   'Los 0s y 1s de las redes modernas heredan ese principio.'),
  ('q10', 'cur_ing', 'cat_electricidad', 'dif_media',
   '¿Qué ventaja tuvo la corriente alterna de Tesla sobre la corriente continua de Edison?',
   ARRAY['Transportar energía a altas tensiones y largas distancias con menos pérdidas', 'Ser más barata de generar en pilas', 'No requerir cables de transmisión', 'Almacenarse en baterías de plomo'], 0,
   'La CA escala los sistemas eléctricos a nivel regional y nacional.',
   'Suministro eléctrico ininterrumpido para parques industriales y datacenters.'),
  ('q11', 'cur_ing', 'cat_electricidad', 'dif_media',
   '¿Cómo convierte una célula fotovoltaica la radiación solar en electricidad?',
   ARRAY['Por el efecto fotoeléctrico, sin emisiones contaminantes en sitio', 'Quemando combustible fósil', 'Por inducción electromagnética térmica', 'Almacenando luz en baterías de corriente alterna'], 0,
   'Aprovecha directamente una fuente limpia e inagotable.',
   'Estrategias de descarbonización e independencia energética en plantas industriales.'),
  ('q12', 'cur_ing', 'cat_electricidad', 'dif_dificil',
   '¿Por qué la pila voltaica (1800) fue crucial para la ciencia y la ingeniería?',
   ARRAY['Fue la primera fuente continua y estable de corriente eléctrica', 'Fue el primer acumulador de agua', 'Inventó el electroimán industrial', 'Generó electricidad sin reacción química'], 0,
   'Superó las descargas estáticas momentáneas, permitiendo experimentar con corriente constante.',
   'Antecedente de las baterías de litio para vehículos eléctricos y renovables.'),
  ('q13', 'cur_ing', 'cat_semiconductores', 'dif_facil',
   '¿Qué componente de estado sólido (1947, Laboratorios Bell) reemplazó a los tubos de vacío?',
   ARRAY['El transistor', 'El condensador cerámico', 'El relé electromecánico', 'El diodo de neón'], 0,
   'Amplifica y conmuta señales con alto rendimiento y menor tamaño/consumo.',
   'Miles de millones de micro-conmutadores están hoy en cada chip.'),
  ('q14', 'cur_ing', 'cat_semiconductores', 'dif_media',
   '¿Qué aportó el concepto de la "Máquina Universal" de Alan Turing a la informática?',
   ARRAY['Una sola máquina podía ejecutar cualquier algoritmo cambiando sus instrucciones', 'El primer ordenador con ratón', 'La transmisión de datos por fibra óptica', 'El cálculo manual de logaritmos'], 0,
   'Es el origen del programa almacenado y del software flexible.',
   'Base de la Inteligencia Artificial y la automatización de procesos (RPA).'),
  ('q15', 'cur_ing', 'cat_semiconductores', 'dif_dificil',
   '¿Qué integró el microprocesador Intel 4004 por primera vez en un solo circuito?',
   ARRAY['La CPU completa en un único chip', 'La memoria RAM y el teclado', 'La tarjeta de video', 'El módem telefónico'], 0,
   'Fue el paso decisivo para incorporar poder de cómputo en cualquier maquinaria.',
   'Los PLC que operan brazos robóticos en fábricas descienden de ese concepto.'),
  ('q16', 'cur_ing', 'cat_procesos', 'dif_media',
   '¿Qué combinación de materiales hizo del hormigón armado un material revolucionario?',
   ARRAY['Concreto a compresión + acero a tracción', 'Vidrio templado + madera', 'Aluminio + cobre fundido', 'Cerámica + plomo'], 0,
   'Aprovecha propiedades mecánicas complementarias de dos materiales.',
   'Construcción de rascacielos, puentes de gran luz y megaproyectos.'),
  ('q17', 'cur_ing', 'cat_procesos', 'dif_media',
   '¿Cuál es el principio de funcionamiento del radar?',
   ARRAY['Emite ondas electromagnéticas que rebotan y calculan distancia y velocidad', 'Detecta metales por gravedad', 'Fotografía en infrarrojo térmico', 'Mide la presión atmosférica'], 0,
   'Es un método de detección remota e inspección no destructiva.',
   'Sensores LiDAR en vehículos autónomos y control del tráfico aéreo.'),
  ('q18', 'cur_ing', 'cat_procesos', 'dif_dificil',
   '¿Qué exigencia técnica impulsó la producción masiva de penicilina?',
   ARRAY['Biorreactores de fermentación profunda y esterilización industrial', 'Telefonía celular de alta potencia', 'Motores de combustión compactos', 'Circuitos integrados de vacío'], 0,
   'El nacimiento de la industria biotecnológica y farmacéutica moderna.',
   'Producción industrial de vacunas y enzimas de limpieza biológica.'),
  ('q19', 'cur_ing', 'cat_procesos', 'dif_dificil',
   '¿Qué principio aerodinámico dominaron los Hermanos Wright para lograr el vuelo controlado?',
   ARRAY['Control de tres ejes combinado con una buena relación potencia-peso', 'Solo la sustentación de las alas fijas', 'El empuje de cohetes de pólvora', 'La flotación de dirigibles rígidos'], 0,
   'No bastó generar sustentación: había que controlar la estabilidad del sistema dinámico.',
   'Simulación de fluidos y gestión de riesgos en proyectos aeronáuticos.'),
  ('q20', 'cur_ing', 'cat_comunicaciones', 'dif_dificil',
   '¿Qué aporte arquitectónico introdujo ARPANET en 1969 para la resiliencia de las redes?',
   ARRAY['Conmutación de paquetes distribuida y tolerante a fallos', 'Enlaces satelitales exclusivos', 'La transmisión de voz por circuitos cerrados', 'El almacenamiento central único de datos'], 0,
   'Los datos llegan a destino aunque un nodo falle, gracias al diseño descentralizado.',
   'Arquitectura Cloud Computing y la infraestructura global de Internet.'),
  ('q21', 'cur_ing', 'cat_industrial', 'dif_dificil',
   '¿Por qué el motor de combustión interna impactó la logística y la cadena de suministro mundial?',
   ARRAY['Ofrece alta densidad de potencia y autonomía móvil para transporte pesado', 'Es más silencioso que el vapor', 'No requiere combustibles líquidos', 'Reduce la velocidad de las flotas'], 0,
   'Reemplazó al vapor por combustibles de mayor energía por unidad de masa.',
   'Cadenas de suministro Just-In-Time movidas por transporte terrestre y marítimo.'),
  ('q22', 'cur_ing', 'cat_empresarial', 'dif_media',
   '¿Cómo contribuye la célula fotovoltaica al cambio de matriz energética en empresas sostenibles?',
   ARRAY['Transforma radiación solar en electricidad sin emisiones en sitio', 'Reduce solo el consumo de agua', 'Elimina la necesidad de mantenimiento', 'Convierte calor residual en frío'], 0,
   'Aprovechamiento directo de energías limpias e inagotables.',
   'Estrategias de descarbonización e independencia energética industrial.'),
  ('q23', 'cur_ing', 'cat_empresarial', 'dif_media',
   '¿Qué hizo el transistor posible en términos de escala tecnológica?',
   ARRAY['Miniaturizar y reducir el consumo de los sistemas informáticos', 'Eliminar todo el cableado eléctrico', 'Conectar satélites sin antenas', 'Reemplazar la energía solar por baterías'], 0,
   'Permitió la miniaturización, reduciendo tamaño y consumo eléctrico.',
   'Laptops y smartphones actuales contienen miles de millones de transistores.'),
  ('q24', 'cur_ing', 'cat_empresarial', 'dif_dificil',
   '¿Cómo se relaciona la evolución de la ingeniería (de lo mecánico a la IA) con el rol del ingeniero empresarial?',
   ARRAY['Integra tecnología, procesos y personas para crear valor en las organizaciones', 'Solo debe reparar máquinas antiguas', 'Debe ignorar la tecnología moderna', 'Se limita a vender dispositivos'], 0,
   'La visión sistémica e integradora es la esencia del ingeniero empresarial.',
   'Liderazgo en la transformación digital e innovación sostenible de las organizaciones.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. USUARIOS DEMO (OJO)
--    Las cuentas demo (profe/maria/juan/sofia/carlos) deben crearse desde el
--    panel Auth de Supabase (o con la API REST) para que el trigger
--    on_auth_user_created genere su players y app_users automáticamente:
--      POST /auth/v1/signup  { email, password, data: { nombre, rol } }
--    roles: profe -> docente ; maria/juan/sofia/carlos -> estudiante
-- ---------------------------------------------------------------------------