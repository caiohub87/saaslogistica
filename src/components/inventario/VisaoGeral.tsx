'use client';

import { Loader2, Package, Scissors, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  fmtBRL, fmtData, fmtQtd, low, posicaoAtual, type ItemPosicao,
} from '@/lib/inventario';
import type { Inventario } from '@/types/database';
import { cn } from '@/utils/cn';

/**
 * Visao geral do estoque conferido — a tela que junta as duas rotinas.
 *
 * Cada item aparece UMA vez, com a contagem mais recente dele: se o corte de
 * ontem tocou no produto, e o corte que vale; senao vale o inventario normal.
 * Nao ha nada para lancar aqui — a tela se atualiza sozinha conforme os
 * inventarios vao sendo salvos nas outras abas.
 */
export function VisaoGeral({ lancamentos, carregando }: {
  lancamentos: Inventario[];
  carregando: boolean;
}) {
  const [fornAtivo, setFornAtivo] = useState('');
  const [busca, setBusca] = useState('');
  const [soDiv, setSoDiv] = useState(false);
  const [origem, setOrigem] = useState<'todos' | 'normal' | 'corte'>('todos');

  const fornecedores = useMemo(
    () => [...new Set(lancamentos.map((l) => l.fornecedor))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [lancamentos],
  );
  const fornecedor = fornecedores.includes(fornAtivo) ? fornAtivo : (fornecedores[0] ?? '');

  const itens = useMemo(
    () => (fornecedor ? posicaoAtual(lancamentos, fornecedor) : []),
    [lancamentos, fornecedor],
  );

  const filtrados = useMemo(() => {
    const q = low(busca);
    return itens
      .filter((i) => !soDiv || i.dif_qtde)
      .filter((i) => origem === 'todos' || i.tipo === origem)
      .filter((i) => !q || low(i.id).includes(q) || low(i.descricao).includes(q));
  }, [itens, busca, soDiv, origem]);

  /** Resumo da posicao inteira do fornecedor, nao do filtro da tela. */
  const resumo = useMemo(() => {
    const dif = itens.reduce((a, i) => a + i.dif_financeira, 0);
    const ultima = itens.reduce((a, i) => (i.data > a ? i.data : a), '');
    return {
      total: itens.length,
      divergentes: itens.filter((i) => i.dif_qtde).length,
      doCorte: itens.filter((i) => i.tipo === 'corte').length,
      pendentes: itens.filter((i) => !i.aprovado).length,
      dif,
      ultima,
    };
  }, [itens]);

  if (carregando) {
    return (
      <div className="painel sombra flex justify-center rounded-2xl py-16">
        <Loader2 aria-hidden className="size-5 animate-spin text-marinho-500" />
      </div>
    );
  }

  if (!fornecedores.length) {
    return (
      <section className="painel sombra rounded-2xl p-6 text-center motion-safe:animate-entrada">
        <h2 className="text-[15px] font-bold">Nada conferido ainda</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] txt-fraco">
          Assim que o primeiro inventário — normal ou de corte — for lançado, os itens dele
          aparecem aqui, separados por fornecedor.
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4 motion-safe:animate-entrada">
      <section className="painel sombra rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <Package aria-hidden className="size-4.5 text-marinho-500" />
          Posição atual por fornecedor
        </h2>
        <p className="mb-3 mt-1 text-[12.5px] txt-fraco">
          De cada item vale a <b>contagem mais recente</b>, venha ela do inventário normal ou do
          corte. A tela se atualiza sozinha conforme os dois vão sendo lançados.
        </p>

        <div className="sem-barra mb-3 flex gap-1 overflow-x-auto">
          {fornecedores.map((f) => (
            <button
              key={f} type="button"
              onClick={() => { setFornAtivo(f); setBusca(''); }}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                f === fornecedor ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50',
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Caixa rotulo="Itens acompanhados" valor={fmtQtd(resumo.total)} destaque />
          <Caixa rotulo="Com divergência" valor={fmtQtd(resumo.divergentes)} />
          <Caixa
            rotulo="Diferença acumulada" valor={fmtBRL(resumo.dif)}
            cor={resumo.dif < 0 ? 'erro' : 'ok'}
          />
          <Caixa rotulo="Vindos do corte" valor={fmtQtd(resumo.doCorte)} />
          <Caixa
            rotulo="Última contagem"
            valor={resumo.ultima ? fmtData(resumo.ultima) : '—'}
          />
        </div>

        {resumo.pendentes > 0 && (
          <p className="mt-2 rounded-lg painel-2 px-3 py-2 text-[12.5px] txt-fraco">
            {fmtQtd(resumo.pendentes)} item(ns) vêm de lançamento que ainda <b>aguarda aprovação</b> da
            gerência — o número já aparece aqui, mas não está validado.
          </p>
        )}
      </section>

      <section className="painel sombra rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-bold">
            {fornecedor}
            <span className="ml-2 rounded-md painel-2 px-2 py-0.5 text-[12px] font-semibold txt-fraco">
              {filtrados.length} de {itens.length} itens
            </span>
          </h3>

          <div className="relative min-w-52 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar item (id ou descrição)…"
              className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
            />
          </div>

          <select
            value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)}
            className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="todos">Normal e corte</option>
            <option value="normal">Só inventário normal</option>
            <option value="corte">Só corte</option>
          </select>

          <label className="flex items-center gap-1.5 text-[12.5px] txt-fraco">
            <input type="checkbox" checked={soDiv} onChange={(e) => setSoDiv(e.target.checked)} />
            só divergências
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="painel-2 text-left">
                <Th>Id</Th><Th>Descrição</Th><Th>Embalagem</Th>
                <Th num>Sld Estoq</Th><Th num>Sld Contagem</Th>
                <Th num>Dif Qtde</Th><Th num>Dif Financeira</Th>
                <Th>Contado em</Th><Th>Origem</Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-sm txt-fraco">
                  Nenhum item no filtro atual.
                </td></tr>
              ) : filtrados.map((i) => (
                <tr key={i.id} className={cn('border-b borda', !i.dif_qtde && 'opacity-55')}>
                  <Td>{i.id}</Td>
                  <Td>{i.descricao}</Td>
                  <Td>{i.embalagem}</Td>
                  <Td num>{fmtQtd(i.sld_estoq)}</Td>
                  <Td num>{fmtQtd(i.sld_contagem)}</Td>
                  <Td num sinal={i.dif_qtde}>{i.dif_qtde ? fmtQtd(i.dif_qtde) : '—'}</Td>
                  <Td num sinal={i.dif_financeira}>{i.dif_financeira ? fmtBRL(i.dif_financeira) : '—'}</Td>
                  <Td>
                    <span className="whitespace-nowrap">{fmtData(i.data)}</span>
                    {!i.aprovado && (
                      <span className="ml-1.5 rounded-md bg-ouro-100 px-1.5 py-0.5 text-[10.5px] font-bold text-ouro-700">
                        aguardando
                      </span>
                    )}
                  </Td>
                  <Td><SeloOrigem item={i} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ pedaços */

function SeloOrigem({ item }: { item: ItemPosicao }) {
  if (item.tipo === 'corte') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-marinho-50 px-2 py-0.5 text-[11px] font-bold text-marinho-800">
        <Scissors aria-hidden className="size-3" />
        Corte
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-md painel-2 px-2 py-0.5 text-[11px] font-bold txt-fraco">
      Inventário
    </span>
  );
}

function Caixa({ rotulo, valor, cor, destaque }: {
  rotulo: string; valor: string; cor?: 'ok' | 'erro'; destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border borda px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      <p className={cn(
        'mt-0.5 text-[17px] font-bold',
        cor === 'ok' && 'text-ok-600',
        cor === 'erro' && 'text-erro-600',
        destaque && !cor && 'text-marinho-500',
      )}>
        {valor}
      </p>
    </div>
  );
}

function Th({ children, num }: { children: React.ReactNode; num?: boolean }) {
  return (
    <th className={cn(
      'whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wide txt-fraco',
      num && 'text-right',
    )}>
      {children}
    </th>
  );
}

function Td({ children, num, sinal }: { children: React.ReactNode; num?: boolean; sinal?: number }) {
  return (
    <td className={cn(
      'px-3 py-2',
      num && 'whitespace-nowrap text-right',
      sinal != null && sinal > 0 && 'font-bold text-ok-600',
      sinal != null && sinal < 0 && 'font-bold text-erro-600',
    )}>
      {children}
    </td>
  );
}
