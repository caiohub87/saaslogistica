-- ============================================================
-- VEICULOS  ·  a placa deixa de ser texto solto e vira cadastro
-- ------------------------------------------------------------
-- ADITIVO: cria uma tabela nova e nao encosta em nada que ja existe.
-- Rode DEPOIS de 10_usuarios_permissoes.sql (usa minha_unidade() e pode()).
--
-- POR QUE:
--   A placa era digitada a mao em cada falta e sobra. Duas pessoas escrevendo a
--   mesma placa de jeitos diferentes ('OEY 8503' e 'OEY8503') viram dois
--   veiculos na hora de analisar, e o total de ocorrencias por carro fica
--   errado sem ninguem perceber.
--
--   Com o cadastro, quem registra ESCOLHE a placa de uma lista. A analise por
--   veiculo passa a fechar.
--
-- MESMO DESENHO DA TABELA `motoristas`:
--   Desativar em vez de apagar preserva o historico, e o registro da ocorrencia
--   continua guardando a placa como TEXTO — se o veiculo sair da frota, a falta
--   antiga nao muda.
--
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists veiculos (
  id bigint generated always as identity primary key,
  unidade text not null,
  placa text not null,
  -- desativar tira das opcoes sem apagar: o veiculo pode voltar, e as
  -- ocorrencias antigas seguem apontando para a placa
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (unidade, placa)
);
create index if not exists veiculos_unidade on veiculos (unidade, ativo, placa);

comment on table veiculos is
  'Frota que sai na rota. A placa escolhida aqui e gravada como texto na '
  'ocorrencia — este cadastro so alimenta a lista de opcoes.';

-- ---------- RLS ----------
-- Igual a `motoristas`: quem registra falta/sobra tambem mantem a lista, porque
-- quem usa e quem sabe qual carro saiu.
alter table veiculos enable row level security;
drop policy if exists "leitura veiculos" on veiculos;
drop policy if exists "escrita veiculos" on veiculos;
create policy "leitura veiculos" on veiculos for select to authenticated
  using ( unidade = minha_unidade() and pode('ocorrencias','ver') );
create policy "escrita veiculos" on veiculos for all to authenticated
  using ( unidade = minha_unidade() and pode('ocorrencias','lancar') )
  with check ( unidade = minha_unidade() and pode('ocorrencias','lancar') );

-- ---------- frota inicial ----------
-- Lida da lista enviada. CONFIRA antes de rodar: placa errada aqui vira opcao
-- errada na tela. Para tirar uma, apague a linha; para acrescentar, copie o
-- formato. Rodar de novo nao duplica.
insert into veiculos (unidade, placa) values
  ('Dilnor', 'NQB 9732'),
  ('Dilnor', 'NQC 2532'),
  ('Dilnor', 'OEY 7883'),
  ('Dilnor', 'NQB 9742'),
  ('Dilnor', 'OEY 6703'),
  ('Dilnor', 'OEY 6673'),
  ('Dilnor', 'OEY 7773'),
  ('Dilnor', 'OEY 6683'),
  ('Dilnor', 'NQC 2552'),
  ('Dilnor', 'OEY 6713'),
  ('Dilnor', 'OEY 6693'),
  ('Dilnor', 'NQB 9752'),
  ('Dilnor', 'OEY 8503'),
  ('Dilnor', 'NQC 2542'),
  ('Dilnor', 'PFK 1501'),
  ('Dilnor', 'NIB 9029'),
  ('Dilnor', 'MMN 6B87'),
  ('Dilnor', 'KKL 4490'),
  ('Dilnor', 'KMA 4599'),
  ('Dilnor', 'KKK 6709')
on conflict (unidade, placa) do nothing;

-- Conferir:
--   select placa from veiculos where unidade = 'Dilnor' order by placa;
