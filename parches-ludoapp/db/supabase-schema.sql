-- ============================================================================
-- LudoApp · Esquema de base de datos para Supabase (PostgreSQL 15+)  ·  v2
-- ----------------------------------------------------------------------------
-- Cómo usarlo: Supabase > SQL Editor > New query > pegar TODO > Run.
-- Es idempotente: puedes ejecutarlo varias veces sin duplicar nada.
--
-- Colecciones (equivalen a js/core/storage.js):
--   courses · categories · difficulties · questions        (catálogo educativo)
--   players · app_users · sessions · session_members ·
--   attempts · lobbies · lobby_members                     (juego)
--
-- Mejoras respecto a la v1:
--   · Seguridad: RLS por rol real (un alumno ya no puede hacerse docente,
--     ni editar salas/sesiones ajenas); la clave hasheada nunca es legible
--     desde el navegador; vistas con security_invoker; anon sin acceso.
--   · Integridad: la categoría de una pregunta debe pertenecer a su curso,
--     CHECKs de rangos y formatos, códigos de sala únicos solo mientras
--     están activos, borrar una pregunta ya no falla por sus intentos.
--   · Anti-trampa: el trigger de attempts calcula `correct` y la dificultad
--     desde la pregunta (el cliente no puede mentir).
--   · Salas: tabla lobby_members con control de cupo y estado en la BD.
--   · Rendimiento: índices en todas las claves foráneas y consultas típicas.
--   · Vistas nuevas: preguntas_activas y ranking con posición.
--
-- Compatibilidad: no cambia ninguna tabla/columna que use la API (api/*.js).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. RESET OPCIONAL (descomenta SOLO si quieres borrar todo y empezar de cero)
--    Si ya habías ejecutado la v1, haz este reset una vez para adoptar la v2.
-- ---------------------------------------------------------------------------
/*
drop view  if exists public.ranking_global, public.sesiones_recientes,
                     public.resumen_por_dificultad, public.preguntas_activas cascade;
drop table if exists public.lobby_members, public.lobbies, public.attempts,
                     public.session_members, public.sessions, public.app_users,
                     public.players, public.questions, public.difficulties,
                     public.categories, public.courses cascade;
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user(), public.set_updated_at(),
                        public.attempts_fill(), public.lobby_members_guard(),
                        public.current_player_id(), public.is_docente() cascade;
*/

-- Guarda: si ya existe el esquema v1 (tiene `questions` pero no `lobby_members`),
-- se detiene con un aviso claro en lugar de mezclar tablas viejas con políticas nuevas.
do $$
begin
  if to_regclass('public.questions') is not null and to_regclass('public.lobby_members') is null then
    raise exception 'Se detectó el esquema v1 de LudoApp. Descomenta el bloque RESET de la sección 0 (quita /* y */), ejecuta el script completo y listo. Esto borra los datos de LudoApp (no toca otras tablas).';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. CATÁLOGO EDUCATIVO
-- ---------------------------------------------------------------------------

create table if not exists public.courses (
  id          text primary key,
  nombre      text not null check (btrim(nombre) <> ''),
  descripcion text,
  created_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id         text primary key,
  course_id  text not null references public.courses(id) on delete cascade,
  nombre     text not null check (btrim(nombre) <> ''),
  created_at timestamptz not null default now(),
  unique (course_id, nombre),
  unique (id, course_id)               -- necesario para la FK compuesta de questions
);

create table if not exists public.difficulties (
  id          text primary key,
  nombre      text not null unique check (btrim(nombre) <> ''),
  peso_puntos int  not null default 1 check (peso_puntos > 0),
  created_at  timestamptz not null default now()
);

create table if not exists public.questions (
  id                 text primary key,
  course_id          text not null references public.courses(id) on delete cascade,
  category_id        text not null,
  difficulty_id      text not null references public.difficulties(id),
  enunciado          text not null check (btrim(enunciado) <> ''),
  opciones           text[] not null check (array_length(opciones, 1) = 4),
  respuesta_correcta int  not null check (respuesta_correcta between 0 and 3),
  feedback           text,
  ejemplo_aplicado   text,
  activa             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- la categoría debe pertenecer al mismo curso que la pregunta
  foreign key (category_id, course_id)
    references public.categories (id, course_id) on delete cascade
);

create index if not exists categories_course_idx  on public.categories (course_id);
create index if not exists questions_filtro_idx   on public.questions (course_id, category_id, difficulty_id) where activa;
create index if not exists questions_category_idx on public.questions (category_id);
create index if not exists questions_diff_idx     on public.questions (difficulty_id);

-- ---------------------------------------------------------------------------
-- 2. JUEGO · jugadores, usuarios de la app, sesiones, intentos, salas
-- ---------------------------------------------------------------------------

-- Ficha pública del jugador (progresión + gamificación).
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete cascade,
  nombre        text not null check (btrim(nombre) <> ''),
  rol           text not null default 'estudiante' check (rol in ('docente', 'estudiante')),
  avatar_id     text,
  xp            int not null default 0  check (xp >= 0),
  monedas       int not null default 60 check (monedas >= 0),
  puntos        int not null default 0  check (puntos >= 0),
  correctas     int not null default 0  check (correctas >= 0),
  incorrectas   int not null default 0  check (incorrectas >= 0),
  racha         int not null default 0  check (racha >= 0),
  racha_max     int not null default 0  check (racha_max >= 0),
  nivel         int not null default 1  check (nivel >= 1),
  logros        jsonb not null default '[]'::jsonb check (jsonb_typeof(logros) = 'array'),
  modos_ganados jsonb not null default '[]'::jsonb check (jsonb_typeof(modos_ganados) = 'array'),
  skills        jsonb not null default '{"pista": 1, "comodin": 0, "doble_dano": 1, "escudo": 1, "impulso": 0, "cura": 0}'::jsonb
                check (jsonb_typeof(skills) = 'object'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists players_ranking_idx on public.players (rol, xp desc);

-- Cuentas de la app. La clave se guarda SIEMPRE hasheada (scrypt) en
-- clave_hash + clave_salt (lo hace la API en Node); nunca en claro.
-- Una cuenta debe tener contraseña propia o estar ligada a Supabase Auth.
create table if not exists public.app_users (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete cascade,
  player_id   uuid unique references public.players(id) on delete set null,
  nombre      text not null check (btrim(nombre) <> ''),
  usuario     text not null unique check (usuario = lower(btrim(usuario)) and usuario <> ''),
  clave_hash  text,
  clave_salt  text,
  rol         text not null default 'estudiante' check (rol in ('docente', 'estudiante')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (user_id is not null or (clave_hash is not null and clave_salt is not null))
);

-- Sesión de juego creada por un docente (con código de sala).
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null check (codigo ~ '^[A-Z0-9]{4,8}$'),
  course_id  text references public.courses(id) on delete set null,
  modo       text,
  estado     text not null default 'abierta' check (estado in ('abierta', 'en_curso', 'cerrada')),
  docente_id uuid references public.players(id) on delete set null,
  config     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- el código solo debe ser único mientras la sesión sigue activa (se pueden reciclar)
create unique index if not exists sessions_codigo_activo_key on public.sessions (codigo) where estado <> 'cerrada';
create index if not exists sessions_estado_idx  on public.sessions (estado, created_at desc);
create index if not exists sessions_docente_idx on public.sessions (docente_id);
create index if not exists sessions_course_idx  on public.sessions (course_id);

-- Participantes de una sesión y su resultado final (pódium).
create table if not exists public.session_members (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id  uuid not null references public.players(id) on delete cascade,
  posicion   int check (posicion > 0),
  puntos     int not null default 0,
  subtitulo  text,
  created_at timestamptz not null default now(),
  primary key (session_id, player_id)
);
create index if not exists session_members_player_idx on public.session_members (player_id);

-- Cada respuesta del alumno. Si se borra la pregunta, el intento se conserva
-- (question_id queda en null) para no perder las estadísticas.
create table if not exists public.attempts (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid references public.sessions(id) on delete set null,
  player_id      uuid not null references public.players(id) on delete cascade,
  question_id    text references public.questions(id) on delete set null,
  difficulty_id  text references public.difficulties(id) on delete set null,
  mode           text,
  selected_index int check (selected_index between 0 and 3),
  correct        boolean not null default false,
  puntos         int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists attempts_player_idx     on public.attempts (player_id, created_at desc);
create index if not exists attempts_session_idx    on public.attempts (session_id);
create index if not exists attempts_question_idx   on public.attempts (question_id);
create index if not exists attempts_difficulty_idx on public.attempts (difficulty_id);

-- Salas de juego (lobbies). estado usa los mismos valores que js/auth.js.
create table if not exists public.lobbies (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players(id) on delete cascade,  -- anfitrión
  nombre     text not null default 'Sala',
  codigo     text not null check (codigo ~ '^[A-Z0-9]{4,8}$'),
  estado     text not null default 'abierta' check (estado in ('abierta', 'jugando', 'cerrada')),
  config     jsonb not null default '{}'::jsonb,   -- {mode, courseId, categoryId, difficultyId, timeSeconds, maxJugadores}
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lobbies_codigo_activo_key on public.lobbies (codigo) where estado <> 'cerrada';
create index if not exists lobbies_player_idx on public.lobbies (player_id);

-- Jugadores dentro de una sala.
create table if not exists public.lobby_members (
  lobby_id  uuid not null references public.lobbies(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, player_id)
);
create index if not exists lobby_members_player_idx on public.lobby_members (player_id);

-- ---------------------------------------------------------------------------
-- 3. FUNCIONES Y TRIGGERS
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- Ficha de jugador del usuario logueado (para las políticas RLS).
create or replace function public.current_player_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.players where user_id = (select auth.uid());
$$;

-- ¿El usuario logueado es docente?
create or replace function public.is_docente()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.players
    where user_id = (select auth.uid()) and rol = 'docente'
  );
$$;

-- Alta automática al crearse un usuario en Supabase Auth.
-- SEGURIDAD: el rol docente solo se acepta desde raw_app_meta_data (que solo
-- puede escribir el servidor/admin). raw_user_meta_data lo controla el propio
-- usuario al registrarse, así que NO se usa para el rol.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_nombre text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''),
                            split_part(coalesce(new.email, new.id::text), '@', 1));
  v_rol    text := case when new.raw_app_meta_data ->> 'rol' = 'docente' then 'docente' else 'estudiante' end;
  v_pid    uuid;
begin
  insert into public.players (user_id, nombre, rol)
    values (new.id, v_nombre, v_rol) returning id into v_pid;
  insert into public.app_users (user_id, player_id, nombre, usuario, rol)
    values (new.id, v_pid, v_nombre, lower(coalesce(new.email, new.id::text)), v_rol);
  return new;
end; $$;

-- Anti-trampa: `correct` y la dificultad se calculan desde la pregunta real.
create or replace function public.attempts_fill()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_correcta int;
  v_dif      text;
begin
  if new.question_id is not null then
    select respuesta_correcta, difficulty_id into v_correcta, v_dif
      from public.questions where id = new.question_id;
    if found then
      new.difficulty_id := v_dif;
      if new.selected_index is not null then
        new.correct := (new.selected_index = v_correcta);
      end if;
    end if;
  end if;
  return new;
end; $$;

-- Control de cupo y estado al unirse a una sala (evita carreras de concurrencia).
create or replace function public.lobby_members_guard()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_max    int;
  v_count  int;
begin
  select estado,
         case when config ->> 'maxJugadores' ~ '^[0-9]+$' then (config ->> 'maxJugadores')::int else 4 end
    into v_estado, v_max
    from public.lobbies where id = new.lobby_id for update;
  if not found then
    raise exception 'La sala no existe.';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'La sala no está abierta a nuevos jugadores (estado: %).', v_estado;
  end if;
  select count(*) into v_count from public.lobby_members where lobby_id = new.lobby_id;
  if v_count >= v_max then
    raise exception 'La sala está llena.';
  end if;
  return new;
end; $$;

drop trigger if exists questions_updated_at on public.questions;
create trigger questions_updated_at before update on public.questions
  for each row execute function public.set_updated_at();
drop trigger if exists players_updated_at on public.players;
create trigger players_updated_at before update on public.players
  for each row execute function public.set_updated_at();
drop trigger if exists app_users_updated_at on public.app_users;
create trigger app_users_updated_at before update on public.app_users
  for each row execute function public.set_updated_at();
drop trigger if exists sessions_updated_at on public.sessions;
create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();
drop trigger if exists lobbies_updated_at on public.lobbies;
create trigger lobbies_updated_at before update on public.lobbies
  for each row execute function public.set_updated_at();

drop trigger if exists attempts_fill_trg on public.attempts;
create trigger attempts_fill_trg before insert on public.attempts
  for each row execute function public.attempts_fill();

drop trigger if exists lobby_members_guard_trg on public.lobby_members;
create trigger lobby_members_guard_trg before insert on public.lobby_members
  for each row execute function public.lobby_members_guard();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Las funciones de trigger no deben poder llamarse desde la API pública (RPC).
revoke all on function public.set_updated_at()       from public, anon, authenticated;
revoke all on function public.handle_new_user()      from public, anon, authenticated;
revoke all on function public.attempts_fill()        from public, anon, authenticated;
revoke all on function public.lobby_members_guard()  from public, anon, authenticated;
-- Los helpers de RLS solo los usa un usuario autenticado.
revoke all on function public.current_player_id() from public, anon;
revoke all on function public.is_docente()        from public, anon;
grant execute on function public.current_player_id() to authenticated;
grant execute on function public.is_docente()        to authenticated;

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
--    Nota: la API de Node usa la service key (ignora RLS). Estas políticas
--    protegen el acceso directo desde el navegador con la clave pública.
-- ---------------------------------------------------------------------------

alter table public.courses         enable row level security;
alter table public.categories      enable row level security;
alter table public.difficulties    enable row level security;
alter table public.questions       enable row level security;
alter table public.players         enable row level security;
alter table public.app_users       enable row level security;
alter table public.sessions        enable row level security;
alter table public.session_members enable row level security;
alter table public.attempts        enable row level security;
alter table public.lobbies         enable row level security;
alter table public.lobby_members   enable row level security;

-- Se borran las políticas anteriores (p. ej. las inseguras de la v1) y se recrean.
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('courses','categories','difficulties','questions','players','app_users',
                        'sessions','session_members','attempts','lobbies','lobby_members')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 4.1 Lectura abierta para cualquier usuario autenticado (nunca para anon).
do $$
declare t text;
begin
  foreach t in array array['courses','categories','difficulties','players',
                           'sessions','session_members','lobbies','lobby_members']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
  end loop;
end $$;

-- Preguntas: los alumnos solo ven las activas; el docente ve todas.
create policy questions_select on public.questions for select to authenticated
  using (activa or (select public.is_docente()));

-- 4.2 Catálogo: solo docentes crean / editan / borran cursos, categorías y preguntas.
do $$
declare t text;
begin
  foreach t in array array['courses','categories','questions']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_docente()))', t || '_docente_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_docente())) with check ((select public.is_docente()))', t || '_docente_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_docente()))', t || '_docente_del', t);
  end loop;
