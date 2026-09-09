'use client';

import { DoorOpen, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  fmtData, fmtDias, porImpressora, porSala, type Consumo as Numeros, type TrocaComDuracao,
} from '@/lib/toners';
import type { Impressora, Sala } from '@/types/database';
import { cn } from '@/utils/cn';

type Visao = 'sala' | 'impressora';

/**
 * Quanto tempo o toner dura, por sala e por impressora.
 *
 * A média usa só as trocas JÁ encerradas — a que está na máquina ainda não
 * durou o que vai durar, e incluí-la derrubaria a média justamente quando o
 * toner é novo.
 *
 * "Desde a última" é o número que se olha no dia a dia: comparado à média, diz
 * se a máquina está perto de pedir toner. Por isso ele ganha destaque quando
 * passa da média.
 */
export function Consumo({ trocas, salas, impressoras }: {
  trocas: TrocaComDuracao[];
  salas: Sala[];
  impressoras: Impressora[];
}) {
  const [visao, setVisao] = useState<Visao>('sala');

  const linhasSala = useMemo(
    () => porSala(salas, impressoras, trocas)
      .sort((a, b) => b.consumo.trocas - a.consumo.trocas || a.sala.nome.localeCompare(b.sala.nome, 'pt-BR')),
    [salas, impressoras, trocas],
  );

  const linhasImp = useMemo(
    () => porImpressora(impressoras, salas, trocas)
      .sort((a, b) => b.consumo.trocas - a.consumo.trocas
        || a.impressora.nome.localeCompare(b.impressora.nome, 'pt-BR')),
    [impressoras, salas, trocas],
  );

  if (!impressoras.length) {
    return (
      <div className="painel sombra rounded-2xl p-10 text-center">
        <Printer aria-hidden className="mx-auto mb-3 size-8 txt-fraco" />
        <p className="text-[15px] font-semibold">Nada para consolidar ainda</p>
        <p className="mt-1 text-sm txt-fraco">Cadastre as salas e as impressoras primeiro.</p>
      </div>
    );
  }

  return (
    <section className="painel sombra rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold">Consumo</h2>
        <div className="flex gap-1.5">
          {([['sala', 'Por sala', DoorOpen], ['impressora', 'Por impressora', Printer]] as const).map(
            ([id, nome, Icone]) => (
              <button
                key={id} type="button" onClick={() => setVisao(id)} aria-pressed={visao === id}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors',
                  visao === id ? 'bg-marinho-800 text-white' : 'painel-2 txt-fraco hover:bg-marinho-50',
                )}
              >
                <Icone aria-hidden className="size-3.5" />
                {nome}
              </button>
            ),
          )}
        </div>
        <span className="ml-auto text-[12px] txt-fraco">
          {trocas.length} troca(s) registrada(s)
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="painel-2 text-left">
              <th className="px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide txt-fraco">
                {visao === 'sala' ? 'Sala' : 'Impressora'}
              </th>
              <th className="px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide txt-fraco">
                {visao === 'sala' ? 'Impressoras' : 'Sala'}
              </th>
              <th className="px-2.5 py-2 text-right text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Trocas</th>
              <th className="px-2.5 py-2 text-right text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Média</th>
              <th className="px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Última troca</th>
              <th className="px-2.5 py-2 text-right text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Desde a última</th>
              <th className="px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Toner atual</th>
            </tr>
          </thead>
          <tbody>
            {visao === 'sala' ? linhasSala.map(({ sala, impressoras: n, consumo }) => (
              <tr key={sala.id} className="border-b borda">
                <td className="px-2.5 py-2">
                  <b>{sala.nome}</b>
                  {sala.local && <span className="ml-1.5 text-[11px] txt-fraco">{sala.local}</span>}
                  {!sala.ativo && <Inativo />}
                </td>
                <td className="px-2.5 py-2 txt-fraco">{n}</td>
                <Numeros c={consumo} />
              </tr>
            )) : linhasImp.map(({ impressora, sala, consumo }) => (
              <tr key={impressora.id} className="border-b borda">
                <td className="px-2.5 py-2">
                  <b>{impressora.nome}</b>
                  {impressora.modelo && <span className="ml-1.5 text-[11px] txt-fraco">{impressora.modelo}</span>}
                  {!impressora.ativo && <Inativo />}
                </td>
                <td className="px-2.5 py-2 txt-fraco">{sala?.nome ?? '—'}</td>
                <Numeros c={consumo} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px] txt-fraco">
        A média conta só os toners já substituídos — o que está na máquina ainda não terminou de
        durar. Quem tem <b>uma troca só</b> ainda não tem média: falta a segunda para haver
        distância a medir.
      </p>
    </section>
  );
}

/** As colunas de número, iguais nas duas visões. */
function Numeros({ c }: { c: Numeros }) {
  // passou da média: é o sinal de que o toner deve estar acabando
  const vencendo = c.media != null && c.desdeUltima != null && c.desdeUltima > c.media;
  return (
    <>
      <td className="px-2.5 py-2 text-right tabular-nums">{c.trocas || <span className="txt-fraco">—</span>}</td>
      <td className="px-2.5 py-2 text-right font-bold tabular-nums">{fmtDias(c.media)}</td>
      <td className="whitespace-nowrap px-2.5 py-2 tabular-nums">{fmtData(c.ultima)}</td>
      <td className="px-2.5 py-2 text-right">
        {c.desdeUltima == null ? <span className="txt-fraco">—</span> : (
          <span className={cn('rounded-md px-2 py-0.5 text-[12px] font-bold tabular-nums',
            vencendo && 'bg-ouro-100 text-ouro-700')}>
            {fmtDias(c.desdeUltima)}
          </span>
        )}
      </td>
      <td className="px-2.5 py-2 text-[12px]">{c.toner ?? <span className="txt-fraco">—</span>}</td>
    </>
  );
}

function Inativo() {
  return (
    <span className="ml-1.5 rounded bg-erro-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-erro-600">
      Inativa
    </span>
  );
}
