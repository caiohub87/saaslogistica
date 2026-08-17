'use client';

import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  fmtBRL, fmtData, fmtMoeda, fmtPct, fmtQtd, linhasGerencia, MESES, totais, totalGerencia,
  type LinhaGerencia,
} from '@/lib/inventario';
import type { Inventario } from '@/types/database';
import { cn } from '@/utils/cn';

import { GraficoBarras, GraficoLinha, Ranking } from './Graficos';

/** Rotulo curto do eixo: 1.600 -> "1,6k". */
const compacto = (v: number) => {
  const a = Math.abs(v);
  return (v < 0 ? '-' : '') + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace('.', ',') + 'k' : a.toFixed(0));
};

export function Comparativo({ lancamentos, unidade, podeExportar }: {
  lancamentos: Inventario[]; unidade: string; podeExportar: boolean;
}) {
  const [fornecedor, setFornecedor] = useState('__todos');
  const [ini, setIni] = useState('');
  const [fim, setFim] = useState('');
  const [msg, setMsg] = useState('');

  const fornecedores = useMemo(
    () => [...new Set(lancamentos.map((l) => l.fornecedor))].sort(),
    [lancamentos],
  );

  const noPeriodo = useMemo(
    () => lancamentos.filter((l) =>
      (!ini || l.data_inventario >= ini) &&
      (!fim || l.data_inventario <= fim) &&
      (fornecedor === '__todos' || l.fornecedor === fornecedor)),
    [lancamentos, ini, fim, fornecedor],
  );

  /** ordem cronológica: os gráficos e os totalizadores dependem disso */
  const cronologico = useMemo(
    () => [...noPeriodo].sort((a, b) => (a.data_inventario < b.data_inventario ? -1 : 1)),
    [noPeriodo],
  );
  const linhas = useMemo(() => linhasGerencia(cronologico), [cronologico]);
  const geral = useMemo(() => totalGerencia(linhas), [linhas]);

  const umFornecedor = fornecedor !== '__todos';
  const rotulo = (l: LinhaGerencia) =>
    fmtData(l.data).slice(0, 5) + (umFornecedor ? '' : ' ' + l.fornecedor.slice(0, 7));

  const periodo = (ini || fim)
    ? `${ini ? fmtData(ini) : 'início'} a ${fim ? fmtData(fim) : 'hoje'}`
    : 'Todo o período';

  // ranking: o lançamento mais recente de cada fornecedor dentro do período
  const porFornecedor = useMemo(() => {
    const m: Record<string, Inventario> = {};
    noPeriodo.forEach((l) => {
      if (!m[l.fornecedor] || m[l.fornecedor].data_inventario < l.data_inventario) m[l.fornecedor] = l;
    });
    return Object.values(m)
      .map((l) => ({ label: l.fornecedor, value: totais(l.produtos ?? []).fin }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 12);
  }, [noPeriodo]);

  const ultimo = cronologico[cronologico.length - 1];
  const topProdutos = useMemo(() => {
    if (!ultimo) return [];
    return (ultimo.produtos ?? [])
      .filter((p) => p.dif_financeira)
      .sort((a, b) => Math.abs(b.dif_financeira) - Math.abs(a.dif_financeira))
      .slice(0, 10)
      .map((p) => ({ label: p.descricao || p.id, value: p.dif_financeira }));
  }, [ultimo]);

  async function exportar() {
    if (!linhas.length) { setMsg('Nenhum inventário no período para exportar.'); return; }
    setMsg('Gerando o Excel…');
    const { montarExcelGerencia } = await import('@/lib/excelGerencia');
    const nome = await montarExcelGerencia(linhas, unidade);
    setMsg(`${nome} — ${linhas.length} inventário(s).`);
  }

  return (
    <div className="flex flex-col gap-4 motion-safe:animate-entrada">
      <section className="painel sombra rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}
            className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="__todos">Todos os fornecedores</option>
            {fornecedores.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[12.5px] txt-fraco">
            De <input type="date" value={ini} onChange={(e) => setIni(e.target.value)}
              className="painel-2 rounded-lg border borda px-2 py-1.5" />
          </label>
          <label className="flex items-center gap-1 text-[12.5px] txt-fraco">
            Até <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
              className="painel-2 rounded-lg border borda px-2 py-1.5" />
          </label>
          {podeExportar && (
            <button
              type="button" onClick={() => void exportar()}
              className="flex items-center gap-1.5 rounded-lg bg-ouro-500 px-3 py-1.5 text-[12.5px] font-bold text-marinho-900"
            >
              <Download aria-hidden className="size-3.5" />
              Excel para a gerência
            </button>
          )}
          {msg && <span className="text-[12px] txt-fraco">{msg}</span>}
        </div>

        {linhas.length === 0 ? (
          <p className="py-6 text-center text-sm txt-fraco">Nenhum inventário no período.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Caixa rotulo="Período" valor={periodo} destaque />
            <Caixa rotulo="Inventários" valor={String(linhas.length)} />
            <Caixa rotulo="R$ est. invent." valor={fmtBRL(geral.est)} />
            <Caixa rotulo="Acuracidade" valor={fmtPct(geral.acu)} />
            <Caixa rotulo="Entrada" valor={fmtBRL(geral.entrada)} cor="ok" />
            <Caixa rotulo="Saída" valor={fmtBRL(geral.saida)} cor="erro" />
            <Caixa rotulo="Diferença" valor={fmtBRL(geral.dif)} cor={geral.dif < 0 ? 'erro' : 'ok'} />
            <Caixa rotulo="% Dif" valor={fmtPct(geral.pct)} cor={(geral.pct ?? 0) < 0 ? 'erro' : 'ok'} />
            <Caixa rotulo="Itens" valor={`${fmtQtd(geral.produtos)} · ${geral.divergentes} divergentes`} />
          </div>
        )}
      </section>

      <section className="painel sombra rounded-2xl p-4">
        <h3 className="mb-2 text-[15px] font-bold">
          Divergência financeira por inventário
          <span className="ml-2 rounded-md painel-2 px-2 py-0.5 text-[11.5px] font-semibold txt-fraco">
            verde = sobra · vermelho = falta
          </span>
        </h3>
        <GraficoBarras
          dados={linhas.map((l) => ({ label: rotulo(l), value: l.dif }))}
          fmt={(v) => fmtMoeda(v)} fmtEixo={compacto}
          vazio="Sem inventários no período."
        />
      </section>

      <section className="painel sombra rounded-2xl p-4">
        <h3 className="mb-2 text-[15px] font-bold">
          Acuracidade da contagem
          <span className="ml-2 rounded-md painel-2 px-2 py-0.5 text-[11.5px] font-semibold txt-fraco">
            1 − (entrada + saída) ÷ valor do estoque
          </span>
        </h3>
        <GraficoLinha
          dados={linhas.filter((l) => l.acu != null).map((l) => ({ label: rotulo(l), value: l.acu! }))}
          vazio="Sem inventários com valor de estoque informado."
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="painel sombra rounded-2xl p-4">
          <h3 className="mb-3 text-[15px] font-bold">Divergência por fornecedor</h3>
          <Ranking dados={porFornecedor} fmt={fmtBRL} vazio="Sem fornecedores no período." />
        </section>
        <section className="painel sombra rounded-2xl p-4">
          <h3 className="mb-3 text-[15px] font-bold">
            Maiores divergências
            <span className="ml-2 text-[11.5px] font-semibold txt-fraco">último inventário</span>
          </h3>
          <Ranking dados={topProdutos} fmt={fmtBRL} vazio="Nenhuma divergência no último inventário." />
        </section>
      </div>

      <section className="painel sombra rounded-2xl p-4">
        <h3 className="mb-3 text-[15px] font-bold">Inventário a inventário</h3>
        <TabelaGerencia linhas={linhas} />
      </section>
    </div>
  );
}

/** Mesmas colunas e mesmos totalizadores do Excel que vai para a gerência. */
function TabelaGerencia({ linhas }: { linhas: LinhaGerencia[] }) {
  if (!linhas.length) {
    return <p className="py-8 text-center text-sm txt-fraco">Nenhum inventário no período.</p>;
  }
  const meses = [...new Set(linhas.map((l) => l.data.slice(0, 7)))].sort();
  const anos = [...new Set(linhas.map((l) => l.data.slice(0, 4)))].sort();

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="painel-2 text-left">
            <Th>Data</Th><Th>Fornecedor</Th><Th num>Produtos</Th><Th num>Divergentes</Th>
            <Th num>R$ Est. Invent.</Th><Th num>Acuracidade</Th><Th num>Entrada</Th>
            <Th num>Saída</Th><Th num>Diferença</Th><Th num>% Dif</Th>
          </tr>
        </thead>
        <tbody>
          {meses.map((mk) => {
            const doMes = linhas.filter((l) => l.data.slice(0, 7) === mk);
            const t = totalGerencia(doMes);
            return (
              <Fragmento key={mk}>
                {doMes.map((l, i) => (
                  <tr key={l.fornecedor + l.data + i} className="border-b borda">
                    <Td>{fmtData(l.data)}</Td>
                    <Td><b>{l.fornecedor}</b></Td>
                    <Td num>{l.produtos}</Td>
                    <Td num>{l.divergentes}</Td>
                    <Td num>{fmtBRL(l.est)}</Td>
                    <Td num>{fmtPct(l.acu)}</Td>
                    <Td num cor="ok">{l.entrada ? fmtBRL(l.entrada) : '—'}</Td>
                    <Td num cor="erro">{l.saida ? fmtBRL(l.saida) : '—'}</Td>
                    <Td num sinal={l.dif}>{fmtBRL(l.dif)}</Td>
                    <Td num sinal={l.pct ?? 0}>{fmtPct(l.pct)}</Td>
                  </tr>
                ))}
                <LinhaTotal rotulo={MESES[Number(mk.slice(5, 7)) - 1]} t={t} />
              </Fragmento>
            );
          })}
          {anos.map((a) => (
            <LinhaTotal key={a} rotulo={a} t={totalGerencia(linhas.filter((l) => l.data.slice(0, 4) === a))} ano />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Fragmento({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function LinhaTotal({ rotulo, t, ano }: { rotulo: string; t: LinhaGerencia; ano?: boolean }) {
  return (
    <tr className={cn('font-extrabold', ano ? 'bg-marinho-900' : 'bg-marinho-800')} style={{ color: '#ffe45c' }}>
      <td className="px-3 py-2">{rotulo}</td>
      <td className="px-3 py-2">TOTALIZADORES ——&gt;</td>
      <td className="px-3 py-2 text-right">{t.produtos}</td>
      <td className="px-3 py-2 text-right">{t.divergentes}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">{fmtBRL(t.est)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">{fmtPct(t.acu)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">{fmtBRL(t.entrada)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">{fmtBRL(t.saida)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">{fmtBRL(t.dif)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right">{fmtPct(t.pct)}</td>
    </tr>
  );
}

function Caixa({ rotulo, valor, cor, destaque }: {
  rotulo: string; valor: string; cor?: 'ok' | 'erro'; destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border borda px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      <p className={cn(
        'mt-0.5 text-[15px] font-bold',
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

function Td({ children, num, sinal, cor }: {
  children: React.ReactNode; num?: boolean; sinal?: number; cor?: 'ok' | 'erro';
}) {
  return (
    <td className={cn(
      'px-3 py-2',
      num && 'whitespace-nowrap text-right',
      cor === 'ok' && 'font-bold text-ok-600',
      cor === 'erro' && 'font-bold text-erro-600',
      sinal != null && sinal > 0 && 'font-bold text-ok-600',
      sinal != null && sinal < 0 && 'font-bold text-erro-600',
    )}>
      {children}
    </td>
  );
}
