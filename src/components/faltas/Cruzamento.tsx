'use client';

import { useState } from 'react';

import { fmtPct, pct, type Cruzamento as Dados } from '@/lib/analiseFaltas';
import { cn } from '@/utils/cn';

/**
 * Grade motorista × veículo.
 *
 * Dois rankings lado a lado dizem quem aparece mais e qual carro aparece mais,
 * mas não dizem se é SEMPRE O MESMO PAR. Um motorista que só dá falta num
 * carro específico aponta para o carro, ou para a dupla — e é aí que costuma
 * estar a causa, não no nome que lidera a lista.
 *
 * Grade de magnitude pede RAMPA SEQUENCIAL: uma hue só, mais escuro onde é
 * maior. Não é cor categórica — as células não têm identidade, têm intensidade.
 *
 * O número fica escrito em toda célula que não é zero. A cor é reforço, nunca
 * o único jeito de ler o valor.
 */
export function Cruzamento({ dados, total, onEscolher }: {
  dados: Dados;
  /** denominador do percentual: o total do período */
  total: number;
  /** clicar numa célula recorta a página pelo par */
  onEscolher: (motorista: string, placa: string) => void;
}) {
  const [tabela, setTabela] = useState(false);
  const { linhas, colunas, celulas, maior } = dados;

  if (!linhas.length || !colunas.length) {
    return (
      <section className="painel sombra rounded-2xl p-4">
        <h2 className="text-[15px] font-bold">Motorista × veículo</h2>
        <p className="py-8 text-center text-[13px] txt-fraco">
          Precisa de motorista e placa nos registros para cruzar.
        </p>
      </section>
    );
  }

  /** Em qual dos 4 passos a célula cai. Zero não pinta: ausência não é valor. */
  const passo = (v: number) => {
    if (!v) return 0;
    return Math.min(4, Math.ceil((v / maior) * 4));
  };

  return (
    <section className="painel sombra rounded-2xl p-4">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-[15px] font-bold">Motorista × veículo</h2>
        <span className="text-[12px] txt-fraco">onde o par se repete</span>
        <button
          type="button" onClick={() => setTabela((v) => !v)} aria-pressed={tabela}
          className="ml-auto rounded-lg border borda px-2 py-0.5 text-[11.5px] font-semibold txt-fraco hover:bg-marinho-50"
        >
          {tabela ? 'Ver grade' : 'Ver tabela'}
        </button>
      </div>
      <p className="mb-3 text-[12px] txt-fraco">
        Dois rankings separados mostram quem aparece mais e qual carro aparece mais. Só a grade
        mostra se é sempre a <b>mesma dupla</b> — que é onde costuma estar a causa.
      </p>

      {tabela ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="painel-2 text-left">
                <th className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide txt-fraco">Motorista</th>
                <th className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide txt-fraco">Veículo</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide txt-fraco">Ocor.</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide txt-fraco">% do total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.flatMap((l) => colunas
                .filter((c) => celulas[l][c] > 0)
                .map((c) => ({ l, c, v: celulas[l][c] })))
                .sort((a, b) => b.v - a.v)
                .map(({ l, c, v }) => (
                  <tr key={l + '|' + c} className="border-b borda">
                    <td className="px-2 py-1.5">{l}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{c}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{v}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums txt-fraco">{fmtPct(pct(v, total))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th />
                {colunas.map((c) => (
                  <th key={c} className="px-1 pb-1.5 text-center text-[10.5px] font-bold uppercase tracking-wide txt-fraco">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l}>
                  <th className="max-w-40 truncate py-1 pr-2 text-right text-[12px] font-semibold">{l}</th>
                  {colunas.map((c) => {
                    const v = celulas[l][c];
                    const p = passo(v);
                    return (
                      <td key={c} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => v && onEscolher(l, c)}
                          disabled={!v}
                          title={v
                            ? `${l} no ${c}: ${v} ocorrência(s) · ${fmtPct(pct(v, total))} do total`
                            : `${l} não teve ocorrência no ${c}`}
                          className={cn(
                            'flex size-11 items-center justify-center rounded-md text-[13px] font-bold tabular-nums transition-transform',
                            v ? 'cursor-pointer hover:scale-105' : 'cursor-default',
                            // o texto vai claro a partir do 3º passo, onde o
                            // fundo escurece o bastante para engolir a tinta
                            p >= 3 ? 'text-white' : 'text-[color:var(--texto)]',
                          )}
                          style={{ background: v ? `var(--seq-${p})` : 'var(--grade)' }}
                        >
                          {v || ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!tabela && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] txt-fraco">
          <span>menos</span>
          {[1, 2, 3, 4].map((p) => (
            <span key={p} className="size-4 rounded-sm" style={{ background: `var(--seq-${p})` }} />
          ))}
          <span>mais</span>
          <span className="ml-2">· célula vazia = o par não apareceu · clique para recortar</span>
        </div>
      )}
    </section>
  );
}