end $$;

-- 4.3 Jugadores: cada uno edita solo su ficha (rol y user_id están bloqueados
--     por privilegios de columna, ver sección 5).
create policy players_insert_own on public.players for insert to authenticated
  with check (user_id = (select auth.uid()) and rol = 'estudiante');
create policy players_update_own on public.players for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4.4 Cuentas: cada usuario ve y edita solo la suya (sin clave, ver sección 5).
create policy app_users_select_own on public.app_users for select to authenticated
  using (user_id = (select auth.uid()));
create policy app_users_update_own on public.app_users for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 4.5 Sesiones: las crea un docente y solo su dueño las modifica.
create policy sessions_insert_docente on public.sessions for insert to authenticated
  with check ((select public.is_docente()) and docente_id = (select public.current_player_id()));
create policy sessions_update_owner on public.sessions for update to authenticated
  using (docente_id = (select public.current_player_id()))
  with check (docente_id = (select public.current_player_id()));
create policy sessions_delete_owner on public.sessions for delete to authenticated
  using (docente_id = (select public.current_player_id()));

-- Participantes: cada alumno se une él mismo a sesiones abiertas; el docente
-- dueño puede gestionar el resto (posiciones, puntos, expulsar).
create policy session_members_insert on public.session_members for insert to authenticated
  with check (
    (player_id = (select public.current_player_id())
       and exists (select 1 from public.sessions s where s.id = session_id and s.estado = 'abierta'))
    or exists (select 1 from public.sessions s
               where s.id = session_id and s.docente_id = (select public.current_player_id()))
  );
