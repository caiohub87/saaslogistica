-- ============================================================
-- RLS DE TRANSICAO  ·  as 7 tabelas que ja existem
-- ------------------------------------------------------------
-- IMPORTANTE: este arquivo NAO remove nenhuma policy antiga.
-- No Postgres, varias policies permissivas na mesma tabela se somam com OU.
-- Entao, ao ADICIONAR as policies novas, os dois sistemas funcionam ao mesmo
-- tempo: o index.html antigo continua entrando com dilnor.admin@gestao.app, e
-- o sistema novo entra com login individual. Quando o novo estiver aprovado e
-- o antigo sair do ar, ai sim removemos as antigas (arquivo 12).
--
-- Rode DEPOIS de 10_usuarios_permissoes.sql.
-- ============================================================

-- ---------- premiacoes ----------
drop policy if exists "novo leitura premiacoes" on premiacoes;
drop policy if exists "novo escrita premiacoes" on premiacoes;
create policy "novo leitura premiacoes" on premiacoes for select to authenticated
  using ( unidade = minha_unidade() and (pode('salvos','ver') or pode('produtividade','ver')) );
create policy "novo escrita premiacoes" on premiacoes for all to authenticated
  using ( unidade = minha_unidade() and (pode('produtividade','salvar') or pode('salvos','excluir')) )
  with check ( unidade = minha_unidade() and pode('produtividade','salvar') );

-- ---------- escalas ----------
drop policy if exists "novo leitura escalas" on escalas;
drop policy if exists "novo escrita escalas" on escalas;
create policy "novo leitura escalas" on escalas for select to authenticated
  using ( unidade = minha_unidade() and (pode('escala','ver') or pode('escalasalvas','ver')) );
create policy "novo escrita escalas" on escalas for all to authenticated
  using ( unidade = minha_unidade() and pode('escala','salvar') )
  with check ( unidade = minha_unidade() and pode('escala','salvar') );

-- ---------- equipe_status ----------
drop policy if exists "novo leitura equipe" on equipe_status;
drop policy if exists "novo escrita equipe" on equipe_status;
-- a escala precisa ler a equipe para sugerir nomes, entao 'escala.ver' tambem le
create policy "novo leitura equipe" on equipe_status for select to authenticated
  using ( unidade = minha_unidade() and (pode('equipe','ver') or pode('escala','ver')) );
create policy "novo escrita equipe" on equipe_status for all to authenticated
  using ( unidade = minha_unidade() and pode('equipe','editar') )
  with check ( unidade = minha_unidade() and pode('equipe','editar') );

-- ---------- rascunhos ----------
drop policy if exists "novo leitura rascunhos" on rascunhos;
drop policy if exists "novo escrita rascunhos" on rascunhos;
create policy "novo leitura rascunhos" on rascunhos for select to authenticated
  using ( unidade = minha_unidade() and pode('escala','ver') );
create policy "novo escrita rascunhos" on rascunhos for all to authenticated
  using ( unidade = minha_unidade() and pode('escala','editar') )
  with check ( unidade = minha_unidade() and pode('escala','editar') );

-- ---------- diarias ----------
drop policy if exists "novo leitura diarias" on diarias;
drop policy if exists "novo escrita diarias" on diarias;
create policy "novo leitura diarias" on diarias for select to authenticated
  using ( unidade = minha_unidade() and (pode('diarias','ver') or pode('escala','ver')) );
-- as diarias sao gravadas junto com a escala, por isso dependem de 'escala.salvar'
create policy "novo escrita diarias" on diarias for all to authenticated
  using ( unidade = minha_unidade() and pode('escala','salvar') )
  with check ( unidade = minha_unidade() and pode('escala','salvar') );

-- ---------- agendamentos ----------
-- a coluna tipo separa as duas telas: 'enviar' e 'receber' tem permissao propria
drop policy if exists "novo leitura agendamentos" on agendamentos;
drop policy if exists "novo escrita agendamentos" on agendamentos;
create policy "novo leitura agendamentos" on agendamentos for select to authenticated
  using ( unidade = minha_unidade() and (
    (tipo = 'enviar'  and pode('agendamentos','ver')) or
    (tipo = 'receber' and pode('recebimentos','ver')) ) );
create policy "novo escrita agendamentos" on agendamentos for all to authenticated
  using ( unidade = minha_unidade() and (
    (tipo = 'enviar'  and (pode('agendamentos','editar') or pode('agendamentos','excluir'))) or
    (tipo = 'receber' and (pode('recebimentos','editar') or pode('recebimentos','excluir'))) ) )
  with check ( unidade = minha_unidade() and (
    (tipo = 'enviar'  and pode('agendamentos','editar')) or
    (tipo = 'receber' and pode('recebimentos','editar')) ) );

-- ---------- inventarios ----------
drop policy if exists "novo leitura inventarios" on inventarios;
drop policy if exists "novo escrita inventarios" on inventarios;
create policy "novo leitura inventarios" on inventarios for select to authenticated
  using ( unidade = minha_unidade() and pode('inventario','ver') );
create policy "novo escrita inventarios" on inventarios for all to authenticated
  using ( unidade = minha_unidade() and (pode('inventario','lancar') or pode('inventario','excluir')) )
  with check ( unidade = minha_unidade() and pode('inventario','lancar') );
