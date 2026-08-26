'use client';

import { CalendarClock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  diasAte, fmtDataBR, montarVisao, PERIODOS, SEM_FORNECEDOR, type Periodo,
} from '@/lib/validade';
import type { ItemValidade, RegistroValidade } from '@/types/database';
import { cn } from '@/utils/cn';

const low = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const qtd = (n: number) => n.toLocaleString('pt-BR');

/**
 * Visao — o mesmo desenho da planilha que a gerencia ja acompanha: um bloco por
 * fornecedor, uma linha por produto, e os quatro prazos lado a lado.
 *
 * O mesmo SKU em enderecos diferentes vira UMA linha: quem le quer saber quanto
 * ha para escoar em 30 dias, nao em qual rua do deposito esta. Os enderecos
 * aparecem embaixo da descricao, para quem precisar ir buscar.
 */
export function Visao({ itens, registros, fornecedores }: {
  itens: ItemValidade[];
  registros: RegistroValidade[];
  fornecedores: Record<string, string>;
}) {
  const [busca, setBusca] = useState('');
  const [fornAtivo, setFornAtivo] = useState('__todos');

  /** descricao e embalagem saem do retrato do PDF, nao do registro */
  const { descricoes, embalagens } = useMemo(() => {
    const d: Record<string, string> = {};
    const e: Record<string, number | null> = {};
    itens.forEach((i) => { d[i.produto_id] = i.descricao; e[i.produto_id] = i.emb_padrao; });
    return { descricoes: d, embalagens: e };
  }, [itens]);

  const grupos = useMemo(
    () => montarVisao(
      registros.map((r) => ({
        produto_id: r.produto_id,
        endereco: r.endereco,
        quantidade: Number(r.quantidade),
        periodo: r.periodo as Periodo,
        vencimento: r.vencimento,
      })),
      descricoes, fornecedores, embalagens,
    ),
    [registros, descricoes, fornecedores, embalagens],
  );

  const visiveis = useMemo(() => {
    const q = low(busca);
    return grupos
      .filter((g) => fornAtivo === '__todos' || g.fornecedor === fornAtivo)
      .map((g) => ({
        ...g,
        linhas: g.linhas.filter((l) => !q
          || low(l.produto_id).includes(q) || low(l.descricao).includes(q)),
      }))
      .filter((g) => g.linhas.length > 0);
  }, [grupos, busca, fornAtivo]);

  const geral = useMemo(() => {
    const t: Record<Periodo, number> = { 30: 0, 60: 0, 90: 0, 120: 0 };
    let total = 0;
    visiveis.forEach((g) => {
      PERIODOS.forEach((p) => { t[p] += g.totais[p]; });
      total += g.total;
    });
    return { porPeriodo: t, total, produtos: visiveis.reduce((a, g) => a + g.linhas.length, 0) };
  }, [visiveis]);

  if (!registros.length) {
    return (
      <section className="painel sombra rounded-2xl p-6 text-center motion-safe:animate-entrada">
        <h2 className="text-[15px] font-bold">Nada registrado ainda</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] txt-fraco">
          Na aba <b>Lançar</b>, digite a quantidade de cada lote e escolha em quantos dias ele
          vai escoar. O que você registrar aparece aqui, agrupado por fornecedor.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4 motion-safe:animate-entrada">
      <section className="painel sombra rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <CalendarClock aria-hidden className="size-4.5 text-marinho-500" />
          Relatório de vencimentos
        </h2>
        <p className="mb-3 mt-1 text-[12.5px] txt-fraco">
          Por fornecedor, quanto de cada produto está previsto para escoar em cada prazo. A data
          mostrada é a validade mais próxima entre os lotes somados naquela coluna.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto…"
              className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
            />
          </div>
          <select
            value={fornAtivo} onChange={(e) => setFornAtivo(e.target.value)}
            className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="__todos">Todos os fornecedores</option>
            {grupos.map((g) => <option key={g.fornecedor} value={g.fornecedor}>{g.fornecedor}</option>)}
          </select>
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Caixa rotulo="Produtos" valor={qtd(geral.produtos)} destaque />
          {PERIODOS.map((p) => (
            <Caixa key={p} rotulo={`${p} dias`} valor={qtd(geral.porPeriodo[p])} />
          ))}
          <Caixa rotulo="Total un." valor={qtd(geral.total)} />
        </div>
      </section>

      <section className="painel sombra rounded-2xl p-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="painel-2 text-left">
                <th rowSpan={2} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide txt-fraco">Código</th>
                <th rowSpan={2} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide txt-fraco">Produto</th>
                <th rowSpan={2} className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide txt-fraco">Emb.</th>
                {PERIODOS.map((p) => (
                  <th key={p} colSpan={2}
                    className="border-l borda px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide txt-fraco">
                    {p} dias
                  </th>
                ))}
                <th rowSpan={2} className="border-l borda px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide txt-fraco">Total</th>
              </tr>
              <tr className="painel-2 text-left">
                {PERIODOS.map((p) => (
                  <Fragmento key={p}>
                    <th className="border-l borda px-3 py-1.5 text-right text-[10.5px] font-bold uppercase txt-fraco">Qtde un.</th>
                    <th className="px-3 py-1.5 text-[10.5px] font-bold uppercase txt-fraco">Vencimento</th>
                  </Fragmento>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((g) => (
                <Fragmento key={g.fornecedor}>
                  <tr>
                    <td colSpan={12} className={cn(
                      'px-3 py-1.5 text-[12px] font-extrabold uppercase tracking-wide',
                      g.fornecedor === SEM_FORNECEDOR
                        ? 'bg-ouro-100 text-ouro-700' : 'bg-marinho-50 text-marinho-800',
                    )}>
                      {g.fornecedor}
                      {g.fornecedor === SEM_FORNECEDOR && (
                        <span className="ml-2 font-semibold normal-case">
                          — classifique na aba Lançar para estes saírem daqui
                        </span>
                      )}
                    </td>
                  </tr>

                  {g.linhas.map((l) => (
                    <tr key={l.produto_id} className="border-b borda">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">{l.produto_id}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold">{l.descricao || '—'}</span>
                        {l.enderecos.length > 0 && (
                          <span className="block font-mono text-[10.5px] txt-fraco">
                            {l.enderecos.join(' · ')}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right txt-fraco">{l.emb_padrao ?? '—'}</td>

                      {PERIODOS.map((p) => {
                        const c = l.porPeriodo[p];
                        const dias = c ? diasAte(c.vencimento) : null;
                        return (
                          <Fragmento key={p}>
                            <td className={cn('whitespace-nowrap border-l borda px-3 py-2 text-right',
                              c && 'font-bold')}>
                              {c ? qtd(c.quantidade) : '—'}
                              {c && c.registros > 1 && (
                                <span className="ml-1 text-[10px] font-normal txt-fraco">
                                  ({c.registros})
                                </span>
                              )}
                            </td>
                            <td className={cn(
                              'whitespace-nowrap px-3 py-2 text-[12px]',
                              dias != null && dias < 0 && 'font-bold text-erro-600',
                              dias != null && dias >= 0 && dias <= 30 && 'font-bold text-ouro-700',
                            )}>
                              {c ? fmtDataBR(c.vencimento) : ''}
                            </td>
                          </Fragmento>
                        );
                      })}

                      <td className="whitespace-nowrap border-l borda px-3 py-2 text-right font-bold">
                        {qtd(l.total)}
                      </td>
                    </tr>
                  ))}

                  <tr className="border-b-2 borda painel-2 font-bold">
                    <td className="px-3 py-1.5" />
                    <td className="px-3 py-1.5 text-[12px] uppercase txt-fraco">
                      Total {g.fornecedor}
                    </td>
                    <td />
                    {PERIODOS.map((p) => (
                      <Fragmento key={p}>
                        <td className="whitespace-nowrap border-l borda px-3 py-1.5 text-right">
                          {g.totais[p] ? qtd(g.totais[p]) : '—'}
                        </td>
                        <td />
                      </Fragmento>
                    ))}
                    <td className="whitespace-nowrap border-l borda px-3 py-1.5 text-right">
                      {qtd(g.total)}
                    </td>
                  </tr>
                </Fragmento>
              ))}

              <tr className="bg-marinho-900 font-extrabold" style={{ color: '#ffe45c' }}>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 uppercase">Total geral</td>
                <td />
                {PERIODOS.map((p) => (
                  <Fragmento key={p}>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{qtd(geral.porPeriodo[p])}</td>
                    <td />
                  </Fragmento>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right">{qtd(geral.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ pedaços */

function Fragmento({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Caixa({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-xl border borda px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      <p className={cn('mt-0.5 text-[17px] font-bold', destaque && 'text-marinho-500')}>{valor}</p>
    </div>
  );
}
