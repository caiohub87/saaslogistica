/** Cálculos do depósito. Não dependem de React, do banco ou do relógio global. */
import type { Agendamento, UnidadeQtd } from '@/types/database';

export const TOLERANCIA_MIN = 15;
const MINUTO = 60_000;
const UNIDADES: UnidadeQtd[] = ['paletes', 'caixas', 'volumes'];

/** Datas da agenda são civis: converter para UTC trocaria o dia à noite. */
export function dataLocalISO(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/** Aceita também os segundos que uma coluna time do Postgres pode devolver. */
export function previstoEm(a: Agendamento): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.data) || !a.hora || !/^\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(a.hora)) return null;
  const [ano, mes, dia] = a.data.split('-').map(Number);
  const [hora, minuto, segundo = 0] = a.hora.split(':').map(Number);
  if (hora > 23 || minuto > 59 || segundo >= 60) return null;
  const previsto = new Date(ano, mes - 1, dia, hora, minuto, segundo);
  return previsto.getFullYear() === ano && previsto.getMonth() === mes - 1 && previsto.getDate() === dia
    ? previsto : null;
}

function instante(valor?: string | null): number | null {
  if (!valor) return null;
  const ms = new Date(valor).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Negativo = chegou antes. Ausência ou carimbo inválido nunca vira zero. */
export function atrasoMin(a: Agendamento): number | null {
  const previsto = previstoEm(a);
  const chegada = instante(a.chegada_em);
  return previsto && chegada !== null ? (chegada - previsto.getTime()) / MINUTO : null;
}

/** null significa que ainda não há informação para avaliar a pontualidade. */
export function pontual(a: Agendamento): boolean | null {
  const atraso = atrasoMin(a);
  return atraso === null ? null : atraso <= TOLERANCIA_MIN;
}

/** Descartamos intervalos invertidos em vez de esconder um carimbo incorreto. */
export function tempoDescargaMin(a: Agendamento): number | null {
  const inicio = instante(a.descarga_em);
  const fim = instante(a.recebido_em);
  return inicio !== null && fim !== null && fim >= inicio ? (fim - inicio) / MINUTO : null;
}

/** O alerta operacional usa 30 min; a tolerância dos indicadores usa 15 min. */
export function atrasadoAgora(a: Agendamento, agora: Date): boolean {
  const previsto = previstoEm(a);
  return a.tipo === 'receber' && a.status === 'Agendado' && a.data === dataLocalISO(agora)
    && previsto !== null && agora.getTime() > previsto.getTime() + 30 * MINUTO;
}

export interface KpisRecebimentos {
  total: number;
  recebidos: number;
  cancelados: number;
  comChegada: number;
  pontuais: number;
  percentualPontual: number | null;
  /** Média assinada: uma média negativa representa antecipação. */
  atrasoMedioMin: number | null;
  comDescarga: number;
  tempoMedioDescargaMin: number | null;
  naoComparecimentos: number;
  /** Recebidos + não-comparecimentos; pendências não diluem a taxa. */
  desfechos: number;
  taxaNaoComparecimento: number | null;
}

const media = (valores: number[]) => valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;

/**
 * Só os carimbos válidos alimentam tempos e pontualidade. Linhas antigas ainda
 * contam no total e nos desfechos, mas não ganham horários inventados.
 * Cancelamentos e faltas não participam das médias de chegada/descarga.
 */
export function kpisPeriodo(itens: readonly Agendamento[]): KpisRecebimentos {
  const recebimentos = itens.filter((a) => a.tipo === 'receber');
  const validos = recebimentos.filter((a) => a.status !== 'Cancelado' && a.status !== 'Não compareceu');
  const atrasos = validos.map(atrasoMin).filter((v): v is number => v !== null);
  const descargas = validos.map(tempoDescargaMin).filter((v): v is number => v !== null);
  const pontuais = atrasos.filter((v) => v <= TOLERANCIA_MIN).length;
  const recebidos = recebimentos.filter((a) => a.status === 'Recebido').length;
  const naoComparecimentos = recebimentos.filter((a) => a.status === 'Não compareceu').length;
  const desfechos = recebidos + naoComparecimentos;
  return {
    total: recebimentos.length, recebidos,
    cancelados: recebimentos.filter((a) => a.status === 'Cancelado').length,
    comChegada: atrasos.length, pontuais,
    percentualPontual: atrasos.length ? pontuais / atrasos.length * 100 : null,
    atrasoMedioMin: media(atrasos), comDescarga: descargas.length,
    tempoMedioDescargaMin: media(descargas), naoComparecimentos, desfechos,
    taxaNaoComparecimento: desfechos ? naoComparecimentos / desfechos * 100 : null,
  };
}

export interface IndicadorFornecedor extends KpisRecebimentos {
  fornecedor: string;
  /** Quantidade de agendamentos do fornecedor, inclusive cancelados. */
  n: number;
}

/** Fornecedores sem carimbo ficam no final, com percentual null, nunca 0%. */
export function porFornecedor(itens: readonly Agendamento[]): IndicadorFornecedor[] {
  const grupos = new Map<string, Agendamento[]>();
  for (const a of itens) {
    if (a.tipo !== 'receber') continue;
    const nome = a.fornecedor?.trim() || 'Fornecedor não informado';
    const grupo = grupos.get(nome) ?? [];
    grupo.push(a);
    grupos.set(nome, grupo);
  }
  return Array.from(grupos, ([fornecedor, grupo]) => ({ fornecedor, n: grupo.length, ...kpisPeriodo(grupo) }))
    .sort((a, b) => (b.percentualPontual ?? -1) - (a.percentualPontual ?? -1)
      || b.comChegada - a.comChegada || a.fornecedor.localeCompare(b.fornecedor, 'pt-BR'));
}

export interface MapaHorarios {
  /** Segunda a domingo; getDay() continua usando domingo = 0. */
  dias: { dia: number; rotulo: string; horas: number[] }[];
  maior: number;
  total: number;
  semHora: number;
}

/** É demanda agendada, não ocupação medida: inclui faltas, exclui cancelados. */
export function mapaDiaHora(itens: readonly Agendamento[]): MapaHorarios {
  const rotulos = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dias = [1, 2, 3, 4, 5, 6, 0].map((dia) => ({ dia, rotulo: rotulos[dia], horas: Array<number>(24).fill(0) }));
  let maior = 0, total = 0, semHora = 0;
  for (const a of itens) {
    if (a.tipo !== 'receber' || a.status === 'Cancelado') continue;
    const previsto = previstoEm(a);
    if (!previsto) { semHora++; continue; }
    const linha = dias.find((d) => d.dia === previsto.getDay())!;
    maior = Math.max(maior, ++linha.horas[previsto.getHours()]);
    total++;
  }
  return { dias, maior, total, semHora };
}

export interface VolumeSemana {
  /** Segunda-feira da semana da data agendada, em horário local. */
  semana: string;
  quantidades: Record<UnidadeQtd, number>;
}

/**
 * Só cargas recebidas com quantidade estruturada. Nunca somamos paletes com
 * caixas nem tentamos converter o texto livre antigo em quantidade.
 * A semana usa a data agendada, a mesma referência do filtro de período.
 */
export function volumePorSemana(itens: readonly Agendamento[]): VolumeSemana[] {
  const semanas = new Map<string, VolumeSemana>();
  for (const a of itens) {
    if (a.tipo !== 'receber' || a.status !== 'Recebido' || a.qtd == null
      || !Number.isFinite(a.qtd) || a.qtd < 0 || !a.unidade_qtd || !UNIDADES.includes(a.unidade_qtd)) continue;
    const data = previstoEm({ ...a, hora: '12:00' });
    if (!data) continue;
    data.setDate(data.getDate() - (data.getDay() + 6) % 7);
    const semana = dataLocalISO(data);
    const grupo = semanas.get(semana) ?? { semana, quantidades: { paletes: 0, caixas: 0, volumes: 0 } };
    grupo.quantidades[a.unidade_qtd] += a.qtd;
    semanas.set(semana, grupo);
  }
  const ordenadas = Array.from(semanas.values()).sort((a, b) => a.semana.localeCompare(b.semana));
  if (!ordenadas.length) return [];
  // Semanas intermediárias vazias aparecem como zero, sem comprimir o tempo.
  const resultado: VolumeSemana[] = [];
  const cursor = new Date(`${ordenadas[0].semana}T12:00:00`);
  const fim = ordenadas[ordenadas.length - 1].semana;
  while (dataLocalISO(cursor) <= fim) {
    const semana = dataLocalISO(cursor);
    resultado.push(semanas.get(semana) ?? { semana, quantidades: { paletes: 0, caixas: 0, volumes: 0 } });
    cursor.setDate(cursor.getDate() + 7);
  }
  return resultado;
}
