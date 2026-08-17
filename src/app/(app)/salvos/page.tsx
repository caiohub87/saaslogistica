'use client';

import {
  Archive, ChevronDown, ChevronRight, History, Loader2, Pencil, Save, TrendingUp, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { fmtPct, parseDataBR } from '@/lib/produtividade';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import { cn } from '@/utils/cn';

const fmtBRL = (n: number) =>
  'R$ ' + (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface MembroEquipe {
  chave: string; nome: string; tipo: 'mot' | 'aju'; cargo: string; valor: number;
}
interface Premiacao {
  id: number; unidade: string; data_saida: string; carga: string;
  motorista: string | null; aj1: string | null; aj2: string | null;
  prod_final: number | null; faixa: string | null; pagar: boolean;
  valor_mot: number; valor_aj1: number; valor_aj2: number;
  equipe: MembroEquipe[] | null;
  created_at: string;
}
interface Alteracao {
  id: number; premiacao_id: number; campo: string;
  valor_antes: string | null; valor_depois: string | null;
  alterado_por: string; alterado_em: string;
}

/** dd-mm-aaaa -> chave ISO, para ordenar e agrupar por semana */
const iso = (d: string) => {
  const dt = parseDataBR(d);
  return dt ? dt.toISOString().slice(0, 10) : '';
};
/** Segunda-feira da semana daquela data — a chave do agrupamento semanal. */
function segundaDa(d: string): string {
  const dt = parseDataBR(d);
  if (!dt) return '';
  const s = new Date(dt);
  s.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return s.toISOString().slice(0, 10);
}
const fmtISO = (s: string) => (s ? s.split('-').reverse().join('/') : '—');

export default function SalvosPage() {
  const { pode, demo, usuario } = useSessao();
  const podeEditar = pode('salvos', 'ver') && pode('produtividade', 'salvar');

  const [linhas, setLinhas] = useState<Premiacao[]>([]);
  const [historico, setHistorico] = useState<Record<number, Alteracao[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [semana, setSemana] = useState('');
  const [aberta, setAberta] = useState<number | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [rascunho, setRascunho] = useState<MembroEquipe[]>([]);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (demo) {
      const { premiacoesDemo } = await import('@/lib/demo');
      setLinhas(premiacoesDemo() as Premiacao[]);
      setCarregando(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }
    const { data, error } = await sb.from('premiacoes').select('*')
      .order('data_saida', { ascending: false }).limit(2000);
    if (error) setErro(error.message);
    else setLinhas((data ?? []) as Premiacao[]);
    setCarregando(false);
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Equipe da linha: usa `equipe` quando existe; senão reconstrói do formato antigo. */
  const equipeDe = (p: Premiacao): MembroEquipe[] => {
    if (p.equipe?.length) return p.equipe;
    const e: MembroEquipe[] = [];
    if (p.motorista) e.push({ chave: 'mot', nome: p.motorista, tipo: 'mot', cargo: '—', valor: p.valor_mot });
    if (p.aj1) e.push({ chave: 'aj1', nome: p.aj1, tipo: 'aju', cargo: '—', valor: p.valor_aj1 });
    if (p.aj2) e.push({ chave: 'aj2', nome: p.aj2, tipo: 'aju', cargo: '—', valor: p.valor_aj2 });
    return e;
  };

  const semanas = useMemo(() => {
    const s = [...new Set(linhas.map((l) => segundaDa(l.data_saida)).filter(Boolean))];
    return s.sort().reverse();
  }, [linhas]);

  const semanaAtiva = semana || semanas[0] || '';
  const daSemana = useMemo(
    () => linhas.filter((l) => segundaDa(l.data_saida) === semanaAtiva)
      .sort((a, b) => (iso(a.data_saida) < iso(b.data_saida) ? -1 : 1)),
    [linhas, semanaAtiva],
  );

  /**
   * Produtividade da semana = MEDIA das produtividades dos dias.
   *
   * Cada dia primeiro vira a média das suas cargas; depois tira-se a média dos
   * dias. Não é peso da semana ÷ peso previsto da semana — as duas só coincidem
   * quando todos os dias têm o mesmo volume.
   */
  const dias = useMemo(() => {
    const m: Record<string, number[]> = {};
    daSemana.forEach((l) => { (m[l.data_saida] ??= []).push(l.prod_final ?? 0); });
    return Object.entries(m)
      .map(([data, ps]) => ({ data, media: ps.reduce((a, x) => a + x, 0) / ps.length, cargas: ps.length }))
      .sort((a, b) => (iso(a.data) < iso(b.data) ? -1 : 1));
  }, [daSemana]);

  const mediaSemana = dias.length ? dias.reduce((a, d) => a + d.media, 0) / dias.length : 0;
  const totalSemana = daSemana.reduce(
    (a, l) => a + equipeDe(l).reduce((x, p) => x + (p.valor ?? 0), 0), 0,
  );

  async function verHistorico(p: Premiacao) {
    if (aberta === p.id) { setAberta(null); return; }
    setAberta(p.id);
    if (historico[p.id] || demo) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from('premiacao_alteracoes').select('*')
      .eq('premiacao_id', p.id).order('alterado_em', { ascending: false });
    setHistorico((h) => ({ ...h, [p.id]: (data ?? []) as Alteracao[] }));
  }

  function abrirEdicao(p: Premiacao) {
    setEditando(p.id);
    setRascunho(equipeDe(p).map((m) => ({ ...m })));
    setMotivo('');
    setMsg(null); setErro(null);
  }

  /**
   * Grava o reajuste de nomes E registra cada alteração.
   *
   * O histórico é gravado ANTES do update: se a gravação do nome falhar, sobra
   * um registro a mais, o que é preferível a alterar sem deixar rastro.
   */
  async function salvarEdicao(p: Premiacao) {
    const antes = equipeDe(p);
    const mudancas = rascunho
      .map((novo) => {
        const velho = antes.find((a) => a.chave === novo.chave);
        return velho && velho.nome !== novo.nome
          ? { campo: velho.tipo === 'mot' ? 'motorista' : 'ajudante', de: velho.nome, para: novo.nome }
          : null;
      })
      .filter(Boolean) as { campo: string; de: string; para: string }[];

    if (!mudancas.length) { setEditando(null); return; }
    if (demo) { setErro('Modo de demonstração não grava no banco.'); return; }

    const sb = getSupabase();
    if (!sb) return;
    setSalvando(true); setErro(null);

    const { error: eHist } = await sb.from('premiacao_alteracoes').insert(
      mudancas.map((m) => ({
        premiacao_id: p.id, campo: m.campo,
        valor_antes: m.de, valor_depois: m.para,
        motivo: motivo.trim() || null,
        alterado_por: usuario!.nome, alterado_por_id: usuario!.id,
      })),
    );
    if (eHist) {
      setSalvando(false);
      setErro('Não registrei a alteração, então não alterei o nome: ' + eHist.message +
        (/relation|does not exist/i.test(eHist.message) ? ' — rode o SQL 12_premiacao_auditoria.sql.' : ''));
      return;
    }

    const mot = rascunho.find((m) => m.tipo === 'mot');
    const ajus = rascunho.filter((m) => m.tipo === 'aju');
    const { error } = await sb.from('premiacoes').update({
      equipe: rascunho,
      motorista: mot?.nome ?? null,
      aj1: ajus[0]?.nome ?? null,
      aj2: ajus[1]?.nome ?? null,
    }).eq('id', p.id);
    setSalvando(false);

    if (error) { setErro('Não salvou: ' + error.message); return; }
    setMsg(`${mudancas.length} nome(s) reajustado(s) e registrado(s).`);
    setEditando(null);
    setHistorico((h) => { const n = { ...h }; delete n[p.id]; return n; });
    await carregar();
  }

  if (!pode('salvos', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver as premiações salvas.</p>
      </div>
    );
  }

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Archive aria-hidden className="size-5 text-marinho-500" />
          Premiações salvas
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          O que veio da Produtividade. Nomes podem ser reajustados — toda alteração fica registrada.
        </p>
      </header>

      {erro && <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm font-semibold text-erro-600">{erro}</p>}
      {msg && <p className="mb-4 rounded-xl bg-ok-500/10 px-4 py-3 text-sm font-semibold text-ok-600">{msg}</p>}

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" /></div>
      ) : !linhas.length ? (
        <div className="painel sombra rounded-2xl p-10 text-center">
          <Archive aria-hidden className="mx-auto mb-3 size-8 txt-fraco" />
          <p className="text-[15px] font-semibold">Nada salvo ainda</p>
          <p className="mt-1 text-sm txt-fraco">
            Selecione cargas na Produtividade e clique em <b>Salvar premiação</b>.
          </p>
        </div>
      ) : (
        <>
          <section className="painel sombra mb-4 rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-[12.5px] font-semibold">Semana de</label>
              <select
                value={semanaAtiva} onChange={(e) => { setSemana(e.target.value); setAberta(null); }}
                className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
              >
                {semanas.map((s) => <option key={s} value={s}>{fmtISO(s)}</option>)}
              </select>
              <span className="text-[12px] txt-fraco">{daSemana.length} carga(s) · {dias.length} dia(s)</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border-2 border-marinho-500 px-3 py-2">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide txt-fraco">
                  <TrendingUp aria-hidden className="size-3" /> Produtividade da semana
                </p>
                <p className="mt-0.5 text-[22px] font-bold text-marinho-500">{fmtPct(mediaSemana)}</p>
                <p className="text-[11px] txt-fraco">média dos {dias.length} dia(s)</p>
              </div>
              <Caixa rotulo="Cargas premiadas" valor={String(daSemana.length)} />
              <Caixa rotulo="Total da semana" valor={fmtBRL(totalSemana)} />
              <Caixa rotulo="Não pagas (17:30)" valor={String(daSemana.filter((l) => !l.pagar).length)} />
            </div>

            {/* dia a dia: a média da semana sai da média destes */}
            <div className="mt-3 flex flex-wrap gap-2">
              {dias.map((d) => (
                <div key={d.data} className="rounded-lg painel-2 px-2.5 py-1.5 text-[12px]">
                  <span className="font-semibold">{d.data.slice(0, 5)}</span>
                  <span className="ml-1.5 txt-fraco">{fmtPct(d.media)}</span>
                  <span className="ml-1.5 txt-fraco">· {d.cargas} carga(s)</span>
                </div>
              ))}
            </div>
          </section>

          <section className="painel sombra rounded-2xl p-4">
            <ul className="flex flex-col gap-2">
              {daSemana.map((p) => {
                const equipe = equipeDe(p);
                const total = equipe.reduce((a, m) => a + (m.valor ?? 0), 0);
                const emEdicao = editando === p.id;
                return (
                  <li key={p.id} className={cn('rounded-xl border p-3', emEdicao ? 'border-marinho-500' : 'borda')}>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[14px] font-bold">Carga {p.carga}</span>
                      <span className="text-[12px] txt-fraco">{p.data_saida}</span>
                      {p.faixa && (
                        <span className="rounded-md painel-2 px-2 py-0.5 text-[11.5px] font-bold">{p.faixa}</span>
                      )}
                      <span className="text-[12.5px] font-semibold">{fmtPct(p.prod_final ?? 0)}</span>
                      {!p.pagar && (
                        <span className="rounded-md bg-ouro-100 px-2 py-0.5 text-[11px] font-bold text-ouro-700">
                          após 17:30
                        </span>
                      )}
                      <span className={cn('ml-auto text-[14px] font-bold', p.pagar ? 'text-ok-600' : 'txt-fraco')}>
                        {fmtBRL(total)}
                      </span>
                      <button
                        type="button" onClick={() => void verHistorico(p)}
                        className="flex items-center gap-1 rounded-lg border borda px-2 py-1 text-[11.5px] font-semibold txt-fraco"
                      >
                        <History aria-hidden className="size-3.5" />
                        Histórico
                        {aberta === p.id ? <ChevronDown aria-hidden className="size-3" /> : <ChevronRight aria-hidden className="size-3" />}
                      </button>
                      {podeEditar && !emEdicao && (
                        <button
                          type="button" onClick={() => abrirEdicao(p)}
                          className="flex items-center gap-1 rounded-lg border borda px-2 py-1 text-[11.5px] font-semibold"
                        >
                          <Pencil aria-hidden className="size-3.5" /> Reajustar nomes
                        </button>
                      )}
                    </div>

                    {!emEdicao ? (
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] txt-fraco">
                        {equipe.map((m) => (
                          <span key={m.chave}>
                            <b className="text-[12.5px]" style={{ color: 'var(--texto)' }}>{m.nome}</b>
                            {' '}({m.tipo === 'mot' ? 'motorista' : 'ajudante'} · {fmtBRL(m.valor)})
                          </span>
                        ))}
                        {!equipe.length && <span>Sem equipe registrada.</span>}
                      </div>
                    ) : (
                      <div className="mt-3 border-t borda pt-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          {rascunho.map((m, i) => (
                            <label key={m.chave} className="block">
                              <span className="mb-1 block text-[11.5px] font-semibold txt-fraco">
                                {m.tipo === 'mot' ? 'Motorista' : 'Ajudante'} · {fmtBRL(m.valor)}
                              </span>
                              <input
                                value={m.nome}
                                onChange={(e) => setRascunho((r) =>
                                  r.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))}
                                className="painel-2 w-full rounded-lg border borda px-2 py-1.5 text-[13px] font-semibold outline-none focus:border-marinho-500"
                              />
                            </label>
                          ))}
                        </div>
                        <label className="mt-2 block">
                          <span className="mb-1 block text-[11.5px] font-semibold txt-fraco">
                            Motivo do reajuste (opcional, entra no registro)
                          </span>
                          <input
                            value={motivo} onChange={(e) => setMotivo(e.target.value)}
                            placeholder="ex.: nome veio abreviado do ERP"
                            className="painel-2 w-full rounded-lg border borda px-2 py-1.5 text-[12.5px] outline-none focus:border-marinho-500"
                          />
                        </label>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button" onClick={() => void salvarEdicao(p)} disabled={salvando}
                            className="flex items-center gap-1.5 rounded-lg bg-marinho-800 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
                          >
                            {salvando ? <Loader2 aria-hidden className="size-3.5 animate-spin" /> : <Save aria-hidden className="size-3.5" />}
                            Salvar reajuste
                          </button>
                          <button
                            type="button" onClick={() => setEditando(null)}
                            className="flex items-center gap-1 rounded-lg border borda px-2.5 py-1.5 text-[12.5px] font-semibold txt-fraco"
                          >
                            <X aria-hidden className="size-3.5" /> Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {aberta === p.id && (
                      <div className="mt-3 rounded-xl painel-2 p-3 motion-safe:animate-surgir">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide txt-fraco">
                          Alterações registradas
                        </p>
                        {(historico[p.id] ?? []).length === 0 ? (
                          <p className="text-[12.5px] txt-fraco">Nenhuma alteração — os nomes estão como vieram do relatório.</p>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {historico[p.id].map((h) => (
                              <li key={h.id} className="text-[12.5px]">
                                <span className="txt-fraco">{new Date(h.alterado_em).toLocaleString('pt-BR')} · </span>
                                <b>{h.alterado_por}</b>
                                <span className="txt-fraco"> mudou {h.campo} de </span>
                                <span className="rounded bg-erro-500/10 px-1 text-erro-600 line-through">{h.valor_antes}</span>
                                <span className="txt-fraco"> para </span>
                                <span className="rounded bg-ok-500/10 px-1 text-ok-600">{h.valor_depois}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Caixa({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border borda px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      <p className="mt-0.5 text-[19px] font-bold">{valor}</p>
    </div>
  );
}
