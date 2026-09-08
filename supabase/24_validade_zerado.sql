-- ============================================================
-- VALIDADE · marcar o produto que zerou no estoque
-- ------------------------------------------------------------
-- ADITIVO: cria uma tabela nova e nao encosta em nada que ja existe.
-- Rode DEPOIS de 16_validade.sql.
--
-- POR QUE:
--   O relatorio do WMS e um retrato do dia. Entre um retrato e outro o produto
--   pode acabar — e quem esta no deposito sabe disso antes do proximo PDF. Sem
--   onde registrar, ele continua na lista pedindo atencao que nao precisa mais,
--   e quem confere perde tempo procurando o que ja saiu.
--
-- POR QUE TABELA PROPRIA, E NAO UMA COLUNA EM validade_itens:
--   "O produto acabou" e sobre o PRODUTO, e validade_itens tem uma linha por
--   produto E ENDERECO. A marca ficaria repetida em cada endereco, e bastaria
--   um upload trazer um endereco novo para nascer um item sem a marca — o
--   mesmo produto zerado e nao zerado ao mesmo tempo.
--
-- POR QUE O UPLOAD NAO LIMPA A MARCA:
--   Seria adivinhar. Quem marcou olhou o deposito; o PDF pode ser de ontem, ou
--   trazer saldo que ja saiu. A marca sai quando alguem clicar de novo — a
--   mesma pessoa que colocou.
--
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists validade_zerados (
  unidade text not null,
  produto_id text not null,
  zerado_por text,
  zerado_por_id uuid,
  zerado_em timestamptz not null default now(),
  primary key (unidade, produto_id)
);

comment on table validade_zerados is
  'Produtos que acabaram no deposito. A linha existir E a marca; desmarcar '
  'apaga. Quem esta aqui continua aparecendo na tela, com selo.';

-- ---------- RLS ----------
alter table validade_zerados enable row level security;
drop policy if exists "leitura validade_zerados" on validade_zerados;
drop policy if exists "escrita validade_zerados" on validade_zerados;

create policy "leitura validade_zerados" on validade_zerados for select to authenticated
  using ( unidade = minha_unidade() and pode('validade','ver') );

-- marcar e desmarcar sao o mesmo ato de quem trabalha a lista, entao seguem a
-- permissao de lancar — nao merecem uma terceira
create policy "escrita validade_zerados" on validade_zerados for all to authenticated
  using ( unidade = minha_unidade() and pode('validade','lancar') )
  with check ( unidade = minha_unidade() and pode('validade','lancar') );

-- Conferir:
--   select produto_id, zerado_por, zerado_em from validade_zerados order by zerado_em desc;
