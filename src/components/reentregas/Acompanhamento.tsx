'use client';

import {
  Camera, Check, ChevronDown, ChevronRight, Loader2, Printer, RotateCcw, Search, Trash2, Undo2,
} from 'lucide-react';
import Image from 'next/image';
import { useMemo, useRef, useState } from 'react';

import { imprimirReentrega } from '@/lib/imprimirReentrega';
import {
  DESFECHO, fmtBRL, fmtData, fmtPeso, fmtQuando, selo, SITUACAO, situacaoDe,
  type SituacaoReentrega,
} from '@/lib/reentregas';
import type { DesfechoReentrega, Reentrega } from '@/types/database';
import { cn } from '@/utils/cn';

type Filtro = 'abertas' | SituacaoReentrega | 'todas';

const FILTROS: { id: Filtro; nome: string }[] = [
  { id: 'abertas', nome: 'Em aberto' },
  { id: 'foto', nome: 'Aguardando foto' },
  { id: 'aprovacao', nome: 'Aguardando aprovação' },
  { id: 'deposito', nome: 'No depósito' },
  { id: 'fechada', nome: 'Finalizadas' },
  { id: 'todas', nome: 'Todas' },
];

/**
 * Passos 2 a 5 — o palete andando.
 *
 * Cada linha mostra só o que a pessoa pode fazer com ela AGORA: sem foto não
 * aparece aprovar, sem aprovação não aparece finalizar. A ordem do fluxo
 * também é conferida no banco, nas funções de transição — aqui é só para não
 * oferecer botão que vai dar erro.
 */
