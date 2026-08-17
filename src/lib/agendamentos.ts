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

/** O status avanca em ciclo, clicando nele. */
export const CICLO: Record<TipoAgendamento, StatusAgendamento[]> = {
  enviar: ['Agendado', 'Montado', 'Enviado', 'Cancelado'],
  receber: ['Agendado', 'Recebido', 'Cancelado'],
};

/** Status que contam como concluidos: esmaecem e vao para o fim — nunca somem. */
export const CONCLUIDOS: Record<TipoAgendamento, StatusAgendamento[]> = {
  enviar: ['Enviado', 'Cancelado'],
  receber: ['Recebido', 'Cancelado'],
};

export function proximoStatus(tipo: TipoAgendamento, atual: StatusAgendamento): StatusAgendamento {
  const seq = CICLO[tipo];
  return seq[(seq.indexOf(atual) + 1) % seq.length];
}

export const concluido = (tipo: TipoAgendamento, s: StatusAgendamento) => CONCLUIDOS[tipo].includes(s);

/** Cor de cada status, nas mesmas famílias do sistema antigo. */
export const COR_STATUS: Record<StatusAgendamento, string> = {
  Agendado: 'bg-marinho-100 text-marinho-800',
  Montado: 'bg-ouro-100 text-ouro-700',
  Enviado: 'bg-ok-500/15 text-ok-600',
  Recebido: 'bg-ok-500/15 text-ok-600',
  Cancelado: 'bg-erro-500/15 text-erro-600',
};

export const hojeISO = () => new Date().toISOString().slice(0, 10);

/** HOJE / ATRASADO — só para o que ainda está pendente. */
export function selo(tipo: TipoAgendamento, data: string, status: StatusAgendamento) {
  if (concluido(tipo, status)) return null;
  const h = hojeISO();
  if (data === h) return 'HOJE' as const;
  if (data < h) return 'ATRASADO' as const;
  return null;
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
