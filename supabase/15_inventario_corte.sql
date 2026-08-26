-- ============================================================
-- INVENTARIO DE CORTE  ·  um arquivo, varios fornecedores
-- ------------------------------------------------------------
-- ADITIVO: acrescenta a coluna `tipo` em inventarios e troca a chave unica
-- para incluir ela. Nenhum dado existente muda de valor — tudo que ja esta
-- gravado passa a ser tipo='normal' pelo default da coluna.
--
-- POR QUE:
--   O inventario normal e um arquivo por fornecedor, com o fornecedor
--   escolhido na tela. O inventario de CORTE e um arquivo so com produtos de
--   varios fornecedores misturados, separados pela coluna "Id Fabricante" do
--   relatorio do ERP. A tela quebra o arquivo e grava um lancamento por
--   fornecedor, todos com tipo='corte'.
--
-- POR QUE A CHAVE MUDA:
--   A chave antiga era (unidade, fornecedor, data_inventario). Com ela, lancar
--   um corte no mesmo dia em que houve inventario normal do mesmo fornecedor
--   SOBRESCREVERIA o normal — perdendo a contagem completa e ficando so com os
--   itens cortados. Incluindo `tipo` na chave os dois convivem, e re-subir o
--   mesmo arquivo continua substituindo o lancamento certo.
--
-- RLS: nao muda nada. As policies de inventarios ja valem para as duas linhas,
-- porque e a mesma tabela e a mesma permissao ('inventario', 'lancar'/'ver').
--
-- Pode rodar mais de uma vez.
-- Rode DEPOIS de 11_rls_transicao.sql.
-- ============================================================

-- ---------- a coluna ----------
alter table inventarios add column if not exists tipo text not null default 'normal';

alter table inventarios drop constraint if exists inventarios_tipo_check;
alter table inventarios add constraint inventarios_tipo_check
  check (tipo in ('normal', 'corte'));

comment on column inventarios.tipo is
  'normal = um arquivo, um fornecedor, contagem completa. '
  'corte = arquivo com varios fornecedores, separado pela coluna Id Fabricante.';

-- ---------- a chave unica ----------
-- Derruba qualquer unique que esteja exatamente em (unidade, fornecedor,
-- data_inventario) — o nome varia conforme quem criou a tabela, entao a busca e
-- pelas colunas, nao pelo nome.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'inventarios'
      and con.contype = 'u'
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(con.conkey) as k
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
      ) = array['data_inventario', 'fornecedor', 'unidade']
  loop
    execute format('alter table inventarios drop constraint %I', c.conname);
  end loop;
end $$;

-- E os unique INDEX soltos (sem constraint por tras) nas mesmas tres colunas.
do $$
declare
  i record;
begin
  for i in
    select cls.relname
    from pg_index idx
    join pg_class cls on cls.oid = idx.indexrelid
    join pg_class tbl on tbl.oid = idx.indrelid
    where tbl.relname = 'inventarios'
      and idx.indisunique
      and not idx.indisprimary
      and not exists (select 1 from pg_constraint con where con.conindid = idx.indexrelid)
      and (
        select array_agg(att.attname::text order by att.attname)
        from unnest(idx.indkey) as k
        join pg_attribute att on att.attrelid = idx.indrelid and att.attnum = k
      ) = array['data_inventario', 'fornecedor', 'unidade']
  loop
    execute format('drop index %I', i.relname);
  end loop;
end $$;

-- A chave nova. E ela que o upsert da tela usa em onConflict.
create unique index if not exists inventarios_unidade_forn_data_tipo
  on inventarios (unidade, fornecedor, data_inventario, tipo);

-- A Visao geral le tudo do fornecedor para achar a contagem mais recente de
-- cada item; este indice evita varrer a tabela inteira quando o historico crescer.
create index if not exists inventarios_unidade_forn_data
  on inventarios (unidade, fornecedor, data_inventario desc);
