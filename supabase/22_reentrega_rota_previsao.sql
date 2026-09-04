-- ============================================================
-- REENTREGAS · rota, previsao de saida e a tela separada da foto
-- ------------------------------------------------------------
-- ADITIVO: duas colunas novas em `reentregas`, uma tela nova no catalogo e o
-- ajuste de duas regras de acesso. Nenhum dado muda de valor.
-- Rode DEPOIS de 21_reentregas.sql.
--
-- Pode rodar mais de uma vez.
-- ============================================================

-- ---------- rota ----------
-- E o "PRACA / CLIENTE" do cartaz que vai grudado no palete: quem le no
-- corredor precisa saber para onde aquilo volta, e isso nao sai do relatorio.
alter table reentregas add column if not exists rota text;

-- ---------- previsao de saida ----------
-- Quando se pretende reenviar. NAO e obrigatoria de proposito: ha reentrega que
-- fica no deposito sem margem de retorno, e obrigar uma data faria a pessoa
-- inventar uma — pior que nao ter.
alter table reentregas add column if not exists data_prevista date;

comment on column reentregas.rota is
  'Praca/cliente de destino, escrito na solicitacao. Aparece grande no cartaz.';
comment on column reentregas.data_prevista is
  'Quando se pretende reenviar. Nula quando nao ha previsao — o palete fica no '
  'deposito sem data.';

-- ============================================================
-- A TELA SO DA FOTO
-- ------------------------------------------------------------
-- Quem so fotografa nao precisa ver o acompanhamento, e passar a permissao
-- 'reentregas.ver' para essa conta abriria a tela inteira. Entao a foto ganha
-- uma TELA propria, com chave propria: a conta recebe 'reentregafoto.ver' e
-- nada de 'reentregas', e enxerga apenas a fila de paletes esperando foto.
--
-- A tabela e a mesma; o que muda e por qual porta se entra.
-- ============================================================
insert into app_telas (chave, nome, grupo, ordem, acoes) values
  ('reentregafoto', 'Foto do palete', 'Estoque', 119, array['ver','fotografar'])
on conflict (chave) do update
  set nome = excluded.nome, grupo = excluded.grupo,
      ordem = excluded.ordem, acoes = excluded.acoes;

-- ---------- leitura ----------
-- Passa a aceitar as duas portas. Sem isso a tela da foto abriria vazia: a
-- conta conseguiria gravar a foto mas nao enxergaria a lista para escolher.
drop policy if exists "leitura reentregas" on reentregas;
create policy "leitura reentregas" on reentregas for select to authenticated
  using ( unidade = minha_unidade()
          and ( pode('reentregas','ver') or pode('reentregafoto','ver') ) );

-- ---------- a funcao da foto ----------
-- IDENTICA a do 21, com UMA mudanca: a permissao aceita as duas portas. Todo o
-- resto — recusar solicitacao finalizada, exigir foto nao vazia e reabrir a
-- aprovacao ao refotografar — segue palavra por palavra, porque e regra de
-- negocio e nao tem nada a ver com de onde a foto veio.
create or replace function reentrega_foto(p_id bigint, p_foto text, p_nome text)
returns reentregas language plpgsql security definer set search_path = public as $$
declare r reentregas;
begin
  if not ( pode('reentregas','fotografar') or pode('reentregafoto','fotografar') ) then
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

-- Conferir:
--   select chave, acoes from app_telas where chave like 'reentrega%';
--   select column_name from information_schema.columns
--    where table_name = 'reentregas' and column_name in ('rota','data_prevista');