create policy session_members_update on public.session_members for update to authenticated
  using (
    player_id = (select public.current_player_id())
    or exists (select 1 from public.sessions s
               where s.id = session_id and s.docente_id = (select public.current_player_id()))
  )
  with check (
    player_id = (select public.current_player_id())
    or exists (select 1 from public.sessions s
               where s.id = session_id and s.docente_id = (select public.current_player_id()))
  );
create policy session_members_delete on public.session_members for delete to authenticated
  using (
    player_id = (select public.current_player_id())
    or exists (select 1 from public.sessions s
               where s.id = session_id and s.docente_id = (select public.current_player_id()))
  );

-- 4.6 Intentos: el alumno registra y ve los suyos; el docente ve los de sus sesiones.
create policy attempts_insert_own on public.attempts for insert to authenticated
  with check (player_id = (select public.current_player_id()));
create policy attempts_select on public.attempts for select to authenticated
  using (
    player_id = (select public.current_player_id())
    or exists (select 1 from public.sessions s
               where s.id = attempts.session_id and s.docente_id = (select public.current_player_id()))
  );

-- 4.7 Salas: cualquiera lee (para unirse por código); solo el anfitrión edita.
create policy lobbies_insert_own on public.lobbies for insert to authenticated
  with check (player_id = (select public.current_player_id()));
