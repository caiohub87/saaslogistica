-- ============================================================
-- USUARIOS E PERMISSOES  ·  Sistema de Gestao Logistica
-- ------------------------------------------------------------
-- ADITIVO: nao altera nem apaga nenhuma das 7 tabelas que ja existem
-- (premiacoes, escalas, equipe_status, rascunhos, diarias, agendamentos,
-- inventarios). Pode rodar com o sistema antigo no ar.
--
-- O que muda de conceito:
--   ANTES  o papel vinha do e-mail (dilnor.admin@ / dilnor.consulta@) e as
--          telas sensiveis eram protegidas por senha escrita no codigo-fonte.
--   AGORA  cada pessoa tem login proprio e o administrador marca, por tela e
--          por acao, o que ela pode fazer. As senhas de tela deixam de existir.
-- ============================================================

-- ---------- telas e acoes do sistema (catalogo fixo) ----------
-- Serve para a tela de administracao montar a matriz de permissoes sozinha.
create table if not exists app_telas (
  chave text primary key,           -- 'inventario', 'escala', ...
  nome text not null,               -- rotulo que aparece na administracao
  grupo text not null,              -- agrupamento no menu do topo
  ordem int not null default 0,
  acoes text[] not null default array['ver']::text[]   -- acoes possiveis nesta tela
);

insert into app_telas (chave,nome,grupo,ordem,acoes) values
  ('inicio',       'Inicio',              'Operacao',   10, array['ver']),
  ('analise',      'Analise de Entregas', 'Operacao',   20, array['ver','importar']),
  ('produtividade','Produtividade',       'Operacao',   30, array['ver','salvar','exportar']),
  ('salvos',       'Premiacoes salvas',   'Operacao',   40, array['ver','exportar','excluir']),
  ('escala',       'Escala',              'Equipe',     50, array['ver','editar','salvar','imprimir']),
  ('escalasalvas', 'Escalas salvas',      'Equipe',     60, array['ver','imprimir']),
  ('diarias',      'Diarias',             'Equipe',     70, array['ver','exportar']),
  ('equipe',       'Disponibilidade',     'Equipe',     80, array['ver','editar']),
  ('agendamentos', 'Cargas a Enviar',     'Planejamento',90, array['ver','editar','excluir','imprimir']),
  ('recebimentos', 'Cargas a Receber',    'Planejamento',100,array['ver','editar','excluir','imprimir']),
  ('inventario',   'Inventario',          'Estoque',    110, array['ver','lancar','excluir','aprovar','exportar']),
  ('cadastros',    'Cadastros',           'Administracao',120, array['ver','editar']),
  ('config',       'Configuracoes',       'Administracao',130, array['ver','editar']),
  ('usuarios',     'Usuarios e acessos',  'Administracao',140, array['ver','editar']),
  ('desempenho',   'Meu Desempenho',      'Pessoal',    150, array['ver'])
on conflict (chave) do update
  set nome=excluded.nome, grupo=excluded.grupo, ordem=excluded.ordem, acoes=excluded.acoes;

-- ---------- pessoas ----------
-- Uma linha por pessoa, ligada ao usuario do Supabase Auth (auth.users).
create table if not exists usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  unidade text not null,                 -- 'Dilnor' | 'Nordece'
  nome text not null,
  cargo text,                            -- 'Conferente', 'Gerente', 'Motorista'...
  admin boolean not null default false,  -- administrador: enxerga e faz tudo na unidade
  ativo boolean not null default true,   -- desligar sem apagar historico
  criado_em timestamptz default now()
);
create index if not exists usuarios_unidade on usuarios (unidade, ativo);

-- ---------- permissoes por pessoa ----------
-- Uma linha por (pessoa, tela). 'acoes' guarda o que ela pode fazer ali.
-- Sem linha = nao ve a tela.
create table if not exists usuario_permissoes (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  tela text not null references app_telas(chave) on delete cascade,
  acoes text[] not null default array['ver']::text[],
  primary key (usuario_id, tela)
);

