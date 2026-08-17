'use client';

import {
  BarChart3, ChevronDown, ChevronRight, FileUp, Loader2, Search, Trash2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import {
  agregarPedidos, fmtKg, fmtPct, type AgregadoPedidos, type Carga,
} from '@/lib/produtividade';
import { lerRelatorio } from '@/lib/relatorio';
import { useRelatorio } from '@/providers/RelatorioProvider';
import { useSessao } from '@/providers/SessionProvider';
import type { Pedido } from '@/types/relatorio';
import { cn } from '@/utils/cn';

const fmtBRL = (n: number) =>
  'R$ ' + (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COR_CAT: Record<string, string> = {
  entregue: 'bg-ok-500/15 text-ok-600',
  reentrega: 'bg-ouro-100 text-ouro-700',
  devolvido: 'bg-erro-500/15 text-erro-600',
  pendente: 'bg-marinho-100 text-marinho-800',
};

type Chave = 'carga' | 'motorista' | 'rota' | 'ped' | 'ent' | 'reent' | 'dev' | 'pend'
  | 'peso' | 'valor' | 'vprob' | 'pent';

interface Linha { c: Carga; fp: Pedido[]; a: AgregadoPedidos }

export default function AnalisePage() {
  const { pode } = useSessao();
  const { cargas, meta, carregando, definirRelatorio, limpar } = useRelatorio();
  const podeImportar = pode('analise', 'importar');

  const [busca, setBusca] = useState('');
  const [motorista, setMotorista] = useState('');
  const [rota, setRota] = useState('');
  const [statusFora, setStatusFora] = useState<Set<string>>(new Set()); // status DESmarcados
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<{ k: Chave; dir: 1 | -1 }>({ k: 'carga', dir: 1 });
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  const motoristas = useMemo(
    () => [...new Set(cargas.map((c) => c.motorista).filter(Boolean))].sort(), [cargas],
  );
  const rotas = useMemo(
    () => [...new Set(cargas.map((c) => c.rota).filter(Boolean))].sort(), [cargas],
  );

  /** Cargas dentro dos filtros de busca/motorista/rota — o escopo dos contadores. */
  const escopo = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cargas
      .filter((c) => !motorista || c.motorista === motorista)
      .filter((c) => !rota || c.rota === rota)
      .filter((c) => !q || [c.id, c.motorista, c.rota].some((x) => (x ?? '').toLowerCase().includes(q)));
  }, [cargas, busca, motorista, rota]);

  /** Contadores de status refletem o escopo atual, como no sistema antigo. */
  const statusNoEscopo = useMemo(() => {
    const m: Record<string, { stl: string; rotulo: string; cat: string; n: number }> = {};
    escopo.forEach((c) => c.peds.forEach((p) => {
      (m[p.stl] ??= { stl: p.stl, rotulo: p.status, cat: p.cat, n: 0 }).n++;
    }));
    return Object.values(m).sort((a, b) => b.n - a.n);
  }, [escopo]);

  const ligado = (stl: string) => !statusFora.has(stl);
  const todosLigados = statusNoEscopo.every((s) => ligado(s.stl));

  function alternarStatus(stl: string) {
    setStatusFora((fora) => {
      const n = new Set(fora);
      // 1º clique com tudo ligado: isola esse status
      if (n.size === 0) { statusNoEscopo.forEach((s) => { if (s.stl !== stl) n.add(s.stl); }); return n; }
      // clicar de novo no único ligado: volta a todos
      const ligados = statusNoEscopo.filter((s) => !n.has(s.stl));
      if (ligados.length === 1 && ligados[0].stl === stl) return new Set();
      if (n.has(stl)) n.delete(stl); else n.add(stl);
      return n;
    });
  }

  /** Cada carga com os pedidos dos status marcados; totais recalculados. */
  const linhas = useMemo<Linha[]>(() => {
    const out: Linha[] = [];
    escopo.forEach((c) => {
      const fp = c.peds.filter((p) => ligado(p.stl));
      if (fp.length) out.push({ c, fp, a: agregarPedidos(fp) });
    });
    const val = (l: Linha): string | number => {
      switch (ordem.k) {
        case 'carga': return l.c.id;
        case 'motorista': return l.c.motorista ?? '';
        case 'rota': return l.c.rota ?? '';
        case 'ped': return l.a.pedidos;
        case 'ent': return l.a.cEnt;
        case 'reent': return l.a.cReent;
        case 'dev': return l.a.cDev;
        case 'pend': return l.a.cPend;
        case 'peso': return l.a.peso;
        case 'valor': return l.a.valor;
        case 'vprob': return l.a.valorProblema;
        case 'pent': return l.a.pctEnt;
      }
    };
    return out.sort((x, y) => {
      const a = val(x), b = val(y);
      const r = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), 'pt-BR', { numeric: true });
      return r * ordem.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escopo, statusFora, ordem]);

  const T = useMemo(() => {
    const t = { ped: 0, ent: 0, reent: 0, dev: 0, pend: 0, peso: 0, valor: 0, vprob: 0 };
    linhas.forEach(({ a }) => {
      t.ped += a.pedidos; t.ent += a.cEnt; t.reent += a.cReent; t.dev += a.cDev;
      t.pend += a.cPend; t.peso += a.peso; t.valor += a.valor; t.vprob += a.valorProblema;
    });
    return t;
  }, [linhas]);

  async function importar(f: File) {
    setLendo(true); setErro(null);
    try {
      const { pedidos, meta: m } = await lerRelatorio(f);
      definirRelatorio(pedidos, m);
      setAbertas(new Set()); setStatusFora(new Set());
    } catch (e) { setErro((e as Error).message); }
    setLendo(false);
  }

  function ordenarPor(k: Chave) {
    setOrdem((o) => (o.k === k ? { k, dir: (o.dir * -1) as 1 | -1 } : { k, dir: 1 }));
  }

  if (!pode('analise', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver a análise de entregas.</p>
      </div>
    );
  }

  const sufixo = todosLigados ? '' : ' (filtro)';

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <BarChart3 aria-hidden className="size-5 text-marinho-500" />
            Análise de Entregas
          </h1>
          <p className="mt-1 text-sm txt-fraco">
            {meta
              ? <>Base de <b>{meta.arquivo}</b> · {meta.pedidos} pedidos · {cargas.length} cargas</>
              : 'Carregue o Relatório de Entregas do Fusion.'}
          </p>
        </div>
        {podeImportar && (
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={() => arquivo.current?.click()} disabled={lendo}
              className="flex items-center gap-2 rounded-xl bg-marinho-800 px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {lendo ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <FileUp aria-hidden className="size-4" />}
              {lendo ? 'Lendo…' : meta ? 'Trocar relatório' : 'Importar relatório'}
            </button>
            {meta && (
              <button
                type="button" onClick={() => { limpar(); setAbertas(new Set()); }}
                className="flex items-center gap-1.5 rounded-xl border borda px-3 py-2 text-[13px] font-semibold txt-fraco"
              >
                <Trash2 aria-hidden className="size-3.5" /> Limpar
              </button>
            )}
            <input
              ref={arquivo} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); e.target.value = ''; }}
            />
          </div>
        )}
      </header>

      {erro && <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm font-semibold text-erro-600">{erro}</p>}

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" /></div>
      ) : !cargas.length ? (
        <div className="painel sombra rounded-2xl p-10 text-center">
          <FileUp aria-hidden className="mx-auto mb-3 size-8 txt-fraco" />
          <p className="text-[15px] font-semibold">Nenhum relatório carregado</p>
          <p className="mt-1 text-sm txt-fraco">
            A mesma base alimenta a Produtividade — carregue uma vez e as duas telas usam.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
            <Caixa rotulo={`Pedidos${sufixo}`} valor={String(T.ped)} />
            <Caixa rotulo={`Peso${sufixo} kg`} valor={fmtKg(T.peso)} destaque />
            <Caixa rotulo="Entregues" valor={String(T.ent)} cor="ok" />
            <Caixa rotulo="Reentregas" valor={String(T.reent)} cor="ouro" />
            <Caixa rotulo="Devoluções" valor={String(T.dev)} cor="erro" />
            <Caixa rotulo="Pendentes" valor={String(T.pend)} cor="marinho" />
            <Caixa rotulo="Valor em reentrega" valor={fmtBRL(T.vprob)} />
          </div>

          <section className="painel sombra rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-52 flex-1">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
                <input
                  value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar carga, motorista, rota…"
                  className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
                />
              </div>
              <select value={motorista} onChange={(e) => setMotorista(e.target.value)}
                className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]">
                <option value="">Todos motoristas</option>
                {motoristas.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={rota} onChange={(e) => setRota(e.target.value)}
                className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]">
                <option value="">Todas rotas</option>
                {rotas.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <span className="text-[12px] txt-fraco">{linhas.length} cargas</span>
            </div>

            {/* pílulas de status: 1º clique isola, clique de novo volta a todos */}
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {statusNoEscopo.map((s) => (
                <button
                  key={s.stl} type="button" onClick={() => alternarStatus(s.stl)}
                  aria-pressed={ligado(s.stl)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors',
                    ligado(s.stl) ? COR_CAT[s.cat] : 'painel-2 txt-fraco opacity-50',
                  )}
                >
                  {s.rotulo} <span className="opacity-70">{s.n}</span>
                </button>
              ))}
              {!todosLigados && (
                <button type="button" onClick={() => setStatusFora(new Set())}
                  className="rounded-lg border borda px-2.5 py-1 text-[12px] font-semibold txt-fraco">
                  Mostrar todos
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="painel-2 text-left">
                    <th className="w-7" />
                    <Th k="carga" ordem={ordem} ao={ordenarPor}>Carga</Th>
                    <Th k="motorista" ordem={ordem} ao={ordenarPor}>Motorista</Th>
                    <Th k="rota" ordem={ordem} ao={ordenarPor}>Rota</Th>
                    <Th k="ped" ordem={ordem} ao={ordenarPor} num>Ped.</Th>
                    <Th k="ent" ordem={ordem} ao={ordenarPor} num>Entr.</Th>
                    <Th k="reent" ordem={ordem} ao={ordenarPor} num>Reent.</Th>
                    <Th k="dev" ordem={ordem} ao={ordenarPor} num>Dev.</Th>
                    <Th k="pend" ordem={ordem} ao={ordenarPor} num>Pend.</Th>
                    <Th k="peso" ordem={ordem} ao={ordenarPor} num>Peso (kg)</Th>
                    <Th k="valor" ordem={ordem} ao={ordenarPor} num>Valor</Th>
                    <Th k="vprob" ordem={ordem} ao={ordenarPor} num>Valor reent.</Th>
                    <Th k="pent" ordem={ordem} ao={ordenarPor} num>%Entr.</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 ? (
                    <tr><td colSpan={13} className="px-3 py-8 text-center text-sm txt-fraco">
                      Nenhuma carga com os status selecionados.
                    </td></tr>
                  ) : linhas.map(({ c, fp, a }) => {
                    const aberta = abertas.has(c.id);
                    return (
                      <Fragmento key={c.id}>
                        <tr
                          onClick={() => setAbertas((s) => {
                            const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n;
                          })}
                          className={cn('cursor-pointer border-b borda hover:bg-marinho-50/60', aberta && 'bg-marinho-50/60')}
                        >
                          <td className="px-2 py-2 txt-fraco">
                            {aberta ? <ChevronDown aria-hidden className="size-3.5" /> : <ChevronRight aria-hidden className="size-3.5" />}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <b>{c.id}</b>
                            {c.placa === 'AGREG' && (
                              <span className="ml-1.5 rounded bg-ouro-100 px-1.5 py-0.5 text-[10px] font-bold text-ouro-700">AGREG</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{c.motorista || <span className="txt-fraco">—</span>}</td>
                          <td className="px-3 py-2 txt-fraco">{c.rota || '—'}</td>
                          <Num>{a.pedidos}</Num>
                          <Num>{a.cEnt || ''}</Num>
                          <Num cor="text-ouro-700">{a.cReent || ''}</Num>
                          <Num cor="text-erro-600">{a.cDev || ''}</Num>
                          <Num cor="text-marinho-500">{a.cPend || ''}</Num>
                          <Num>{fmtKg(a.peso)}</Num>
                          <Num>{fmtBRL(a.valor)}</Num>
                          <Num>{a.valorProblema ? fmtBRL(a.valorProblema) : '—'}</Num>
                          <Num forte>{fmtPct(a.pctEnt)}</Num>
                        </tr>
                        {aberta && (
                          <tr className="border-b borda">
                            <td />
                            <td colSpan={12} className="px-3 pb-3">
                              <Detalhe peds={fp} />
                            </td>
                          </tr>
                        )}
                      </Fragmento>
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

/* ------------------------------------------------------------------ pedaços */

function Fragmento({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Detalhe({ peds }: { peds: Pedido[] }) {
  return (
    <div className="overflow-x-auto rounded-xl painel-2 p-2 motion-safe:animate-surgir">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left">
            {['Pedido', 'Cód. Cliente', 'Cliente', 'Cidade', 'Rota', 'Status', 'Motivo'].map((h) => (
              <th key={h} className="px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-wide txt-fraco">{h}</th>
            ))}
            <th className="px-2 py-1.5 text-right text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Peso</th>
            <th className="px-2 py-1.5 text-right text-[10.5px] font-bold uppercase tracking-wide txt-fraco">Valor</th>
          </tr>
        </thead>
        <tbody>
          {peds.map((p, i) => (
            <tr key={p.pedido + i} className="border-t borda">
              <td className="px-2 py-1.5 txt-fraco">{p.pedido || '—'}</td>
              <td className="px-2 py-1.5 txt-fraco">{p.codcli || '—'}</td>
              <td className="px-2 py-1.5">{p.cliente || '—'}</td>
              <td className="px-2 py-1.5 txt-fraco">{p.cidade || '—'}</td>
              <td className="px-2 py-1.5 txt-fraco">{p.rota || '—'}</td>
              <td className="px-2 py-1.5">
                <span className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-bold', COR_CAT[p.cat])}>
                  {p.status}
                </span>
              </td>
              <td className="px-2 py-1.5 txt-fraco">{p.motivo || '—'}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right">{fmtKg(p.peso)}</td>
              <td className="whitespace-nowrap px-2 py-1.5 text-right">{fmtBRL(p.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, k, ordem, ao, num }: {
  children: React.ReactNode; k: Chave;
  ordem: { k: Chave; dir: 1 | -1 }; ao: (k: Chave) => void; num?: boolean;
}) {
  const ativo = ordem.k === k;
  return (
    <th className={cn('whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wide', num && 'text-right')}>
      <button
        type="button" onClick={() => ao(k)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-wide', ativo ? 'text-marinho-500' : 'txt-fraco')}
      >
        {children}
        {ativo && <span aria-hidden>{ordem.dir === 1 ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}

function Num({ children, cor, forte }: { children: React.ReactNode; cor?: string; forte?: boolean }) {
  return <td className={cn('whitespace-nowrap px-3 py-2 text-right', cor, forte && 'font-bold')}>{children}</td>;
}

function Caixa({ rotulo, valor, cor, destaque }: {
  rotulo: string; valor: string; cor?: 'ok' | 'ouro' | 'erro' | 'marinho'; destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border borda px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      <p className={cn(
        'mt-0.5 text-[19px] font-bold',
        cor === 'ok' && 'text-ok-600',
        cor === 'ouro' && 'text-ouro-700',
        cor === 'erro' && 'text-erro-600',
        cor === 'marinho' && 'text-marinho-500',
        destaque && !cor && 'text-marinho-500',
      )}>
        {valor}
      </p>
    </div>
  );
}
