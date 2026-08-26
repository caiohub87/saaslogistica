/**
 * Regras do inventario — portadas do sistema antigo SEM alterar nenhum calculo.
 *
 * Todas as formulas daqui foram conferidas contra a planilha que a gerencia usa:
 *   CANOINHAS 97,56% · NUTRIMENTAL 96,82% · MAIO 97,19% · 2026 99,33%
 * Se algum numero mudar, o relatorio da gerencia deixa de fechar. Nao mexer sem
 * conferir contra aqueles quatro casos.
 */

import type { Inventario, ProdutoInventario, TipoInventario } from '@/types/database';

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
  /** so o corte usa: quem fabricou a linha, e a razao social para conferencia */
  fabricante: number; razao_social: number;
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
    fabricante: idx('id fabricante', 'cod fabricante', 'codigo fabricante'),
    razao_social: idx('razao social'),
  };
}

/** Acha a linha do cabecalho e mapeia as colunas — comum ao normal e ao corte. */
function abrirPlanilha(linhas: unknown[][]): { cm: Colunas; corpo: unknown[][] } {
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
  return { cm, corpo: linhas.slice(hi + 1) };
}

/** Uma linha de produto. Devolve null quando e rodape ou linha vazia. */
function lerProduto(row: unknown[], cm: Colunas): ProdutoInventario | null {
  const g = (k: keyof Colunas) => (cm[k] >= 0 ? row[cm[k]] : null);
  const id = norm(g('id'));
  if (!id || /total/i.test(id)) return null;
  const est = parseNum(g('sld_estoq'));
  const cont = parseNum(g('sld_contagem'));
  return {
    id,
    descricao: norm(g('descricao')),
    embalagem: norm(g('embalagem')),
    sld_estoq: est,
    sld_contagem: cont,
    dif_qtde: cm.dif_qtde >= 0 ? parseNum(g('dif_qtde')) : cont - est,
    dif_financeira: parseNum(g('dif_financeira')),
  };
}

/** Um arquivo = um lancamento, no fornecedor escolhido na tela. */
export function montarProdutos(linhas: unknown[][]): ProdutoInventario[] {
  const { cm, corpo } = abrirPlanilha(linhas);

  const produtos: ProdutoInventario[] = [];
  corpo.forEach((row) => {
    if (!row) return;
    const p = lerProduto(row, cm);
    if (p) produtos.push(p);
  });

  if (!produtos.length) throw new Error('O arquivo não tem nenhuma linha de produto.');
  return produtos;
}

// ---------------------------------------------------------------- corte

/**
 * De qual fornecedor e cada produto do inventario de corte.
 *
 * O corte vem num arquivo so, com produtos de varios fornecedores misturados.
 * Quem decide e a coluna "Id Fabricante" — NAO a marca que aparece na
 * descricao: a racao QUALIDY, por exemplo, e do fabricante 8820, que e ADIMAX.
 *
 * A chave aqui e o codigo SEM zeros a esquerda; o ERP grava '006090' e a
 * gerencia fala '6090'. Um fornecedor pode ter mais de um codigo.
 */
export const FABRICANTES: Record<string, string> = {
  105: 'CONSERVA ODERICH',
  1938: 'ADL',
  8820: 'ADIMAX', 8902: 'ADIMAX',
  9277: 'VITAO',
  9163: 'MURIEL',
  168: 'NUTRIMENTAL', 233: 'NUTRIMENTAL',
  187: 'ENERGIZER',            // razao social SPECTRUM BRANDS; a marca e RAYOVAC
  9322: 'GRENDENE',
  8629: 'MARILAN', 8711: 'MARILAN',
  9187: 'ACE',
  203: 'J MACEDO', 232: 'J MACEDO', 7813: 'J MACEDO', 8895: 'J MACEDO',
  9371: 'ONTEX', 7837: 'ONTEX',   // 7837 vem como FALCON no arquivo
  6090: 'COLGATE', 6317: 'COLGATE', 7708: 'COLGATE',
  9536: 'BOLD',                   // tambem aparece como BARRIND INDUSTRIA
  8663: 'CIA CANOINHAS',
  8986: 'SANTA MARIA', 9075: 'SANTA MARIA',
};

/** Onde caem os produtos cujo Id Fabricante ainda nao esta no mapa acima. */
export const NAO_IDENTIFICADO = 'NÃO IDENTIFICADO';

/** '006090' -> '6090'. So digitos, sem zeros a esquerda. */
export const codigoFabricante = (v: unknown) =>
  String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');

export interface GrupoCorte {
  fornecedor: string;
  /** os Id Fabricante que cairam neste fornecedor, ja sem zeros a esquerda */
  codigos: string[];
  produtos: ProdutoInventario[];
  /** so no grupo NAO IDENTIFICADO: o codigo e a razao social de cada desconhecido */
  desconhecidos: { codigo: string; razao: string }[];
}

/**
 * Quebra o arquivo de corte em um grupo por fornecedor.
 *
 * Codigo fora do mapa nao e descartado: vai para o grupo NAO IDENTIFICADO
 * junto com a razao social, para a tela mostrar e alguem decidir depois. Perder
 * item calado seria pior do que mostrar um grupo a mais.
 */
