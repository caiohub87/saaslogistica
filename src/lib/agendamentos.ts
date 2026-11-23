/**
 * Regras dos agendamentos — portadas do sistema antigo sem mudar comportamento.
 *
 * As duas telas (Cargas a Enviar e Cargas a Receber) usam a mesma tabela
 * `agendamentos`, separadas pela coluna `tipo`. No sistema antigo eram
 * sub-abas com senha; aqui viraram telas independentes, cada uma com a sua
 * permissao — quem cuida do deposito nao precisa mais decorar 1609.
 */

import { PackageCheck, Truck, type LucideIcon } from 'lucide-react';

import type { StatusAgendamento, TipoAgendamento } from '@/types/database';

/**
 * O status avanca clicando nele.
 *
 * Enviar: ciclo antigo, sem mudança. Receber: só ANDA PARA FRENTE, e cada passo
 * grava a hora (chegada, início e fim da descarga) — é dessas horas que saem a
 * pontualidade e o tempo de descarga. "Cancelado" e "Não compareceu" saem do
 * ciclo e viram botões próprios: são desfechos, não etapas.
 */
export const CICLO: Record<TipoAgendamento, StatusAgendamento[]> = {
  enviar: ['Agendado', 'Montado', 'Enviado', 'Cancelado'],
  receber: ['Agendado', 'Chegou', 'Descarregando', 'Recebido'],
};

/** Status que contam como concluidos: esmaecem e vao para o fim — nunca somem. */
export const CONCLUIDOS: Record<TipoAgendamento, StatusAgendamento[]> = {
  enviar: ['Enviado', 'Cancelado'],
  receber: ['Recebido', 'Cancelado', 'Não compareceu'],
};

/** Próximo status; no receber, null quando já está no fim (ou fora do ciclo). */
export function proximoStatus(tipo: TipoAgendamento, atual: StatusAgendamento): StatusAgendamento | null {
  const seq = CICLO[tipo];
  const i = seq.indexOf(atual);
  if (tipo === 'receber') return i >= 0 && i < seq.length - 1 ? seq[i + 1] : null;
  return seq[(i + 1) % seq.length];
}

/** Coluna de hora que cada status do receber carimba ao ser alcançado. */
export const CARIMBO: Partial<Record<StatusAgendamento, 'chegada_em' | 'descarga_em' | 'recebido_em'>> = {
  Chegou: 'chegada_em',
  Descarregando: 'descarga_em',
  Recebido: 'recebido_em',
};

export const concluido = (tipo: TipoAgendamento, s: StatusAgendamento) => CONCLUIDOS[tipo].includes(s);

/** Cor de cada status, nas mesmas famílias do sistema antigo. */
export const COR_STATUS: Record<StatusAgendamento, string> = {
  Agendado: 'bg-marinho-100 text-marinho-800',
  Montado: 'bg-ouro-100 text-ouro-700',
  Enviado: 'bg-ok-500/15 text-ok-600',
  Recebido: 'bg-ok-500/15 text-ok-600',
  Cancelado: 'bg-erro-500/15 text-erro-600',
  Chegou: 'bg-info-500/15 text-info-500',
  Descarregando: 'bg-ouro-100 text-ouro-700',
  'Não compareceu': 'bg-erro-500/15 text-erro-600',
};

/**
 * Data de hoje no horário LOCAL. toISOString() devolve a data em UTC: depois
 * das 21h no Brasil já é "amanhã", e a agenda marcava o dia errado como HOJE.
 */
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Depois de quantos minutos da hora marcada um recebimento sem chegada vira ATRASADO. */
export const ATRASO_RECEBER_MIN = 30;

/**
 * HOJE / ATRASADO — só para o que ainda está pendente.
 *
 * No receber, hoje com hora marcada: passou a hora + 30 min e o caminhão não
 * chegou (ainda Agendado) → ATRASADO já no mesmo dia, não só no dia seguinte.
 */
export function selo(tipo: TipoAgendamento, data: string, status: StatusAgendamento, hora?: string | null) {
  if (concluido(tipo, status)) return null;
  const h = hojeISO();
  if (data < h) return 'ATRASADO' as const;
  if (data !== h) return null;
  if (tipo === 'receber' && status === 'Agendado' && hora) {
    const [hh, mm] = hora.split(':').map(Number);
    const agora = new Date();
    if (agora.getHours() * 60 + agora.getMinutes() > hh * 60 + mm + ATRASO_RECEBER_MIN) return 'ATRASADO' as const;
  }
  return 'HOJE' as const;
}

/** "08:42" de um timestamptz, no horário local. */
export const horaDe = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null;

/** Minutos entre a hora marcada e a chegada real (positivo = atrasou). */
export function atrasoChegadaMin(a: { data: string; hora: string | null; chegada_em?: string | null }) {
  if (!a.hora || !a.chegada_em) return null;
  const previsto = new Date(`${a.data}T${a.hora.slice(0, 5)}:00`);
  return Math.round((new Date(a.chegada_em).getTime() - previsto.getTime()) / 60000);
}

/** Quantidade para mostrar: o número novo, ou o texto livre das linhas antigas. */
export function qtdTexto(a: { qtd?: number | null; unidade_qtd?: string | null; volumes: string | null }) {
  if (a.qtd != null) return `${a.qtd.toLocaleString('pt-BR')} ${a.unidade_qtd ?? 'volumes'}`;
  return a.volumes;
}

/** Configuração de cada tela: rótulos e campos mudam, o resto é igual. */
export interface ConfigAgenda {
  tipo: TipoAgendamento;
  tela: string;               // chave da permissão
  titulo: string;
  subtitulo: string;
  /** nome principal mostrado no calendário e na tabela */
  campoNome: 'cliente' | 'fornecedor';
  rotuloNome: string;
  temHora: boolean;
  /** segunda coluna: rota (enviar) ou volumes (receber) */
  campoSecundario: 'rota' | 'volumes';
  rotuloSecundario: string;
  Icone: LucideIcon;
}

export const CONFIG: Record<TipoAgendamento, ConfigAgenda> = {
  enviar: {
    tipo: 'enviar', tela: 'agendamentos',
    titulo: 'Cargas a Enviar', subtitulo: 'Agenda do montador de cargas.',
    campoNome: 'cliente', rotuloNome: 'Cliente',
    temHora: false,
    campoSecundario: 'rota', rotuloSecundario: 'Rota',
    Icone: Truck,
  },
  receber: {
    tipo: 'receber', tela: 'recebimentos',
    titulo: 'Cargas a Receber', subtitulo: 'Agenda do depósito.',
    campoNome: 'fornecedor', rotuloNome: 'Fornecedor / origem',
    temHora: true,
    campoSecundario: 'volumes', rotuloSecundario: 'Qtd / volumes',
    Icone: PackageCheck,
  },
};

export const MESES_NOME = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
