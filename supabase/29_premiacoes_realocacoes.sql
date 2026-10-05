-- ============================================================
-- PREMIACOES: Rastreamento de realocações por atestado
-- ------------------------------------------------------------
-- ADITIVO: adiciona suporte para rastrear realocações de ajudantes
-- quando há atestado ou mudanças na equipe.
-- Rode DEPOIS de 12_premiacao_auditoria.sql.
-- ============================================================

-- Tabela para rastrear realocações de ajudantes
create table if not exists premiacao_realocacoes (
  id bigint generated always as identity primary key,
  premiacao_id bigint not null references premiacoes(id) on delete cascade,
  carga text not null,                    -- identificador da carga
  nome_original text not null,            -- ajudante que saiu (ex: Paulo de Tarso)
  nome_realocado text not null,           -- quem assumiu (ex: Geovani)
  tipo text not null default 'aju',       -- 'mot' ou 'aju'
  motivo text,                            -- 'atestado', 'doença', 'falta', etc
  realocado_por text not null,            -- nome de quem fez a realocação
  realocado_por_id uuid,                  -- auth.uid()
  realocado_em timestamptz not null default now(),
  observacao text                         -- nota adicional
);

create index if not exists premiacao_realocacoes_por_premiacao
  on premiacao_realocacoes (premiacao_id, realocado_em desc);

create index if not exists premiacao_realocacoes_por_nome
  on premiacao_realocacoes (nome_original, realocado_em desc);

comment on table premiacao_realocacoes is
  'Rastreia realocações de ajudantes/motorista na produtividade, '
  'como quando alguém sai por atestado e outro assume seu lugar.';

-- RLS
alter table premiacao_realocacoes enable row level security;
drop policy if exists "leitura realocacoes" on premiacao_realocacoes;
drop policy if exists "insercao realocacoes" on premiacao_realocacoes;

-- quem enxerga a premiação enxerga o histórico de realocações dela
create policy "leitura realocacoes" on premiacao_realocacoes for select to authenticated
  using ( exists (select 1 from premiacoes p
                  where p.id = premiacao_realocacoes.premiacao_id
                    and p.unidade = minha_unidade()) );

-- quem tem permissão de ver salvos pode registrar realocações
create policy "insercao realocacoes" on premiacao_realocacoes for insert to authenticated
  with check ( realocado_por_id = auth.uid()
               and pode('salvos','ver')
               and exists (select 1 from premiacoes p
                           where p.id = premiacao_realocacoes.premiacao_id
                             and p.unidade = minha_unidade()) );

-- ============================================================
-- Catálogo de telas (se não estiver em outro lugar)
-- ============================================================
insert into app_telas (chave, nome, grupo, ordem, acoes) values
  ('produtividade_realocacoes', 'Realocações na Produtividade', 'Operação', 113,
   array['ver','criar'])
on conflict (chave) do update
  set nome = excluded.nome, grupo = excluded.grupo,
      ordem = excluded.ordem, acoes = excluded.acoes;

-- ============================================================
-- Verificar depois de rodar:
--   select column_name from information_schema.columns
--    where table_name = 'premiacao_realocacoes';
--   select count(*) from premiacao_realocacoes;
-- ============================================================
