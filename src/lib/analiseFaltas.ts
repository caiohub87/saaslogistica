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

/** As dimensões que dá para recortar clicando numa barra do ranking. */
export type Dimensao = 'motorista' | 'placa' | 'produto' | 'ajudante';

export interface Filtro {
  tipo: TipoOcorrencia;
  /** 'aaaa-mm-dd' ou '' para sem limite */
  ini: string;
  fim: string;
  motorista: string;
  placa: string;
  /** código do produto, não a descrição — é ele que identifica */
  produto: string;
  ajudante: string;
}

export const filtroVazio = (tipo: TipoOcorrencia = 'falta'): Filtro =>
  ({ tipo, ini: '', fim: '', motorista: '', placa: '', produto: '', ajudante: '' });

export function aplicar(itens: Ocorrencia[], f: Filtro): Ocorrencia[] {
  return itens.filter((o) => o.tipo === f.tipo
    && (!f.ini || o.data >= f.ini)
    && (!f.fim || o.data <= f.fim)
    && (!f.motorista || o.motorista === f.motorista)
    && (!f.placa || (o.placa ?? '') === f.placa)
    && (!f.produto || produtosDe(o).some((p) => p.produto === f.produto))
    && (!f.ajudante || (o.ajudantes ?? []).includes(f.ajudante)));
}

/** Os recortes ativos, para a tela mostrar e deixar desfazer um a um. */
export function recortes(f: Filtro): { dim: Dimensao; valor: string }[] {
  const saida: { dim: Dimensao; valor: string }[] = [];
  (['motorista', 'placa', 'produto', 'ajudante'] as const).forEach((d) => {
    if (f[d]) saida.push({ dim: d, valor: f[d] });
  });
  return saida;
}

// ---------------------------------------------------------------- período anterior

/**
 * A janela imediatamente anterior, do MESMO tamanho.
 *
 * Só existe quando há período escolhido: sem início e fim não há "tamanho" a
 * espelhar, e comparar o histórico inteiro com um vazio não diz nada.
 *
 * O tamanho conta os dois extremos (1 a 31 de janeiro são 31 dias), e a janela
 * anterior termina na véspera do início — sem sobreposição de um dia, que
 * contaria a mesma ocorrência dos dois lados.
 */
export function janelaAnterior(f: Filtro): { ini: string; fim: string } | null {
  if (!f.ini || !f.fim) return null;
  const d = (s: string) => {
    const [a, m, dd] = s.split('-').map(Number);
    return new Date(a, m - 1, dd);
  };
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

  const ini = d(f.ini), fim = d(f.fim);
  if (fim < ini) return null;
  const dias = Math.round((fim.getTime() - ini.getTime()) / 86400000) + 1;

  const fimAnt = new Date(ini); fimAnt.setDate(fimAnt.getDate() - 1);
  const iniAnt = new Date(fimAnt); iniAnt.setDate(iniAnt.getDate() - (dias - 1));
  return { ini: iso(iniAnt), fim: iso(fimAnt) };
}

/**
 * Variação percentual de agora contra antes.
 *
 * Null quando antes era zero: sair de 0 para 5 não é "500% pior", é aparecer —
 * e uma seta com número nesse caso mente sobre a escala do que mudou.
 */
export function variacao(agora: number, antes: number): number | null {
  if (!antes) return null;
  return ((agora - antes) / antes) * 100;
}

// ---------------------------------------------------------------- cruzamento

export interface Cruzamento {
  linhas: string[];
  colunas: string[];
  /** contagem em [linha][coluna] */
  celulas: Record<string, Record<string, number>>;
  maior: number;
}

/**
 * Motorista × veículo: onde costuma morar a causa.
 *
 * Um motorista que só dá falta num carro específico aponta para o carro (ou
 * para a dupla), não para a pessoa — e é isso que dois rankings separados não
 * conseguem mostrar, por mais que se olhe um ao lado do outro.
 *
 * Limitado aos N maiores de cada lado: a grade completa seria ilegível, e a
 * cauda é onde estão os pares de uma ocorrência só, que não formam padrão.
 */
export function cruzar(itens: Ocorrencia[], n = 6): Cruzamento {
  const linhas = porMotorista(itens).slice(0, n).map((f) => f.chave);
  const colunas = porPlaca(itens).slice(0, n).map((f) => f.chave);
  const setL = new Set(linhas), setC = new Set(colunas);

  const celulas: Record<string, Record<string, number>> = {};
  linhas.forEach((l) => { celulas[l] = Object.fromEntries(colunas.map((c) => [c, 0])); });

  let maior = 0;
  itens.forEach((o) => {
    const l = o.motorista, c = o.placa ?? '';
    if (!setL.has(l) || !setC.has(c)) return;
    const v = (celulas[l][c] += 1);
    if (v > maior) maior = v;
  });
  return { linhas, colunas, celulas, maior };
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
