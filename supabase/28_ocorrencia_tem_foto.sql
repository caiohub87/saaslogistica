-- ============================================================
-- FALTAS E SOBRAS · saber que existe foto sem baixar a foto
-- ------------------------------------------------------------
-- ADITIVO: acrescenta UMA coluna calculada em `ocorrencias`. Nao altera dado
-- nenhum, nao mexe em policy. Rode DEPOIS de 14_faltas_sobras.sql.
--
-- O PROBLEMA:
--   A foto da sobra e gravada embutida, como data:image/jpeg;base64, com teto
--   de 900 KB por registro. A listagem da tela trazia `select('*')` com limite
--   de 2000 linhas — ou seja, baixava TODAS as fotos para desenhar uma lista
--   em que a imagem so aparece se alguem clicar em "ver foto". Com 100 sobras
--   fotografadas sao dezenas de MB, no 4G do deposito, a cada abertura.
--
-- POR QUE UMA COLUNA GERADA, E NAO UMA SEGUNDA CONSULTA:
--   A tela precisa saber apenas SE ha foto, para decidir se mostra o botao.
--   Em `reentregas` isso sai de graca do carimbo `foto_em`, que ja existe;
--   aqui nao ha carimbo equivalente. Daria para perguntar numa consulta a
--   parte ("me da os ids com foto"), mas isso e uma viagem de rede a mais em
--   toda abertura de tela, para responder algo que e propriedade da linha.
--
--   `generated always as ... stored` mantem a resposta junto do dado e sempre
--   em dia: o Postgres recalcula a cada insert e update, e nao existe caminho
--   para gravar foto sem a coluna acompanhar. Uma coluna boolean comum
--   dependeria de a aplicacao lembrar de atualizar — e bastaria um caminho
--   esquecer para a tela mentir.
--
-- CUSTO: um boolean por linha. A coluna NAO guarda copia da imagem.
--
-- Pode rodar mais de uma vez.
-- ============================================================

alter table ocorrencias add column if not exists tem_foto boolean
  generated always as (foto is not null) stored;

comment on column ocorrencias.tem_foto is
  'Calculada: a linha tem foto? Existe para a listagem nao precisar baixar a '
  'imagem (ate 900 KB) so para decidir se mostra o botao de ver foto.';

-- ============================================================
-- Conferir:
--   select tem_foto, count(*) from ocorrencias group by tem_foto;
--
--   -- e que ela acompanha sozinha:
--   select tem_foto from ocorrencias where id = <um id com foto>;   -- t
-- ============================================================
