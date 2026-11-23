'use client';

import { Clock3, Maximize, Minimize, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useRecebimentos } from '@/hooks/useRecebimentos';
import { COR_STATUS } from '@/lib/agendamentos';
import { atrasadoAgora, dataLocalISO, previstoEm } from '@/lib/recebimentos';
import { useSessao } from '@/providers/SessionProvider';
import type { Agendamento } from '@/types/database';
import { cn } from '@/utils/cn';

const numero = new Intl.NumberFormat('pt-BR');

function quantidade(a: Agendamento) {
  return a.qtd != null && a.unidade_qtd ? `${numero.format(a.qtd)} ${a.unidade_qtd}` : a.volumes || 'Quantidade não informada';
}

function duracao(a: Agendamento, agora: Date): string {
  const inicio = a.descarga_em ? new Date(a.descarga_em).getTime() : NaN;
  if (!Number.isFinite(inicio) || inicio > agora.getTime()) return 'Início da descarga não registrado';
  const minutos = Math.floor((agora.getTime() - inicio) / 60_000);
  if (!minutos) return 'Descarga iniciada agora';
  return minutos < 60 ? `Descarregando há ${minutos} min` : `Descarregando há ${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

/** Painel somente de leitura. Os avanços de status continuam na aba Agenda. */
export function PainelDia() {
  const { pode, usuario, carregando: sessaoCarregando } = useSessao();
  const { itens, carregando, erro, recarregar } = useRecebimentos();
  const [agora, setAgora] = useState<Date | null>(null);
  const [telaCheia, setTelaCheia] = useState(false);
  const [avisoTela, setAvisoTela] = useState<string | null>(null);
  const painel = useRef<HTMLElement>(null);

  useEffect(() => {
    const atualizar = () => setAgora(new Date());
    // O primeiro horário só aparece no navegador, sem divergência na hidratação.
    const inicio = window.setTimeout(atualizar, 0);
    const intervalo = window.setInterval(atualizar, 60_000);
    const aoMudarTela = () => setTelaCheia(document.fullscreenElement === painel.current);
    document.addEventListener('fullscreenchange', aoMudarTela);
    return () => {
      window.clearTimeout(inicio);
      window.clearInterval(intervalo);
      document.removeEventListener('fullscreenchange', aoMudarTela);
    };
  }, []);

  async function alternarTelaCheia() {
    setAvisoTela(null);
    try {
      if (document.fullscreenElement === painel.current) await document.exitFullscreen();
      else if (painel.current?.requestFullscreen) await painel.current.requestFullscreen();
      else setAvisoTela('Este navegador não oferece tela cheia. Você pode ampliar a página pelo menu do navegador.');
    } catch {
      setAvisoTela('Não foi possível abrir a tela cheia neste navegador.');
    }
  }

  if (!sessaoCarregando && !pode('recebimentos', 'ver')) {
    return <div className="painel sombra rounded-2xl p-6 text-center">Você não tem permissão para ver os recebimentos.</div>;
  }

  const hoje = agora ? dataLocalISO(agora) : '';
  const doDia = itens.filter((a) => a.data === hoje).sort((a, b) => {
    const ha = previstoEm(a)?.getTime() ?? Infinity;
    const hb = previstoEm(b)?.getTime() ?? Infinity;
    return (ha === hb ? 0 : ha - hb) || a.id - b.id;
  });
  const contadores = [
    { rotulo: 'A chegar', valor: doDia.filter((a) => a.status === 'Agendado').length },
    { rotulo: 'Na portaria', valor: doDia.filter((a) => a.status === 'Chegou').length },
    { rotulo: 'Descarregando', valor: doDia.filter((a) => a.status === 'Descarregando').length },
    { rotulo: 'Recebidos', valor: doDia.filter((a) => a.status === 'Recebido').length },
    { rotulo: 'Atrasados', valor: doDia.filter((a) => agora && atrasadoAgora(a, agora)).length },
  ];

  return (
    <section ref={painel} aria-label="Painel de recebimentos do dia" className="min-w-0 space-y-4 overflow-y-auto rounded-2xl bg-[var(--fundo)] p-1 text-[var(--texto)] sm:p-2 fullscreen:h-screen fullscreen:rounded-none fullscreen:p-4 sm:fullscreen:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold sm:text-2xl">Painel do dia</h2>
          <p className="mt-1 text-sm txt-fraco">
            {usuario?.unidade} · {agora ? agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) : 'Carregando o dia…'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <time dateTime={agora?.toISOString()} className="mr-1 text-2xl font-bold tabular-nums sm:text-3xl">
            {agora ? agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
          </time>
          <button type="button" onClick={() => { void recarregar(); }} disabled={carregando} title="Atualizar recebimentos" aria-label="Atualizar recebimentos" className="painel flex size-10 items-center justify-center rounded-xl disabled:opacity-50">
            <RefreshCw aria-hidden className={cn('size-4', carregando && 'motion-safe:animate-spin')} />
          </button>
          <button type="button" onClick={() => { void alternarTelaCheia(); }} className="painel flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold">
            {telaCheia ? <Minimize aria-hidden className="size-4" /> : <Maximize aria-hidden className="size-4" />}
            {telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
        </div>
      </header>

      {avisoTela && <p role="status" className="painel rounded-xl p-3 text-sm txt-fraco">{avisoTela}</p>}
      {erro && <p role="alert" className="rounded-xl border border-erro-500/30 bg-erro-500/10 p-3 text-sm">{erro} Os dados já carregados permanecem visíveis.</p>}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3" aria-label="Resumo do dia">
        {contadores.map((c, i) => (
          <div key={c.rotulo} className={cn('painel sombra rounded-2xl p-3 sm:p-4', i === 4 && 'col-span-2 sm:col-span-1')}>
            <p className="text-xs font-semibold txt-fraco sm:text-sm">{c.rotulo}</p>
            <p className={cn('mt-1 text-3xl font-bold tabular-nums sm:text-4xl', i === 4 && c.valor > 0 && 'text-erro-600')}>
              {carregando || !agora ? '—' : c.valor}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs txt-fraco">Atrasados: ainda a chegar, com mais de 30 min após o horário agendado. Altere os status na aba Agenda.</p>
      {carregando || !agora ? <p role="status" className="painel rounded-2xl p-8 text-center txt-fraco">Carregando recebimentos…</p>
        : !doDia.length ? <p className="painel sombra rounded-2xl p-8 text-center txt-fraco">Nenhum recebimento agendado para hoje.</p>
          : <ul className="space-y-3">
            {doDia.map((a) => {
              const atrasado = atrasadoAgora(a, agora);
              return (
                <li key={a.id} className={cn('painel sombra grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-2xl p-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:p-5', atrasado && 'border-erro-500/60! bg-erro-500/10!')}>
                  <div className="text-xl font-bold tabular-nums sm:text-3xl">
                    {a.hora ? a.hora.slice(0, 5) : <span className="text-sm txt-fraco">Sem hora</span>}
                  </div>
                  <div className="min-w-0">
                    <h3 className="break-words text-lg font-bold leading-tight sm:text-2xl">{a.fornecedor || 'Fornecedor não informado'}</h3>
                    <p className="mt-1 break-words text-sm txt-fraco sm:text-base">{quantidade(a)}</p>
                    {a.status === 'Descarregando' && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold sm:text-base"><Clock3 aria-hidden className="size-4 shrink-0" />{duracao(a, agora)}</p>}
                  </div>
                  <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
                    <span className={cn('rounded-lg px-3 py-1.5 text-sm font-bold sm:text-base', COR_STATUS[a.status])}>{a.status}</span>
                    {atrasado && <span className="rounded-lg bg-erro-500/15 px-3 py-1.5 text-sm font-bold text-erro-600">Atrasado</span>}
                  </div>
                </li>
              );
            })}
          </ul>}
      <p className="text-right text-xs txt-fraco">Atualização automática · conferência a cada minuto</p>
    </section>
  );
}
