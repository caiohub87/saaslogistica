-- ============================================================
-- FALTAS E SOBRAS  ·  registro do que faltou e do que voltou sobrando
-- ------------------------------------------------------------
-- ADITIVO: cria duas tabelas novas e nao encosta em nada que ja existe.
-- Rode DEPOIS de 10_usuarios_permissoes.sql (usa minha_unidade() e pode()).
--
-- Sao duas ocorrencias diferentes na mesma tabela, separadas pela coluna tipo
-- — mesmo desenho dos agendamentos (enviar/receber):
--   FALTA  lote + codigo do produto + embalagem + motorista + ajudantes +
--          placa. Passa por APROVACAO de quem tem a permissao.
--   SOBRA  lote + motorista + placa + quantidade + foto do que voltou.
--          Depois alguem VALIDA dizendo de que produto e aquilo.
--
-- Pode rodar mais de uma vez: cria o que falta e atualiza as policies.
-- ============================================================

-- ---------- equipe da rota (motoristas e ajudantes) ----------
-- Lista propria, mantida na tela: o nome no relatorio do ERP vem de outro
-- cadastro e nem sempre bate com quem realmente saiu com a carga.
-- Desativar (ativo=false) em vez de apagar preserva os registros antigos, que
-- guardam o nome como texto.
-- A tabela nasceu so com motoristas e manteve o nome; hoje guarda os dois,
-- separados pela coluna funcao.
create table if not exists motoristas (
  id bigint generated always as identity primary key,
  unidade text not null,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (unidade, nome)
);
create index if not exists motoristas_unidade on motoristas (unidade, ativo, nome);

-- funcao: quem dirige e quem ajuda saem da mesma lista, cada um no seu campo
alter table motoristas add column if not exists funcao text not null default 'motorista';
alter table motoristas drop constraint if exists motoristas_funcao_check;
alter table motoristas add constraint motoristas_funcao_check
  check (funcao in ('motorista', 'ajudante'));
-- a mesma pessoa pode estar nas duas funcoes (o ajudante que as vezes dirige),
-- entao o nome sozinho deixa de ser unico — o par nome+funcao e que e
alter table motoristas drop constraint if exists motoristas_unidade_nome_key;
create unique index if not exists motoristas_unidade_nome_funcao
  on motoristas (unidade, nome, funcao);

-- ---------- faltas e sobras ----------
create table if not exists ocorrencias (
  id bigint generated always as identity primary key,
  unidade text not null,
  tipo text not null check (tipo in ('falta', 'sobra')),
  data date not null default current_date,
  lote text not null,
  -- so falta: '65696' e '48UNID' — separados para dar para somar por produto
  produto text,
  embalagem text,
  motorista text not null,        -- texto, nao FK: o registro nao muda se o cadastro mudar
  placa text,
  -- so sobra: a foto vai embutida (data:image/jpeg;base64,...), ja reduzida no
  -- navegador para ~1280px. Evita depender de balde do Storage e das policies
  -- dele; se um dia forem muitas fotos, migra para o Storage e troca por url.
  foto text,
  obs text,
  registrado_por text,
  registrado_por_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists ocorrencias_busca on ocorrencias (unidade, tipo, data desc);

-- ---------- quantidade, equipe e as duas conferencias ----------
-- Colunas separadas do create acima para quem ja rodou a primeira versao deste
-- arquivo poder rodar de novo sem erro.
alter table ocorrencias add column if not exists quantidade numeric;          -- sobra: quanto voltou
alter table ocorrencias add column if not exists ajudantes text[] not null default '{}';  -- falta: ate 3
-- falta: liberada por quem tem a permissao 'aprovar'
alter table ocorrencias add column if not exists aprovado_por text;
alter table ocorrencias add column if not exists aprovado_em timestamptz;
-- sobra: nasce sem saber de que produto e; quem identifica preenche produto e assina aqui
alter table ocorrencias add column if not exists validado_por text;
alter table ocorrencias add column if not exists validado_em timestamptz;

-- ---------- catalogo de telas ----------
insert into app_telas (chave, nome, grupo, ordem, acoes) values
  ('ocorrencias', 'Faltas e sobras', 'Estoque', 115, array['ver','lancar','aprovar','excluir'])
on conflict (chave) do update
  set nome = excluded.nome, grupo = excluded.grupo,
      ordem = excluded.ordem, acoes = excluded.acoes;

-- ---------- RLS ----------
alter table motoristas enable row level security;
drop policy if exists "leitura motoristas" on motoristas;
drop policy if exists "escrita motoristas" on motoristas;
create policy "leitura motoristas" on motoristas for select to authenticated
  using ( unidade = minha_unidade() and pode('ocorrencias','ver') );
-- quem registra falta/sobra tambem mantem a lista: quem usa e quem sabe quem saiu
create policy "escrita motoristas" on motoristas for all to authenticated
  using ( unidade = minha_unidade() and pode('ocorrencias','lancar') )
  with check ( unidade = minha_unidade() and pode('ocorrencias','lancar') );

alter table ocorrencias enable row level security;
drop policy if exists "leitura ocorrencias" on ocorrencias;
drop policy if exists "escrita ocorrencias" on ocorrencias;
drop policy if exists "conferencia ocorrencias" on ocorrencias;
drop policy if exists "exclusao ocorrencias" on ocorrencias;
create policy "leitura ocorrencias" on ocorrencias for select to authenticated
  using ( unidade = minha_unidade() and pode('ocorrencias','ver') );
create policy "escrita ocorrencias" on ocorrencias for insert to authenticated
  with check ( unidade = minha_unidade() and pode('ocorrencias','lancar') );
-- aprovar a falta e validar a sobra sao a segunda conferencia: quem registra
-- nao libera o proprio registro, por isso permissao separada de 'lancar'
create policy "conferencia ocorrencias" on ocorrencias for update to authenticated
  using ( unidade = minha_unidade() and pode('ocorrencias','aprovar') )
  with check ( unidade = minha_unidade() and pode('ocorrencias','aprovar') );
-- excluir e acao separada: registrar nao da direito de apagar o registro alheio
create policy "exclusao ocorrencias" on ocorrencias for delete to authenticated
  using ( unidade = minha_unidade() and pode('ocorrencias','excluir') );

-- ============================================================
-- Conferir depois de rodar:
--   select count(*) from motoristas;
--   select count(*) from ocorrencias;
--   select chave, nome, acoes from app_telas where chave = 'ocorrencias';
--
-- Para liberar a tela para alguem que nao e administrador:
--   Usuarios e acessos -> a pessoa -> Faltas e sobras -> marcar Ver / Lancar.
--   'Aprovar' e o que libera aprovar falta e validar sobra — deixe so com quem
--   confere, senao a segunda conferencia vira formalidade.
-- ============================================================
