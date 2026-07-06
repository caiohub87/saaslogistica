-- ============================================================
-- CONFIGURAÇÃO DO BANCO (rodar no Supabase: SQL Editor → New query → colar → Run)
-- ============================================================

-- Tabela única de premiações (uma linha por unidade+dia+carga)
create table if not exists premiacoes (
  id bigint generated always as identity primary key,
  unidade text not null,            -- 'Dilnor' | 'Nordece'
  data_saida date not null,
  carga text not null,
  motorista text,
  aj1 text,
  aj2 text,
  tipo text,                        -- cargo do motorista
  prod_final numeric,               -- 0..1
  faixa text,
  pagar boolean default true,
  valor_mot numeric default 0,
  valor_aj1 numeric default 0,
  valor_aj2 numeric default 0,
  problemas jsonb default '[]',     -- pedidos não entregues da carga
  created_at timestamptz default now(),
  unique (unidade, data_saida, carga)   -- salvar de novo substitui (upsert)
);

-- Segurança: cada unidade só enxerga os próprios dados
alter table premiacoes enable row level security;

-- Leitura: admin e consulta da unidade (e-mail começa com o nome da unidade)
create policy "leitura da propria unidade" on premiacoes
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );

-- Escrita: somente o usuário .admin da unidade
create policy "escrita admin da unidade" on premiacoes
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' );

-- ============================================================
-- MÓDULO ESCALA (rodar depois, quando o módulo for criado)
-- ============================================================

-- Escala diária (uma por unidade+data de saída; salvar de novo substitui)
create table if not exists escalas (
  id bigint generated always as identity primary key,
  unidade text not null,
  data_saida date not null,
  data_carrego date,
  linhas jsonb default '[]',
  created_at timestamptz default now(),
  unique (unidade, data_saida)
);
alter table escalas enable row level security;
create policy "leitura unidade escalas" on escalas
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin escalas" on escalas
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' );

-- Disponibilidade da equipe (status por pessoa)
create table if not exists equipe_status (
  id bigint generated always as identity primary key,
  unidade text not null,
  nome text not null,
  tipo text,                        -- 'motorista' | 'ajudante'
  status text default 'disponivel', -- disponivel | ferias | viajando | afastado | folga
  unique (unidade, nome)
);
alter table equipe_status enable row level security;
create policy "leitura unidade equipe" on equipe_status
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin equipe" on equipe_status
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' );

-- ============================================================
-- USUÁRIOS (criar no painel: Authentication → Users → Add user → marcar "Auto Confirm User")
--   dilnor.admin@gestao.app      → senha de administrador da Dilnor
--   dilnor.consulta@gestao.app   → senha de consulta (funcionários) da Dilnor
--   nordece.admin@gestao.app     → senha de administrador da Nordece
--   nordece.consulta@gestao.app  → senha de consulta (funcionários) da Nordece
-- ============================================================