export function montarCorte(linhas: unknown[][]): GrupoCorte[] {
  const { cm, corpo } = abrirPlanilha(linhas);
  if (cm.fabricante < 0) {
    throw new Error(
      'Este arquivo não tem a coluna "Id Fabricante" — sem ela não dá para saber de quem é cada ' +
      'produto. Confira se é mesmo o relatório de corte, ou lance por fornecedor na aba Lançamentos.',
    );
  }

  const grupos = new Map<string, GrupoCorte>();
  corpo.forEach((row) => {
    if (!row) return;
    const p = lerProduto(row, cm);
    if (!p) return;

    const codigo = codigoFabricante(row[cm.fabricante]);
    const razao = cm.razao_social >= 0 ? norm(row[cm.razao_social]) : '';
    const fornecedor = FABRICANTES[codigo] ?? NAO_IDENTIFICADO;

    const g = grupos.get(fornecedor)
      ?? { fornecedor, codigos: [], produtos: [], desconhecidos: [] };
    if (codigo && !g.codigos.includes(codigo)) g.codigos.push(codigo);
    if (fornecedor === NAO_IDENTIFICADO && !g.desconhecidos.some((d) => d.codigo === codigo)) {
      g.desconhecidos.push({ codigo: codigo || '(vazio)', razao });
    }
    g.produtos.push({
      ...p,
      ...(codigo ? { fabricante: codigo } : {}),
      ...(razao ? { razao_social: razao } : {}),
    });
    grupos.set(fornecedor, g);
  });

  if (!grupos.size) throw new Error('O arquivo não tem nenhuma linha de produto.');

  // NAO IDENTIFICADO por ultimo: e o que precisa de atencao, nao o que abre a lista
  return [...grupos.values()].sort((a, b) => {
    if (a.fornecedor === NAO_IDENTIFICADO) return 1;
    if (b.fornecedor === NAO_IDENTIFICADO) return -1;
    return a.fornecedor.localeCompare(b.fornecedor, 'pt-BR');
  });
}

/**
 * O valor de estoque que o corte herda para poder calcular acuracidade.
 *
 * O arquivo de corte so traz os itens cortados — somar o custo deles daria um
 * denominador muito menor que o estoque real e uma acuracidade artificialmente
 * pessima. Entao a base e a do inventario NORMAL mais recente do mesmo
 * fornecedor ate a data do corte. Sem base, devolve 0 e a tela mostra '—' em
 * vez de um numero sobre denominador inventado.
 */
export function baseEstoqueCorte(
  fornecedor: string, data: string, todos: Inventario[],
): { valor: number; de: string | null } {
  const anterior = todos
    .filter((l) => (l.tipo ?? 'normal') === 'normal'
      && l.fornecedor === fornecedor
      && l.data_inventario <= data
      && +l.valor_estoque > 0)
    .sort((a, b) => (a.data_inventario < b.data_inventario ? 1 : -1))[0];

  return anterior
    ? { valor: +anterior.valor_estoque, de: anterior.data_inventario }
    : { valor: 0, de: null };
}

// ---------------------------------------------------------------- posicao atual

export interface ItemPosicao extends ProdutoInventario {
  /** data do lancamento de onde veio esta contagem */
  data: string;
  tipo: TipoInventario;
  aprovado: boolean;
}

/**
 * Posicao atual item a item de um fornecedor: de cada produto vale a contagem
 * MAIS RECENTE, venha ela do inventario normal ou do corte.
 *
 * Um item contado no corte de ontem ganha do inventario normal do mes passado.
 * No mesmo dia, o corte ganha do normal: ele e a recontagem.
 */
export function posicaoAtual(lancs: Inventario[], fornecedor: string): ItemPosicao[] {
  const cronologico = lancs
    .filter((l) => l.fornecedor === fornecedor)
    .sort((a, b) => {
      if (a.data_inventario !== b.data_inventario) {
        return a.data_inventario < b.data_inventario ? -1 : 1;
      }
      return (a.tipo ?? 'normal') === 'corte' ? 1 : -1;
    });

  const atual = new Map<string, ItemPosicao>();
  cronologico.forEach((l) => {
    (l.produtos ?? []).forEach((p) => {
      atual.set(p.id, {
        ...p,
        data: l.data_inventario,
        tipo: l.tipo ?? 'normal',
        aprovado: Boolean(l.aprovado_em),
      });
    });
  });

  // divergencia primeiro, e a maior no topo: e o que a pessoa abre a tela para ver
  return [...atual.values()].sort((a, b) => {
    const da = Math.abs(a.dif_financeira);
    const db = Math.abs(b.dif_financeira);
    if (da !== db) return db - da;
    return a.descricao.localeCompare(b.descricao, 'pt-BR');
  });
}

// ---------------------------------------------------------------- relatorio da gerencia

/** Uma linha do relatorio da gerencia, no vocabulario dela. */
export interface LinhaGerencia {
  data: string;
  fornecedor: string;
  /** so para a tela distinguir as duas rotinas; o Excel da gerencia nao usa */
  tipo: TipoInventario;
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
      tipo: l.tipo ?? 'normal',
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
    data: '', fornecedor: '', tipo: 'normal',   // linha de totalizador: nao representa um lancamento
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
