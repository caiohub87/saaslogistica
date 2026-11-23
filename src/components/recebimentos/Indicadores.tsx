'use client';

import { Info, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useRecebimentos } from '@/hooks/useRecebimentos';
import {
  dataLocalISO, kpisPeriodo, mapaDiaHora, porFornecedor, TOLERANCIA_MIN, volumePorSemana,
  type IndicadorFornecedor, type MapaHorarios, type VolumeSemana,
} from '@/lib/recebimentos';
import { useSessao } from '@/providers/SessionProvider';
import type { UnidadeQtd } from '@/types/database';
import { cn } from '@/utils/cn';

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const pct = (v: number | null) => v === null ? '—' : `${numero.format(v)}%`;
const minutos = (v: number | null) => v === null ? '—' : `${numero.format(v)} min`;
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const UNIDADES: UnidadeQtd[] = ['paletes', 'caixas', 'volumes'];

function Cartao({ titulo, detalhe, children }: { titulo: string; detalhe: string; children: ReactNode }) {
  return (
    <section className="painel sombra min-w-0 rounded-2xl p-4 sm:p-5">
      <h3 className="text-base font-bold">{titulo}</h3>
      <p className="mb-4 mt-1 text-xs leading-relaxed txt-fraco">{detalhe}</p>
      {children}
    </section>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-7 text-center text-sm txt-fraco">{children}</p>;
}

function Pontualidade({ fornecedores }: { fornecedores: IndicadorFornecedor[] }) {
  const avaliados = fornecedores.filter((f) => f.percentualPontual !== null);
  return (
    <Cartao titulo="Pontualidade por fornecedor" detalhe={`Do mais pontual ao menos pontual · tolerância de ${TOLERANCIA_MIN} min · só chegadas registradas com horário agendado.`}>
      {!avaliados.length ? <Vazio>Ainda não há chegadas com horário para comparar.</Vazio> : (
        <ol className="space-y-4">
          {avaliados.map((f) => (
            <li key={f.fornecedor}>
              <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 break-words font-semibold">{f.fornecedor}</span>
                <b className="shrink-0 tabular-nums">{pct(f.percentualPontual)}</b>
              </div>
              <div className="h-2.5 overflow-hidden rounded-sm bg-[var(--grade)]" aria-hidden>
                <div className="h-full rounded-r-sm bg-[var(--serie)]" style={{ width: `${f.percentualPontual}%` }} />
              </div>
              <p className="mt-1.5 text-xs tabular-nums txt-fraco">{f.pontuais} de {f.comChegada} no horário · atraso médio {minutos(f.atrasoMedioMin)}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-xs txt-fraco">Escala de 0 a 100%. Atraso negativo significa chegada antecipada.</p>
    </Cartao>
  );
}

function MapaCalor({ mapa }: { mapa: MapaHorarios }) {
  // A faixa cresce quando há agendamentos fora do expediente habitual.
  const ocupadas = Array.from({ length: 24 }, (_, h) => h).filter((h) => mapa.dias.some((d) => d.horas[h] > 0));
  const primeira = Math.min(6, ...ocupadas);
  const ultima = Math.max(18, ...ocupadas);
  const horas = Array.from({ length: ultima - primeira + 1 }, (_, i) => primeira + i);
  return (
    <Cartao titulo="Quando o depósito concentra agendamentos" detalhe="Dia da semana × horário previsto · conta agendamentos, inclusive não-comparecimentos; cancelados ficam de fora.">
      {!mapa.total ? <Vazio>Nenhum agendamento com horário neste período.</Vazio> : (
        <>
          <div className="max-w-full overflow-x-auto pb-2" tabIndex={0} role="region" aria-label="Mapa de horários; deslize para ver todas as horas">
            <table className="w-full border-separate border-spacing-1 text-center text-xs tabular-nums">
              <caption className="sr-only">Quantidade de agendamentos por dia da semana e hora</caption>
              <thead><tr><th scope="col"><span className="sr-only">Dia</span></th>{horas.map((h) => <th scope="col" key={h} className="pb-1 font-semibold txt-fraco">{String(h).padStart(2, '0')}h</th>)}</tr></thead>
              <tbody>
                {mapa.dias.map((d) => (
                  <tr key={d.dia}>
                    <th scope="row" className="pr-1 text-left font-semibold">{d.rotulo}</th>
                    {horas.map((h) => {
                      const valor = d.horas[h];
                      const passo = valor ? Math.min(4, Math.ceil(valor / mapa.maior * 4)) : 0;
                      // A rampa inverte a luminosidade no tema escuro: a tinta
                      // acompanha essa mudança para os números continuarem legíveis.
                      const tinta = passo >= 3 ? 'text-white [.escuro_&]:text-[#070a1c]'
                        : passo === 1 ? 'text-[#070a1c] [.escuro_&]:text-white' : 'text-[#070a1c]';
                      return (
                        <td key={h} className={cn('h-8 min-w-8 rounded-md font-bold', valor ? tinta : 'txt-fraco')}
                          style={{ background: valor ? `var(--seq-${passo})` : 'var(--grade)' }}
                          title={`${d.rotulo}, ${h}h: ${valor} agendamento(s)`}>
                          {valor || <span className="sr-only">0</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs txt-fraco">
            <span>Menos</span>{[1, 2, 3, 4].map((p) => <span key={p} aria-hidden className="size-4 rounded-sm" style={{ background: `var(--seq-${p})` }} />)}<span>Mais</span>
            <span>· célula vazia = zero</span>
          </div>
        </>
      )}
      {mapa.semHora > 0 && <p className="mt-3 text-xs txt-fraco">{mapa.semHora} agendamento(s) sem horário válido fora da grade.</p>}
    </Cartao>
  );
}

function Volume({ semanas }: { semanas: VolumeSemana[] }) {
  const [escolhida, setEscolhida] = useState<UnidadeQtd>('paletes');
  const [larguraDisponivel, setLarguraDisponivel] = useState(0);
  const areaGrafico = useRef<HTMLDivElement>(null);
  const unidades = UNIDADES.filter((u) => semanas.some((s) => s.quantidades[u] > 0));
  const temVolume = unidades.length > 0;
  useEffect(() => {
    const area = areaGrafico.current;
    if (!area) return;
    const observador = new ResizeObserver(([entrada]) => {
      setLarguraDisponivel(Math.floor(entrada.contentRect.width));
    });
    observador.observe(area);
    return () => observador.disconnect();
  }, [temVolume]);
  const unidade = unidades.includes(escolhida) ? escolhida : unidades[0] ?? 'paletes';
  const maior = Math.max(0, ...semanas.map((s) => s.quantidades[unidade]));
  const total = semanas.reduce((soma, s) => soma + s.quantidades[unidade], 0);
  // Uma unidade do SVG equivale a um pixel: o cartão pode crescer sem ampliar
  // as letras ou a altura. Em telas estreitas, a largura mínima mantém a rolagem.
  const largura = Math.max(320, semanas.length * 56 + 52, larguraDisponivel);
  const altura = 230, esquerda = 48, direita = 12, topo = 24, base = 185;
  const passo = (largura - esquerda - direita) / Math.max(1, semanas.length);
  const escala = maior || 1;
  return (
    <Cartao titulo="Volume recebido por semana" detalhe="Somente cargas recebidas com quantidade preenchida · semanas começam na segunda-feira, pela data agendada.">
      {!unidades.length ? <Vazio>Ainda não há cargas recebidas com quantidade e unidade preenchidas.</Vazio> : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs txt-fraco">Unidade
              <select value={unidade} onChange={(e) => setEscolhida(e.target.value as UnidadeQtd)} className="painel-2 rounded-lg border borda px-2 py-1.5 text-sm text-[var(--texto)]">
                {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <p className="text-sm font-semibold tabular-nums">{numero.format(total)} {unidade}</p>
          </div>
          <div ref={areaGrafico} className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Volume semanal; deslize para ver todas as semanas">
            <svg viewBox={`0 0 ${largura} ${altura}`} width={largura} height={altura} role="img" aria-label={`Volume recebido em ${unidade} por semana. Total: ${numero.format(total)}.`} className="block max-w-none" style={{ width: largura, height: altura }}>
              <title>Volume recebido por semana em {unidade}</title>
              {[0, 0.5, 1].map((f) => {
                const y = base - f * (base - topo);
                return <g key={f}><line x1={esquerda} y1={y} x2={largura - direita} y2={y} stroke="var(--grade)" /><text x={esquerda - 6} y={y + 4} textAnchor="end" fill="var(--texto-fraco)" fontSize={11}>{numero.format(escala * f)}</text></g>;
              })}
              {semanas.map((s, i) => {
                const valor = s.quantidades[unidade];
                const h = valor / escala * (base - topo);
                const x = esquerda + passo * i + passo / 2;
                return (
                  <g key={s.semana}>
                    <rect x={x - passo * 0.3} y={base - h} width={passo * 0.6} height={h} rx={3} fill="var(--serie)"><title>Semana de {diaCurto(s.semana)}: {numero.format(valor)} {unidade}</title></rect>
                    <text x={x} y={base - h - 6} textAnchor="middle" fontSize={12} fill="var(--texto)">{numero.format(valor)}</text>
                    <text x={x} y={base + 19} textAnchor="middle" fontSize={11} fill="var(--texto-fraco)">{diaCurto(s.semana)}</text>
                  </g>
                );
              })}
              <text x={esquerda} y={altura - 4} fontSize={11} fill="var(--texto-fraco)">Semana de (segunda-feira)</text>
            </svg>
          </div>
          <p className="mt-2 text-xs txt-fraco">Cada unidade tem sua própria escala. O texto livre dos registros antigos não entra na soma.</p>
        </>
      )}
    </Cartao>
  );
}

function NaoComparecimentos({ fornecedores }: { fornecedores: IndicadorFornecedor[] }) {
  const faltas = fornecedores.filter((f) => f.naoComparecimentos > 0).sort((a, b) => b.naoComparecimentos - a.naoComparecimentos || a.fornecedor.localeCompare(b.fornecedor, 'pt-BR'));
  const maior = faltas[0]?.naoComparecimentos ?? 1;
  return (
    <Cartao titulo="Não-comparecimentos por fornecedor" detalhe="Faltas registradas na Agenda · comprimento da barra compara com o maior número da lista.">
      {!faltas.length ? <Vazio>Nenhum não-comparecimento registrado neste período.</Vazio> : (
        <ul className="space-y-4">
          {faltas.map((f) => (
            <li key={f.fornecedor}>
              <div className="mb-1.5 flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words font-semibold">{f.fornecedor}</span><b className="shrink-0 tabular-nums">{f.naoComparecimentos}</b></div>
              <div className="h-2.5 overflow-hidden rounded-sm bg-[var(--grade)]" aria-hidden><div className="h-full rounded-r-sm bg-[var(--serie)]" style={{ width: `${f.naoComparecimentos / maior * 100}%` }} /></div>
              <p className="mt-1.5 text-xs tabular-nums txt-fraco">{pct(f.taxaNaoComparecimento)} de {f.desfechos} desfechos (recebidos + faltas)</p>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

/** Indicadores independentes da Agenda; não exigem props para integrar a aba. */
export function Indicadores() {
  const { pode, carregando: sessaoCarregando } = useSessao();
  const [periodo, setPeriodo] = useState<30 | 90 | 180>(90);
  const [hoje, setHoje] = useState('');
  useEffect(() => {
    const atualizarDia = () => setHoje(dataLocalISO(new Date()));
    const inicio = window.setTimeout(atualizarDia, 0);
    const intervalo = window.setInterval(atualizarDia, 60_000);
    return () => { window.clearTimeout(inicio); window.clearInterval(intervalo); };
  }, []);
  const inicio = hoje ? new Date(`${hoje}T12:00:00`) : null;
  inicio?.setDate(inicio.getDate() - periodo + 1);
  const desde = inicio ? dataLocalISO(inicio) : undefined;
  const { itens, carregando, erro, recarregar } = useRecebimentos(desde);
  // O filtro inferior é aplicado no banco. O superior impede que previsões
  // futuras entrem nos indicadores de um período que termina hoje.
  const analise = useMemo(() => {
    const periodoItens = itens.filter((a) => a.data <= hoje);
    return {
      kpis: kpisPeriodo(periodoItens), fornecedores: porFornecedor(periodoItens),
      mapa: mapaDiaHora(periodoItens), semanas: volumePorSemana(periodoItens),
    };
  }, [itens, hoje]);
  const { kpis, fornecedores, mapa, semanas } = analise;
  const esperando = carregando || !hoje;

  if (!sessaoCarregando && !pode('recebimentos', 'ver')) {
    return <div className="painel sombra rounded-2xl p-6 text-center">Você não tem permissão para ver os indicadores de recebimento.</div>;
  }

  const cards = [
    { titulo: 'No horário', valor: pct(kpis.percentualPontual), base: `${kpis.pontuais} de ${kpis.comChegada} chegadas avaliadas` },
    { titulo: 'Atraso médio', valor: minutos(kpis.atrasoMedioMin), base: `${kpis.comChegada} chegadas · negativo = antecipação` },
    { titulo: 'Tempo médio de descarga', valor: minutos(kpis.tempoMedioDescargaMin), base: `${kpis.comDescarga} descargas com início e fim` },
    { titulo: 'Não-comparecimento', valor: pct(kpis.taxaNaoComparecimento), base: `${kpis.naoComparecimentos} de ${kpis.desfechos} desfechos` },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">Indicadores do recebimento</h2><p className="mt-1 text-xs txt-fraco">{desde && hoje ? `${diaCurto(desde)} a ${diaCurto(hoje)} · ${kpis.total} agendamento(s)` : 'Carregando período…'}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="painel flex gap-1 rounded-xl p-1" role="group" aria-label="Período dos indicadores">
            {([30, 90, 180] as const).map((dias) => <button key={dias} type="button" aria-pressed={periodo === dias} onClick={() => setPeriodo(dias)} className={cn('rounded-lg px-3 py-2 text-sm font-semibold', periodo === dias ? 'aba-ativa' : 'txt-fraco')}>{dias} dias</button>)}
          </div>
          <button type="button" onClick={() => { void recarregar(); }} disabled={carregando} aria-label="Atualizar indicadores" title="Atualizar indicadores" className="painel flex size-10 items-center justify-center rounded-xl disabled:opacity-50"><RefreshCw aria-hidden className={cn('size-4', carregando && 'motion-safe:animate-spin')} /></button>
        </div>
      </header>
      {erro && <p role="alert" className="rounded-xl border border-erro-500/30 bg-erro-500/10 p-3 text-sm">{erro}</p>}
      {esperando ? <p role="status" className="painel rounded-2xl p-8 text-center txt-fraco">Carregando indicadores…</p> : (
        <>
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => <div key={c.titulo} className="painel sombra min-w-0 rounded-2xl p-4"><h3 className="text-xs font-semibold txt-fraco">{c.titulo}</h3><p className="my-2 text-2xl font-bold tabular-nums sm:text-3xl">{c.valor}</p><p className="text-xs leading-relaxed txt-fraco">{c.base}</p></div>)}
          </div>
          {!kpis.comChegada && <div className="painel flex items-start gap-3 rounded-2xl p-4" role="status"><Info aria-hidden className="mt-0.5 size-5 shrink-0 text-info-500" /><p className="text-sm leading-relaxed txt-fraco">Os indicadores começam a contar a partir de quando o depósito passa a registrar a chegada. Neste período ainda não há chegadas com horário agendado para avaliar a pontualidade. Os registros antigos continuam na Agenda.</p></div>}
          <p className="text-xs leading-relaxed txt-fraco">No horário: chegada até {TOLERANCIA_MIN} min após o previsto. Médias usam somente carimbos válidos. Taxa de não-comparecimento: faltas ÷ (recebidos + faltas), sem pendências e cancelamentos.</p>
          <div className="grid min-w-0 gap-4 xl:grid-cols-2"><Pontualidade fornecedores={fornecedores} /><NaoComparecimentos fornecedores={fornecedores} /></div>
          <MapaCalor mapa={mapa} />
          <Volume semanas={semanas} />
        </>
      )}
    </div>
  );
}
