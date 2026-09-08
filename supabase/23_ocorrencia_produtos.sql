-- ============================================================
-- FALTAS E SOBRAS · mais de um produto no mesmo registro
-- ------------------------------------------------------------
-- ADITIVO: acrescenta uma coluna e copia para dentro dela o que ja existe.
-- Nenhum registro perde informacao e nenhuma coluna e apagada.
-- Rode DEPOIS de 17_ocorrencia_descricao.sql.
--
-- POR QUE:
--   Uma falta era um produto so. Mas a carga volta com o que faltou, e o que
--   faltou raramente e um item unico — quem registra abria uma falta por
--   produto, repetindo lote, motorista, placa e equipe em cada uma. A lista
--   ficava cheia de registros que sao, na verdade, a mesma ocorrencia.
--
-- POR QUE jsonb E NAO text[]:
--   Os ajudantes cabem num text[] porque um ajudante e um nome. Um produto sao
--   tres coisas — codigo, embalagem e nome — e separa-las em tres arrays
--   paralelos so funciona enquanto ninguem apaga o item do meio de um deles.
--
-- Pode rodar mais de uma vez.
-- ============================================================

-- cada item: {produto, embalagem, descricao}
alter table ocorrencias add column if not exists produtos jsonb not null default '[]';

comment on column ocorrencias.produtos is
  'Os produtos da ocorrencia. Cada item: {produto, embalagem, descricao}. '
  'Substitui as colunas produto/embalagem/descricao, que ficaram para tras '
  'como historico dos registros anteriores a esta coluna.';

-- ---------- traz o que ja existe para dentro da lista ----------
-- Sem isto os registros antigos apareceriam sem produto na tela, que passa a
-- ler `produtos`. Roda so em quem tem produto e ainda esta com a lista vazia,
-- entao rodar de novo nao duplica nada.
update ocorrencias
   set produtos = jsonb_build_array(
         jsonb_strip_nulls(jsonb_build_object(
           'produto',   produto,
           'embalagem', embalagem,
           'descricao', descricao
         ))
       )
 where produto is not null
   and produto <> ''
   and produtos = '[]'::jsonb;

-- As colunas produto/embalagem/descricao continuam onde estao, de proposito:
-- apagar reescreveria historico, e ha registro antigo cuja unica copia do dado
-- e ela. A tela nao escreve mais nelas — quem manda agora e `produtos`.

-- Conferir:
--   select count(*) filter (where produtos = '[]') as sem_lista,
--          count(*) filter (where jsonb_array_length(produtos) > 0) as com_lista,
--          count(*) filter (where jsonb_array_length(produtos) > 1) as com_varios
--     from ocorrencias;
