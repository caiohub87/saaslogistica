'use client';

import { AlertTriangle, FileText, Loader2, PackageCheck, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Categoria } from '@/lib/produtividade';
import {
  chaveDe, fmtBRL, fmtPeso, hojeISO, paraReentrega, resumir,
} from '@/lib/reentregas';
import { useRelatorio } from '@/providers/RelatorioProvider';
import type { Reentrega } from '@/types/database';
import { cn } from '@/utils/cn';

/** Cor do selo de situação — a mesma leitura da lista de ocorrências. */
const CAT_COR: Record<Categoria, string> = {
  reentrega: 'bg-ouro-100 text-ouro-700',
  devolvido: 'bg-erro-500/15 text-erro-600',
  pendente: 'painel-2 txt-fraco',
  entregue: 'bg-ok-500/15 text-ok-600',
};

/**
 * 1º passo — monta a solicitação a partir do relatório de entregas.
 *
 * A tela mostra o relatório INTEIRO, não só o que o ERP classificou como
 * reentrega: o status nem sempre bate com o que desceu do caminhão, e quem
 * monta o palete olha a mercadoria. As reentregas vêm primeiro na lista e há
 * filtro por situação, para o caso comum continuar sendo o mais rápido.
 *
 * O que dá para contar (clientes, peso, motorista, ajudantes) sai do
 * relatório; o que só quem está no depósito sabe (o lote destinado, quantos
 * paletes, se é lote à parte) é digitado.
 *
 * A base é a MESMA da Análise de Entregas — carregada uma vez, usada pelas
 * duas telas. Por isso aqui não há importação própria: seria uma segunda base
 * para manter em dia.
 */
