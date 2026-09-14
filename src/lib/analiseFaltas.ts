'use client';

/**
 * Análise de faltas e sobras — os números por trás dos gráficos.
 *
 * Só contagem e agrupamento, sem nada de tela: é isto que dá para testar sem
 * abrir o navegador, e é aqui que mora a única decisão sutil do módulo — o que
 * conta como "uma" falta.
 */

import { conferida, produtosDe } from '@/lib/ocorrencias';
import type { Ocorrencia, TipoOcorrencia } from '@/types/database';

export interface Filtro {
  tipo: TipoOcorrencia;
  /** 'aaaa-mm-dd' ou '' para sem limite */
  ini: string;
  fim: string;
  motorista: string;
  placa: string;
}

export const filtroVazio = (tipo: TipoOcorrencia = 'falta'): Filtro =>
  ({ tipo, ini: '', fim: '', motorista: '', placa: '' });

export function aplicar(itens: Ocorrencia[], f: Filtro): Ocorrencia[] {
  return itens.filter((o) => o.tipo === f.tipo
    && (!f.ini || o.data >= f.ini)
    && (!f.fim || o.data <= f.fim)
    && (!f.motorista || o.motorista === f.motorista)
    && (!f.placa || (o.placa ?? '') === f.placa));
}

// ---------------------------------------------------------------- contagens

/**
 * Uma fatia do ranking.
 *
 * `itens` é quantas OCORRÊNCIAS, `produtos` quantas linhas de produto. Os dois
 * existem porque respondem perguntas diferentes: uma ocorrência com seis
 * produtos é um evento só para o motorista, mas seis itens para o estoque.
 */
export interface Fatia {
  chave: string;
  rotulo: string;
  itens: number;
  produtos: number;
}

function ranking(
  itens: Ocorrencia[],
  chavesDe: (o: Ocorrencia) => { chave: string; rotulo: string }[],
): Fatia[] {
  const m = new Map<string, Fatia>();
  itens.forEach((o) => {
    const nProd = produtosDe(o).length;
    // um registro pode cair em mais de uma fatia (dois ajudantes na mesma
    // falta), mas nunca duas vezes na MESMA: sem isto, repetir o ajudante no
    // formulário contaria a falta em dobro para ele
    const vistas = new Set<string>();
    chavesDe(o).forEach(({ chave, rotulo }) => {
      if (!chave || vistas.has(chave)) return;
      vistas.add(chave);
      const f = m.get(chave) ?? { chave, rotulo, itens: 0, produtos: 0 };
      f.itens += 1;
      f.produtos += nProd;
      m.set(chave, f);
    });
  });
  return [...m.values()].sort((a, b) => b.itens - a.itens || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

export const porMotorista = (itens: Ocorrencia[]) =>
  ranking(itens, (o) => (o.motorista ? [{ chave: o.motorista, rotulo: o.motorista }] : []));

export const porPlaca = (itens: Ocorrencia[]) =>
  ranking(itens, (o) => (o.placa ? [{ chave: o.placa, rotulo: o.placa }] : []));

export const porAjudante = (itens: Ocorrencia[]) =>
  ranking(itens, (o) => (o.ajudantes ?? []).filter(Boolean).map((a) => ({ chave: a, rotulo: a })));

/**
 * Por produto. Aqui `itens` conta em quantas ocorrências o produto apareceu —
 * que é a pergunta ("quantas vezes este item deu problema"), não quantas vezes
 * ele foi digitado.
 */
export const porProduto = (itens: Ocorrencia[]) =>
  ranking(itens, (o) => produtosDe(o).map((p) => ({
    chave: p.produto,
    rotulo: p.descricao ? `${p.produto} · ${p.descricao}` : p.produto,
  })));

export const porLote = (itens: Ocorrencia[]) =>
  ranking(itens, (o) => (o.lote ? [{ chave: o.lote, rotulo: o.lote }] : []));

/**
 * Mantém as N maiores e junta o resto em "Outros".
 *
 * A cauda some do gráfico mas não da conta: sem a barra de "Outros", um
 * ranking de 8 numa lista de 60 sugere que aquilo é o total, e não é.
 */
export function comOutros(fatias: Fatia[], n: number): Fatia[] {
  if (fatias.length <= n) return fatias;
  const cabeca = fatias.slice(0, n);
  const cauda = fatias.slice(n);
  return [...cabeca, {
    chave: '__outros',
    rotulo: `Outros (${cauda.length})`,
    itens: cauda.reduce((a, f) => a + f.itens, 0),
    produtos: cauda.reduce((a, f) => a + f.produtos, 0),
  }];
}

// ---------------------------------------------------------------- tempo

export interface PontoMes { mes: string; rotulo: string; itens: number }

/**
 * Por mês, SEM buracos: mês sem ocorrência entra com zero.
 *
 * Pular o mês vazio encostaria dezembro em fevereiro e a linha mostraria uma
 * subida que não houve — o gráfico mentiria por omissão.
 */
export function porMes(itens: Ocorrencia[]): PontoMes[] {
  if (!itens.length) return [];
  const conta = new Map<string, number>();
  itens.forEach((o) => {
    const m = o.data.slice(0, 7);
    conta.set(m, (conta.get(m) ?? 0) + 1);
  });
  const meses = [...conta.keys()].sort();
  const [aI, mI] = meses[0].split('-').map(Number);
  const [aF, mF] = meses[meses.length - 1].split('-').map(Number);

  const saida: PontoMes[] = [];
  for (let a = aI, m = mI; a < aF || (a === aF && m <= mF); m === 12 ? (m = 1, a++) : m++) {
    const chave = `${a}-${String(m).padStart(2, '0')}`;
    saida.push({ mes: chave, rotulo: `${String(m).padStart(2, '0')}/${String(a).slice(2)}`, itens: conta.get(chave) ?? 0 });
  }
  return saida;
}

// ---------------------------------------------------------------- resumo

export interface Resumo {
  itens: number;
  produtos: number;
  conferidas: number;
  pendentes: number;
  motoristas: number;
  placas: number;
  /** média de ocorrências por mês no período — null com menos de 2 meses */
  porMesMedia: number | null;
}

export function resumir(itens: Ocorrencia[]): Resumo {
  const meses = porMes(itens);
  return {
    itens: itens.length,
    produtos: itens.reduce((a, o) => a + produtosDe(o).length, 0),
    conferidas: itens.filter(conferida).length,
    pendentes: itens.filter((o) => !conferida(o)).length,
    motoristas: new Set(itens.map((o) => o.motorista).filter(Boolean)).size,
    placas: new Set(itens.map((o) => o.placa).filter(Boolean)).size,
    // um mês só não é média de nada
    porMesMedia: meses.length > 1
      ? Math.round((itens.length / meses.length) * 10) / 10
      : null,
  };
}

export const pct = (parte: number, todo: number) => (todo ? (parte / todo) * 100 : 0);

export const fmtPct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

export const fmtNum = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