create policy lobbies_update_own on public.lobbies for update to authenticated
  using (player_id = (select public.current_player_id()))
  with check (player_id = (select public.current_player_id()));
create policy lobbies_delete_own on public.lobbies for delete to authenticated
  using (player_id = (select public.current_player_id()));

create policy lobby_members_insert_self on public.lobby_members for insert to authenticated
  with check (player_id = (select public.current_player_id()));
create policy lobby_members_delete on public.lobby_members for delete to authenticated
  using (
    player_id = (select public.current_player_id())
    or exists (select 1 from public.lobbies l
               where l.id = lobby_id and l.player_id = (select public.current_player_id()))
  );

-- ---------------------------------------------------------------------------
-- 5. PRIVILEGIOS (defensa en profundidad, además de RLS)
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['courses','categories','difficulties','questions','players','app_users',
                           'sessions','session_members','attempts','lobbies','lobby_members']
  loop
    execute format('revoke all on table public.%I from anon', t);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', t);
  end loop;
end $$;

-- Un jugador solo puede modificar su progreso, NUNCA su rol ni su user_id.
revoke update on public.players from authenticated;
grant  update (nombre, avatar_id, xp, monedas, puntos, correctas, incorrectas, racha, racha_max,
               nivel, logros, modos_ganados, skills) on public.players to authenticated;

