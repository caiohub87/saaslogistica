'use client';

import { BarChart3, CalendarDays, MonitorPlay } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Agenda } from '@/components/agendamentos/Agenda';
import { Indicadores } from '@/components/recebimentos/Indicadores';
import { PainelDia } from '@/components/recebimentos/PainelDia';
import { cn } from '@/utils/cn';

const ABAS = [
  { id: 'agenda', nome: 'Agenda', Icone: CalendarDays },
  { id: 'painel', nome: 'Painel do dia', Icone: MonitorPlay },
  { id: 'indicadores', nome: 'Indicadores', Icone: BarChart3 },
] as const;
type Aba = (typeof ABAS)[number]['id'];

/**
 * Cargas a Receber — agenda do depósito, painel do dia e indicadores.
 *
 * A aba vai no endereço (?aba=painel): a TV do depósito abre direto no painel
 * por um link salvo, sem ninguém precisar clicar.
 */
export default function RecebimentosPage() {
  const [aba, setAba] = useState<Aba>('agenda');

  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get('aba');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o endereço só na montagem
    if (ABAS.some((a) => a.id === pedida)) setAba(pedida as Aba);
  }, []);

  function trocar(nova: Aba) {
    setAba(nova);
    const url = new URL(window.location.href);
    if (nova === 'agenda') url.searchParams.delete('aba'); else url.searchParams.set('aba', nova);
    window.history.replaceState(null, '', url);
  }

  return (
    <div>
      <div role="tablist" aria-label="Seções do recebimento" className="sem-barra mb-5 flex gap-1 overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => trocar(a.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-[13.5px] font-semibold',
              aba === a.id ? 'aba aba-on' : 'aba aba-off txt-fraco',
            )}
          >
            <a.Icone aria-hidden className="size-4" />
            {a.nome}
          </button>
        ))}
      </div>

      {aba === 'agenda' && <Agenda tipo="receber" />}
      {aba === 'painel' && <PainelDia />}
      {aba === 'indicadores' && <Indicadores />}
    </div>
  );
}
