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

-- Rascunho / acompanhamento (um por unidade: blocos praça e viagem)
create table if not exists rascunhos (
  unidade text primary key,
  praca jsonb default '[]',
  viagem jsonb default '[]',
  updated_at timestamptz default now()
);
alter table rascunhos enable row level security;
create policy "leitura unidade rascunho" on rascunhos
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin rascunho" on rascunhos
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' );

-- Diárias (histórico de pagamento: um lançamento por pessoa por dia/linha da escala)
create table if not exists diarias (
  id bigint generated always as identity primary key,
  unidade text not null,
  data_saida date not null,
  nome text not null,
  funcao text,                 -- 'motorista' | 'ajudante'
  veiculo text,
  lote text,
  valor numeric default 0,
  created_at timestamptz default now()
);
alter table diarias enable row level security;
create policy "leitura unidade diarias" on diarias
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin diarias" on diarias
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' );

-- Agendamentos (dois tipos: 'enviar' = montador de cargas | 'receber' = depósito)
create table if not exists agendamentos (
  id bigint generated always as identity primary key,
  unidade text not null,
  tipo text not null,               -- 'enviar' | 'receber'
  data date not null,
  hora text,                        -- usado no tipo 'receber'
  cliente text,                     -- enviar
  rota text,                        -- enviar
  descricao text,                   -- (não usado — mantido por compatibilidade)
  fornecedor text,                  -- receber: origem/fornecedor
  volumes text,                     -- receber: quantidade/volumes
  status text default 'Agendado',   -- enviar: Agendado|Montado|Enviado|Cancelado · receber: Agendado|Recebido|Cancelado
  obs text,
  created_at timestamptz default now()
);
alter table agendamentos enable row level security;
create policy "leitura unidade agendamentos" on agendamentos
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin agendamentos" on agendamentos
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and auth.email() like '%.admin@%' );

-- ============================================================
-- MÓDULO DESPESAS (controle de despesas x faturamento + metas)
--   Fonte do upload mensal: PDF "124 - Balancete, Por Conta" do ERP.
--   Um upload por competência (mês/ano); salvar de novo substitui (upsert).
-- ============================================================

-- Despesas: uma linha por conta (código) por competência.
-- Realizado gravado com sinal positivo (o PDF traz negativo).
create table if not exists despesas (
  id bigint generated always as identity primary key,
  unidade text not null,
  ano int not null,
  mes int not null,                 -- competência escolhida no upload (1..12)
  grupo text not null,              -- código do grupo: '351','352',...,'366','600'
  grupo_nome text,                  -- nome do grupo: 'DESPESA GERAL', 'LOGISTICA'...
  codigo int not null,              -- código da conta: 35101, 36601...
  conta text,                       -- nome da conta: 'ALUGUEL', 'SALARIO'...
  valor numeric default 0,          -- realizado, sinal positivo
  periodo_inicio date,              -- do cabeçalho do PDF (referência: 21/06/2026)
  periodo_fim date,                 -- do cabeçalho do PDF (referência: 21/07/2026)
  created_at timestamptz default now(),
  unique (unidade, ano, mes, codigo)   -- salvar de novo substitui (upsert) — não duplica
);
alter table despesas enable row level security;
drop policy if exists "leitura unidade despesas" on despesas;
drop policy if exists "escrita admin despesas" on despesas;
create policy "leitura unidade despesas" on despesas
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin despesas" on despesas
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and (auth.email() like '%.admin@%' or auth.email() like '%.gerente@%') )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and (auth.email() like '%.admin@%' or auth.email() like '%.gerente@%') );

-- Faturamento: uma linha por competência (cabeçalho do balancete).
create table if not exists despesas_faturamento (
  id bigint generated always as identity primary key,
  unidade text not null,
  ano int not null,
  mes int not null,
  fat_bruto numeric,                -- Faturamento Bruto
  fat_liquido numeric,              -- Faturamento Líquido (base do %/Fat.)
  cmv numeric,                      -- CMV
  saldo_bruto numeric,              -- Saldo Bruto
  periodo_inicio date,
  periodo_fim date,
  created_at timestamptz default now(),
  unique (unidade, ano, mes)
);
alter table despesas_faturamento enable row level security;
drop policy if exists "leitura unidade fat" on despesas_faturamento;
drop policy if exists "escrita admin fat" on despesas_faturamento;
create policy "leitura unidade fat" on despesas_faturamento
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin fat" on despesas_faturamento
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and (auth.email() like '%.admin@%' or auth.email() like '%.gerente@%') )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and (auth.email() like '%.admin@%' or auth.email() like '%.gerente@%') );

-- Metas / orçamento mensal: definidas pelo gerente.
-- alvo = 'TOTAL' (despesa total do mês) ou o código de grupo dos 4 principais:
--   '351' Geral · '352' Predial · '365' Depósito · '366' Logística
create table if not exists metas (
  id bigint generated always as identity primary key,
  unidade text not null,
  ano int not null,
  mes int not null,
  alvo text not null,               -- 'TOTAL' | '351' | '352' | '365' | '366'
  valor_meta numeric default 0,
  created_at timestamptz default now(),
  unique (unidade, ano, mes, alvo)  -- uma meta por alvo por competência (upsert)
);
alter table metas enable row level security;
drop policy if exists "leitura unidade metas" on metas;
drop policy if exists "escrita admin metas" on metas;
create policy "leitura unidade metas" on metas
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin metas" on metas
  for all to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) and (auth.email() like '%.admin@%' or auth.email() like '%.gerente@%') )
  with check ( lower(unidade) = split_part(auth.email(), '.', 1) and (auth.email() like '%.admin@%' or auth.email() like '%.gerente@%') );

-- ============================================================
-- MÓDULO INVENTÁRIO (divergência de conferência por fornecedor)
--   Fonte do upload: relatório de conferência do ERP (.xls que na verdade é HTML).
--   Um lançamento = um fornecedor (coluna DESCR_271) numa data de inventário.
--   Lançar de novo a mesma data/fornecedor substitui (upsert).
--   Div Ant NÃO é gravado: é calculado na hora, lendo o Dif Qtde do inventário
--   imediatamente anterior do mesmo fornecedor.
-- ============================================================
create table if not exists inventarios (
  id bigint generated always as identity primary key,
  unidade text not null,
  fornecedor text not null,           -- DESCR_271 do ERP (RAYOVAC, ADL, COLGATE...)
  data_inventario date not null,      -- dia em que o inventário foi feito
  produtos jsonb not null default '[]',
  -- cada item: {id, descricao, embalagem, sld_estoq, sld_contagem, dif_qtde, dif_financeira}
  created_at timestamptz default now(),
  unique (unidade, fornecedor, data_inventario)
);
create index if not exists inventarios_busca on inventarios (unidade, fornecedor, data_inventario desc);
alter table inventarios enable row level security;
drop policy if exists "leitura unidade inventarios" on inventarios;
drop policy if exists "escrita admin inventarios" on inventarios;
create policy "leitura unidade inventarios" on inventarios
  for select to authenticated
  using ( lower(unidade) = split_part(auth.email(), '.', 1) );
create policy "escrita admin inventarios" on inventarios
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
