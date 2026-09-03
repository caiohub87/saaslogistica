-- ============================================================
-- REENTREGAS  ·  solicitacao da mercadoria que volta para o deposito
-- ------------------------------------------------------------
-- ADITIVO: cria uma tabela nova e nao encosta em nada que ja existe.
-- Rode DEPOIS de 10_usuarios_permissoes.sql (usa minha_unidade() e pode()).
--
-- O QUE E:
--   O pedido que nao foi entregue volta na carroceria e desce no deposito.
--   Alguem monta o palete, pede a reentrega, e esse palete anda por um fluxo
--   de cinco passos ate sair de novo ou ser devolvido.
--
--   1  quem opera monta a solicitacao a partir do relatorio de entregas,
--      marcando os pedidos em REENTREGA, e imprime o documento do palete
--   2  quem esta no deposito anexa o documento e fotografa o palete
--   3  a solicitacao e aprovada
--   4  fica em acompanhamento enquanto o palete espera
--   5  fecha como REENVIADA ou DEVOLVIDA
--
-- POR QUE OS PEDIDOS FICAM GRAVADOS AQUI (jsonb) E NAO SO REFERENCIADOS:
--   O relatorio do Fusion nao mora no banco — fica no localStorage do
--   navegador e e trocado a cada nova importacao. Se a solicitacao apontasse
--   para ele, o palete perderia o conteudo na primeira troca de base. Mesma
--   razao de `ocorrencias.motorista` ser texto: o registro e uma foto do
--   momento.
--
-- POR QUE UMA DATA SO:
--   `data` e o dia em que a mercadoria voltou ao deposito, gravado no
--   registro. Vale igual para lote a parte ou nao. O desfecho tem carimbo
--   proprio (finalizado_em), entao nao ha data digitada em lugar nenhum.
--
-- Pode rodar mais de uma vez.
-- ============================================================

create table if not exists reentregas (
  id bigint generated always as identity primary key,
  unidade text not null,

  -- ---------- o que a pessoa informa ----------
  -- o lote DESTINADO a mercadoria no deposito. Nao vem do relatorio: e
  -- decidido na hora de montar o palete.
  lote text not null,
  paletes int not null check (paletes > 0),
  -- lote a parte: o mesmo pedido fica no deposito para sair noutro dia.
  -- Guardado como coluna propria (e nao deduzido) porque e a pergunta que
  -- separa o que espera do que sai junto com a proxima carga.
  lote_a_parte boolean not null default false,

  -- ---------- o que vem do relatorio ----------
  -- contados/somados na hora do registro e gravados: o relatorio e do dia,
  -- a solicitacao fica.
  clientes int not null default 0,
  peso numeric not null default 0,
  motorista text not null default '',
  ajudantes text[] not null default '{}',
  -- cada item: {pedido, cliente, codcli, carga, peso, valor, motivo}
  pedidos jsonb not null default '[]',

  -- dia em que a mercadoria voltou ao deposito
  data date not null default current_date,
  obs text,

  -- ---------- o fluxo ----------
  -- A situacao NAO e uma coluna: sai dos carimbos, como em `ocorrencias`.
  --   foto nula ............ aguardando a foto do palete
  --   foto e sem aprovacao . aguardando aprovacao
  --   aprovada ............. em acompanhamento no deposito
  --   finalizada ........... fechada, e `desfecho` diz como
  -- Uma coluna a mais seria uma segunda verdade para manter sincronizada.
  foto text,
  desfecho text check (desfecho in ('reenviada', 'devolvida')),

  registrado_por text, registrado_por_id uuid,
  foto_por text,       foto_por_id uuid,       foto_em timestamptz,
  aprovado_por text,   aprovado_por_id uuid,   aprovado_em timestamptz,
  finalizado_por text, finalizado_por_id uuid, finalizado_em timestamptz,

  criado_em timestamptz not null default now()
);

create index if not exists reentregas_busca on reentregas (unidade, data desc);
-- o acompanhamento abre no que ainda esta aberto: este indice evita varrer o
-- historico inteiro quando ele crescer
create index if not exists reentregas_abertas
  on reentregas (unidade, data desc) where finalizado_em is null;

