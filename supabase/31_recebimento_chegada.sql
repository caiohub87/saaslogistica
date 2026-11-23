-- ============================================================
-- CARGAS A RECEBER: chegada real, descarga e quantidade em número
-- ------------------------------------------------------------
-- ADITIVO: só acrescenta colunas, status e um gatilho. Nenhum dado existente
-- muda, e o sistema antigo continua lendo/gravando as colunas de sempre.
-- Rode DEPOIS de 11_rls_transicao.sql. Pode rodar de novo sem problema.
--
-- O que passa a existir:
--   status novos (só no receber):
--     Agendado -> Chegou (portaria) -> Descarregando -> Recebido
--     e dois desfechos fora do ciclo: Cancelado e "Nao compareceu"
--   chegada_em / descarga_em / recebido_em  carimbados PELO BANCO (now()),
--     no instante em que o status muda — nao vem do relogio de quem clicou,
--     que pode estar errado. E dessas horas que saem a pontualidade do
--     fornecedor e o tempo de descarga.
--   qtd + unidade_qtd (+ peso_kg, nf): a quantidade em numero. A coluna
--     antiga `volumes` (texto livre) continua, para as linhas antigas.
-- ============================================================

alter table agendamentos add column if not exists chegada_em  timestamptz;
alter table agendamentos add column if not exists descarga_em timestamptz;
alter table agendamentos add column if not exists recebido_em timestamptz;
alter table agendamentos add column if not exists qtd numeric;
alter table agendamentos add column if not exists unidade_qtd text;
alter table agendamentos add column if not exists peso_kg numeric;
alter table agendamentos add column if not exists nf text;

do $$ begin
  alter table agendamentos add constraint agendamentos_unidade_qtd_check
    check (unidade_qtd is null or unidade_qtd in ('paletes','caixas','volumes'));
exception when duplicate_object then null; end $$;

-- ---------- status ----------
-- Se a tabela tiver um CHECK antigo limitando o status, ele recusaria os novos.
-- Procura qualquer CHECK que mencione a coluna status e troca por um com a
-- lista completa. Sem CHECK nenhum, nada acontece.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class t on t.oid = con.conrelid
    where t.relname = 'agendamentos' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table agendamentos drop constraint %I', c.conname);
  end loop;
end $$;

-- NOT VALID: vale para o que for gravado daqui em diante, sem reprovar uma
-- linha antiga que por acaso tenha um status fora da lista
alter table agendamentos add constraint agendamentos_status_check
  check (status in ('Agendado','Montado','Enviado','Recebido','Cancelado',
                    'Chegou','Descarregando','Não compareceu')) not valid;

-- ---------- carimbos de hora ----------
-- O gatilho olha a MUDANCA de status:
--   chegou em Chegou/Descarregando/Recebido sem o carimbo anterior -> carimba
--     (pular etapa, ex. Agendado direto para Recebido no sistema antigo,
--      carimba so o que foi alcancado: a etapa pulada fica sem hora e nao
--      entra na media — melhor faltar do que inventar)
--   voltou para Agendado (reabrir) -> apaga os tres, o ciclo recomeca
create or replace function agendamento_carimbar()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tipo <> 'receber' or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'Agendado' then
    new.chegada_em := null; new.descarga_em := null; new.recebido_em := null;
  elsif new.status = 'Chegou' then
    new.chegada_em := coalesce(new.chegada_em, now());
  elsif new.status = 'Descarregando' then
    new.descarga_em := coalesce(new.descarga_em, now());
  elsif new.status = 'Recebido' then
    new.recebido_em := coalesce(new.recebido_em, now());
  end if;
  return new;
end $$;

drop trigger if exists agendamento_carimbar on agendamentos;
create trigger agendamento_carimbar before update of status on agendamentos
  for each row execute function agendamento_carimbar();

-- ---------- tempo real ----------
-- O Painel do dia escuta mudancas na tabela para atualizar sozinho na TV.
-- (A RLS continua valendo: cada um so recebe o que pode ler.)
do $$ begin
  alter publication supabase_realtime add table agendamentos;
exception when duplicate_object then null; when undefined_object then null; end $$;

create index if not exists agendamentos_receber_data
  on agendamentos (unidade, tipo, data);

-- ============================================================
-- Conferir depois de rodar:
--   select column_name from information_schema.columns
--    where table_name = 'agendamentos' and column_name in
--    ('chegada_em','descarga_em','recebido_em','qtd','unidade_qtd','peso_kg','nf');
-- ============================================================
