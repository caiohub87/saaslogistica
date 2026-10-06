-- ============================================================
-- PREMIACAO: Justificativa para zeramento de valor
-- ------------------------------------------------------------
-- ADITIVO: adiciona campo de justificativa quando pessoa não
-- envia canhotos ou há motivo para zerar a produtividade.
-- Rode DEPOIS de 12_premiacao_auditoria.sql.
-- ============================================================

-- Campo para registrar o motivo quando valor é zerado
alter table premiacoes add column if not exists justificativa text;

-- Índice para facilitar busca por justificativas
create index if not exists premiacoes_justificativa
  on premiacoes (unidade, justificativa) where justificativa is not null;

comment on column premiacoes.justificativa is
  'Motivo pelo qual a produtividade ou valor foi zerado. '
  'Ex: "Canhotos não entregues", "Falta documentação", "Problema com rota"';

-- ============================================================
-- Conferir depois de rodar:
--   select column_name from information_schema.columns
--    where table_name = 'premiacoes' and column_name = 'justificativa';
-- ============================================================
