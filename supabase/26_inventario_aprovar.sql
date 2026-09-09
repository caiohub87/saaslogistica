-- ============================================================
-- INVENTARIO · a aprovacao passa a valer no banco
-- ------------------------------------------------------------
-- ADITIVO: nao cria nem apaga tabela, nao altera dado nenhum. Acrescenta um
-- gatilho em `inventarios`. Rode DEPOIS de 11_rls_transicao.sql.
--
-- O QUE ESTAVA ERRADO:
--   A permissao 'aprovar' do inventario existia so na tela. A policy de
--   escrita e esta:
--
--     create policy "novo escrita inventarios" on inventarios for all
--       using ( ... (pode('inventario','lancar') or pode('inventario','excluir')) )
--       with check ( ... pode('inventario','lancar') );
--
--   Aprovar e um UPDATE em aprovado_por/aprovado_em. Como a policy libera
--   UPDATE para quem tem 'lancar', qualquer pessoa do deposito podia aprovar
--   o proprio inventario chamando o Supabase por fora da tela — inclusive o
--   perfil "Deposito", que tem 'lancar' e nao tem 'aprovar'.
--
--   Era exatamente a senha 79513 de volta: quem sabe o caminho, aprova. O
--   README promete que "mesmo que alguem burle a tela, o Postgres recusa", e
--   para o inventario isso nao era verdade.
--
-- POR QUE GATILHO, E NAO POLICY:
--   Em `reentregas` deu para tirar a policy de UPDATE inteira e deixar so
--   funcoes de transicao. Aqui nao da: 'lancar' PRECISA de UPDATE, porque
--   relancar o mesmo arquivo e um upsert — e o mesmo comando que grava a
--   contagem nova. E uma policy nao sabe QUAL coluna mudou: o WITH CHECK so
--   enxerga a linha nova, nunca a antiga.
--
--   Um gatilho BEFORE enxerga OLD e NEW, entao consegue dizer "mexeu na
--   aprovacao" — que e precisamente a pergunta que a policy nao alcanca.
--
-- O SEGUNDO PROBLEMA, DE QUEBRA:
--   Relancar o arquivo substitui `produtos` e `valor_estoque` mas mantinha o
--   carimbo de aprovacao. Ou seja: dava para aprovar uma contagem e depois
--   trocar os numeros por baixo, com a linha continuando "aprovada" — a
--   assinatura passava a atestar dados que nao existem mais. Agora a contagem
--   mudar derruba a aprovacao, pelo mesmo motivo que trocar a foto do palete
--   derruba a aprovacao da reentrega: mudou a prova, cai o aval.
--
-- NAO QUEBRA O SISTEMA ANTIGO:
--   O index.html entra com dilnor.admin@gestao.app, que e admin em `usuarios`,
--   e pode() libera tudo para admin. Continua aprovando como hoje.
--
-- Pode rodar mais de uma vez.
-- ============================================================

create or replace function inventarios_guarda_aprovacao()
returns trigger language plpgsql set search_path = public as $$
begin
  -- pode() e security definer: le usuarios/permissoes sem esbarrar na RLS
  if TG_OP = 'INSERT' then
    -- nascer aprovado e aprovar
    if (new.aprovado_por is not null or new.aprovado_em is not null)
       and not pode('inventario', 'aprovar') then
      raise exception 'Seu acesso nao tem permissao de aprovar inventario.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- mexer no carimbo — colocar OU retirar — exige a permissao
  if (new.aprovado_por is distinct from old.aprovado_por
      or new.aprovado_em is distinct from old.aprovado_em)
     and not pode('inventario', 'aprovar') then
    raise exception 'Seu acesso nao tem permissao de aprovar inventario.'
      using errcode = '42501';
  end if;

  -- A contagem mudou e ninguem tocou no carimbo de proposito: a aprovacao
  -- valia para os numeros antigos, entao cai. Quem tem 'aprovar' aprova de
  -- novo depois de conferir o arquivo novo.
  --
  -- A segunda condicao evita atropelar quem esta lancando e aprovando no
  -- mesmo comando: ai a intencao foi declarada, e vale.
  if old.aprovado_em is not null
     and new.aprovado_em is not distinct from old.aprovado_em
     and (new.produtos is distinct from old.produtos
          or new.valor_estoque is distinct from old.valor_estoque) then
    new.aprovado_por := null;
    new.aprovado_em := null;
  end if;

  return new;
end; $$;

drop trigger if exists inventarios_aprovacao on inventarios;
create trigger inventarios_aprovacao
  before insert or update on inventarios
  for each row execute function inventarios_guarda_aprovacao();

comment on function inventarios_guarda_aprovacao() is
  'Faz valer pode(inventario, aprovar). A policy de escrita nao consegue: ela '
  'precisa liberar UPDATE para o upsert de lancamento e nao enxerga qual '
  'coluna mudou.';

-- ============================================================
-- Conferir depois de rodar:
--
--   select tgname from pg_trigger
--    where tgrelid = 'inventarios'::regclass and not tgisinternal;
--   -- espera: inventarios_aprovacao
--
-- Teste de mesa, logado como alguem com 'lancar' e SEM 'aprovar':
--
--   update inventarios set aprovado_por = 'eu', aprovado_em = now()
--    where id = <um id da sua unidade>;
--   -- espera: ERROR ... nao tem permissao de aprovar inventario
--
-- E que o lancamento normal continua passando:
--
--   update inventarios set valor_estoque = valor_estoque
--    where id = <o mesmo id>;
--   -- espera: UPDATE 1
-- ============================================================
