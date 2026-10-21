'use client';

import { FileDown, Loader2, Printer, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  baixarPrestacaoExcel, imprimirPrestacao, limitesDoMes, montarPrestacao, nomeDoPeriodo,
} from '@/lib/prestacaoToners';
import { hojeISO, type TrocaComDuracao } from '@/lib/toners';
import type { Impressora, Sala } from '@/types/database';

/**
 * Escolhe o período da prestação: o mês primeiro, e os dias dentro dele se a
 * conta não fechar no mês cheio. Mostra o resumo antes de gerar, para quem
 * presta conta conferir o número com o estoque.
 */
export function PrestarContas({
  trocas, salas, impressoras, unidade, responsavel, aoFechar,
}: {
  trocas: TrocaComDuracao[];
  salas: Sala[];
  impressoras: Impressora[];
  unidade: string;
  responsavel: string;
  aoFechar: () => void;
}) {
  const [mes, setMes] = useState(() => hojeISO().slice(0, 7));
  const [de, setDe] = useState(() => limitesDoMes(hojeISO().slice(0, 7)).de);
  const [ate, setAte] = useState(() => limitesDoMes(hojeISO().slice(0, 7)).ate);
  const [baixando, setBaixando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  function escolherMes(m: string) {
    if (!m) return;
    setMes(m);
    const l = limitesDoMes(m);
    setDe(l.de); setAte(l.ate);
  }

  const invalido = !de || !ate || de > ate;
  const p = useMemo(
    () => montarPrestacao(trocas, salas, impressoras, de, ate),
    [trocas, salas, impressoras, de, ate],
  );

  async function excel() {
    setBaixando(true);
    try {
      setAviso(`${await baixarPrestacaoExcel(p)} baixado.`);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <section className="painel sombra mb-4 rounded-2xl border-2 border-marinho-500 p-4 motion-safe:animate-surgir">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[15px] font-bold">Prestar contas</h2>
        <button
          type="button" onClick={aoFechar} aria-label="Fechar"
          className="ml-auto rounded-lg p-1 txt-fraco hover:bg-marinho-50"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[12.5px] font-semibold">
          Mês
          <input
            type="month" value={mes} onChange={(e) => escolherMes(e.target.value)}
            className="painel-2 mt-1 block rounded-lg border borda px-2.5 py-1.5 text-[12.5px] font-normal"
          />
        </label>
        <label className="text-[12.5px] font-semibold">
          De
          <input
            type="date" value={de} onChange={(e) => setDe(e.target.value)}
            className="painel-2 mt-1 block rounded-lg border borda px-2.5 py-1.5 text-[12.5px] font-normal"
          />
        </label>
        <label className="text-[12.5px] font-semibold">
          Até
          <input
            type="date" value={ate} onChange={(e) => setAte(e.target.value)}
            className="painel-2 mt-1 block rounded-lg border borda px-2.5 py-1.5 text-[12.5px] font-normal"
          />
        </label>
        <p className="pb-2 text-[11.5px] txt-fraco">
          O mês preenche os dias; ajuste-os se a conta não for do mês inteiro.
        </p>
      </div>

      {invalido ? (
        <p role="alert" className="mt-3 rounded-xl bg-erro-500/10 px-3 py-2 text-[12.5px] font-semibold text-erro-600">
          A data inicial precisa ser igual ou anterior à final.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-[140px_1fr_1fr]">
            <div className="rounded-xl border borda px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide txt-fraco">Toners trocados</p>
              <p className="text-[24px] font-bold text-marinho-500">{p.linhas.length}</p>
              <p className="text-[11px] txt-fraco">{nomeDoPeriodo(de, ate)}</p>
            </div>
            <Resumo titulo="Por toner" itens={p.porToner.map((t) => [t.toner, t.qtd])} />
            <Resumo titulo="Por sala" itens={p.porSala.map((s) => [s.sala, s.qtd])} />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button" onClick={() => imprimirPrestacao(p, unidade, responsavel)}
              className="flex items-center gap-1.5 rounded-lg bg-marinho-800 px-3 py-2 text-[12.5px] font-semibold text-white"
            >
              <Printer aria-hidden className="size-4" /> Imprimir prestação
            </button>
            <button
              type="button" onClick={() => void excel()} disabled={baixando}
              className="flex items-center gap-1.5 rounded-lg border borda px-3 py-2 text-[12.5px] font-semibold disabled:opacity-60"
            >
              {baixando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileDown aria-hidden className="size-4" />}
              Baixar Excel
            </button>
            {aviso && <span className="text-[12px] font-semibold text-ok-600">{aviso}</span>}
          </div>
        </>
      )}
    </section>
  );
}

function Resumo({ titulo, itens }: { titulo: string; itens: [string, number][] }) {
  return (
    <div className="rounded-xl border borda px-3 py-2">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide txt-fraco">{titulo}</p>
      {itens.length ? (
        <ul className="max-h-28 overflow-y-auto text-[12.5px]">
          {itens.map(([nome, qtd]) => (
            <li key={nome} className="flex justify-between gap-2 border-b borda py-0.5 last:border-0">
              <span>{nome}</span><b className="tabular-nums">{qtd}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] txt-fraco">Nenhuma troca no período.</p>
      )}
    </div>
  );
}
