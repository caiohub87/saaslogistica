-- ============================================================
-- FALTAS E SOBRAS  ·  o nome do produto junto do codigo
-- ------------------------------------------------------------
-- ADITIVO: acrescenta uma coluna em `ocorrencias`. Nada muda de valor —
-- registros antigos ficam com descricao nula e continuam mostrando so o codigo.
--
-- POR QUE:
--   A falta guarda o codigo do produto ('65696'), que sozinho nao diz nada para
--   quem le o registro depois. O nome vem dos inventarios ja lancados: a tela
--   procura o codigo no que foi contado e, achando, preenche o nome sozinho.
--
-- POR QUE GRAVAR O NOME AQUI, E NAO SO LER DO INVENTARIO NA HORA DE MOSTRAR:
--   Mesma razao do `motorista` desta tabela ser texto e nao vinculo — o registro
--   e uma foto do momento. Se o produto for renomeado ou o inventario apagado, a
--   falta continua dizendo o que foi registrado. E e o unico jeito de suportar o
--   produto que NAO esta em inventario nenhum, em que o nome e digitado a mao.
--
-- Nada aqui toca a tabela `inventarios`: a leitura e so consulta.
--
-- Pode rodar mais de uma vez.
-- ============================================================

alter table ocorrencias add column if not exists descricao text;

comment on column ocorrencias.descricao is
  'Nome do produto no momento do registro. Preenchido a partir dos inventarios '
  'quando o codigo e conhecido, ou digitado a mao quando nao e. Nulo nos '
  'registros anteriores a esta coluna.';