comment on table reentregas is
  'Solicitacao de reentrega: o palete que voltou ao deposito, do pedido ate o '
  'reenvio ou a devolucao. Os pedidos ficam gravados em jsonb porque o '
  'relatorio de origem nao mora no banco.';

-- ---------- catalogo de telas ----------
insert into app_telas (chave, nome, grupo, ordem, acoes) values
  ('reentregas', 'Reentregas', 'Estoque', 112,
   array['ver','lancar','fotografar','aprovar','finalizar','excluir','imprimir'])
on conflict (chave) do update
  set nome = excluded.nome, grupo = excluded.grupo,
      ordem = excluded.ordem, acoes = excluded.acoes;

-- ============================================================
-- RLS
-- ------------------------------------------------------------
-- Repare que NAO existe policy de UPDATE. E de proposito.
--
-- Os tres passos do meio — anexar a foto, aprovar e finalizar — sao todos
-- UPDATE na mesma linha, cada um com a sua permissao. Uma policy de UPDATE
-- nao sabe QUAL coluna esta sendo mexida, entao qualquer uma delas deixaria
-- quem tem `fotografar` gravar tambem `aprovado_por` — a segunda conferencia
-- viraria enfeite, exatamente como acontece hoje em `inventarios`, onde
-- `aprovar` so existe na tela.
--
-- Por isso cada transicao e uma funcao security definer que confere a sua
-- propria permissao e escreve SO as suas colunas. Sem policy de UPDATE,
-- ninguem altera a linha por fora delas.
-- ============================================================
alter table reentregas enable row level security;
drop policy if exists "leitura reentregas" on reentregas;
drop policy if exists "insercao reentregas" on reentregas;
drop policy if exists "exclusao reentregas" on reentregas;
drop policy if exists "escrita reentregas" on reentregas;

create policy "leitura reentregas" on reentregas for select to authenticated
  using ( unidade = minha_unidade() and pode('reentregas','ver') );

create policy "insercao reentregas" on reentregas for insert to authenticated
  with check ( unidade = minha_unidade() and pode('reentregas','lancar')
               and registrado_por_id = auth.uid() );

-- apagar e acao separada: montar a propria solicitacao nao da direito de
-- apagar a que outra pessoa montou
create policy "exclusao reentregas" on reentregas for delete to authenticated
  using ( unidade = minha_unidade() and pode('reentregas','excluir') );

-- ============================================================
-- AS TRANSICOES
-- Cada uma confere a permissao, confere a unidade e recusa fora de ordem.
-- Devolvem a linha inteira para a tela nao precisar reconsultar.
-- ============================================================

-- passo 2: a foto do palete
create or replace function reentrega_foto(p_id bigint, p_foto text, p_nome text)
returns reentregas language plpgsql security definer set search_path = public as $$
declare r reentregas;
begin
  if not pode('reentregas','fotografar') then
    raise exception 'Seu acesso nao tem permissao de anexar a foto do palete.';
  end if;
  select * into r from reentregas where id = p_id and unidade = minha_unidade();
  if not found then raise exception 'Solicitacao nao encontrada nesta unidade.'; end if;
  if r.finalizado_em is not null then raise exception 'Esta solicitacao ja foi finalizada.'; end if;
  if p_foto is null or p_foto = '' then raise exception 'A foto do palete e obrigatoria.'; end if;

  update reentregas set foto = p_foto, foto_por = p_nome,
         foto_por_id = auth.uid(), foto_em = now(),
         -- refotografar depois de aprovado reabre a aprovacao: a foto e a
         -- prova do que foi aprovado, entao trocar a prova invalida o aval
         aprovado_por = null, aprovado_por_id = null, aprovado_em = null
   where id = p_id returning * into r;
  return r;
end; $$;

