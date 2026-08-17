'use client';

import { CalendarDays, List, Loader2, Pencil, Plus, Printer, Save, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  concluido, CONFIG, COR_STATUS, hojeISO, proximoStatus, selo, type ConfigAgenda,
} from '@/lib/agendamentos';
import { fmtData } from '@/lib/inventario';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import type { Agendamento, TipoAgendamento } from '@/types/database';
import { cn } from '@/utils/cn';

import { Calendario } from './Calendario';

const mesDe = (iso: string) => iso.slice(0, 7);

interface Form {
  id: number | null;
  data: string; hora: string; nome: string; secundario: string; obs: string;
}
const formVazio = (): Form => ({ id: null, data: hojeISO(), hora: '', nome: '', secundario: '', obs: '' });

export function Agenda({ tipo }: { tipo: TipoAgendamento }) {
  const cfg: ConfigAgenda = CONFIG[tipo];
  const { pode, demo, usuario } = useSessao();
  const podeEditar = pode(cfg.tela, 'editar');
  const podeExcluir = pode(cfg.tela, 'excluir');
  const podeImprimir = pode(cfg.tela, 'imprimir');

  const [itens, setItens] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [vista, setVista] = useState<'calendario' | 'tabela'>('calendario');
  const [mes, setMes] = useState(mesDe(hojeISO()));
  const [form, setForm] = useState<Form>(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [ocultarConcluidos, setOcultar] = useState(false);
  const [ini, setIni] = useState('');
  const [fim, setFim] = useState('');
  const [mesImpressao, setMesImpressao] = useState(mesDe(hojeISO()));
  const [abrirImpressao, setAbrirImpressao] = useState(false);

  const carregar = useCallback(async () => {
    if (demo) {
      const { agendamentosDemo } = await import('@/lib/demo');
      setItens(agendamentosDemo(tipo));
      setErro(null); setCarregando(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }
    const { data, error } = await sb
      .from('agendamentos').select('*').eq('tipo', tipo)
      .order('data', { ascending: true }).limit(3000);
    if (error) {
      setErro(error.message + (/relation|does not exist/i.test(error.message)
        ? ' — rode o SQL dos agendamentos no Supabase.' : ''));
      setItens([]);
    } else {
      setItens((data ?? []) as Agendamento[]);
      setErro(null);
    }
    setCarregando(false);
  }, [tipo, demo]);

  useEffect(() => { void carregar(); }, [carregar]);

  function bloqueadoNoDemo() {
    if (!demo) return false;
    setMsg(null);
    setErro('Modo de demonstração não grava no banco.');
    return true;
  }

  async function salvar() {
    if (!form.data || !form.nome.trim()) {
      setErro(`Preencha a data e ${cfg.campoNome === 'cliente' ? 'o cliente' : 'o fornecedor'}.`);
      return;
    }
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    setSalvando(true); setErro(null);

    const dados: Record<string, unknown> = {
      unidade: usuario!.unidade, tipo,
      data: form.data,
      hora: cfg.temHora ? (form.hora || null) : null,
      obs: form.obs || null,
      [cfg.campoNome]: form.nome.trim(),
      [cfg.campoSecundario]: form.secundario || null,
    };

    const { error } = form.id
      ? await sb.from('agendamentos').update(dados).eq('id', form.id)
      : await sb.from('agendamentos').insert({ ...dados, status: 'Agendado' });
    setSalvando(false);

    if (error) {
      setErro(error.message + (/permission|policy|row-level/i.test(error.message)
        ? ' — seu acesso não permite editar esta agenda.' : ''));
      return;
    }
    setMsg(form.id ? 'Agendamento atualizado.' : 'Agendamento criado.');
    setForm(formVazio());
    await carregar();
  }

  async function avancarStatus(a: Agendamento) {
    if (!podeEditar || bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const novo = proximoStatus(tipo, a.status);
    const { error } = await sb.from('agendamentos').update({ status: novo }).eq('id', a.id);
    if (error) { setErro(error.message); return; }
    setItens((l) => l.map((x) => (x.id === a.id ? { ...x, status: novo } : x)));
  }

  async function excluir(a: Agendamento) {
    const nome = a[cfg.campoNome] ?? '';
    if (!confirm(`Excluir o agendamento de ${fmtData(a.data)} — ${nome}?`)) return;
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('agendamentos').delete().eq('id', a.id);
    if (error) { setErro(error.message); return; }
    setMsg('Agendamento excluído.');
    await carregar();
  }

  function editar(a: Agendamento) {
    setForm({
      id: a.id, data: a.data, hora: a.hora ?? '',
      nome: a[cfg.campoNome] ?? '', secundario: a[cfg.campoSecundario] ?? '', obs: a.obs ?? '',
    });
    setMsg(null); setErro(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- filtros ----------
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((a) => !ocultarConcluidos || !concluido(tipo, a.status))
      .filter((a) => (!ini || a.data >= ini) && (!fim || a.data <= fim))
      .filter((a) => !q || [a.cliente, a.rota, a.fornecedor, a.volumes, a.obs]
        .some((x) => (x ?? '').toLowerCase().includes(q)))
      // concluídos vão esmaecidos para o fim — nunca somem
      .sort((a, b) => {
        const ca = concluido(tipo, a.status) ? 1 : 0;
        const cb = concluido(tipo, b.status) ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return (a.data + (a.hora ?? '')) < (b.data + (b.hora ?? '')) ? -1 : 1;
      });
  }, [itens, tipo, busca, ocultarConcluidos, ini, fim]);

  const pendentes = itens.filter((a) => !concluido(tipo, a.status)).length;

  /**
   * A impressão é por MÊS, não pelo filtro De/Até: o calendário é uma folha de
   * um mês. Usa `itens` inteiro em vez de `filtrados` para a folha não sair
   * furada por causa de uma busca digitada na tela — o mês impresso é o mês
   * inteiro, do jeito que ele é.
   */
  async function imprimir() {
    const { imprimirAgenda } = await import('@/lib/imprimirAgenda');
    imprimirAgenda(cfg, itens, usuario?.unidade ?? 'Dilnor', mesImpressao);
  }

  if (!pode(cfg.tela, 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver esta agenda.</p>
      </div>
    );
  }

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <cfg.Icone aria-hidden className="size-5 text-marinho-500" />
          {cfg.titulo}
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          {cfg.subtitulo} {pendentes > 0 && <><b>{pendentes}</b> pendente(s).</>}
        </p>
      </header>

      {erro && <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm font-semibold text-erro-600">{erro}</p>}
      {msg && <p className="mb-4 rounded-xl bg-ok-500/10 px-4 py-3 text-sm font-semibold text-ok-600">{msg}</p>}

      {podeEditar && (
        <section className="painel sombra mb-4 rounded-2xl p-4 motion-safe:animate-subir">
          <h2 className="mb-3 text-[15px] font-bold">
            {form.id ? 'Editar agendamento' : 'Novo agendamento'}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Data">
              <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className={ENTRADA} />
            </Campo>
            {cfg.temHora && (
              <Campo rotulo="Hora">
                <input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} className={ENTRADA} />
              </Campo>
            )}
            <Campo rotulo={cfg.rotuloNome}>
              <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={ENTRADA} />
            </Campo>
            <Campo rotulo={cfg.rotuloSecundario}>
              <input value={form.secundario} onChange={(e) => setForm({ ...form, secundario: e.target.value })} className={ENTRADA} />
            </Campo>
            <Campo rotulo="Observações">
              <input value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} className={ENTRADA} />
            </Campo>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button" onClick={() => void salvar()} disabled={salvando}
              className="flex items-center gap-2 rounded-xl bg-marinho-800 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" />
                : form.id ? <Save aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
              {salvando ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Agendar'}
            </button>
            {form.id && (
              <button
                type="button" onClick={() => setForm(formVazio())}
                className="flex items-center gap-1.5 rounded-xl border borda px-3 py-2.5 text-[13px] font-semibold txt-fraco"
              >
                <X aria-hidden className="size-4" /> Cancelar edição
              </button>
            )}
          </div>
        </section>
      )}

      <section className="painel sombra rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border borda p-0.5">
            {(['calendario', 'tabela'] as const).map((v) => (
              <button
                key={v} type="button" onClick={() => setVista(v)}
                className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold',
                  vista === v ? 'bg-marinho-800 text-white' : 'txt-fraco')}
              >
                {v === 'calendario' ? <CalendarDays aria-hidden className="size-3.5" /> : <List aria-hidden className="size-3.5" />}
                {v === 'calendario' ? 'Calendário' : 'Tabela'}
              </button>
            ))}
          </div>
          <input
            value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="painel-2 min-w-40 flex-1 rounded-lg border borda px-2.5 py-1.5 text-[12.5px] outline-none focus:border-marinho-500"
          />
          <label className="flex items-center gap-1 text-[12.5px] txt-fraco">
            De <input type="date" value={ini} onChange={(e) => setIni(e.target.value)} className="painel-2 rounded-lg border borda px-2 py-1.5" />
          </label>
          <label className="flex items-center gap-1 text-[12.5px] txt-fraco">
            Até <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="painel-2 rounded-lg border borda px-2 py-1.5" />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] txt-fraco">
            <input type="checkbox" checked={ocultarConcluidos} onChange={(e) => setOcultar(e.target.checked)} />
            ocultar concluídos
          </label>
          {podeImprimir && (
            <button
              type="button" onClick={() => { setMesImpressao(mes); setAbrirImpressao(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-ouro-500 px-3 py-1.5 text-[12.5px] font-bold text-marinho-900"
            >
              <Printer aria-hidden className="size-3.5" /> Imprimir calendário
            </button>
          )}
        </div>

        {carregando ? (
          <div className="flex justify-center py-10"><Loader2 aria-hidden className="size-5 animate-spin text-marinho-500" /></div>
        ) : vista === 'calendario' ? (
          <Calendario cfg={cfg} itens={filtrados} mes={mes} aoTrocarMes={setMes} />
        ) : (
          <Tabela
            cfg={cfg} itens={filtrados}
            podeEditar={podeEditar} podeExcluir={podeExcluir}
            aoStatus={avancarStatus} aoEditar={editar} aoExcluir={excluir}
          />
        )}

        <p className="mt-3 text-[11.5px] txt-fraco">
          Clique no status para avançar: {CONFIG[tipo].tipo === 'enviar'
            ? 'Agendado → Montado → Enviado → Cancelado'
            : 'Agendado → Recebido → Cancelado'}. Concluídos ficam esmaecidos no fim — nada é apagado.
        </p>
      </section>

      {abrirImpressao && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 motion-safe:animate-surgir"
          onClick={(e) => { if (e.target === e.currentTarget) setAbrirImpressao(false); }}
          role="presentation"
        >
          <div role="dialog" aria-modal="true" aria-label="Imprimir calendário"
            className="painel sombra-lg w-full max-w-sm rounded-2xl p-5 motion-safe:animate-subir">
            <h3 className="text-[16px] font-bold">Imprimir calendário</h3>
            <p className="mt-1 text-[12.5px] txt-fraco">
              Sai uma folha com o mês inteiro, em paisagem. A busca e o filtro De/Até da tela não
              afetam a impressão — o mês vai completo.
            </p>
            <label className="mt-4 block">
              <span className="mb-1 block text-[12.5px] font-semibold">Mês</span>
              <input
                type="month" value={mesImpressao} onChange={(e) => setMesImpressao(e.target.value)}
                className={ENTRADA}
              />
            </label>
            <p className="mt-2 text-[12px] txt-fraco">
              {itens.filter((a) => a.data.slice(0, 7) === mesImpressao).length} agendamento(s) neste mês.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setAbrirImpressao(false); void imprimir(); }}
                className="flex items-center gap-2 rounded-xl bg-marinho-800 px-4 py-2.5 text-[13px] font-semibold text-white"
              >
                <Printer aria-hidden className="size-4" /> Imprimir
              </button>
              <button
                type="button" onClick={() => setAbrirImpressao(false)}
                className="rounded-xl border borda px-3 py-2.5 text-[13px] font-semibold txt-fraco"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ENTRADA = 'painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500';

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold">{rotulo}</span>
      {children}
    </label>
  );
}

function Tabela({ cfg, itens, podeEditar, podeExcluir, aoStatus, aoEditar, aoExcluir }: {
  cfg: ConfigAgenda; itens: Agendamento[];
  podeEditar: boolean; podeExcluir: boolean;
  aoStatus: (a: Agendamento) => void; aoEditar: (a: Agendamento) => void; aoExcluir: (a: Agendamento) => void;
}) {
  if (!itens.length) {
    return <p className="py-10 text-center text-sm txt-fraco">Nenhum agendamento no filtro atual.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="painel-2 text-left">
            <Th>Data</Th>
            {cfg.temHora && <Th>Hora</Th>}
            <Th>{cfg.rotuloNome}</Th>
            <Th>{cfg.rotuloSecundario}</Th>
            <Th>Observações</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {itens.map((a) => {
            const s = selo(cfg.tipo, a.data, a.status);
            return (
              <tr key={a.id} className={cn('border-b borda', concluido(cfg.tipo, a.status) && 'opacity-55')}>
                <td className="whitespace-nowrap px-3 py-2">
                  {fmtData(a.data)}
                  {s && (
                    <span className={cn('ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold',
                      s === 'HOJE' ? 'bg-ouro-100 text-ouro-700' : 'bg-erro-500/15 text-erro-600')}>
                      {s}
                    </span>
                  )}
                </td>
                {cfg.temHora && <td className="whitespace-nowrap px-3 py-2">{a.hora ?? '—'}</td>}
                <td className="px-3 py-2"><b>{a[cfg.campoNome] || '—'}</b></td>
                <td className="px-3 py-2">{a[cfg.campoSecundario] || '—'}</td>
                <td className="px-3 py-2 txt-fraco">{a.obs || '—'}</td>
                <td className="px-3 py-2">
                  <button
                    type="button" disabled={!podeEditar} onClick={() => aoStatus(a)}
                    title={podeEditar ? 'Clique para avançar o status' : undefined}
                    className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold', COR_STATUS[a.status],
                      podeEditar ? 'cursor-pointer' : 'cursor-default')}
                  >
                    {a.status}
                  </button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {podeEditar && (
                    <button type="button" onClick={() => aoEditar(a)} aria-label="Editar"
                      className="rounded-lg p-1.5 txt-fraco hover:bg-marinho-50">
                      <Pencil aria-hidden className="size-3.5" />
                    </button>
                  )}
                  {podeExcluir && (
                    <button type="button" onClick={() => aoExcluir(a)} aria-label="Excluir"
                      className="rounded-lg p-1.5 text-erro-600 hover:bg-erro-500/10">
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
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wide txt-fraco">{children}</th>;
}
