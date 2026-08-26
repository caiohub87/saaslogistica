-- ============================================================
-- CONTROLE DE VALIDADE  ·  a "Relacao Preventiva de Validade" virando tela
-- ------------------------------------------------------------
-- ADITIVO: cria tres tabelas novas e nao encosta em nada que ja existe.
-- Rode DEPOIS de 10_usuarios_permissoes.sql (usa minha_unidade() e pode()).
--
-- COMO A ROTINA FUNCIONA:
--   Toda semana sai do WMS um PDF com uma linha por LOTE — o mesmo produto
--   aparece varias vezes, uma por endereco, porque cada endereco tem a sua
--   validade. Alguem sobe esse PDF e, olhando o que esta fisicamente separado,
--   registra quanto vai escoar em 30, 60, 90 ou 120 dias.
--
--   O periodo NAO e a validade real do lote: e decisao operacional de quando
--   aquilo vai ser escoado. Por isso ele e escolhido na mao, e nao calculado a
--   partir da coluna "Dias" do relatorio.
--
-- SAO TRES COISAS COM CICLOS DE VIDA DIFERENTES — por isso tres tabelas:
--   validade_itens      o retrato do PDF. Trocado a cada upload.
--   validade_registros  o trabalho da pessoa (quanto em qual periodo). Sobrevive
--                       aos uploads: subir PDF novo nao pode apagar isso.
--   produto_fornecedor  de quem e cada SKU. Aprendido uma vez, vale para sempre.
--
-- Pode rodar mais de uma vez.
-- ============================================================

-- ---------- o retrato do PDF ----------
-- Uma linha por (produto, endereco): e assim que o relatorio vem, e e assim que
-- a pessoa enxerga o deposito — o mesmo SKU em dois enderecos sao duas coisas
-- separadas, com validades diferentes.
--
-- O upload faz UPSERT por (unidade, produto_id, endereco): item que veio no PDF
-- novo tem os numeros atualizados; item que NAO veio fica como estava. Nada e
-- apagado, porque o relatorio e recortado por faixa de dias e um item some da
-- listagem sem ter sumido do deposito.
create table if not exists validade_itens (
  id bigint generated always as identity primary key,
  unidade text not null,
  produto_id text not null,          -- 'ID' do relatorio, o codigo do produto
  descricao text not null,
  endereco text not null,            -- '20.03.00.059'
  emb_padrao numeric,                -- quantas unidades tem a caixa
  qtd_cx numeric,                    -- Estoque Atual · Qtd. CX (pode ser fracionario)
  qtd_un numeric,                    -- Estoque Atual · Qtd. UN
  validade date not null,            -- a validade do lote naquele endereco
  dias int,                          -- quanto falta, conforme o WMS calculou (negativo = vencido)
  observacao text,
  -- de qual upload este retrato veio; serve para a tela mostrar "lido em" e
  -- para destacar item que nao apareceu na leva mais recente
  lido_em timestamptz not null default now(),
  unique (unidade, produto_id, endereco)
);
create index if not exists validade_itens_busca on validade_itens (unidade, validade);

