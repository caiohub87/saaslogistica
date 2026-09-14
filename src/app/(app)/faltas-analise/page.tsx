'use client';

import {
  CalendarRange, Check, ChartColumnBig, Clock, Download, Loader2, PackageMinus, PackagePlus,
  RotateCcw, Truck, User, Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Ranking } from '@/components/faltas/Ranking';
import { GraficoArea, type PontoArea } from '@/components/layout/GraficoArea';
import {
  aplicar, comOutros, filtroVazio, fmtNum, fmtPct, pct, porAjudante, porLote, porMes,
  porMotorista, porPlaca, porProduto, resumir, type Filtro,
} from '@/lib/analiseFaltas';
import { conferida, fmtData, produtosDe, produtoTexto } from '@/lib/ocorrencias';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import type { Ocorrencia, TipoOcorrencia } from '@/types/database';
import { cn } from '@/utils/cn';

/** Quantas fatias cabem num card antes de a cauda virar "Outros". */
const TOPO = 8;

/**
 * Análise de faltas e sobras.
 *
 * Só leitura: nada aqui grava. A tela responde "quem e o quê aparecem mais",
 * que é uma pergunta de conferência — por isso ela mostra a mesma base da tela
 * de registro, sem cópia própria.
 *
 * Os filtros ficam numa linha só, ACIMA de tudo, e valem para a página
 * inteira. Filtro dentro de card faz cada gráfico responder a um recorte
 * diferente, e dois números que não podem ser comparados acabam lado a lado.
 */
