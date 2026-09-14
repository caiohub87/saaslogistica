'use client';

import { useState } from 'react';

import { fmtNum, fmtPct, pct, type Fatia } from '@/lib/analiseFaltas';
import { cn } from '@/utils/cn';

/**
 * Ranking em barras horizontais.
 *
 * HORIZONTAL porque os rótulos são nomes ("FRANCISCO DAS CHAGAS") e códigos de
 * produto: em colunas eles viram texto deitado ou cortado.
 *
 * UMA COR SÓ, e não uma escala escura-onde-maior. Motorista, placa e produto
 * são categorias nominais — a ordem entre elas não carrega significado — e o
 * comprimento da barra já diz a magnitude. Pintar por valor gastaria o canal de
 * cor repetindo o que o tamanho mostra, e ainda repintaria as barras a cada
 * filtro, fazendo a mesma pessoa mudar de cor conforme a companhia.
 *
 * O valor fica escrito ao lado da barra, sempre. O tooltip acrescenta o
 * detalhe, mas nunca é o único jeito de ler o número.
 */
export function Ranking({ titulo, subtitulo, fatias, total, vazio, unidade = 'ocorrência', onEscolher }: {
  titulo: string;
  subtitulo?: string;
  fatias: Fatia[];
  /** denominador do percentual — o total do período, não a soma das fatias */
  total: number;
  vazio: string;
  unidade?: string;
  /** clicar na fatia recorta a página por ela; ausente = ranking só de leitura */
  onEscolher?: (chave: string) => void;
}) {
  const [tabela, setTabela] = useState(false);
  /**
   * A escala ignora "Outros".
   *
   * Ele é a soma de uma cauda inteira, não um concorrente: num ranking de
   * lotes com 12 empatados na cauda, "Outros" chega a 24 contra 3 do maior
   * lote nomeado, vira a barra de 100% e achata justamente a comparação que a
   * pessoa veio fazer. Por isso ele aparece como número, sem barra.
   */
  const maior = fatias.reduce((a, f) => (f.chave === '__outros' ? a : Math.max(a, f.itens)), 0);

  return (
    <section className="painel sombra flex flex-col rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-[15px] font-bold">{titulo}</h2>
        {subtitulo && <span className="text-[12px] txt-fraco">{subtitulo}</span>}
        {fatias.length > 0 && (
          <button
            type="button" onClick={() => setTabela((v) => !v)}
            aria-pressed={tabela}
            className="ml-auto rounded-lg border borda px-2 py-0.5 text-[11.5px] font-semibold txt-fraco hover:bg-marinho-50"
          >
            {tabela ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        )}
      </div>

      {fatias.length === 0 ? (
        <p className="py-8 text-center text-[13px] txt-fraco">{vazio}</p>
      ) : tabela ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="painel-2 text-left">
                <th className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide txt-fraco">#</th>
                <th className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide txt-fraco">Nome</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide txt-fraco">Ocor.</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide txt-fraco">Produtos</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide txt-fraco">% do total</th>
              </tr>
            </thead>
            <tbody>
              {fatias.map((f, i) => (
                <tr key={f.chave} className="border-b borda">
                  <td className="px-2 py-1.5 tabular-nums txt-fraco">{i + 1}</td>
                  <td className="px-2 py-1.5">{f.rotulo}</td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{f.itens}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums txt-fraco">{f.produtos}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums txt-fraco">{fmtPct(pct(f.itens, total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-2">
          {fatias.map((f) => {
            const larg = maior ? (f.itens / maior) * 100 : 0;
            const outros = f.chave === '__outros';
              // "Outros" não é uma fatia: recortar por ele não quer dizer nada
              const clicavel = Boolean(onEscolher) && !outros;
              return (
              <li
                key={f.chave}
                // alvo de clique/hover maior que a marca: a barra tem 10px, a linha 28
                className={cn(
                  'group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-1 py-1',
                  clicavel && 'cursor-pointer hover:bg-marinho-50/60',
                  !clicavel && 'hover:bg-marinho-50/60',
                )}
                onClick={clicavel ? () => onEscolher!(f.chave) : undefined}
                role={clicavel ? 'button' : undefined}
                tabIndex={clicavel ? 0 : undefined}
                onKeyDown={clicavel
                  ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEscolher!(f.chave); } }
                  : undefined}
                title={clicavel
                  ? `${f.rotulo}: ${f.itens} ${unidade}(s) · ${f.produtos} produto(s) · ${fmtPct(pct(f.itens, total))} do total — clique para recortar`
                  : `${f.rotulo}: ${f.itens} ${unidade}(s) · ${f.produtos} produto(s) · ${fmtPct(pct(f.itens, total))} do total`}
              >
                <span className="min-w-0">
                  <span className={cn('block truncate text-[12.5px]', outros && 'italic txt-fraco')}>
                    {f.rotulo}
                  </span>
                  {/* a barra: 10px, ponta arredondada, ancorada no zero.
                      "Outros" não ganha barra — ver o comentário da escala. */}
                  {!outros && (
                    <span className="mt-1 block h-2.5 w-full rounded-sm" style={{ background: 'var(--grade)' }}>
                      <span
                        className="block h-full rounded-r-[4px]"
                        style={{ width: `${Math.max(larg, f.itens ? 1.5 : 0)}%`, background: 'var(--serie)' }}
                      />
                    </span>
                  )}
                </span>
                {/* o valor sempre visível — o tooltip complementa, não substitui */}
                <span className="whitespace-nowrap text-right">
                  <b className="text-[13.5px] tabular-nums">{f.itens}</b>
                  <span className="ml-1.5 text-[11.5px] txt-fraco tabular-nums">
                    {fmtPct(pct(f.itens, total))}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {fatias.length > 0 && !tabela && (
        <p className="mt-3 text-[11px] txt-fraco">
          {fmtNum(total)} {unidade}(s) no período · a barra compara com o maior nomeado da lista
        </p>
      )}
    </section>
  );
}