-- ---------- o trabalho da pessoa ----------
-- Quantos vao escoar em qual periodo. Tabela SEPARADA de validade_itens de
-- proposito: o upload semanal troca o retrato, mas nao pode encostar aqui.
--
-- Varias linhas para o mesmo (produto, endereco) e o caso normal, nao excecao:
-- um endereco com 20 unidades pode virar 12 em '30' e 8 em '60'. Por isso NAO
-- existe unique nessas colunas.
create table if not exists validade_registros (
  id bigint generated always as identity primary key,
  unidade text not null,
  produto_id text not null,
  endereco text not null,
  quantidade numeric not null,
  periodo int not null check (periodo in (30, 60, 90, 120)),
  -- a validade copiada do item no momento do registro. Fica GRAVADA em vez de
  -- lida do item toda vez porque e ela que a Visao mostra na coluna do periodo:
  -- se o retrato mudar depois, o que a pessoa registrou continua o que ela viu.
  vencimento date,
  obs text,
  registrado_por text,
  registrado_por_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists validade_registros_busca
  on validade_registros (unidade, produto_id, endereco);

-- ---------- de quem e cada SKU ----------
-- O PDF de validade traz ID e Descricao, mas NAO traz o fabricante — diferente
-- do relatorio de corte, que tem a coluna "Id Fabricante". Entao o vinculo
-- produto -> fornecedor e aprendido e guardado aqui.
--
-- A tela preenche isto sozinha a partir dos inventarios de corte ja lancados
-- (que carregam o fabricante em cada produto); o que sobrar sem dono a pessoa
-- classifica na mao, uma vez so.
create table if not exists produto_fornecedor (
  unidade text not null,
  produto_id text not null,
  fornecedor text not null,
  -- 'corte' = deduzido do Id Fabricante de um inventario de corte
  -- 'manual' = alguem escolheu na tela; nao pode ser sobrescrito pela deducao
  origem text not null default 'manual' check (origem in ('corte', 'manual')),
  atualizado_em timestamptz not null default now(),
  primary key (unidade, produto_id)
);

-- ---------- catalogo de telas ----------
insert into app_telas (chave, nome, grupo, ordem, acoes) values
  ('validade', 'Validade', 'Estoque', 118, array['ver','lancar','excluir'])
on conflict (chave) do update
  set nome = excluded.nome, grupo = excluded.grupo,
      ordem = excluded.ordem, acoes = excluded.acoes;

-- ---------- RLS ----------
alter table validade_itens enable row level security;
drop policy if exists "leitura validade_itens" on validade_itens;
drop policy if exists "escrita validade_itens" on validade_itens;
create policy "leitura validade_itens" on validade_itens for select to authenticated
  using ( unidade = minha_unidade() and pode('validade','ver') );
-- subir o PDF e 'lancar': e o mesmo ato de trazer o relatorio para dentro
create policy "escrita validade_itens" on validade_itens for all to authenticated
  using ( unidade = minha_unidade() and pode('validade','lancar') )
  with check ( unidade = minha_unidade() and pode('validade','lancar') );

alter table validade_registros enable row level security;
drop policy if exists "leitura validade_registros" on validade_registros;
drop policy if exists "escrita validade_registros" on validade_registros;
drop policy if exists "exclusao validade_registros" on validade_registros;
create policy "leitura validade_registros" on validade_registros for select to authenticated
  using ( unidade = minha_unidade() and pode('validade','ver') );
create policy "escrita validade_registros" on validade_registros for insert to authenticated
  with check ( unidade = minha_unidade() and pode('validade','lancar') );
create policy "atualizacao validade_registros" on validade_registros for update to authenticated
  using ( unidade = minha_unidade() and pode('validade','lancar') )
  with check ( unidade = minha_unidade() and pode('validade','lancar') );
-- apagar registro alheio e acao separada de lancar o proprio
create policy "exclusao validade_registros" on validade_registros for delete to authenticated
  using ( unidade = minha_unidade() and pode('validade','excluir') );

alter table produto_fornecedor enable row level security;
drop policy if exists "leitura produto_fornecedor" on produto_fornecedor;
drop policy if exists "escrita produto_fornecedor" on produto_fornecedor;
create policy "leitura produto_fornecedor" on produto_fornecedor for select to authenticated
  using ( unidade = minha_unidade() and pode('validade','ver') );
create policy "escrita produto_fornecedor" on produto_fornecedor for all to authenticated
  using ( unidade = minha_unidade() and pode('validade','lancar') )
  with check ( unidade = minha_unidade() and pode('validade','lancar') );

-- Conferir depois de subir o primeiro PDF:
--   select count(*) from validade_itens;
--   select fornecedor, count(*) from produto_fornecedor group by fornecedor;
