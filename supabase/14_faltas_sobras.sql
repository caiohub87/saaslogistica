-- ============================================================
-- FALTAS E SOBRAS  ·  registro do que faltou e do que voltou sobrando
-- ------------------------------------------------------------
-- ADITIVO: cria duas tabelas novas e nao encosta em nada que ja existe.
-- Rode DEPOIS de 10_usuarios_permissoes.sql (usa minha_unidade() e pode()).
--
-- Sao duas ocorrencias diferentes na mesma tabela, separadas pela coluna tipo
-- — mesmo desenho dos agendamentos (enviar/receber):
--   FALTA  lote + codigo do produto + embalagem + motorista + placa
--   SOBRA  lote + motorista + placa + foto do que voltou
-- ============================================================

-- ---------- motoristas ----------
-- Lista propria, mantida na tela: o nome do motorista no relatorio do ERP vem
-- de outro cadastro e nem sempre bate com quem realmente saiu com a carga.
-- Desativar (ativo=false) em vez de apagar preserva os registros antigos, que
-- guardam o nome como texto.
create table if not exists motoristas (
  id bigint generated always as identity primary key,
  unidade text not null,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (unidade, nome)
);
create index if not exists motoristas_unidade on motoristas (unidade, ativo, nome);

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

-- ---------- catalogo de telas ----------
insert into app_telas (chave, nome, grupo, ordem, acoes) values
  ('ocorrencias', 'Faltas e sobras', 'Estoque', 115, array['ver','lancar','excluir'])
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
drop policy if exists "exclusao ocorrencias" on ocorrencias;
create policy "leitura ocorrencias" on ocorrencias for select to authenticated
  using ( unidade = minha_unidade() and pode('ocorrencias','ver') );
create policy "escrita ocorrencias" on ocorrencias for insert to authenticated
  with check ( unidade = minha_unidade() and pode('ocorrencias','lancar') );
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
-- ============================================================