-- passo 3: a aprovacao
create or replace function reentrega_aprovar(p_id bigint, p_nome text)
returns reentregas language plpgsql security definer set search_path = public as $$
declare r reentregas;
begin
  if not pode('reentregas','aprovar') then
    raise exception 'Seu acesso nao tem permissao de aprovar reentrega.';
  end if;
  select * into r from reentregas where id = p_id and unidade = minha_unidade();
  if not found then raise exception 'Solicitacao nao encontrada nesta unidade.'; end if;
  if r.foto is null then raise exception 'Sem a foto do palete nao da para aprovar.'; end if;
  if r.finalizado_em is not null then raise exception 'Esta solicitacao ja foi finalizada.'; end if;

  update reentregas set aprovado_por = p_nome, aprovado_por_id = auth.uid(),
         aprovado_em = now()
   where id = p_id returning * into r;
  return r;
end; $$;

-- retirar a aprovacao, quando aprovou por engano
create or replace function reentrega_desaprovar(p_id bigint)
returns reentregas language plpgsql security definer set search_path = public as $$
declare r reentregas;
begin
  if not pode('reentregas','aprovar') then
    raise exception 'Seu acesso nao tem permissao de aprovar reentrega.';
  end if;
  select * into r from reentregas where id = p_id and unidade = minha_unidade();
  if not found then raise exception 'Solicitacao nao encontrada nesta unidade.'; end if;
  if r.finalizado_em is not null then raise exception 'Esta solicitacao ja foi finalizada.'; end if;

  update reentregas set aprovado_por = null, aprovado_por_id = null, aprovado_em = null
   where id = p_id returning * into r;
  return r;
end; $$;

-- passo 5: fecha como reenviada ou devolvida
create or replace function reentrega_finalizar(p_id bigint, p_desfecho text, p_nome text)
returns reentregas language plpgsql security definer set search_path = public as $$
declare r reentregas;
begin
  if not pode('reentregas','finalizar') then
    raise exception 'Seu acesso nao tem permissao de finalizar reentrega.';
  end if;
  if p_desfecho not in ('reenviada','devolvida') then
    raise exception 'Desfecho invalido: use reenviada ou devolvida.';
  end if;
  select * into r from reentregas where id = p_id and unidade = minha_unidade();
  if not found then raise exception 'Solicitacao nao encontrada nesta unidade.'; end if;
  if r.aprovado_em is null then raise exception 'So da para finalizar depois de aprovada.'; end if;
  if r.finalizado_em is not null then raise exception 'Esta solicitacao ja foi finalizada.'; end if;

  update reentregas set desfecho = p_desfecho, finalizado_por = p_nome,
         finalizado_por_id = auth.uid(), finalizado_em = now()
   where id = p_id returning * into r;
  return r;
end; $$;

-- reabrir, quando finalizou errado
create or replace function reentrega_reabrir(p_id bigint)
returns reentregas language plpgsql security definer set search_path = public as $$
declare r reentregas;
begin
  if not pode('reentregas','finalizar') then
    raise exception 'Seu acesso nao tem permissao de finalizar reentrega.';
  end if;
  select * into r from reentregas where id = p_id and unidade = minha_unidade();
  if not found then raise exception 'Solicitacao nao encontrada nesta unidade.'; end if;

  update reentregas set desfecho = null, finalizado_por = null,
         finalizado_por_id = null, finalizado_em = null
   where id = p_id returning * into r;
  return r;
end; $$;

grant execute on function reentrega_foto(bigint, text, text) to authenticated;
grant execute on function reentrega_aprovar(bigint, text) to authenticated;
grant execute on function reentrega_desaprovar(bigint) to authenticated;
grant execute on function reentrega_finalizar(bigint, text, text) to authenticated;
grant execute on function reentrega_reabrir(bigint) to authenticated;

-- ============================================================
-- Conferir depois de rodar:
--   select count(*) from reentregas;
--   select chave, acoes from app_telas where chave = 'reentregas';
--
-- Para liberar a tela:
--   Usuarios e acessos -> a pessoa -> Reentregas
--     Ver          acompanha
--     Lancar       monta a solicitacao e imprime o documento do palete
--     Fotografar   anexa a foto do palete (quem esta no deposito)
--     Aprovar      libera a solicitacao ja fotografada
--     Finalizar    fecha como reenviada ou devolvida
--   Deixe 'Fotografar' e 'Aprovar' com pessoas diferentes: quem fotografa nao
--   deve aprovar a propria foto, que e o ponto da conferencia.
-- ============================================================
