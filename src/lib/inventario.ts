/**
 * Regras do inventario — portadas do sistema antigo SEM alterar nenhum calculo.
 *
 * Todas as formulas daqui foram conferidas contra a planilha que a gerencia usa:
 *   CANOINHAS 97,56% · NUTRIMENTAL 96,82% · MAIO 97,19% · 2026 99,33%
 * Se algum numero mudar, o relatorio da gerencia deixa de fechar. Nao mexer sem
 * conferir contra aqueles quatro casos.
 */

import type { Inventario, ProdutoInventario } from '@/types/database';

// ---------------------------------------------------------------- numeros

/** Le numero no formato brasileiro: "3.806,87" -> 3806.87 e "2.145" -> 2145. */
export function parseNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // milhar pt-BR
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const semAcento = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const low = (s: unknown) => semAcento(s).trim().toLowerCase();
export const norm = (s: unknown) => String(s ?? '').trim();

export const fmtQtd = (n: number) => (+n || 0).toLocaleString('pt-BR');
export const fmtBRL = (n: number) =>
  'R$ ' + (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtMoeda = (n: number) =>
  (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtPct = (n: number | null) =>
  n == null ? '—' : n.toFixed(2).replace('.', ',') + '%';
/** '2026-04-16' -> '16/04/2026' */
export const fmtData = (iso: string) => {
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
};

// ---------------------------------------------------------------- totais

export interface TotaisInventario {
  /** produtos listados */
  total: number;
  /** quantos tem Dif Qtde diferente de zero */
  ndiv: number;
  /** soma do Dif Qtde (liquido) */
  qtd: number;
  /** soma do Dif Financeira (liquido) */
  fin: number;
  /** soma so das divergencias positivas — a "Entrada" do relatorio */
  pos: number;
  /** soma so das negativas, negativa — o modulo dela e a "Saida" */
  neg: number;
}

export function totais(produtos: ProdutoInventario[]): TotaisInventario {
  const t: TotaisInventario = { total: produtos.length, ndiv: 0, qtd: 0, fin: 0, pos: 0, neg: 0 };
  produtos.forEach((p) => {
    const q = +p.dif_qtde || 0;
    const f = +p.dif_financeira || 0;
    t.qtd += q;
    t.fin += f;
    if (f > 0) t.pos += f;
    else t.neg += f;
    if (q) t.ndiv += 1;
  });
  return t;
}

/**
 * Acuracidade = 1 - (Entrada + Saida) / R$ Est. Invent.
 *
 * E por VALOR, somando as divergencias dos DOIS sentidos — nao e contagem de
 * itens. Sem o valor do estoque nao ha como calcular: devolve null para a tela
 * mostrar "—" em vez de um numero inventado.
 */
export function acuracidade(est: number, entrada: number, saida: number): number | null {
  const e = +est || 0;
  if (!e) return null;
  return (1 - ((+entrada || 0) + (+saida || 0)) / e) * 100;
}

/** Atalho a partir dos totais de um lancamento. */
export const acuracidadeDe = (t: TotaisInventario, est: number) =>
  acuracidade(est, t.pos, Math.abs(t.neg));

/** % Dif = Diferenca / R$ Est. Invent. — com sinal. */
export function pctEstoque(est: number, dif: number): number | null {
  const e = +est || 0;
  return e ? (dif / e) * 100 : null;
}

// ---------------------------------------------------------------- Div Ant

/**
 * Div Ant = o Dif Qtde daquele produto no inventario ANTERIOR do mesmo
 * fornecedor; 0 quando nao existe.
 *
 * Nao fica gravado no banco de proposito: e resolvido na leitura, para se
 * auto-corrigir caso um inventario antigo seja lancado depois.
 */
export function mapaDivAnt(lanc: Inventario, todos: Inventario[]): Record<string, number> {
  const anterior = todos
    .filter((l) => l.fornecedor === lanc.fornecedor && l.data_inventario < lanc.data_inventario)
    .sort((a, b) => (a.data_inventario < b.data_inventario ? 1 : -1))[0];

  const m: Record<string, number> = {};
  if (anterior) {
    (anterior.produtos ?? []).forEach((p) => {
      if (p.dif_qtde) m[p.id] = p.dif_qtde;
    });
  }
  return m;
}

export interface ProdutoComAnt extends ProdutoInventario {
  div_ant: number;
}

export function comDivAnt(lanc: Inventario, todos: Inventario[]): ProdutoComAnt[] {
  const ant = mapaDivAnt(lanc, todos);
  return (lanc.produtos ?? []).map((p) => ({ ...p, div_ant: ant[p.id] ?? 0 }));
}

// ---------------------------------------------------------------- leitura do arquivo

/**
 * Le o relatorio de conferencia do ERP.
 *
 * O .xls que o ERP gera nao e Excel: e HTML em ISO-8859-1. Decodificar como
 * UTF-8 quebra todo acento. E quando a pessoa abre no Excel, mexe e salva, o
 * Excel embrulha a tabela de dados em tabelas de layout — por isso vale a
 * tabela com mais celulas PROPRIAS, nao a primeira do documento.
 */
export async function lerArquivo(file: File): Promise<unknown[][]> {
  const buf = new Uint8Array(await file.arrayBuffer());

  const porSheetJS = async (): Promise<unknown[][]> => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('A planilha está vazia.');
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
  };

  // assinatura binaria: .xlsx e um ZIP ("PK"), .xls antigo e OLE
  const zip = buf[0] === 0x50 && buf[1] === 0x4b;
  const ole = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
  if (zip || ole) return porSheetJS();

  let cabeca = '';
  for (let i = 0; i < Math.min(buf.length, 2048); i++) cabeca += String.fromCharCode(buf[i]);

  if (/<html|<!doctype|<table|<meta/i.test(cabeca)) {
    let txt = new TextDecoder('iso-8859-1').decode(buf);
    if (/charset\s*=\s*["']?utf-?8/i.test(txt.slice(0, 3000))) txt = new TextDecoder('utf-8').decode(buf);
    const doc = new DOMParser().parseFromString(txt, 'text/html');

    let melhor: HTMLTableElement | null = null;
    let maior = 0;
    doc.querySelectorAll('table').forEach((t) => {
      const todas = t.querySelectorAll('td,th').length;
      const aninhadas = [...t.querySelectorAll('table')].reduce(
        (a, x) => a + x.querySelectorAll('td,th').length, 0,
      );
      const proprias = todas - aninhadas;
      if (proprias > maior) { maior = proprias; melhor = t as HTMLTableElement; }
    });

    if (melhor) {
      return [...(melhor as HTMLTableElement).rows].map((tr) =>
        [...tr.cells].map((td) => td.textContent!.replace(/\s+/g, ' ').trim()),
      );
    }
    try { return await porSheetJS(); } catch { /* cai na mensagem abaixo */ }
    throw new Error(
      'Este arquivo não tem os dados dentro dele. Isso acontece quando a planilha é salva como ' +
      '"Página da Web", que grava as informações numa pasta separada. Abra no Excel e salve como ' +
      '"Pasta de Trabalho do Excel (.xlsx)".',
    );
  }

  return porSheetJS();
}

interface Colunas {
  id: number; descricao: number; embalagem: number;
  sld_estoq: number; sld_contagem: number; dif_qtde: number; dif_financeira: number;
}

export function mapearColunas(cabecalho: unknown[]): Colunas {
  const L = (cabecalho ?? []).map((h) => low(h));
  const idx = (...nomes: string[]) => {
    for (const n of nomes) { const i = L.indexOf(n); if (i >= 0) return i; }
    return -1;
  };
  /** n-esima ocorrencia de um nome repetido no cabecalho */
  const ocorr = (nome: string, n: number) => {
    let c = 0;
    for (let i = 0; i < L.length; i++) if (L[i] === nome && ++c === n) return i;
    return -1;
  };
  return {
    id: idx('id', 'codigo', 'cod produto'),
    descricao: idx('descricao', 'produto'),
    // "Embalagem" aparece 2x: a 1a e a unitaria (UN / UN/1), a 2a e a da
    // contagem (UN/72) — e essa que vale
    embalagem: ocorr('embalagem', 2) >= 0 ? ocorr('embalagem', 2) : ocorr('embalagem', 1),
    sld_estoq: idx('sld estoq', 'saldo estoque'),
    sld_contagem: idx('sld contagem', 'saldo contagem'),
    dif_qtde: idx('dif qtde', 'dif qtd'),
    dif_financeira: idx('dif financeira'),
  };
}

/** Um arquivo = um lancamento, no fornecedor escolhido na tela. */
export function montarProdutos(linhas: unknown[][]): ProdutoInventario[] {
  let hi = linhas.findIndex(
    (r) => r && r.some((c) => ['sld contagem', 'dif qtde', 'sld estoq'].includes(low(c))),
  );
  if (hi < 0) hi = 0;

  const cm = mapearColunas(linhas[hi]);
  if (cm.id < 0 || cm.sld_contagem < 0) {
    const achadas = (linhas[hi] ?? []).map((c) => norm(c)).filter(Boolean).slice(0, 12).join(', ');
    throw new Error(
      'Não encontrei as colunas "Id" e "Sld Contagem". O cabeçalho lido foi: ' + (achadas || '(vazio)') + '.',
    );
  }

  const produtos: ProdutoInventario[] = [];
  linhas.slice(hi + 1).forEach((row) => {
    if (!row) return;
    const g = (k: keyof Colunas) => (cm[k] >= 0 ? row[cm[k]] : null);
    const id = norm(g('id'));
    if (!id || /total/i.test(id)) return;
    const est = parseNum(g('sld_estoq'));
    const cont = parseNum(g('sld_contagem'));
    produtos.push({
      id,
      descricao: norm(g('descricao')),
      embalagem: norm(g('embalagem')),
      sld_estoq: est,
      sld_contagem: cont,
      dif_qtde: cm.dif_qtde >= 0 ? parseNum(g('dif_qtde')) : cont - est,
      dif_financeira: parseNum(g('dif_financeira')),
    });
  });

  if (!produtos.length) throw new Error('O arquivo não tem nenhuma linha de produto.');
  return produtos;
}

// ---------------------------------------------------------------- relatorio da gerencia

/** Uma linha do relatorio da gerencia, no vocabulario dela. */
export interface LinhaGerencia {
  data: string;
  fornecedor: string;
  /** R$ EST. INVENT. */
  est: number;
  acu: number | null;
  /** soma das divergencias positivas */
  entrada: number;
  /** soma das negativas, em modulo */
  saida: number;
  /** ENTRADA - SAIDA */
  dif: number;
  /** DIFERENCA / R$ EST. INVENT. */
  pct: number | null;
  /** so para a tela; nao vai para o Excel */
  produtos: number;
  divergentes: number;
}

export function linhasGerencia(lancs: Inventario[]): LinhaGerencia[] {
  return lancs.map((l) => {
    const t = totais(l.produtos ?? []);
    const est = +l.valor_estoque || 0;
    const saida = Math.abs(t.neg);
    return {
      data: l.data_inventario,
      fornecedor: l.fornecedor,
      est,
      acu: acuracidade(est, t.pos, saida),
      entrada: t.pos,
      saida,
      dif: t.fin,
      pct: pctEstoque(est, t.fin),
      produtos: t.total,
      divergentes: t.ndiv,
    };
  });
}

/**
 * Totalizador de mes/ano. A acuracidade sai da MESMA formula sobre os totais,
 * nao da media das linhas — na planilha os dois coincidem quando os
 * fornecedores tem o mesmo valor de estoque, mas o total do ano prova que e a
 * formula (1 - (20.608,51 + 23.168,47) / 6.536.701,22 = 99,33%).
 */
export function totalGerencia(rs: LinhaGerencia[]): LinhaGerencia {
  const est = rs.reduce((a, r) => a + r.est, 0);
  const entrada = rs.reduce((a, r) => a + r.entrada, 0);
  const saida = rs.reduce((a, r) => a + r.saida, 0);
  const dif = entrada - saida;
  return {
    data: '', fornecedor: '',
    est, acu: acuracidade(est, entrada, saida), entrada, saida, dif,
    pct: pctEstoque(est, dif),
    produtos: rs.reduce((a, r) => a + r.produtos, 0),
    divergentes: rs.reduce((a, r) => a + r.divergentes, 0),
  };
}

export const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

/** Fornecedores da operacao — o nome escolhido e a chave de agrupamento. */
export const FORNECEDORES = [
  'ACE', 'ADIMAX', 'ADL', 'BOLD', 'CIA CANOINHAS', 'COLGATE', 'CONSERVA ODERICH',
  'ENERGIZER', 'GRENDENE', 'J MACEDO', 'MARILAN', 'MURIEL', 'NUTRIMENTAL',
  'ONTEX', 'SANTA MARIA', 'VITAO',
];

export const normFornecedor = (s: string) => norm(s).toUpperCase().replace(/\s+/g, ' ');
