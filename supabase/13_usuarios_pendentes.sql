-- ============================================================
-- USUARIOS PENDENTES
-- ------------------------------------------------------------
-- ADITIVO. Rode depois de 10_usuarios_permissoes.sql.
--
-- Ate aqui, a tela "Usuarios e acessos" so listava quem ja tinha linha na
-- tabela `usuarios` — quem so tinha conta no Supabase Auth (Authentication >
-- Users) ficava invisivel, e so entrava via INSERT manual no SQL Editor.
--
-- Esta funcao expoe, so para administradores, quem tem login no Auth mas
-- ainda nao foi liberado. security definer porque authenticated normalmente
-- nao enxerga auth.users; o "if not sou_admin() then return" e o que evita
-- vazar a lista para quem nao e admin.
-- ============================================================
create or replace function usuarios_pendentes()
returns table(id uuid, email text, criado_em timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not sou_admin() then
    return;
  end if;
  return query
    select au.id, au.email::text, au.created_at
    from auth.users au
    left join usuarios u on u.id = au.id
    where u.id is null
    order by au.created_at desc;
end;
$$;

grant execute on function usuarios_pendentes() to authenticated;

-- Conferir: select * from usuarios_pendentes();  (logado como admin)