-- app_users: la clave hasheada nunca sale al navegador; solo se edita el nombre.
-- (La API de Node usa service_role y no se ve afectada.)
revoke all on table public.app_users from authenticated;
grant  select (id, user_id, player_id, nombre, usuario, rol, created_at, updated_at)
       on public.app_users to authenticated;
grant  update (nombre) on public.app_users to authenticated;

-- Los intentos y las membresías son un registro histórico: no se editan.
revoke update on public.attempts from authenticated;

-- ---------------------------------------------------------------------------
-- 6. VISTAS (security_invoker: respetan las políticas RLS de quien consulta)
--   GET /questions -> preguntas_activas     GET /ranking -> ranking_global
-- ---------------------------------------------------------------------------

drop view if exists public.ranking_global;
drop view if exists public.sesiones_recientes;
drop view if exists public.resumen_por_dificultad;
drop view if exists public.preguntas_activas;

create view public.preguntas_activas with (security_invoker = true) as
  select id, course_id, category_id, difficulty_id, enunciado, opciones,
         respuesta_correcta, feedback, ejemplo_aplicado
  from public.questions
  where activa;

create view public.ranking_global with (security_invoker = true) as
  select rank() over (order by xp desc, puntos desc) as posicion,
         id, nombre, avatar_id, xp, nivel, monedas, puntos,
         correctas, incorrectas, racha_max, logros, modos_ganados
  from public.players
  where rol = 'estudiante'
  order by xp desc, puntos desc;

