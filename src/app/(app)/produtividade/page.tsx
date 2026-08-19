'use client';

import {
  Check, Clock, FileUp, Loader2, Save, Search, Target, Trash2, TriangleAlert, UserPlus, Users, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CARGOS_AJU, CARGOS_MOT, configPadraoDaCarga, fmtKg, fmtPct, isAgregado,
  paraISO, premioDaCarga, premioDaPessoa, type Carga, type ConfigCarga,
} from '@/lib/produtividade';
import { lerRelatorio } from '@/lib/relatorio';
import { getSupabase } from '@/lib/supabase';
import { useRelatorio } from '@/providers/RelatorioProvider';
import { useSessao } from '@/providers/SessionProvider';
import { cn } from '@/utils/cn';

const fmtBRL = (n: number) =>
  'R$ ' + (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// data em horário local, sem passar por toISOString — que converte pra UTC e
// pode voltar um dia (o Brasil está atrás de UTC, meia-noite local ainda é o
// dia anterior lá)
const fmtISOLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hojeISOLocal = () => fmtISOLocal(new Date());
/** segunda-feira da semana que contém essa data ISO */
const segundaISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return fmtISOLocal(dt);
};
const NOME_DIA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

const COR_FAIXA: Record<string, string> = {
  green: 'bg-ok-500/15 text-ok-600',
  blue: 'bg-marinho-100 text-marinho-800',
  orange: 'bg-ouro-100 text-ouro-700',
  red: 'bg-erro-500/15 text-erro-600',
};
const BARRA_FAIXA: Record<string, string> = {
  green: 'bg-ok-500', blue: 'bg-marinho-500', orange: 'bg-ouro-500', red: 'bg-erro-500',
};

