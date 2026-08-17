'use client';

import { X } from 'lucide-react';
import { useState } from 'react';

import {
  COR_STATUS, concluido, DIAS_SEMANA, MESES_NOME, hojeISO, type ConfigAgenda,
} from '@/lib/agendamentos';
import { fmtData } from '@/lib/inventario';
import type { Agendamento } from '@/types/database';
import { cn } from '@/utils/cn';

/**
 * Calendario mensal — a visao padrao das duas telas.
 *
 * Cada dia mostra a quantidade e os nomes (ate 2, com "+N" para o resto).
 * Clicar no dia abre a lista completa daquele dia. Hoje fica destacado e os
 * dias passados esmaecidos.
 */
export function Calendario({ cfg, itens, mes, aoTrocarMes }: {
  cfg: ConfigAgenda;
  itens: Agendamento[];
  mes: string;                      // 'YYYY-MM'
  aoTrocarMes: (m: string) => void;
}) {
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const [ano, mesNum] = mes.split('-').map(Number);
  const primeiroDia = new Date(ano, mesNum - 1, 1).getDay();
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const hoje = hojeISO();

  const porDia: Record<string, Agendamento[]> = {};
  itens.forEach((a) => { (porDia[a.data] ??= []).push(a); });

  const doDia = diaAberto ? (porDia[diaAberto] ?? []) : [];

  return (
    <div>
      <div className="mb-3 flex items-center gap-3 border-b borda pb-2">
        <input
          type="month" value={mes} onChange={(e) => aoTrocarMes(e.target.value)}
          className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[13px]"
        />
        <span className="text-[14px] font-bold">{MESES_NOME[mesNum - 1]} de {ano}</span>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[11.5px] font-bold uppercase tracking-wide text-marinho-500">
        {DIAS_SEMANA.map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: primeiroDia }, (_, i) => <div key={`v${i}`} />)}
        {Array.from({ length: diasNoMes }, (_, i) => {
          const dia = i + 1;
          const iso = `${ano}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
          const doIso = porDia[iso] ?? [];
          const nomes = doIso.map((a) => a[cfg.campoNome]).filter(Boolean) as string[];
          const extra = doIso.length > 2 ? ` +${doIso.length - 2}` : '';
          return (
            <button
              key={iso} type="button"
              onClick={() => doIso.length && setDiaAberto(iso)}
              disabled={!doIso.length}
              className={cn(
                'min-h-[92px] rounded-xl border borda p-2 text-left transition-all',
                doIso.length && 'hover:-translate-y-0.5 hover:border-marinho-500 hover:sombra',
                iso === hoje && 'border-marinho-500 bg-marinho-50/60',
                iso < hoje && 'opacity-55',
                !doIso.length && 'cursor-default',
              )}
            >
              <span className="block text-[13px] font-bold">{dia}</span>
              {doIso.length > 0 && (
                <>
                  <span className="mt-1 inline-block rounded bg-marinho-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {doIso.length}
                  </span>
                  <span className="mt-1 block break-words text-[11px] leading-tight txt-fraco">
                    {nomes.slice(0, 2).join(' / ')}{extra}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {diaAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 motion-safe:animate-surgir"
          onClick={(e) => { if (e.target === e.currentTarget) setDiaAberto(null); }}
          role="presentation"
        >
          <div role="dialog" aria-modal="true" aria-label={`Agendamentos de ${fmtData(diaAberto)}`}
            className="painel sombra-lg max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 motion-safe:animate-subir">
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-[16px] font-bold">
                <cfg.Icone aria-hidden className="inline size-4.5 text-marinho-500" /> {cfg.titulo} — {fmtData(diaAberto)}
              </h3>
              <button
                type="button" onClick={() => setDiaAberto(null)} aria-label="Fechar"
                className="flex size-8 items-center justify-center rounded-lg txt-fraco hover:bg-marinho-50"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <ul className="flex flex-col gap-2">
              {doDia.map((a) => (
                <li key={a.id} className={cn('rounded-xl border borda p-3', concluido(cfg.tipo, a.status) && 'opacity-60')}>
                  <p className="text-[14px] font-bold">
                    {a[cfg.campoNome] || '—'}
                    {cfg.temHora && a.hora && <span className="ml-1.5 text-[12.5px] font-normal txt-fraco">às {a.hora}</span>}
                  </p>
                  <p className="mt-0.5 text-[12.5px] txt-fraco">
                    {cfg.rotuloSecundario}: {a[cfg.campoSecundario] || '—'}
                    {a.obs && <> · {a.obs}</>}
                  </p>
                  <span className={cn('mt-1.5 inline-block rounded-md px-2 py-0.5 text-[11px] font-bold', COR_STATUS[a.status])}>
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