export function Solicitar({ podeLancar, salvando, aoSalvar }: {
  podeLancar: boolean;
  salvando: boolean;
  /** devolve a solicitação gravada, para a tela oferecer a impressão */
  aoSalvar: (dados: Partial<Reentrega>) => Promise<void>;
}) {
  const { cargas, meta, carregando } = useRelatorio();

  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const [cargaFiltro, setCargaFiltro] = useState('');
  const [catFiltro, setCatFiltro] = useState<Categoria | 'todas'>('todas');
  const [lote, setLote] = useState('');
  const [rota, setRota] = useState('');
  const [paletes, setPaletes] = useState('1');
  const [loteAParte, setLoteAParte] = useState(false);
  const [data, setData] = useState(hojeISO);
  /** vazio quando não há previsão — vira null no banco, não uma data inventada */
  const [prevista, setPrevista] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  /**
   * TODAS as linhas do relatório, não só as classificadas como reentrega.
   *
   * O status vem do ERP e nem sempre bate com o que desceu do caminhão: um
   * pedido marcado "devolvido" pode voltar para o depósito à espera de nova
   * tentativa, e antes ele simplesmente não existia nesta tela. Quem monta o
   * palete olha a mercadoria, não o status — então a tela mostra tudo e deixa
   * a escolha com quem está vendo.
   */
  const disponiveis = useMemo(() => cargas.flatMap((c) => c.peds), [cargas]);

  const cargasDoRelatorio = useMemo(
    () => [...new Set(disponiveis.map((p) => p.carga))].sort(),
    [disponiveis],
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return disponiveis
      .filter((p) => !cargaFiltro || p.carga === cargaFiltro)
      .filter((p) => catFiltro === 'todas' || p.cat === catFiltro)
      .filter((p) => !q || [p.pedido, p.cliente, p.codcli, p.carga, p.motorista]
        .some((x) => (x ?? '').toLowerCase().includes(q)))
      // reentrega primeiro: continua sendo o caso comum, e com o relatório
      // inteiro na tela ela se perderia no meio dos entregues
      .sort((a, b) => {
        const ra = a.cat === 'reentrega', rb = b.cat === 'reentrega';
        return ra === rb ? 0 : ra ? -1 : 1;
      });
  }, [disponiveis, busca, cargaFiltro, catFiltro]);

  const selecionados = useMemo(
    () => disponiveis.filter((p) => marcados.has(chaveDe(p))),
    [disponiveis, marcados],
  );
  const resumo = useMemo(() => resumir(selecionados), [selecionados]);

  const todosDaListaMarcados = lista.length > 0 && lista.every((p) => marcados.has(chaveDe(p)));

  function alternar(chave: string) {
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(chave)) n.delete(chave); else n.add(chave);
      return n;
    });
  }

  function alternarTodos() {
    setMarcados((s) => {
      const n = new Set(s);
      if (todosDaListaMarcados) lista.forEach((p) => n.delete(chaveDe(p)));
      else lista.forEach((p) => n.add(chaveDe(p)));
      return n;
    });
  }

  async function salvar() {
    setErro(null);
    if (!selecionados.length) { setErro('Marque pelo menos um pedido em reentrega.'); return; }
    const lt = lote.trim();
    if (!lt) { setErro('Informe o lote destinado à mercadoria.'); return; }
    const np = Number(paletes);
    if (!Number.isInteger(np) || np < 1) { setErro('A quantidade de paletes precisa ser 1 ou mais.'); return; }
    if (!data) { setErro('Informe o dia em que a mercadoria voltou ao depósito.'); return; }

    await aoSalvar({
      lote: lt,
      paletes: np,
      lote_a_parte: loteAParte,
      clientes: resumo.clientes,
      peso: resumo.peso,
      motorista: resumo.motorista,
      ajudantes: resumo.ajudantes,
      pedidos: selecionados.map(paraReentrega),
      data,
      rota: rota.trim() || null,
      // campo vazio vira null, não '': é a diferença entre "sem previsão" e
      // uma data em branco que o banco recusaria
      data_prevista: prevista || null,
      obs: obs.trim() || null,
    });

    // limpa só o que é da solicitação; os filtros ficam como estavam, porque
    // normalmente se monta um palete atrás do outro do mesmo relatório
    setMarcados(new Set());
    setLote(''); setRota(''); setPaletes('1'); setLoteAParte(false);
    setPrevista(''); setObs('');
  }

  if (carregando) {
    return <div className="flex justify-center py-16"><Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" /></div>;
  }

  if (!meta || !disponiveis.length) {
    return (
      <div className="painel sombra rounded-2xl p-10 text-center">
        <FileText aria-hidden className="mx-auto mb-3 size-8 txt-fraco" />
        <p className="text-[15px] font-semibold">
          {meta ? 'Nenhuma reentrega neste relatório' : 'Nenhum relatório carregado'}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm txt-fraco">
          {meta
            ? `A base de ${meta.arquivo} não tem nenhuma linha com status de reentrega. `
              + 'Se esperava encontrar, confira se importou o relatório do dia certo.'
            : 'A base é a mesma da Análise de Entregas — importe o relatório do Fusion por lá '
              + 'e as reentregas aparecem aqui.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* ---------------- os pedidos em reentrega ---------------- */}
      <section className="painel sombra rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold">Pedidos do relatório</h2>
          <div className="relative min-w-44 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pedido, cliente, carga…"
              className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
            />
          </div>
          <select
            value={catFiltro} onChange={(e) => setCatFiltro(e.target.value as typeof catFiltro)}
            aria-label="Situação no relatório"
            className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="todas">Todas as situações</option>
            <option value="reentrega">Reentrega</option>
            <option value="devolvido">Devolvido</option>
            <option value="pendente">Pendente</option>
            <option value="entregue">Entregue</option>
          </select>
          <select
            value={cargaFiltro} onChange={(e) => setCargaFiltro(e.target.value)}
            aria-label="Carga"
            className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="">Todas as cargas</option>
            {cargasDoRelatorio.map((c) => <option key={c} value={c}>Carga {c}</option>)}
          </select>
          <span className="text-[12px] txt-fraco">{lista.length} de {disponiveis.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="painel-2 text-left">
                <th className="w-9 px-2 py-2">
                  <input
                    type="checkbox" checked={todosDaListaMarcados} onChange={alternarTodos}
                    aria-label="Marcar todos os pedidos da lista"
                    className="size-3.5 accent-marinho-800"
                  />
                </th>
                {['Pedido', 'Cliente', 'Situação', 'Carga', 'Motivo'].map((h) => (
                  <th key={h} className="px-2 py-2 text-[10.5px] font-bold uppercase tracking-wide txt-fraco">{h}</th>
                ))}
                <th className="px-2 py-2 text-right text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Peso</th>
                <th className="px-2 py-2 text-right text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-sm txt-fraco">Nada neste filtro.</td></tr>
              ) : lista.map((p) => {
                const k = chaveDe(p);
                const on = marcados.has(k);
                return (
                  <tr
                    key={k} onClick={() => alternar(k)}
                    className={cn('cursor-pointer border-b borda hover:bg-marinho-50/60', on && 'bg-marinho-50/60')}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox" checked={on} onChange={() => alternar(k)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Marcar o pedido ${p.pedido}`}
                        className="size-3.5 accent-marinho-800"
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-semibold tabular-nums">{p.pedido || '—'}</td>
                    <td className="px-2 py-1.5">
                      {p.cliente || '—'}
                      <span className="ml-1.5 text-[11px] txt-fraco">{p.codcli}</span>
                    </td>
                    <td className="px-2 py-1.5">
                      {/* o que o ERP disse — quem marca decide se concorda */}
                      <span className={cn(
                        'whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase',
                        CAT_COR[p.cat],
                      )}>
                        {p.cat}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 txt-fraco">{p.carga}</td>
                    <td className="px-2 py-1.5 text-[11.5px] txt-fraco">{p.motivo || '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{fmtPeso(p.peso)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{fmtBRL(p.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- o que a pessoa informa ---------------- */}
      <section className="painel sombra h-fit rounded-2xl p-4 lg:sticky lg:top-24">
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
          <PackageCheck aria-hidden className="size-4.5 text-marinho-500" />
          Solicitação
        </h2>

        <div className="mb-3 grid grid-cols-3 gap-2">
          <Caixa rotulo="Clientes" valor={String(resumo.clientes)} />
          <Caixa rotulo="Pedidos" valor={String(resumo.pedidos)} />
          <Caixa rotulo="Peso kg" valor={fmtPeso(resumo.peso)} />
        </div>

        <div className="mb-3 rounded-xl painel-2 px-3 py-2 text-[12px]">
          <p><span className="txt-fraco">Motorista:</span> <b>{resumo.motorista || '—'}</b></p>
          <p className="mt-0.5">
            <span className="txt-fraco">Ajudante(s):</span>{' '}
            {resumo.ajudantes.length ? resumo.ajudantes.join(', ') : '—'}
          </p>
        </div>

        {/* a equipe sai do primeiro pedido marcado: com mais de uma carga ela
            deixa de ser uma só, e quem monta precisa saber disso */}
        {resumo.cargas.length > 1 && (
          <p className="mb-3 flex gap-2 rounded-xl bg-ouro-100 px-3 py-2 text-[11.5px] text-ouro-700">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              A seleção mistura as cargas {resumo.cargas.join(', ')}. Motorista e ajudantes ficam os
              da carga {resumo.cargas[0]} — confira se é isso mesmo.
            </span>
          </p>
        )}

        <label htmlFor="lote" className="mb-1 block text-[12.5px] font-semibold">
          Lote destinado <span className="font-normal txt-fraco">— o do depósito, não o da carga</span>
        </label>
        <input
          id="lote" value={lote} onChange={(e) => setLote(e.target.value)}
          placeholder="ex.: 96712"
          className="painel-2 mb-3 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
        />

        <label htmlFor="rota" className="mb-1 block text-[12.5px] font-semibold">
          Rota <span className="font-normal txt-fraco">— a praça ou cliente que aparece grande no cartaz</span>
        </label>
        <input
          id="rota" value={rota} onChange={(e) => setRota(e.target.value)}
          placeholder="ex.: ABREU/IGARASSU — QUARTA-FEIRA"
          className="painel-2 mb-3 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
        />

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="paletes" className="mb-1 block text-[12.5px] font-semibold">Paletes</label>
            <input
              id="paletes" type="number" min={1} value={paletes}
              onChange={(e) => setPaletes(e.target.value)}
              className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
            />
          </div>
          <div>
            <label htmlFor="data" className="mb-1 block text-[12.5px] font-semibold">Voltou em</label>
            <input
              id="data" type="date" value={data} onChange={(e) => setData(e.target.value)}
              className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
            />
          </div>
        </div>

        <label htmlFor="prevista" className="mb-1 block text-[12.5px] font-semibold">
          Previsão de saída <span className="font-normal txt-fraco">— opcional</span>
        </label>
        <input
          id="prevista" type="date" value={prevista} onChange={(e) => setPrevista(e.target.value)}
          className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
        />
        <p className="mb-3 mt-1 text-[11.5px] txt-fraco">
          Deixe em branco quando o palete fica no depósito sem margem de retorno — o cartaz
          simplesmente não mostra esse bloco.
        </p>

        <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-xl border borda px-3 py-2">
          <input
            type="checkbox" checked={loteAParte} onChange={(e) => setLoteAParte(e.target.checked)}
            className="mt-0.5 size-3.5 accent-marinho-800"
          />
          <span className="text-[12.5px]">
            <b>Lote à parte</b>
            <span className="block text-[11.5px] txt-fraco">
              O pedido fica no depósito para ser enviado noutro dia.
            </span>
          </span>
        </label>

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
            Você pode consultar, mas não tem a permissão <b>Lançar</b> para abrir solicitações.
          </p>
        )}

        <button
          type="button" onClick={() => void salvar()}
          disabled={!podeLancar || salvando || !selecionados.length}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-marinho-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <PackageCheck aria-hidden className="size-4" />}
          {salvando ? 'Enviando…' : 'Enviar solicitação'}
        </button>
        <p className="mt-2 text-center text-[11px] txt-fraco">
          Ao enviar, o documento do palete abre para impressão.
        </p>
      </section>
    </div>
  );
}

function Caixa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border borda px-2 py-1.5 text-center">
      <p className="text-[9.5px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      <p className="mt-0.5 text-[17px] font-bold tabular-nums">{valor}</p>
    </div>
  );
}
