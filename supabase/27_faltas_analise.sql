-- ============================================================
-- ANALISE DE FALTAS · so a tela no catalogo
-- ------------------------------------------------------------
-- ADITIVO e minusculo: nao cria tabela, nao cria policy, nao altera dado.
-- Rode DEPOIS de 14_faltas_sobras.sql.
--
-- POR QUE NAO TEM TABELA:
--   A tela nao guarda nada. Ela le `ocorrencias` e conta — por motorista,
--   veiculo, produto, ajudante e lote. Gravar esses totais criaria uma segunda
--   verdade para manter em dia a cada registro novo, corrigido ou apagado, e
--   ela estaria errada na primeira exclusao que ninguem propagasse.
--
-- POR QUE UMA TELA PROPRIA, E NAO UMA ABA EM FALTAS E SOBRAS:
--   Sao publicos diferentes. Quem registra falta precisa de 'lancar' e mexe no
--   dia a dia; quem analisa quer o historico inteiro e nao deve poder escrever
--   nada. Tela separada permite dar a analise a quem nao pode registrar —
--   mesmo motivo de `reentregafoto` existir separada de `reentregas`.
--
-- ATENCAO A DUPLA PERMISSAO:
--   A RLS de `ocorrencias` exige pode('ocorrencias','ver'). Esta tela NAO
--   contorna isso — nem deveria: seria uma porta lateral para os mesmos dados.
--   Entao quem for analisar precisa das duas:
--       ocorrencias.ver    libera os registros no banco
--       faltasanalise.ver  poe a tela no menu
--   Dar so a segunda resulta numa tela vazia; ela avisa o motivo.
--
-- Pode rodar mais de uma vez.
-- ============================================================

insert into app_telas (chave, nome, grupo, ordem, acoes) values
  ('faltasanalise', 'Analise de faltas', 'Estoque', 116, array['ver','exportar'])
on conflict (chave) do update
  set nome = excluded.nome, grupo = excluded.grupo,
      ordem = excluded.ordem, acoes = excluded.acoes;

-- ============================================================
-- Conferir:
--   select chave, nome, acoes from app_telas where chave = 'faltasanalise';
--
-- Para liberar para alguem que hoje so registra:
--   Usuarios e acessos -> a pessoa -> marque Ver em "Analise de faltas"
--   (o Ver de "Faltas e sobras" ela ja tem, senao nao registraria).
--
-- Para liberar para quem SO analisa e nao registra:
--   Faltas e sobras   -> Ver
--   Analise de faltas -> Ver (+ Exportar, se puder levar para o Excel)
-- ============================================================