export default function AnaliseFaltasPage() {
  const { pode, demo } = useSessao();
  const podeExportar = pode('faltasanalise', 'exportar');

  const [itens, setItens] = useState<Ocorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [f, setF] = useState<Filtro>(() => filtroVazio('falta'));
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    if (demo) {
      const { ocorrenciasDemo } = await import('@/lib/demo');
      setItens([...ocorrenciasDemo('falta'), ...ocorrenciasDemo('sobra')]);
      setErro(null); setCarregando(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }
    // a foto pesa e não entra em conta nenhuma: fica de fora da consulta
    const { data, error } = await sb.from('ocorrencias')
      .select('id,unidade,tipo,data,lote,produtos,produto,embalagem,descricao,quantidade,'
        + 'motorista,ajudantes,placa,obs,registrado_por,aprovado_por,aprovado_em,'
        + 'validado_por,validado_em,criado_em')
      .order('data', { ascending: false }).limit(5000);
    if (error) {
      setErro(error.message
        + (/permission|policy|row-level/i.test(error.message)
          ? ' — esta tela lê os mesmos registros da tela de Faltas e sobras, então'
            + ' também depende da permissão Ver dela.'
          : ''));
      setItens([]);
    } else {
      setItens((data ?? []) as Ocorrencia[]);
      setErro(null);
    }
    setCarregando(false);
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const doTipo = useMemo(() => itens.filter((o) => o.tipo === f.tipo), [itens, f.tipo]);
  const filtrados = useMemo(() => aplicar(itens, f), [itens, f]);

  // as opções saem do que existe NAQUELE tipo, não do filtro aplicado: uma lista
  // que encolhe conforme a própria escolha impede desfazer o filtro
  const motoristas = useMemo(
    () => [...new Set(doTipo.map((o) => o.motorista).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [doTipo],
  );
  const placas = useMemo(
    () => [...new Set(doTipo.map((o) => o.placa).filter(Boolean))].sort() as string[],
    [doTipo],
  );

  const r = useMemo(() => resumir(filtrados), [filtrados]);
  const meses = useMemo(() => porMes(filtrados), [filtrados]);
  const serie: PontoArea[] = meses.map((m) => ({ rotulo: m.rotulo, valor: m.itens }));

  const rkMotorista = useMemo(() => comOutros(porMotorista(filtrados), TOPO), [filtrados]);
  const rkPlaca = useMemo(() => comOutros(porPlaca(filtrados), TOPO), [filtrados]);
  const rkProduto = useMemo(() => comOutros(porProduto(filtrados), TOPO), [filtrados]);
  const rkAjudante = useMemo(() => comOutros(porAjudante(filtrados), TOPO), [filtrados]);
  /**
   * Só os lotes que aparecem MAIS DE UMA VEZ.
   *
   * Cada carregamento normalmente dá no máximo uma ocorrência, então o ranking
   * cru vira uma fila de empates em 1 com quase tudo caindo em "Outros" — um
   * gráfico que não diz nada. O sinal aqui é a repetição: o mesmo lote voltando
   * é que merece ser olhado.
   */
  const rkLote = useMemo(
    () => comOutros(porLote(filtrados).filter((f) => f.itens > 1), TOPO),
    [filtrados],
  );

  const eFalta = f.tipo === 'falta';
  const nome = eFalta ? 'falta' : 'sobra';
  const rotuloConferida = eFalta ? 'Aprovadas' : 'Validadas';

  function periodo(dias: number) {
    const ate = new Date();
    const de = new Date();
    de.setDate(de.getDate() - dias);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setF((x) => ({ ...x, ini: iso(de), fim: iso(ate) }));
  }

  async function exportar() {
    setExportando(true);
    try {
      const XLSX = await import('xlsx');
      const linhas = filtrados.map((o) => ({
        Data: fmtData(o.data),
        Tipo: o.tipo,
        Lote: o.lote,
        Motorista: o.motorista,
        Ajudantes: (o.ajudantes ?? []).join(', '),
        Placa: o.placa ?? '',
        Produtos: produtosDe(o).map((p) => produtoTexto(p.produto, p.embalagem)).join(' | '),
        Descrições: produtosDe(o).map((p) => p.descricao ?? '').filter(Boolean).join(' | '),
        Quantidade: o.quantidade ?? '',
        Situação: conferida(o) ? rotuloConferida.slice(0, -1) : 'Pendente',
        Conferido_por: (eFalta ? o.aprovado_por : o.validado_por) ?? '',
        Registrado_por: o.registrado_por ?? '',
        Observação: o.obs ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(linhas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, eFalta ? 'Faltas' : 'Sobras');
      XLSX.writeFile(wb, `${nome}s-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  if (!pode('faltasanalise', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver a análise de faltas.</p>
      </div>
    );
  }

  const semFiltro = !f.ini && !f.fim && !f.motorista && !f.placa;

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <ChartColumnBig aria-hidden className="size-5 text-marinho-500" />
            Análise de {nome}s
          </h1>
          <p className="mt-1 text-sm txt-fraco">
            Quem e o quê aparecem mais — por motorista, veículo, produto e ajudante.
          </p>
        </div>
        {podeExportar && filtrados.length > 0 && (
          <button
            type="button" onClick={() => void exportar()} disabled={exportando}
            className="flex items-center gap-1.5 rounded-xl border borda px-3 py-2 text-[13px] font-semibold txt-fraco disabled:opacity-50"
          >
            {exportando ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Download aria-hidden className="size-3.5" />}
            Exportar Excel
          </button>
        )}
      </header>

      {/* ---------------- filtros: uma linha, valem para a página toda ---------------- */}
      <section className="painel sombra mb-4 rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {([['falta', 'Faltas', PackageMinus], ['sobra', 'Sobras', PackagePlus]] as const).map(
              ([id, rot, Icone]) => (
                <button
                  key={id} type="button"
                  onClick={() => setF((x) => ({ ...filtroVazio(id as TipoOcorrencia), ini: x.ini, fim: x.fim }))}
                  aria-pressed={f.tipo === id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors',
                    f.tipo === id ? 'bg-marinho-800 text-white' : 'painel-2 txt-fraco hover:bg-marinho-50',
                  )}
                >
                  <Icone aria-hidden className="size-3.5" />
                  {rot}
                </button>
              ),
            )}
          </div>

          <span className="mx-1 h-6 w-px shrink-0" style={{ background: 'var(--borda)' }} />

          <CalendarRange aria-hidden className="size-4 shrink-0 txt-fraco" />
          <input
            type="date" value={f.ini} onChange={(e) => setF((x) => ({ ...x, ini: e.target.value }))}
            aria-label="Data inicial"
            className="painel-2 rounded-lg border borda px-2 py-1.5 text-[12.5px]"
          />
          <span className="text-[12px] txt-fraco">até</span>
          <input
            type="date" value={f.fim} onChange={(e) => setF((x) => ({ ...x, fim: e.target.value }))}
            aria-label="Data final"
            className="painel-2 rounded-lg border borda px-2 py-1.5 text-[12.5px]"
          />
          {[30, 90, 365].map((d) => (
            <button
              key={d} type="button" onClick={() => periodo(d)}
              className="rounded-lg border borda px-2 py-1 text-[11.5px] font-semibold txt-fraco hover:bg-marinho-50"
            >
              {d === 365 ? '12 meses' : `${d} dias`}
            </button>
          ))}

          <select
            value={f.motorista} onChange={(e) => setF((x) => ({ ...x, motorista: e.target.value }))}
            aria-label="Motorista"
            className="painel-2 max-w-48 rounded-lg border borda px-2 py-1.5 text-[12.5px]"
          >
            <option value="">Todos motoristas</option>
            {motoristas.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={f.placa} onChange={(e) => setF((x) => ({ ...x, placa: e.target.value }))}
            aria-label="Placa"
            className="painel-2 rounded-lg border borda px-2 py-1.5 text-[12.5px]"
          >
            <option value="">Todas as placas</option>
            {placas.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          {!semFiltro && (
            <button
              type="button" onClick={() => setF(filtroVazio(f.tipo))}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-marinho-500"
            >
              <RotateCcw aria-hidden className="size-3.5" /> Limpar
            </button>
          )}
          <span className="ml-auto text-[12px] txt-fraco">
            {fmtNum(filtrados.length)} de {fmtNum(doTipo.length)} {nome}(s)
          </span>
        </div>
      </section>

      {erro && <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm font-semibold text-erro-600">{erro}</p>}

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" /></div>
      ) : !filtrados.length ? (
        <div className="painel sombra rounded-2xl p-10 text-center">
          <ChartColumnBig aria-hidden className="mx-auto mb-3 size-8 txt-fraco" />
          <p className="text-[15px] font-semibold">Nada no período</p>
          <p className="mt-1 text-sm txt-fraco">
            {doTipo.length
              ? 'Nenhuma ocorrência com estes filtros. Tente limpar o período.'
              : `Nenhuma ${nome} registrada ainda. Elas entram pela tela de Faltas e sobras.`}
          </p>
        </div>
      ) : (
        <>
          {/* ---------------- os números de topo ---------------- */}
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Tile rotulo={`${nome}s no período`} valor={fmtNum(r.itens)} destaque
              nota={r.porMesMedia != null ? `${fmtNum(r.porMesMedia)} por mês` : undefined} />
            <Tile rotulo="Produtos envolvidos" valor={fmtNum(r.produtos)} Icone={PackageMinus} />
            <Tile rotulo="Motoristas" valor={fmtNum(r.motoristas)} Icone={User} />
            <Tile rotulo="Veículos" valor={fmtNum(r.placas)} Icone={Truck} />
            {/* situação usa token de estado, com ícone e rótulo — nunca cor sozinha */}
            <Tile
              rotulo="Aguardando conferência"
              valor={fmtNum(r.pendentes)}
              nota={`${fmtPct(pct(r.conferidas, r.itens))} ${rotuloConferida.toLowerCase()}`}
              Icone={r.pendentes ? Clock : Check}
              estado={r.pendentes ? 'pendente' : 'ok'}
            />
          </div>

          {/* ---------------- evolução ---------------- */}
          <section className="painel sombra mb-4 rounded-2xl p-4">
            <h2 className="text-[15px] font-bold">{`${nome[0].toUpperCase()}${nome.slice(1)}s por mês`}</h2>
            <p className="mb-2 text-[12px] txt-fraco">
              Mês sem ocorrência entra como zero — pular o mês vazio mostraria uma subida que não houve.
            </p>
            <GraficoArea dados={serie} cor="var(--serie)" fmt={(v) => `${fmtNum(v)} ${nome}(s)`} />
          </section>

          {/* ---------------- os rankings ---------------- */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking
              titulo="Por motorista" subtitulo={`quem mais aparece em ${nome}s`}
              fatias={rkMotorista} total={r.itens}
              vazio="Nenhum motorista informado nos registros do período."
            />
            <Ranking
              titulo="Por veículo" subtitulo="pela placa gravada no registro"
              fatias={rkPlaca} total={r.itens}
              vazio="Nenhuma placa informada nos registros do período."
            />
            <Ranking
              titulo="Por produto" subtitulo="em quantas ocorrências o item apareceu"
              fatias={rkProduto} total={r.itens}
              vazio="Nenhum produto informado nos registros do período."
            />
            <Ranking
              titulo="Por ajudante" subtitulo="a mesma ocorrência conta para cada ajudante da rota"
              fatias={rkAjudante} total={r.itens}
              vazio="Nenhum ajudante informado nos registros do período."
            />
            <Ranking
              titulo="Lotes que repetiram" subtitulo="carregamentos com mais de uma ocorrência"
              fatias={rkLote} total={r.itens}
              vazio={`Nenhum lote repetiu no período — cada carregamento deu no máximo uma ${nome}. `
                + 'É o esperado; o alerta seria o contrário.'}
            />
          </div>

          {/* ---------------- tudo, linha a linha ---------------- */}
          <section className="painel sombra mt-4 rounded-2xl p-4">
            <h2 className="mb-1 text-[15px] font-bold">Registros do período</h2>
            <p className="mb-3 text-[12px] txt-fraco">
              {fmtNum(filtrados.length)} {nome}(s) — a base por trás de todos os gráficos acima.
            </p>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead className="sticky top-0 painel-2">
                  <tr className="text-left">
                    {['Data', 'Lote', 'Motorista', 'Placa', 'Produtos', 'Situação'].map((h) => (
                      <th key={h} className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide txt-fraco">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((o) => {
                    const ps = produtosDe(o);
                    const ok = conferida(o);
                    return (
                      <tr key={o.id} className="border-b borda">
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{fmtData(o.data)}</td>
                        <td className="px-2 py-1.5 tabular-nums txt-fraco">{o.lote}</td>
                        <td className="px-2 py-1.5">{o.motorista || <span className="txt-fraco">—</span>}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 txt-fraco">{o.placa ?? '—'}</td>
                        <td className="px-2 py-1.5">
                          {ps.length
                            ? ps.map((p) => p.descricao || produtoTexto(p.produto, p.embalagem)).join(' · ')
                            : <span className="txt-fraco">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <span className={cn('inline-flex items-center gap-1 text-[11.5px] font-bold',
                            ok ? 'text-ok-600' : 'text-ouro-700')}>
                            {ok ? <Check aria-hidden className="size-3" /> : <Clock aria-hidden className="size-3" />}
                            {ok ? rotuloConferida.slice(0, -1) : 'Pendente'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * Um número de topo.
 *
 * O valor grande NÃO usa tabular-nums: em corpo grande, dígitos de largura
 * igual abrem buracos em volta do 1.
 */
function Tile({ rotulo, valor, nota, Icone, destaque, estado }: {
  rotulo: string; valor: string; nota?: string;
  Icone?: typeof Users; destaque?: boolean;
  estado?: 'ok' | 'pendente';
}) {
  return (
    <div className="painel sombra rounded-2xl px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide txt-fraco">
        {Icone && <Icone aria-hidden className="size-3" />}
        {rotulo}
      </p>
      <p className={cn('mt-1 text-[26px] font-bold leading-none',
        estado === 'ok' && 'text-ok-600',
        estado === 'pendente' && 'text-ouro-700',
        destaque && !estado && 'text-marinho-500')}>
        {valor}
      </p>
      {nota && <p className="mt-1 text-[11.5px] txt-fraco">{nota}</p>}
    </div>
  );
}
