-- ============================================================
-- PREMIACAO: equipe completa + trilha de auditoria
-- ------------------------------------------------------------
-- ADITIVO: nao altera nem apaga nada do que ja existe na tabela premiacoes.
-- Rode DEPOIS de 10_usuarios_permissoes.sql e 11_rls_transicao.sql.
-- ============================================================

-- ---------- equipe completa ----------
-- A tabela original tem motorista/aj1/aj2 e valor_mot/valor_aj1/valor_aj2, o
-- que trava em dois ajudantes. Cargas de cliente unico levam mais gente, entao
-- a equipe inteira passa a ser gravada aqui. As colunas antigas continuam
-- preenchidas para o sistema antigo seguir lendo enquanto conviverem.
alter table premiacoes add column if not exists equipe jsonb default '[]';
-- cada item: {chave, nome, tipo:'mot'|'aju', cargo, valor}

-- ---------- quem alterou o que ----------
-- O usuario pode reajustar nomes na tela de Salvos; toda alteracao fica
-- registrada. Nao ha update nem delete nesta tabela: e um livro, nao um
-- rascunho.
create table if not exists premiacao_alteracoes (
  id bigint generated always as identity primary key,
  premiacao_id bigint not null references premiacoes(id) on delete cascade,
  campo text not null,            -- 'motorista', 'ajudante', 'cargo'...
  valor_antes text,
  valor_depois text,
  motivo text,
  alterado_por text not null,     -- nome de quem estava logado
  alterado_por_id uuid,           -- auth.uid(), para rastrear de verdade
  alterado_em timestamptz not null default now()
);
create index if not exists premiacao_alteracoes_por_premiacao
  on premiacao_alteracoes (premiacao_id, alterado_em desc);

alter table premiacao_alteracoes enable row level security;
drop policy if exists "leitura alteracoes" on premiacao_alteracoes;
drop policy if exists "insercao alteracoes" on premiacao_alteracoes;

-- quem enxerga a premiacao enxerga o historico dela
create policy "leitura alteracoes" on premiacao_alteracoes for select to authenticated
  using ( exists (select 1 from premiacoes p
                  where p.id = premiacao_alteracoes.premiacao_id
                    and p.unidade = minha_unidade()) );

-- so INSERT: o historico nao pode ser editado nem apagado por ninguem,
-- justamente para valer como prova do que foi mexido
create policy "insercao alteracoes" on premiacao_alteracoes for insert to authenticated
  with check ( alterado_por_id = auth.uid()
               and exists (select 1 from premiacoes p
                           where p.id = premiacao_alteracoes.premiacao_id
                             and p.unidade = minha_unidade()
                             and pode('salvos','ver')) );

-- ============================================================
-- Conferir depois de rodar:
--   select column_name from information_schema.columns
--    where table_name = 'premiacoes' and column_name = 'equipe';
--   select count(*) from premiacao_alteracoes;
-- ============================================================