-- ============================================================
-- FUNCOES DE APOIO
-- Todas em security definer para poderem ler usuarios/permissoes sem
-- esbarrar na propria RLS (evita recursao infinita nas policies).
-- ============================================================

create or replace function minha_unidade()
returns text language sql stable security definer set search_path = public as $$
  select unidade from usuarios where id = auth.uid() and ativo
$$;

create or replace function sou_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select admin from usuarios where id = auth.uid() and ativo), false)
$$;

-- pode(tela, acao): administrador pode tudo; os demais dependem da marcacao
create or replace function pode(p_tela text, p_acao text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select sou_admin() or exists (
    select 1 from usuario_permissoes up
    join usuarios u on u.id = up.usuario_id
    where up.usuario_id = auth.uid() and u.ativo
      and up.tela = p_tela and p_acao = any(up.acoes)
  )
$$;

-- ============================================================
-- RLS DAS NOVAS TABELAS
-- ============================================================
alter table app_telas enable row level security;
drop policy if exists "telas leitura" on app_telas;
create policy "telas leitura" on app_telas for select to authenticated using (true);

alter table usuarios enable row level security;
drop policy if exists "usuarios leitura" on usuarios;
drop policy if exists "usuarios escrita admin" on usuarios;
-- cada pessoa se enxerga; quem administra enxerga a unidade inteira
create policy "usuarios leitura" on usuarios for select to authenticated
  using ( id = auth.uid() or (sou_admin() and unidade = minha_unidade()) );
create policy "usuarios escrita admin" on usuarios for all to authenticated
  using ( sou_admin() and unidade = minha_unidade() )
  with check ( sou_admin() and unidade = minha_unidade() );

alter table usuario_permissoes enable row level security;
drop policy if exists "permissoes leitura" on usuario_permissoes;
drop policy if exists "permissoes escrita admin" on usuario_permissoes;
-- a pessoa precisa ler as proprias permissoes para o menu se montar
create policy "permissoes leitura" on usuario_permissoes for select to authenticated
  using ( usuario_id = auth.uid()
          or (sou_admin() and exists (select 1 from usuarios u
                where u.id = usuario_permissoes.usuario_id and u.unidade = minha_unidade())) );
create policy "permissoes escrita admin" on usuario_permissoes for all to authenticated
  using ( sou_admin() and exists (select 1 from usuarios u
            where u.id = usuario_permissoes.usuario_id and u.unidade = minha_unidade()) )
  with check ( sou_admin() and exists (select 1 from usuarios u
            where u.id = usuario_permissoes.usuario_id and u.unidade = minha_unidade()) );

-- ============================================================
-- PRIMEIRO ADMINISTRADOR (voce)
-- ------------------------------------------------------------
-- A conta dilnor.admin@gestao.app JA EXISTE no Auth (e a que o sistema atual
-- usa). Da para reaproveitar, sem criar login novo. O select abaixo busca o
-- UUID pelo e-mail sozinho — nao precisa copiar nada na mao.
--
-- Troque apenas o nome, se quiser:

insert into usuarios (id, unidade, nome, cargo, admin)
select id, 'Dilnor', 'Caio', 'Administrador', true
from auth.users
where email = 'dilnor.admin@gestao.app'
on conflict (id) do update set admin = true, ativo = true;

-- Conferir se entrou:
--   select u.nome, u.unidade, u.admin from usuarios u;
--
-- Para criar OUTRAS pessoas depois:
--   1) Authentication > Users > Add user (marque "Auto Confirm User")
--   2) rode, trocando e-mail e nome:
--
--      insert into usuarios (id, unidade, nome, cargo, admin)
--      select id, 'Dilnor', 'Nome da Pessoa', 'Conferente', false
--      from auth.users where email = 'email.da.pessoa@dilnor.com';
--
--   3) as permissoes dela voce marca na tela "Usuarios e acessos" — sem SQL.
--
-- Administrador nao precisa de linha em usuario_permissoes: pode() ja libera
-- tudo para ele.
-- ============================================================