export default function ProdutividadePage() {
  const { pode, demo, usuario } = useSessao();
  const { cargas, meta, config, premio, carregando, definirRelatorio, limpar } = useRelatorio();
  const podeImportar = pode('analise', 'importar') || pode('produtividade', 'salvar');

  const [busca, setBusca] = useState('');
  const [faixaFiltro, setFaixaFiltro] = useState('');
  const [confs, setConfs] = useState<Record<string, ConfigCarga>>({});
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  /**
   * Semana de trabalho: o usuário escolhe a segunda-feira, e antes de salvar
   * precisa dizer qual dos 5 dias está registrando — impede misturar cargas
   * de dias diferentes numa mesma gravação. O período mostra quais dias já
   * têm premiação salva, pra dar pra acompanhar o progresso da semana.
   */
  const [semanaBase, setSemanaBase] = useState(() => segundaISO(hojeISOLocal()));
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [diasSalvos, setDiasSalvos] = useState<Set<string>>(new Set());

  const diasDaSemana = useMemo(() => {
    const [y, m, d] = semanaBase.split('-').map(Number);
    const seg = new Date(y, m - 1, d);
    return Array.from({ length: 5 }, (_, i) => {
      const dt = new Date(seg); dt.setDate(seg.getDate() + i);
      return {
        iso: fmtISOLocal(dt),
        br: `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`,
        nome: NOME_DIA[i],
      };
    });
  }, [semanaBase]);
  const diaAtivo = diasDaSemana.find((d) => d.iso === diaSelecionado) ?? null;

  // data_saida é coluna `date`: consulta e gravação vão em ISO. O 'dd-mm-aaaa'
  // do campo `br` é só rótulo de tela.
  const buscarDiasSalvos = useCallback(async () => {
    if (!usuario) return;
    const isos = diasDaSemana.map((d) => d.iso);
    if (demo) {
      const { premiacoesDemo } = await import('@/lib/demo');
      const salvos = new Set(premiacoesDemo().map((p) => paraISO(p.data_saida)));
      setDiasSalvos(new Set(diasDaSemana.filter((d) => salvos.has(d.iso)).map((d) => d.iso)));
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.from('premiacoes').select('data_saida')
      .eq('unidade', usuario.unidade).in('data_saida', isos);
    const achados = new Set((data ?? []).map((r: { data_saida: string }) => paraISO(r.data_saida)));
    setDiasSalvos(new Set(diasDaSemana.filter((d) => achados.has(d.iso)).map((d) => d.iso)));
  }, [demo, usuario, diasDaSemana]);

  useEffect(() => { void buscarDiasSalvos(); }, [buscarDiasSalvos]);

  /** Config de uma carga, criando a padrão na primeira vez que é tocada. */
  const conf = (c: Carga): ConfigCarga => confs[c.id] ?? configPadraoDaCarga(c);
  const mexer = (c: Carga, mudanca: (x: ConfigCarga) => ConfigCarga) =>
    setConfs((m) => ({ ...m, [c.id]: mudanca(conf(c)) }));

  /** O 17:30: um toque na linha e a carga inteira deixa de receber. */
  const alternarHorario = (c: Carga) => mexer(c, (x) => ({ ...x, ganha: !x.ganha }));

  /**
   * Carga de um cliente só costuma levar mais gente do que as quatro colunas de
   * ajudante do relatório comportam. Nesses casos — e só neles — dá para
   * acrescentar ajudante na mão. Nas demais o campo nem aparece.
   */
  const adicionarAjudante = (c: Carga) => mexer(c, (x) => {
    const chave = `extra:${Date.now()}`;
    return {
      ...x,
      pessoas: {
        ...x.pessoas,
        [chave]: {
          chave, tipo: 'aju',
          cargo: c.placa === 'AGREG' ? 'Ajudante de Praça (Agregado)' : 'Ajudante de Praça',
          display: '',
        },
      },
    };
  });

  const removerPessoa = (c: Carga, chave: string) => mexer(c, (x) => {
    const pessoas = { ...x.pessoas };
    delete pessoas[chave];
    return { ...x, pessoas };
  });

  // o dia escolhido é o que vai SER GRAVADO, não um filtro do que aparece — a
  // data do relatório raramente bate exata com o dia que a pessoa quer
  // registrar, e filtrar por igualdade de data deixava a lista vazia
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cargas
      .filter((c) => !faixaFiltro || c.faixa.k === faixaFiltro)
      .filter((c) => !q || [c.id, c.motorista, c.rota, ...c.ajudantes]
        .some((x) => (x ?? '').toLowerCase().includes(q)))
      .sort((a, b) => b.prodFinal - a.prodFinal);
  }, [cargas, busca, faixaFiltro]);

  const resumo = useMemo(() => {
    const n = cargas.length;
    const media = n ? cargas.reduce((a, c) => a + c.prodFinal, 0) / n : 0;
    const porFaixa = { green: 0, blue: 0, orange: 0, red: 0 } as Record<string, number>;
    cargas.forEach((c) => { porFaixa[c.faixa.k]++; });
    const semHorario = cargas.filter((c) => !conf(c).ganha).length;
    return { n, media, porFaixa, semHorario };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargas, confs]);

  const totalSelecionado = useMemo(
    () => [...selecionadas].reduce((a, id) => {
      const c = cargas.find((x) => x.id === id);
      return c ? a + premioDaCarga(premio, c, conf(c)) : a;
    }, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selecionadas, cargas, confs, premio],
  );

  async function importar(f: File) {
    setLendo(true); setErro(null);
    try {
      const { pedidos, meta: m } = await lerRelatorio(f);
      definirRelatorio(pedidos, m);
      setConfs({}); setSelecionadas(new Set());
    } catch (e) {
      setErro((e as Error).message);
    }
    setLendo(false);
  }

  /**
   * Grava as cargas SELECIONADAS na tabela premiacoes.
   *
   * Uma linha por carga, com a equipe inteira em `equipe` (jsonb) — as colunas
   * antigas motorista/aj1/aj2 continuam preenchidas para o sistema antigo
   * seguir lendo enquanto os dois convivem. Regravar a mesma carga/data
   * substitui, em vez de duplicar.
   */
  async function salvarPremiacao() {
    if (!selecionadas.size) return;
    setErro(null); setSalvo(null);
    if (!diaAtivo) { setErro('Selecione o dia da semana que você está registrando antes de salvar.'); return; }
    if (demo) { setErro('Modo de demonstração não grava no banco. Entre com seu login para salvar.'); return; }
    const sb = getSupabase();
    if (!sb) return;
    setSalvando(true);

    // grava a data ESCOLHIDA, não a que veio no relatório — as duas raramente
    // batem exatas, e é a escolhida que define em qual dia da semana a
    // premiação entra. Em ISO: a coluna é `date` e recusa '17-08-2026'.
    const dataEscolhida = diaAtivo.iso;
    const linhas = [...selecionadas].map((id) => {
      const c = cargas.find((x) => x.id === id)!;
      const cf = conf(c);
      const equipe = Object.values(cf.pessoas)
        .filter((p) => p.display.trim())
        .map((p) => ({
          chave: p.chave, nome: p.display.trim(), tipo: p.tipo, cargo: p.cargo,
          valor: premioDaPessoa(premio, p.cargo, c.faixa.tier, cf.ganha),
        }));
      const mot = equipe.find((p) => p.tipo === 'mot');
      const ajus = equipe.filter((p) => p.tipo === 'aju');
      return {
        unidade: usuario!.unidade,
        data_saida: dataEscolhida,
        carga: c.id,
        motorista: mot?.nome ?? null,
        aj1: ajus[0]?.nome ?? null,
        aj2: ajus[1]?.nome ?? null,
        tipo: mot?.cargo ?? null,
        prod_final: c.prodFinal,
        faixa: c.faixa.label,
        pagar: cf.ganha,
        valor_mot: mot?.valor ?? 0,
        valor_aj1: ajus[0]?.valor ?? 0,
        valor_aj2: ajus[1]?.valor ?? 0,
        equipe,
        problemas: c.peds.filter((p) => p.cat !== 'entregue')
          .map((p) => ({ pedido: p.pedido, cliente: p.cliente, status: p.status, motivo: p.motivo, peso: p.peso })),
      };
    });

    const { error } = await sb.from('premiacoes')
      .upsert(linhas, { onConflict: 'unidade,data_saida,carga' });
    setSalvando(false);

    if (error) {
      setErro('Não salvou: ' + error.message +
        (/permission|policy|row-level/i.test(error.message)
          ? ' — seu acesso não tem permissão de salvar premiação.'
          : /equipe/i.test(error.message)
            ? ' — falta a coluna equipe: rode o SQL 12_premiacao_auditoria.sql.' : ''));
      return;
    }
    setSalvo(`${linhas.length} carga(s) de ${diaAtivo.nome} salva(s). Veja em Premiações salvas.`);
    setSelecionadas(new Set());
    await buscarDiasSalvos();
  }

  if (!pode('produtividade', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver a produtividade.</p>
      </div>
    );
  }

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Target aria-hidden className="size-5 text-marinho-500" />
            Produtividade
          </h1>
          <p className="mt-1 text-sm txt-fraco">
            {meta
              ? <>Base de <b>{meta.arquivo}</b> · {meta.pedidos} pedidos · {cargas.length} cargas</>
              : 'Carregue o Relatório de Entregas para calcular.'}
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
                type="button" onClick={() => { limpar(); setConfs({}); setSelecionadas(new Set()); }}
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
      {salvo && <p className="mb-4 rounded-xl bg-ok-500/10 px-4 py-3 text-sm font-semibold text-ok-600">{salvo}</p>}

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" /></div>
      ) : !cargas.length ? (
        <div className="painel sombra rounded-2xl p-10 text-center">
          <FileUp aria-hidden className="mx-auto mb-3 size-8 txt-fraco" />
          <p className="text-[15px] font-semibold">Nenhum relatório carregado</p>
          <p className="mt-1 text-sm txt-fraco">
            Importe o Relatório de Entregas do Fusion. Ele fica salvo neste navegador e alimenta
            também a Análise de Entregas.
          </p>
        </div>
      ) : (
        <>
          {/* ---------- semana e dia ---------- */}
          <section className="painel sombra mb-4 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-[12.5px] font-semibold" htmlFor="semana">Semana de</label>
              <input
                id="semana" type="date" value={semanaBase}
                onChange={(e) => { if (e.target.value) { setSemanaBase(segundaISO(e.target.value)); setDiaSelecionado(null); } }}
                className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
              />
              <div className="flex flex-wrap gap-1.5">
                {diasDaSemana.map((d) => {
                  const salvo = diasSalvos.has(d.iso);
                  const ativo = diaSelecionado === d.iso;
                  return (
                    <button
                      key={d.iso} type="button"
                      onClick={() => setDiaSelecionado(ativo ? null : d.iso)}
                      aria-pressed={ativo}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                        ativo ? 'border-marinho-500 bg-marinho-800 text-white'
                          : salvo ? 'border-ok-500 bg-ok-500/10 text-ok-600' : 'borda txt-fraco hover:bg-marinho-50',
                      )}
                    >
                      {salvo && <Check aria-hidden className="size-3.5" />}
                      {d.nome} <span className="opacity-70">{d.br.slice(0, 5)}</span>
                    </button>
                  );
                })}
              </div>
              <span className="ml-auto text-[12px] txt-fraco">{diasSalvos.size} de 5 dia(s) já salvos</span>
            </div>
            <p className="mt-2 text-[12px] txt-fraco">
              {diaAtivo
                ? <>As cargas que você marcar serão salvas em <b>{diaAtivo.nome}, {diaAtivo.br}</b>.</>
                : 'Escolha o dia em que a premiação será registrada.'}
            </p>
          </section>

          {/* ---------- resumo ---------- */}
          <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Caixa rotulo="Cargas" valor={String(resumo.n)} />
            <Caixa rotulo="Produtividade média" valor={fmtPct(resumo.media)} destaque />
            <Caixa rotulo="100%" valor={String(resumo.porFaixa.green)} cor="green" />
            <Caixa rotulo={`≥${config.meta90}%`} valor={String(resumo.porFaixa.blue)} cor="blue" />
            <Caixa rotulo={`${config.meta80}–${config.meta90}%`} valor={String(resumo.porFaixa.orange)} cor="orange" />
            <Caixa rotulo={`<${config.meta80}%`} valor={String(resumo.porFaixa.red)} cor="red" />
          </div>

          {resumo.semHorario > 0 && (
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-ouro-100 px-4 py-2.5 text-[13px] font-semibold text-ouro-700">
              <Clock aria-hidden className="size-4 shrink-0" />
              {resumo.semHorario} carga(s) marcada(s) como chegada após {config.horario} — não recebem prêmio.
            </p>
          )}

          <section className="painel sombra rounded-2xl p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-52 flex-1">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
                <input
                  value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar carga, motorista, ajudante, rota…"
                  className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
                />
              </div>
              <select
                value={faixaFiltro} onChange={(e) => setFaixaFiltro(e.target.value)}
                className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
              >
                <option value="">Todas as faixas</option>
                <option value="green">100%</option>
                <option value="blue">≥{config.meta90}%</option>
                <option value="orange">{config.meta80}–{config.meta90}%</option>
                <option value="red">&lt;{config.meta80}%</option>
              </select>
              <span className="text-[12px] txt-fraco">{lista.length} de {cargas.length}</span>
            </div>

            <ul className="flex flex-col gap-2">
              {lista.map((c) => {
                const cf = conf(c);
                const sel = selecionadas.has(c.id);
                const valor = premioDaCarga(premio, c, cf);
                return (
                  <li key={c.id}>
                    <div className={cn(
                      'rounded-xl border p-3 transition-colors',
                      sel ? 'border-marinho-500 bg-marinho-50/50' : 'borda',
                      !cf.ganha && 'opacity-70',
                    )}>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox" checked={sel}
                            onChange={(e) => setSelecionadas((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(c.id); else n.delete(c.id);
                              return n;
                            })}
                          />
                          <span className="text-[14px] font-bold">Carga {c.id}</span>
                        </label>

                        <span className={cn('rounded-md px-2 py-0.5 text-[11.5px] font-bold', COR_FAIXA[c.faixa.k])}>
                          {fmtPct(c.prodFinal)}
                        </span>

                        {/* barra da produtividade — leitura imediata */}
                        <span className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-marinho-100">
                          <span
                            className={cn('block h-full rounded-full', BARRA_FAIXA[c.faixa.k])}
                            style={{ width: `${Math.max(2, c.prodFinal * 100)}%` }}
                          />
                        </span>

                        {/* O 17:30 fica AQUI, na linha, num toque — no sistema
                            antigo estava escondido dentro do painel de seleção */}
                        <button
                          type="button" onClick={() => alternarHorario(c)}
                          aria-pressed={!cf.ganha}
                          title={`Marcar chegada após ${config.horario}`}
                          className={cn(
                            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold transition-colors',
                            cf.ganha
                              ? 'borda txt-fraco hover:border-ouro-500 hover:text-ouro-700'
                              : 'border-ouro-500 bg-ouro-500 text-marinho-900',
                          )}
                        >
                          <Clock aria-hidden className="size-3.5" />
                          {cf.ganha ? `Após ${config.horario}?` : `Após ${config.horario}`}
                        </button>

                        <span className={cn('ml-auto text-[14px] font-bold', cf.ganha ? 'text-ok-600' : 'txt-fraco line-through')}>
                          {fmtBRL(valor)}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] txt-fraco">
                        {c.dataSaida && <span>Saída {c.dataSaida}</span>}
                        <span>{c.pedidos} pedidos · {fmtKg(c.peso)} kg</span>
                        <span>Qtd {fmtPct(c.prodQtd)} · Peso {fmtPct(c.prodPeso)}</span>
                        {c.rota && <span>{c.rota}</span>}
                        {c.placa && <span className={cn(c.placa === 'AGREG' && 'font-bold text-ouro-700')}>{c.placa}</span>}
                        {(c.cReent + c.cDev) > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-erro-600">
                            <TriangleAlert aria-hidden className="size-3" />
                            {c.cReent} reentrega(s) · {c.cDev} devolvida(s)
                          </span>
                        )}
                      </div>

                      {sel && (
                        <div className="mt-3 border-t borda pt-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide txt-fraco">
                              <Users aria-hidden className="size-3.5" /> Equipe da carga
                            </p>
                            {c.clientes === 1 ? (
                              <button
                                type="button" onClick={() => adicionarAjudante(c)}
                                className="flex items-center gap-1 rounded-lg border border-dashed borda px-2 py-1 text-[11.5px] font-semibold txt-fraco transition-colors hover:border-marinho-500 hover:text-marinho-800"
                              >
                                <UserPlus aria-hidden className="size-3.5" />
                                Adicionar ajudante
                              </button>
                            ) : null}
                            {c.clientes === 1 && (
                              <span className="rounded bg-marinho-100 px-1.5 py-0.5 text-[10px] font-bold text-marinho-800">
                                CLIENTE ÚNICO
                              </span>
                            )}
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {Object.values(cf.pessoas).map((p) => (
                              <div key={p.chave} className="rounded-lg painel-2 p-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="rounded bg-marinho-100 px-1.5 py-0.5 text-[10px] font-bold text-marinho-800">
                                    {p.tipo === 'mot' ? 'MOTORISTA' : 'AJUDANTE'}
                                  </span>
                                  {isAgregado(p.cargo) && (
                                    <span className="rounded bg-ouro-100 px-1.5 py-0.5 text-[10px] font-bold text-ouro-700">AGREG</span>
                                  )}
                                  {p.chave.startsWith('extra:') && (
                                    <button
                                      type="button" onClick={() => removerPessoa(c, p.chave)}
                                      aria-label="Remover ajudante"
                                      className="rounded p-0.5 text-erro-600 hover:bg-erro-500/10"
                                    >
                                      <X aria-hidden className="size-3.5" />
                                    </button>
                                  )}
                                  <span className="ml-auto text-[13px] font-bold">
                                    {cf.ganha ? fmtBRL(premioDaPessoa(premio, p.cargo, c.faixa.tier, cf.ganha)) : '—'}
                                  </span>
                                </div>
                                <input
                                  value={p.display}
                                  placeholder={p.chave.startsWith('extra:') ? 'Nome do ajudante' : undefined}
                                  onChange={(e) => mexer(c, (x) => ({
                                    ...x,
                                    pessoas: { ...x.pessoas, [p.chave]: { ...p, display: e.target.value } },
                                  }))}
                                  className="painel mt-1.5 w-full rounded-lg border borda px-2 py-1 text-[13px] font-semibold outline-none focus:border-marinho-500"
                                />
                                <select
                                  value={p.cargo}
                                  onChange={(e) => mexer(c, (x) => ({
                                    ...x,
                                    pessoas: { ...x.pessoas, [p.chave]: { ...p, cargo: e.target.value } },
                                  }))}
                                  className="painel-2 mt-1.5 w-full rounded-lg border borda px-2 py-1 text-[12px]"
                                >
                                  {(p.tipo === 'mot' ? CARGOS_MOT : CARGOS_AJU).map((o) => (
                                    <option key={o} value={o}>{o}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                            {!Object.keys(cf.pessoas).length && (
                              <p className="text-[12.5px] txt-fraco">Sem motorista ou ajudante identificado nesta carga.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {selecionadas.size > 0 && (
            <div className="sticky bottom-3 mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-marinho-800 px-4 py-3 text-white sombra-lg motion-safe:animate-subir">
              <span className="text-[13.5px] font-semibold">
                {selecionadas.size} carga(s) selecionada(s)
              </span>
              <button
                type="button" onClick={() => setSelecionadas(new Set())}
                className="rounded-lg border border-white/25 px-2.5 py-1 text-[12px] font-semibold"
              >
                Limpar
              </button>
              <span className="ml-auto text-[16px] font-bold">{fmtBRL(totalSelecionado)}</span>
              {pode('produtividade', 'salvar') && (
                <button
                  type="button" onClick={() => void salvarPremiacao()} disabled={salvando || !diaAtivo}
                  title={!diaAtivo ? 'Selecione o dia da semana antes de salvar' : undefined}
                  className="flex items-center gap-2 rounded-xl bg-ouro-500 px-4 py-2 text-[13px] font-bold text-marinho-900 disabled:opacity-60"
                >
                  {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
                  {salvando ? 'Salvando…' : diaAtivo ? `Salvar premiação de ${diaAtivo.nome}` : 'Salvar premiação'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Caixa({ rotulo, valor, cor, destaque }: {
  rotulo: string; valor: string; cor?: 'green' | 'blue' | 'orange' | 'red'; destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border borda px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      <p className={cn(
        'mt-0.5 text-[19px] font-bold',
        cor === 'green' && 'text-ok-600',
        cor === 'blue' && 'text-marinho-500',
        cor === 'orange' && 'text-ouro-700',
        cor === 'red' && 'text-erro-600',
        destaque && !cor && 'text-marinho-500',
      )}>
        {valor}
      </p>
    </div>
  );
}
