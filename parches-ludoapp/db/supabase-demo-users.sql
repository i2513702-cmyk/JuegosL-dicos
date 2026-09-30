-- ============================================================================
-- LudoApp · Cuentas DEMO (opcional) · ejecutar DESPUÉS de supabase-schema.sql
-- ----------------------------------------------------------------------------
-- Crea profe / maria / juan / sofia / carlos con la clave 1234, guardada como
-- hash scrypt (mismo formato que api/auth.js), así el login con la API activa
-- funciona con los botones de "Acceso rápido" de la app.
--
-- ⚠ SOLO PARA DESARROLLO Y CLASES. La clave 1234 es pública (está en la UI).
--   Antes de usar la app con datos reales, bórralas:
--     delete from public.app_users where usuario in ('profe','maria','juan','sofia','carlos');
--     delete from public.players   where nombre in ('Prof. Ana López','María Torres','Juan Pérez','Sofía Rojas','Carlos Díaz')
--                                   and user_id is null;
-- Es idempotente: si el usuario ya existe, no lo toca.
-- ============================================================================

do $$
declare
  r     record;
  v_pid uuid;
begin
  for r in
    select * from (values
    ('profe', 'Prof. Ana López', 'docente', '52440e9c68038d36ec9021601a087f26',
     '189d9ff288490c0e412d90261855f169f1ec8ad02b69d135f094ca87da9660e07473e0c081952ff37e029b2d7b13b848f4b15b016222b2bb23e90a5df279abc7'),
    ('maria', 'María Torres', 'estudiante', 'bcd0fbee46d593f13ffb7a2ad87dec93',
     'ce9e35a2d5d571a1e4cdc96425dfda48106ff0a9edbc55cef4d66f061e288f49b634c7b9ac766d3b35d1750407cb262aa0c91429b686510b29c65097054c238d'),
    ('juan', 'Juan Pérez', 'estudiante', 'd7dfeb22f67f5bf9ed6097e0576be074',
     '2d50474bdd2c00af93ea2fa65e7c5a60a107242196566f471a856f2ba7d93a40afd47d89701f1a77be19ee37105c8cb56b7403529f5184e9c7a90213b8214de6'),
    ('sofia', 'Sofía Rojas', 'estudiante', 'c2ba3aabdaf81f9d04f5af420563b3c4',
     '5ff5988441237e67426a8e5838b00af6c9ede36fb8150329cc18d9518150f605df6b7d7b43d63673192803e7174cdd5681b5fb94846bf98ae33f434d872759f1'),
    ('carlos', 'Carlos Díaz', 'estudiante', 'f2ec194328187593106fcf722cc31d8e',
     '65df1a3c157a6d24e7530678de6000fa8728986f5598fdfdfa8c44543830e39d412d9f38c1f54ca2efc11ce1c8208dba9e357ddc221571ba25b1e5cfdb04f8e0')
    ) as t(usuario, nombre, rol, salt, hash)
  loop
    if not exists (select 1 from public.app_users where usuario = r.usuario) then
      insert into public.players (nombre, rol) values (r.nombre, r.rol) returning id into v_pid;
      insert into public.app_users (nombre, usuario, rol, clave_salt, clave_hash, player_id)
        values (r.nombre, r.usuario, r.rol, r.salt, r.hash, v_pid);
    end if;
  end loop;
end $$;

select usuario, rol, player_id is not null as con_ficha from public.app_users order by rol, usuario;
