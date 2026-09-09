-- ============================================================
-- TONERS  ·  para onde vai cada toner e quanto tempo ele dura
-- ------------------------------------------------------------
-- ADITIVO: cria tres tabelas novas e nao encosta em nada que ja existe.
-- Rode DEPOIS de 10_usuarios_permissoes.sql (usa minha_unidade() e pode()).
--
-- O QUE E:
--   O toner sai do estoque e vai para uma impressora, que fica numa sala. Sem
--   registro, ninguem sabe quanto tempo o ultimo durou, qual sala gasta mais
--   nem se uma impressora esta puxando toner fora do normal — so se percebe
--   quando o estoque acaba.
--
-- POR QUE A TROCA APONTA PARA A IMPRESSORA, E NAO PARA A SALA:
--   A pergunta e "quanto tempo durou em cada sala E em cada impressora da
--   sala". A impressora ja pertence a uma sala, entao gravar na impressora
--   responde as duas; gravar na sala perderia a impressora e, numa sala com
--   duas maquinas, misturaria consumos diferentes num numero so.
--
-- POR QUE A DURACAO NAO E COLUNA:
--   Quanto um toner durou e a distancia ate a troca SEGUINTE na mesma
--   impressora. Guardar isso obrigaria a atualizar a linha anterior a cada
--   registro novo — duas verdades para manter em sincronia, e uma exclusao no
--   meio deixaria a conta errada sem ninguem ver. A tela calcula na hora, a
--   partir da ordem das datas. Mesma escolha da situacao em `reentregas`.
--
-- POR QUE DESATIVAR EM VEZ DE APAGAR:
--   Sala fechada ou impressora que saiu de uso continuam sendo o lugar onde
--   toners foram gastos. Apagar levaria o historico junto; `ativo=false` tira
--   das opcoes e mantem o que ja aconteceu.
--
-- Pode rodar mais de uma vez.
-- ============================================================

-- ---------- salas ----------
create table if not exists salas (
  id bigint generated always as identity primary key,
  unidade text not null,
  nome text not null,
  -- onde fica, para achar a sala em predio com andares. Livre de proposito:
  -- cada unidade organiza o espaco do seu jeito.
  local text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (unidade, nome)
);
create index if not exists salas_unidade on salas (unidade, ativo, nome);

-- ---------- impressoras ----------
create table if not exists impressoras (
  id bigint generated always as identity primary key,
  unidade text not null,
  sala_id bigint not null references salas(id) on delete restrict,
  nome text not null,                -- como a sala chama ela: 'Balcao', 'Fundo'
  modelo text,                       -- 'HP LaserJet M404'
  patrimonio text,                   -- etiqueta, quando existe
  -- o toner que ela usa. So preenche o formulario de troca sozinho; nao
  -- impede registrar outro, porque na pratica se usa o que tem em estoque.
  toner_padrao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (unidade, sala_id, nome)
);
create index if not exists impressoras_sala on impressoras (unidade, sala_id, ativo);

-- on delete restrict acima e de proposito: apagar uma sala que ainda tem
-- impressora deixaria maquina orfa. A tela manda desativar a sala.

-- ---------- as trocas ----------
create table if not exists toner_trocas (
  id bigint generated always as identity primary key,
  unidade text not null,
  impressora_id bigint not null references impressoras(id) on delete cascade,
  -- qual toner foi destinado. Texto, nao vinculo: o registro e uma foto do
  -- momento, igual ao motorista em `ocorrencias`.
  toner text not null,
  data date not null default current_date,
  obs text,
  registrado_por text,
  registrado_por_id uuid,
  criado_em timestamptz not null default now()
);
-- a tela ordena por impressora e data para medir a distancia entre trocas:
-- este indice e exatamente essa leitura
create index if not exists toner_trocas_impressora
  on toner_trocas (unidade, impressora_id, data desc);

comment on table toner_trocas is
  'Um toner colocado numa impressora. Quanto durou NAO fica gravado: e a '
  'distancia ate a troca seguinte da mesma impressora, calculada na leitura.';

-- ---------- catalogo de telas ----------
insert into app_telas (chave, nome, grupo, ordem, acoes) values
  ('toners', 'Toners', 'Administracao', 125, array['ver','lancar','editar','excluir'])
on conflict (chave) do update
  set nome = excluded.nome, grupo = excluded.grupo,
      ordem = excluded.ordem, acoes = excluded.acoes;

-- ============================================================
-- RLS
-- ------------------------------------------------------------
-- 'editar' mexe no cadastro (salas e impressoras); 'lancar' registra a troca.
-- Sao separadas porque quem troca o toner no dia a dia nao precisa poder
-- reorganizar as salas da empresa.
-- ============================================================
alter table salas enable row level security;
drop policy if exists "leitura salas" on salas;
drop policy if exists "escrita salas" on salas;
create policy "leitura salas" on salas for select to authenticated
  using ( unidade = minha_unidade() and pode('toners','ver') );
create policy "escrita salas" on salas for all to authenticated
  using ( unidade = minha_unidade() and pode('toners','editar') )
  with check ( unidade = minha_unidade() and pode('toners','editar') );

alter table impressoras enable row level security;
drop policy if exists "leitura impressoras" on impressoras;
drop policy if exists "escrita impressoras" on impressoras;
create policy "leitura impressoras" on impressoras for select to authenticated
  using ( unidade = minha_unidade() and pode('toners','ver') );
create policy "escrita impressoras" on impressoras for all to authenticated
  using ( unidade = minha_unidade() and pode('toners','editar') )
  with check ( unidade = minha_unidade() and pode('toners','editar') );

alter table toner_trocas enable row level security;
drop policy if exists "leitura trocas" on toner_trocas;
drop policy if exists "insercao trocas" on toner_trocas;
drop policy if exists "exclusao trocas" on toner_trocas;
drop policy if exists "escrita trocas" on toner_trocas;
create policy "leitura trocas" on toner_trocas for select to authenticated
  using ( unidade = minha_unidade() and pode('toners','ver') );
create policy "insercao trocas" on toner_trocas for insert to authenticated
  with check ( unidade = minha_unidade() and pode('toners','lancar')
               and registrado_por_id = auth.uid() );
-- sem policy de UPDATE: a troca e um fato datado, nao um rascunho. Corrigir e
-- excluir e lancar de novo, o que deixa rastro em vez de reescrever a
-- historia por baixo do calculo de duracao.
create policy "exclusao trocas" on toner_trocas for delete to authenticated
  using ( unidade = minha_unidade() and pode('toners','excluir') );

-- ============================================================
-- Conferir depois de rodar:
--   select count(*) from salas;
--   select count(*) from impressoras;
--   select chave, acoes from app_telas where chave = 'toners';
--
-- Para liberar a tela:
--   Usuarios e acessos -> a pessoa -> Toners
--     Ver      acompanha o consumo
--     Lancar   registra a troca do toner
--     Editar   cadastra salas e impressoras
--     Excluir  apaga troca lancada errado
-- ============================================================