export function Acompanhamento({
  itens, unidade, ocupado, podeFotografar, podeAprovar, podeFinalizar, podeExcluir, podeImprimir,
  aoFotografar, aoAprovar, aoDesaprovar, aoFinalizar, aoReabrir, aoExcluir,
}: {
  itens: Reentrega[];
  unidade: string;
  /** id da solicitação com uma ação em curso */
  ocupado: number | null;
  podeFotografar: boolean;
  podeAprovar: boolean;
  podeFinalizar: boolean;
  podeExcluir: boolean;
  podeImprimir: boolean;
  aoFotografar: (r: Reentrega, arquivo: File) => Promise<void>;
  aoAprovar: (r: Reentrega) => Promise<void>;
  aoDesaprovar: (r: Reentrega) => Promise<void>;
  aoFinalizar: (r: Reentrega, d: DesfechoReentrega) => Promise<void>;
  aoReabrir: (r: Reentrega) => Promise<void>;
  aoExcluir: (r: Reentrega) => Promise<void>;
}) {
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [busca, setBusca] = useState('');
  const [abertas, setAbertas] = useState<Set<number>>(new Set());
  const [fotoAberta, setFotoAberta] = useState<number | null>(null);
  /** de qual solicitação é o seletor de arquivo aberto agora */
  const alvoFoto = useRef<Reentrega | null>(null);
  const inputFoto = useRef<HTMLInputElement>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((r) => {
        const s = situacaoDe(r);
        if (filtro === 'todas') return true;
        if (filtro === 'abertas') return s !== 'fechada';
        return s === filtro;
      })
      .filter((r) => !q || [r.lote, r.motorista, String(r.id)].some((x) => (x ?? '').toLowerCase().includes(q))
        || (r.pedidos ?? []).some((p) => [p.pedido, p.cliente, p.carga].some((x) => (x ?? '').toLowerCase().includes(q))))
      .sort((a, b) => (a.data === b.data ? b.id - a.id : (a.data < b.data ? 1 : -1)));
  }, [itens, filtro, busca]);

  const contar = (f: Filtro) => itens.filter((r) => {
    const s = situacaoDe(r);
    if (f === 'todas') return true;
    if (f === 'abertas') return s !== 'fechada';
    return s === f;
  }).length;

  function escolherFoto(r: Reentrega) {
    alvoFoto.current = r;
    inputFoto.current?.click();
  }

  return (
    <section className="painel sombra rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
          <input
            value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar lote, pedido, cliente, carga, motorista…"
            className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
          />
        </div>
        <span className="text-[12px] txt-fraco">{lista.length} solicitação(ões)</span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id} type="button" onClick={() => setFiltro(f.id)}
            aria-pressed={filtro === f.id}
            className={cn(
              'rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors',
              filtro === f.id ? 'bg-marinho-800 text-white' : 'painel-2 txt-fraco hover:bg-marinho-50',
            )}
          >
            {f.nome} <span className="opacity-70">{contar(f.id)}</span>
          </button>
        ))}
      </div>

      <input
        ref={inputFoto} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          const alvo = alvoFoto.current;
          e.target.value = '';
          alvoFoto.current = null;
          if (f && alvo) void aoFotografar(alvo, f);
        }}
      />

      {lista.length === 0 ? (
        <p className="px-3 py-10 text-center text-sm txt-fraco">
          {itens.length ? 'Nada neste filtro.' : 'Nenhuma solicitação de reentrega ainda.'}
        </p>
      ) : (
        <ul className="grid gap-2">
          {lista.map((r) => {
            const s = situacaoDe(r);
            const sel = selo(r);
            const aberta = abertas.has(r.id);
            const trabalhando = ocupado === r.id;
            return (
              <li key={r.id} className="rounded-xl border borda">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => setAbertas((x) => {
                      const n = new Set(x); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n;
                    })}
                    aria-expanded={aberta}
                    className="flex items-center gap-1.5 txt-fraco"
                  >
                    {aberta ? <ChevronDown aria-hidden className="size-3.5" /> : <ChevronRight aria-hidden className="size-3.5" />}
                    <span className="sr-only">Ver os pedidos</span>
                  </button>

                  <span className="text-[15px] font-bold tabular-nums">{r.lote}</span>
                  {r.lote_a_parte && (
                    <span className="rounded bg-marinho-900 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-white">
                      Lote à parte
                    </span>
                  )}
                  <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold', sel.cor)}>{sel.rotulo}</span>

                  <span className="text-[12px] txt-fraco">
                    {fmtData(r.data)} · {r.clientes} cliente(s) · {r.paletes} palete(s) · {fmtPeso(r.peso)} kg
                  </span>

                  <span className="ml-auto flex flex-wrap items-center gap-1.5">
                    {trabalhando ? (
                      <Loader2 aria-hidden className="size-4 animate-spin text-marinho-500" />
                    ) : (
                      <>
                        {podeImprimir && (
                          <Botao onClick={() => imprimirReentrega(r, unidade)} titulo="Documento do palete">
                            <Printer aria-hidden className="size-3.5" /> Documento
                          </Botao>
                        )}

                        {s === 'foto' && podeFotografar && (
                          <Botao forte onClick={() => escolherFoto(r)}>
                            <Camera aria-hidden className="size-3.5" /> Anexar foto
                          </Botao>
                        )}

                        {s === 'aprovacao' && (
                          <>
                            {podeFotografar && (
                              <Botao onClick={() => escolherFoto(r)} titulo="Trocar a foto reabre a aprovação">
                                <Camera aria-hidden className="size-3.5" /> Trocar foto
                              </Botao>
                            )}
                            {podeAprovar && (
                              <Botao forte onClick={() => void aoAprovar(r)}>
                                <Check aria-hidden className="size-3.5" /> Aprovar
                              </Botao>
                            )}
                          </>
                        )}

                        {s === 'deposito' && (
                          <>
                            {podeAprovar && (
                              <Botao onClick={() => void aoDesaprovar(r)} titulo="Retirar a aprovação">
                                <Undo2 aria-hidden className="size-3.5" /> Retirar aprovação
                              </Botao>
                            )}
                            {podeFinalizar && (
                              <>
                                <Botao forte onClick={() => void aoFinalizar(r, 'reenviada')}>Reenviada</Botao>
                                <Botao onClick={() => void aoFinalizar(r, 'devolvida')}>Devolvida</Botao>
                              </>
                            )}
                          </>
                        )}

                        {s === 'fechada' && podeFinalizar && (
                          <Botao onClick={() => void aoReabrir(r)}>
                            <RotateCcw aria-hidden className="size-3.5" /> Reabrir
                          </Botao>
                        )}

                        {podeExcluir && (
                          <Botao perigo onClick={() => void aoExcluir(r)} titulo="Excluir a solicitação">
                            <Trash2 aria-hidden className="size-3.5" />
                          </Botao>
                        )}
                      </>
                    )}
                  </span>
                </div>

                {aberta && (
                  <div className="border-t borda px-3 py-3 motion-safe:animate-surgir">
                    <div className="mb-2 grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
                      <Trilha rotulo="Solicitada" quem={r.registrado_por} quando={r.criado_em} />
                      <Trilha rotulo="Foto" quem={r.foto_por} quando={r.foto_em} />
                      <Trilha rotulo="Aprovada" quem={r.aprovado_por} quando={r.aprovado_em} />
                      <Trilha
                        rotulo={r.desfecho ? DESFECHO[r.desfecho].rotulo : 'Finalizada'}
                        quem={r.finalizado_por} quando={r.finalizado_em}
                      />
                    </div>

                    <p className="mb-2 text-[12px]">
                      <span className="txt-fraco">Motorista:</span> <b>{r.motorista || '—'}</b>
                      {' · '}
                      <span className="txt-fraco">Ajudante(s):</span>{' '}
                      {(r.ajudantes ?? []).join(', ') || '—'}
                    </p>
                    {r.obs && <p className="mb-2 text-[12px]"><span className="txt-fraco">Obs.:</span> {r.obs}</p>}

                    {!r.foto && (
                      <p className="mb-2 rounded-lg painel-2 px-3 py-2 text-[11.5px] txt-fraco">
                        {SITUACAO[s].passo}
                      </p>
                    )}

                    {r.foto && (
                      <div className="mb-2">
                        <button
                          type="button" onClick={() => setFotoAberta(fotoAberta === r.id ? null : r.id)}
                          className="flex items-center gap-1.5 text-[12px] font-semibold text-marinho-500"
                        >
                          <Camera aria-hidden className="size-3.5" />
                          {fotoAberta === r.id ? 'Esconder a foto do palete' : 'Ver a foto do palete'}
                        </button>
                        {fotoAberta === r.id && (
                          <Image
                            src={r.foto} alt={`Palete do lote ${r.lote}`}
                            width={640} height={480} unoptimized
                            className="mt-2 max-h-96 w-auto rounded-xl border borda object-contain"
                          />
                        )}
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-xl painel-2 p-2">
                      <table className="w-full border-collapse text-[12px]">
                        <thead>
                          <tr className="text-left">
                            {['Pedido', 'Cód.', 'Cliente', 'Carga', 'Motivo'].map((h) => (
                              <th key={h} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide txt-fraco">{h}</th>
                            ))}
                            <th className="px-2 py-1 text-right text-[10px] font-bold uppercase tracking-wide txt-fraco">Peso</th>
                            <th className="px-2 py-1 text-right text-[10px] font-bold uppercase tracking-wide txt-fraco">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(r.pedidos ?? []).map((p, i) => (
                            <tr key={p.pedido + i} className="border-t borda">
                              <td className="px-2 py-1 tabular-nums">{p.pedido || '—'}</td>
                              <td className="px-2 py-1 txt-fraco">{p.codcli || '—'}</td>
                              <td className="px-2 py-1">{p.cliente || '—'}</td>
                              <td className="px-2 py-1 txt-fraco">{p.carga || '—'}</td>
                              <td className="px-2 py-1 text-[11px] txt-fraco">{p.motivo || '—'}</td>
                              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{fmtPeso(p.peso)}</td>
                              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{fmtBRL(p.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Trilha({ rotulo, quem, quando }: { rotulo: string; quem: string | null; quando: string | null }) {
  return (
    <div className="rounded-lg painel-2 px-2.5 py-1.5">
      <p className="text-[9.5px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      {quando ? (
        <p className="text-[12px]"><b>{quem || '—'}</b> <span className="txt-fraco">· {fmtQuando(quando)}</span></p>
      ) : (
        <p className="text-[12px] txt-fraco">—</p>
      )}
    </div>
  );
}

function Botao({ children, onClick, forte, perigo, titulo }: {
  children: React.ReactNode; onClick: () => void;
  forte?: boolean; perigo?: boolean; titulo?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} title={titulo}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors',
        forte ? 'bg-marinho-800 text-white hover:bg-marinho-900'
          : perigo ? 'text-erro-500 hover:bg-erro-500/10'
            : 'border borda txt-fraco hover:bg-marinho-50',
      )}
    >
      {children}
    </button>
  );
}
