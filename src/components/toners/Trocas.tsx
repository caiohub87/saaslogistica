'use client';

import { Loader2, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { fmtData, fmtDias, hojeISO, type TrocaComDuracao } from '@/lib/toners';
import type { Impressora, Sala } from '@/types/database';
import { cn } from '@/utils/cn';

export interface FormTroca {
  impressora_id: number;
  toner: string;
  data: string;
  obs: string | null;
}

/**
 * Registrar a troca e ver o histórico.
 *
 * A duração aparece na própria linha porque é a razão de existir da tela: o
 * número que interessa não é "trocou dia tal", é "durou tanto". A troca mais
 * recente de cada impressora não tem duração — está em uso, e mostrar os dias
 * corridos como se fosse o total a faria parecer encerrada.
 */
export function Trocas({
  trocas, salas, impressoras, podeLancar, podeExcluir, salvando, ocupado,
  aoRegistrar, aoExcluir,
}: {
  trocas: TrocaComDuracao[];
  salas: Sala[];
  impressoras: Impressora[];
  podeLancar: boolean;
  podeExcluir: boolean;
  salvando: boolean;
  ocupado: number | null;
  aoRegistrar: (f: FormTroca) => Promise<void>;
  aoExcluir: (t: TrocaComDuracao) => Promise<void>;
}) {
  const [impressoraId, setImpressoraId] = useState('');
  const [toner, setToner] = useState('');
  const [data, setData] = useState(hojeISO);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [salaFiltro, setSalaFiltro] = useState('');

  const salaPorId = useMemo(() => new Map(salas.map((s) => [s.id, s])), [salas]);
  const impPorId = useMemo(() => new Map(impressoras.map((i) => [i.id, i])), [impressoras]);
  const ativas = useMemo(() => impressoras.filter((i) => i.ativo), [impressoras]);

  /** Impressoras agrupadas por sala — é assim que quem troca procura a máquina. */
  const porSala = useMemo(() => {
    const g = new Map<number, Impressora[]>();
    ativas.forEach((i) => {
      const l = g.get(i.sala_id);
      if (l) l.push(i); else g.set(i.sala_id, [i]);
    });
    return [...g.entries()]
      .map(([id, lista]) => ({ sala: salaPorId.get(id), lista }))
      .filter((x) => x.sala?.ativo)
      .sort((a, b) => (a.sala!.nome).localeCompare(b.sala!.nome, 'pt-BR'));
  }, [ativas, salaPorId]);

  const escolhida = impressoraId ? impPorId.get(Number(impressoraId)) : undefined;

  /**
   * Escolher a máquina já preenche o toner que ela usa — continua editável,
   * porque na prática se coloca o que tem em estoque.
   *
   * Feito aqui, na ação, e não num efeito que observa a impressora: o efeito
   * reescreveria o campo a cada renderização em que a referência mudasse,
   * apagando o que a pessoa tivesse acabado de digitar.
   */
  function escolherImpressora(valor: string) {
    setImpressoraId(valor);
    const imp = valor ? impPorId.get(Number(valor)) : undefined;
    if (imp?.toner_padrao) setToner(imp.toner_padrao);
  }

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return trocas
      .filter((t) => {
        if (!salaFiltro) return true;
        return impPorId.get(t.impressora_id)?.sala_id === Number(salaFiltro);
      })
      .filter((t) => {
        if (!q) return true;
        const imp = impPorId.get(t.impressora_id);
        const sala = imp ? salaPorId.get(imp.sala_id) : undefined;
        return [t.toner, imp?.nome, imp?.modelo, sala?.nome, t.registrado_por]
          .some((x) => (x ?? '').toLowerCase().includes(q));
      })
      .sort((a, b) => (a.data === b.data ? b.id - a.id : (a.data < b.data ? 1 : -1)));
  }, [trocas, busca, salaFiltro, impPorId, salaPorId]);

  async function registrar() {
    setErro(null);
    if (!impressoraId) { setErro('Escolha a impressora que recebeu o toner.'); return; }
    const t = toner.trim();
    if (!t) { setErro('Informe qual toner foi destinado.'); return; }
    if (!data) { setErro('Informe a data da troca.'); return; }
    await aoRegistrar({ impressora_id: Number(impressoraId), toner: t, data, obs: obs.trim() || null });
    setObs('');
  }

  if (!ativas.length) {
    return (
      <div className="painel sombra rounded-2xl p-10 text-center">
        <Printer aria-hidden className="mx-auto mb-3 size-8 txt-fraco" />
        <p className="text-[15px] font-semibold">Nenhuma impressora cadastrada</p>
        <p className="mx-auto mt-1 max-w-md text-sm txt-fraco">
          Cadastre as salas e as impressoras de cada uma na aba <b>Salas e impressoras</b>.
          Só então dá para dizer para onde o toner foi.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* ---------------- registrar ---------------- */}
      <section className="painel sombra h-fit rounded-2xl p-4 lg:sticky lg:top-24">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
          <Plus aria-hidden className="size-4.5 text-marinho-500" />
          Registrar troca
        </h2>

        <label htmlFor="imp" className="mb-1 block text-[12.5px] font-semibold">Impressora</label>
        <select
          id="imp" value={impressoraId} onChange={(e) => escolherImpressora(e.target.value)}
          className="painel-2 mb-3 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
        >
          <option value="">Escolha a sala e a máquina…</option>
          {porSala.map(({ sala, lista: imps }) => (
            <optgroup key={sala!.id} label={sala!.nome}>
              {imps.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}{i.modelo ? ` · ${i.modelo}` : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <label htmlFor="toner" className="mb-1 block text-[12.5px] font-semibold">
          Toner destinado
          {escolhida?.toner_padrao && (
            <span className="font-normal txt-fraco"> — o padrão dela já veio preenchido</span>
          )}
        </label>
        <input
          id="toner" value={toner} onChange={(e) => setToner(e.target.value)}
          placeholder="ex.: HP CF226A"
          className="painel-2 mb-3 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
        />

        <label htmlFor="dt" className="mb-1 block text-[12.5px] font-semibold">Data da troca</label>
        <input
          id="dt" type="date" value={data} onChange={(e) => setData(e.target.value)}
          className="painel-2 mb-3 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
        />

        <label htmlFor="obs" className="mb-1 block text-[12.5px] font-semibold">Observação</label>
        <textarea
          id="obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
          placeholder="opcional"
          className="painel-2 mb-3 w-full resize-none rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
        />

        {erro && (
          <p role="alert" className="mb-3 rounded-xl bg-erro-500/10 px-3 py-2 text-[12.5px] font-semibold text-erro-600">
            {erro}
          </p>
        )}
        {!podeLancar && (
          <p className="mb-3 rounded-xl painel-2 px-3 py-2 text-[12px] txt-fraco">
            Você acompanha, mas não tem a permissão <b>Lançar</b> para registrar trocas.
          </p>
        )}

        <button
          type="button" onClick={() => void registrar()} disabled={!podeLancar || salvando}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-marinho-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
          {salvando ? 'Gravando…' : 'Registrar troca'}
        </button>
      </section>

      {/* ---------------- histórico ---------------- */}
      <section className="painel sombra rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold">Histórico</h2>
          <div className="relative min-w-44 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar toner, sala, impressora…"
              className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
            />
          </div>
          <select
            value={salaFiltro} onChange={(e) => setSalaFiltro(e.target.value)}
            className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">Todas as salas</option>
            {salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <span className="text-[12px] txt-fraco">{lista.length} troca(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="painel-2 text-left">
                {['Data', 'Sala', 'Impressora', 'Toner'].map((h) => (
                  <th key={h} className="px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide txt-fraco">{h}</th>
                ))}
                <th className="px-2.5 py-2 text-right text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Durou</th>
                <th className="px-2.5 py-2 text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Quem</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm txt-fraco">
                  {trocas.length ? 'Nada neste filtro.' : 'Nenhuma troca registrada ainda.'}
                </td></tr>
              ) : lista.map((t) => {
                const imp = impPorId.get(t.impressora_id);
                const sala = imp ? salaPorId.get(imp.sala_id) : undefined;
                return (
                  <tr key={t.id} className="border-b borda">
                    <td className="whitespace-nowrap px-2.5 py-2 tabular-nums">{fmtData(t.data)}</td>
                    <td className="px-2.5 py-2">{sala?.nome ?? <span className="txt-fraco">—</span>}</td>
                    <td className="px-2.5 py-2">
                      {imp?.nome ?? <span className="txt-fraco">—</span>}
                      {imp?.modelo && <span className="ml-1.5 text-[11px] txt-fraco">{imp.modelo}</span>}
                    </td>
                    <td className="px-2.5 py-2 font-semibold">{t.toner}</td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right">
                      {t.duracao != null ? (
                        <span className="font-bold tabular-nums">{fmtDias(t.duracao)}</span>
                      ) : (
                        <span className="rounded-md bg-ok-500/15 px-2 py-0.5 text-[11px] font-bold text-ok-600">
                          {/* "há hoje" não é português; colocado hoje pede outra frase */}
                          {t.emUsoHa === 0 ? 'em uso desde hoje' : `em uso há ${fmtDias(t.emUsoHa)}`}
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-[11.5px] txt-fraco">{t.registrado_por ?? '—'}</td>
                    <td className="px-1 py-2">
                      {ocupado === t.id ? (
                        <Loader2 aria-hidden className="size-3.5 animate-spin text-marinho-500" />
                      ) : podeExcluir && (
                        <button
                          type="button" onClick={() => void aoExcluir(t)}
                          aria-label={`Excluir a troca de ${fmtData(t.data)}`}
                          className={cn('rounded p-1 text-erro-500 hover:bg-erro-500/10')}
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
