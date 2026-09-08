'use client';

/**
 * Reentregas — o palete que voltou para o depósito.
 *
 * O pedido que não foi entregue desce da carroceria no depósito. Alguém monta
 * o palete a partir do relatório de entregas (as linhas em REENTREGA), pede a
 * reentrega e imprime um documento para grudar no palete. A partir daí o
 * palete anda: foto, aprovação, acompanhamento, e o fecho como reenviado ou
 * devolvido.
 *
 * O que vem do relatório é contado e GRAVADO no registro, não referenciado: o
 * relatório mora no localStorage e é trocado a cada importação, então uma
 * solicitação que apontasse para ele perderia o conteúdo na primeira troca.
 * Mesma razão de `ocorrencias.motorista` ser texto.
 */

import type { DesfechoReentrega, PedidoReentrega, Reentrega } from '@/types/database';
import type { Pedido } from '@/types/relatorio';

/**
 * Onde a solicitação está.
 *
 * Sai dos carimbos, não de uma coluna: uma coluna `situacao` seria uma segunda
 * verdade para manter em sincronia com as datas, e elas já dizem tudo.
 */
export type SituacaoReentrega = 'foto' | 'aprovacao' | 'deposito' | 'fechada';

export function situacaoDe(r: Reentrega): SituacaoReentrega {
  if (r.finalizado_em) return 'fechada';
  if (!r.foto) return 'foto';
  if (!r.aprovado_em) return 'aprovacao';
  return 'deposito';
}

export const SITUACAO: Record<SituacaoReentrega, { rotulo: string; cor: string; passo: string }> = {
  foto: {
    rotulo: 'Aguardando foto',
    cor: 'bg-ouro-100 text-ouro-700',
    passo: 'O depósito precisa anexar o documento ao palete e fotografar.',
  },
  aprovacao: {
    rotulo: 'Aguardando aprovação',
    cor: 'bg-marinho-100 text-marinho-800',
    passo: 'A foto chegou. Falta aprovar.',
  },
  deposito: {
    rotulo: 'No depósito',
    cor: 'bg-info-500/15 text-info-500',
    passo: 'Aprovada, esperando sair de novo ou ser devolvida.',
  },
  fechada: {
    rotulo: 'Finalizada',
    cor: 'bg-ok-500/15 text-ok-600',
    passo: 'Fechada.',
  },
};

export const DESFECHO: Record<DesfechoReentrega, { rotulo: string; cor: string }> = {
  reenviada: { rotulo: 'Reenviada', cor: 'bg-ok-500/15 text-ok-600' },
  devolvida: { rotulo: 'Devolvida', cor: 'bg-erro-500/15 text-erro-600' },
};

/** Como a solicitação aparece na lista: a situação, ou o desfecho se fechada. */
export function selo(r: Reentrega): { rotulo: string; cor: string } {
  const s = situacaoDe(r);
  if (s === 'fechada' && r.desfecho) return DESFECHO[r.desfecho];
  return SITUACAO[s];
}

// ---------------------------------------------------------------- do relatório

/** Chave de um pedido na tela de seleção: carga + número, que é o par único. */
export const chaveDe = (p: Pedido) => `${p.carga}|${p.pedido}`;

/** O pedido do relatório reduzido ao que a solicitação precisa guardar. */
export const paraReentrega = (p: Pedido): PedidoReentrega => ({
  pedido: p.pedido,
  cliente: p.cliente,
  codcli: p.codcli,
  carga: p.carga,
  peso: p.peso,
  valor: p.valor,
  motivo: p.motivo,
});

export interface ResumoSelecao {
  /** clientes DISTINTOS, que é o que o documento pede — não o nº de pedidos */
  clientes: number;
  pedidos: number;
  peso: number;
  valor: number;
  motorista: string;
  ajudantes: string[];
  /** mais de uma carga na seleção: o motorista deixa de ser um só */
  cargas: string[];
}

/**
 * Conta e soma o que foi marcado.
 *
 * Motorista e ajudantes saem dos pedidos marcados. Quando a seleção mistura
 * cargas, a equipe não é uma só — a tela avisa, e aqui fica a do primeiro
 * pedido para o campo não vir vazio.
 */
export function resumir(peds: Pedido[]): ResumoSelecao {
  const clientes = new Set<string>();
  const cargas = new Set<string>();
  let peso = 0, valor = 0;
  peds.forEach((p) => {
    // o código identifica o cliente melhor que a razão social, que vem grafada
    // de formas diferentes conforme o cadastro
    clientes.add(p.codcli || p.cliente);
    if (p.carga) cargas.add(p.carga);
    peso += p.peso;
    valor += p.valor;
  });
  const primeiro = peds[0];
  const ajudantes = primeiro
    ? [...new Set([primeiro.aj1, primeiro.aj2, primeiro.aj3, primeiro.aj4].filter(Boolean))]
    : [];
  return {
    clientes: clientes.size,
    pedidos: peds.length,
    peso, valor,
    motorista: primeiro?.motorista ?? '',
    ajudantes,
    cargas: [...cargas].sort(),
  };
}

// ---------------------------------------------------------------- formato

export const fmtPeso = (n: number) =>
  (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtBRL = (n: number) =>
  'R$ ' + (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** '2026-08-21' -> '21/08/2026' */
export const fmtData = (iso: string) => {
  const [a, m, d] = String(iso ?? '').split('-');
  return d ? `${d}/${m}/${a}` : (iso ?? '');
};

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtQuando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

/** Traduz o erro do banco em instrução. */
export const dica = (msg: string) => {
  const semTabela = /Could not find the table '(?:public\.)?(\w+)'/i.exec(msg);
  if (semTabela) return ` — a tabela ${semTabela[1]} não existe: rode supabase/21_reentregas.sql no Supabase.`;
  if (/Could not find the function|does not exist|schema cache/i.test(msg)) {
    return ' — rode supabase/21_reentregas.sql no Supabase.';
  }
  // as transições são funções do banco: a mensagem delas já explica o motivo
  if (/permission|policy|row-level/i.test(msg)) return ' — seu acesso não tem permissão para isso.';
  return '';
};