create view public.sesiones_recientes with (security_invoker = true) as
  select s.id, s.codigo, s.modo, s.estado, s.docente_id, s.created_at,
         c.nombre as curso,
         (select count(*) from public.session_members m where m.session_id = s.id) as jugadores
  from public.sessions s
  left join public.courses c on c.id = s.course_id
  order by s.created_at desc;

-- Rendimiento por alumno y dificultad (el alumno ve lo suyo, el docente lo de sus sesiones).
create view public.resumen_por_dificultad with (security_invoker = true) as
  select a.player_id, d.id as difficulty_id, d.nombre as dificultad,
         count(*)                                   as total,
         count(*) filter (where a.correct)          as correctas,
         round(100.0 * count(*) filter (where a.correct) / count(*), 1) as porcentaje_acierto,
         coalesce(sum(a.puntos), 0)::int            as puntos
  from public.attempts a
  join public.difficulties d on d.id = a.difficulty_id
  group by a.player_id, d.id, d.nombre;

revoke all on public.preguntas_activas, public.ranking_global,
              public.sesiones_recientes, public.resumen_por_dificultad from anon;
grant select on public.preguntas_activas, public.ranking_global,
                public.sesiones_recientes, public.resumen_por_dificultad to authenticated;

-- ---------------------------------------------------------------------------
-- 7. SEED · catálogo del curso (mismo contenido que js/core/data.js)
-- ---------------------------------------------------------------------------

insert into public.courses (id, nombre, descripcion) values
  ('cur_ing', 'Introducción a la Ingeniería Empresarial',
   'Inventos históricos que transformaron la ingeniería (Unidad 1).')
on conflict (id) do nothing;

insert into public.categories (id, course_id, nombre) values
  ('cat_ant', 'cur_ing', 'Antigüedad y Mecánica'),
  ('cat_industrial', 'cur_ing', 'Revolución Industrial'),
  ('cat_comunicaciones', 'cur_ing', 'Comunicaciones y Datos'),
  ('cat_electricidad', 'cur_ing', 'Electrificación y Energía'),
  ('cat_semiconductores', 'cur_ing', 'Semiconductores y Computación'),
  ('cat_procesos', 'cur_ing', 'Procesos, Materiales y Bioprocesos'),
  ('cat_empresarial', 'cur_ing', 'Ingeniería Empresarial y Futuro')
on conflict (id) do nothing;

insert into public.difficulties (id, nombre, peso_puntos) values
  ('dif_facil', 'Fácil', 1),
  ('dif_media', 'Media', 2),
  ('dif_dificil', 'Difícil', 3)
on conflict (id) do nothing;

insert into public.questions (id, course_id, category_id, difficulty_id, enunciado, opciones, respuesta_correcta, feedback, ejemplo_aplicado) values
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
-- 8. LISTO
--   · Cuentas demo (opcional): ejecuta db/supabase-demo-users.sql
--   · Docentes creados con Supabase Auth: promueve con
--       update auth.users set raw_app_meta_data = raw_app_meta_data || '{"rol":"docente"}' where email = '...';
--       update public.players set rol = 'docente' where user_id = (select id from auth.users where email = '...');
--       update public.app_users set rol = 'docente' where user_id = (select id from auth.users where email = '...');
-- ---------------------------------------------------------------------------
