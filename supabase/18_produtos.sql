-- ============================================================
-- CATALOGO DE PRODUTOS  ·  o codigo e o nome, para nao digitar
-- ------------------------------------------------------------
-- ADITIVO: cria uma tabela nova e nao encosta em nada que ja existe.
-- Rode DEPOIS de 10_usuarios_permissoes.sql (usa minha_unidade() e sou_admin()).
--
-- POR QUE:
--   Quem registra uma falta digita o codigo do produto. A tela ja acha o nome
--   nos inventarios lancados, mas so conhece o que ja foi contado — produto que
--   nunca entrou num inventario obrigava a digitar o nome na mao.
--   Este catalogo e a lista COMPLETA que sai do ERP, entao o nome aparece
--   sozinho mesmo para o que nunca foi inventariado.
--
-- POR QUE POR UNIDADE:
--   Mesma regra das outras tabelas: cada unidade enxerga o seu. Custa importar
--   em cada uma, mas mantem a unidade como fronteira em todo o sistema, sem
--   abrir excecao — e permite que uma unidade com outro ERP tenha outros codigos.
--
-- O carregamento em massa vem no arquivo seguinte (19_produtos_dados.sql).
--
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists produtos (
  unidade text not null,
  -- texto, nao numero: o ERP escreve '065696' e o zero a esquerda faz parte do
  -- que a pessoa ve na tela do WMS. Quem consulta e que normaliza.
  codigo text not null,
  descricao text not null,
  -- o catalogo do ERP nao traz embalagem; ela continua vindo do inventario
  -- quando existe. Fica aqui para o dia em que a exportacao trouxer.
  embalagem text,
  atualizado_em timestamptz not null default now(),
  primary key (unidade, codigo)
);

-- a busca da tela e por codigo exato dentro da unidade — a PK ja resolve.
-- Este indice serve a busca por nome, que a tela oferece como alternativa.
create index if not exists produtos_descricao on produtos (unidade, descricao);

comment on table produtos is
  'Lista de produtos do ERP. So leitura para a operacao: serve para mostrar o '
  'nome do produto a partir do codigo, sem obrigar a digitar.';

-- ---------- RLS ----------
alter table produtos enable row level security;
drop policy if exists "leitura produtos" on produtos;
drop policy if exists "escrita produtos" on produtos;

-- Nome de produto nao e informacao sensivel e varias telas precisam dele
-- (faltas, sobras, validade). Entao a leitura nao pede permissao de tela
-- especifica: basta estar logado e ser da unidade.
create policy "leitura produtos" on produtos for select to authenticated
  using ( unidade = minha_unidade() );

-- Escrever e outra conversa: o catalogo inteiro vem do ERP, e trocar isso na
-- mao bagunçaria o nome em todas as telas. So administrador.
create policy "escrita produtos" on produtos for all to authenticated
  using ( sou_admin() and unidade = minha_unidade() )
  with check ( sou_admin() and unidade = minha_unidade() );

-- Conferir depois de carregar os dados:
--   select count(*) from produtos;
--   select * from produtos where codigo = '105702';
