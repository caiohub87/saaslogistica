/**
 * Controle de validade — le a "Relacao Preventiva de Validade das Mercadorias"
 * que o WMS gera em PDF e organiza no formato que a gerencia acompanha.
 *
 * Uma linha do relatorio e um LOTE, nao um produto: o mesmo SKU aparece varias
 * vezes, uma por endereco, porque cada endereco tem a sua validade.
 *
 * O periodo (30/60/90/120) NAO sai da coluna "Dias" do relatorio. Dias e quanto
 * falta para vencer; periodo e a decisao de quando aquilo vai ser escoado —
 * coisa de quem olha o deposito, nao de calculo.
 */

import { parseNum } from './inventario';
import type { Inventario } from '@/types/database';

// ---------------------------------------------------------------- periodos

export const PERIODOS = [30, 60, 90, 120] as const;
export type Periodo = (typeof PERIODOS)[number];

export const ehPeriodo = (n: unknown): n is Periodo =>
  PERIODOS.includes(Number(n) as Periodo);

// ---------------------------------------------------------------- datas

/** '01/08/2026' -> '2026-08-01' (o formato que o Postgres aceita em date). */
export function dataISO(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br).trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** '2026-08-01' -> '01/08/2026'. Vazio vira travessao. */
export const fmtDataBR = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : '—';
};

/** Quantos dias faltam de hoje ate a validade. Negativo = ja venceu. */
export function diasAte(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const alvo = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (isNaN(alvo.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
}

// ---------------------------------------------------------------- leitura do PDF

/** Uma linha do relatorio, do jeito que saiu do papel. */
export interface LinhaValidade {
  produto_id: string;
  descricao: string;
  endereco: string;
  emb_padrao: number;
  qtd_cx: number;
  qtd_un: number;
  /** ISO, ja convertida de dd/mm/aaaa */
  validade: string;
  /** como o WMS calculou no dia em que o relatorio saiu; negativo = vencido */
  dias: number;
  observacao: string;
}

const RE_DATA = /^\d{2}\/\d{2}\/\d{4}$/;
const RE_ENDERECO = /^\d{2}\.\d{2}\.\d{2}\.\d{3}$/;
const RE_INTEIRO = /^-?\d+$/;

/**
 * Le uma linha de texto do relatorio.
 *
 * O ancora e a DATA, nao a posicao das colunas: a descricao tem numero no meio
 * ("PILHA RAY C BDJ/12 AMARE MEDIA 10105") e contar campos da esquerda erraria
 * onde ela termina. A partir da data, a estrutura e fixa nos dois sentidos:
 *
 *   <id> <descricao...> <emb> <qtd cx> <qtd un> [DATA] <dias> <endereco> [obs...]
 *
 * Dias e endereco sao aceitos em qualquer ordem entre si: qual vem primeiro
 * depende do X que o gerador do PDF deu a cada coluna, e um dos dois e sempre
 * inteiro e o outro sempre no formato 99.99.99.999 — nao ha como confundir.
 *
 * Devolve null para cabecalho, rodape e qualquer linha que nao tenha essa
 * forma — e assim que o cabecalho repetido de cada pagina e descartado.
 */
export function lerLinhaValidade(linha: string): LinhaValidade | null {
  const t = String(linha).trim().split(/\s+/);

  for (let i = 0; i < t.length; i++) {
    if (!RE_DATA.test(t[i])) continue;
    // precisa caber <id> + ao menos 1 palavra de descricao + os 3 numeros
    if (i < 5) continue;
    if (!/^\d{4,7}$/.test(t[0])) continue;

    const a = t[i + 1] ?? '';
    const b = t[i + 2] ?? '';
    let dias: string; let endereco: string;
    if (RE_INTEIRO.test(a) && RE_ENDERECO.test(b)) { dias = a; endereco = b; }
    else if (RE_ENDERECO.test(a) && RE_INTEIRO.test(b)) { endereco = a; dias = b; }
    else continue;

    const validade = dataISO(t[i]);
    if (!validade) continue;

    return {
      produto_id: t[0],
      descricao: t.slice(1, i - 3).join(' '),
      emb_padrao: parseNum(t[i - 3]),
      qtd_cx: parseNum(t[i - 2]),
      qtd_un: parseNum(t[i - 1]),
      validade,
      endereco,
      dias: parseInt(dias, 10),
      observacao: t.slice(i + 3).join(' '),
    };
  }
  return null;
}

/**
 * Reconstroi as linhas visuais de uma pagina de PDF.
 *
 * O PDF nao guarda linhas, guarda pedacos de texto com coordenada. Pedacos com
 * o mesmo Y (com folga de 3, porque o ID e a descricao saem em tamanhos de
 * fonte diferentes e nao ficam na mesma baseline exata) sao a mesma linha;
 * dentro dela, a ordem e o X.
 */
function linhasDaPagina(pedacos: { x: number; y: number; s: string }[]): string[] {
  const grupos: { y: number; itens: { x: number; s: string }[] }[] = [];

  for (const p of pedacos) {
    const g = grupos.find((g) => Math.abs(g.y - p.y) <= 3);
    if (g) g.itens.push(p);
    else grupos.push({ y: p.y, itens: [p] });
  }

  return grupos
    .sort((a, b) => b.y - a.y)                     // topo da pagina primeiro
    .map((g) => g.itens.sort((a, b) => a.x - b.x)
      .map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim());
}

/**
 * Le o PDF inteiro. Roda no navegador: o arquivo nao sai da maquina de quem
 * subiu — mesmo desenho do inventario, que le o .xls sem passar por servidor.
 */
export async function lerPdfValidade(
  file: File,
  aoProgredir?: (pagina: number, total: number) => void,
): Promise<LinhaValidade[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url,
  ).toString();

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;

  const achadas: LinhaValidade[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();

    const pedacos = conteudo.items
      .flatMap((it) => ('str' in it && it.str.trim())
        ? [{ x: it.transform[4] as number, y: it.transform[5] as number, s: it.str }]
        : []);

    for (const linha of linhasDaPagina(pedacos)) {
      const lida = lerLinhaValidade(linha);
      if (lida) achadas.push(lida);
    }
    aoProgredir?.(n, doc.numPages);
  }

  if (!achadas.length) {
    throw new Error(
      'Não encontrei nenhuma linha de produto neste PDF. Confira se é a ' +
      '"Relação Preventiva de Validade das Mercadorias" gerada pelo WMS.',
    );
  }

  // o mesmo (produto, endereco) pode repetir entre paginas quando o relatorio e
  // reimpresso; fica a ultima leitura
  const porChave = new Map<string, LinhaValidade>();
  achadas.forEach((l) => porChave.set(l.produto_id + '@' + l.endereco, l));
  return [...porChave.values()];
}

// ---------------------------------------------------------------- fornecedor do SKU

/**
 * De quem e cada SKU, deduzido dos inventarios ja lancados.
 *
 * O PDF de validade nao tem a coluna "Id Fabricante" que o relatorio de corte
 * tem — mas todo lancamento de inventario JA esta amarrado a um fornecedor, e
 * os produtos dentro dele sao dele. Serve tanto o inventario normal (um
 * fornecedor por arquivo) quanto o corte (que a tela ja separou por fabricante).
 *
 * Vale o lancamento mais recente: se um item trocou de fornecedor, e o de agora
 * que interessa.
 */
export function fornecedoresPorProduto(lancamentos: Inventario[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  [...lancamentos]
    .sort((a, b) => (a.data_inventario < b.data_inventario ? -1 : 1))
    .forEach((l) => {
      (l.produtos ?? []).forEach((p) => { mapa[p.id] = l.fornecedor; });
    });
  return mapa;
}

/** Onde caem os SKU que nenhum inventario conhece ainda. */
export const SEM_FORNECEDOR = 'SEM FORNECEDOR';

// ---------------------------------------------------------------- a visao

/** Uma celula de periodo na tela de Visao: quanto e para quando. */
export interface CelulaPeriodo {
  quantidade: number;
  /** a validade mais proxima entre os registros somados nesta celula */
  vencimento: string | null;
  /** quantos registros foram somados — a tela avisa quando e mais de um */
  registros: number;
}

export interface LinhaVisao {
  produto_id: string;
  descricao: string;
  fornecedor: string;
  /** os enderecos que entraram nesta linha */
  enderecos: string[];
  emb_padrao: number | null;
  porPeriodo: Record<Periodo, CelulaPeriodo | null>;
  /** soma de todos os periodos — o que esta sob controle deste item */
  total: number;
}

export interface GrupoVisao {
  fornecedor: string;
  linhas: LinhaVisao[];
  /** soma do grupo, por periodo, para a linha de total do fornecedor */
  totais: Record<Periodo, number>;
  total: number;
}

interface EntradaVisao {
  produto_id: string;
  endereco: string;
  quantidade: number;
  periodo: Periodo;
  vencimento: string | null;
}

/**
 * Monta a Visao no formato da planilha da gerencia: um bloco por fornecedor,
 * uma linha por SKU, e as quatro colunas de periodo lado a lado.
 *
 * O mesmo SKU em enderecos diferentes vira UMA linha: quem le quer saber
 * quanto tem para escoar em 30 dias, nao em qual rua do deposito esta.
 */
export function montarVisao(
  registros: EntradaVisao[],
  descricoes: Record<string, string>,
  fornecedores: Record<string, string>,
  embalagens: Record<string, number | null> = {},
): GrupoVisao[] {
  const porProduto = new Map<string, LinhaVisao>();

  for (const r of registros) {
    let linha = porProduto.get(r.produto_id);
    if (!linha) {
      linha = {
        produto_id: r.produto_id,
        descricao: descricoes[r.produto_id] ?? '',
        fornecedor: fornecedores[r.produto_id] ?? SEM_FORNECEDOR,
        enderecos: [],
        emb_padrao: embalagens[r.produto_id] ?? null,
        porPeriodo: { 30: null, 60: null, 90: null, 120: null },
        total: 0,
      };
      porProduto.set(r.produto_id, linha);
    }

    if (r.endereco && !linha.enderecos.includes(r.endereco)) linha.enderecos.push(r.endereco);

    const atual = linha.porPeriodo[r.periodo];
    if (!atual) {
      linha.porPeriodo[r.periodo] = {
        quantidade: r.quantidade, vencimento: r.vencimento, registros: 1,
      };
    } else {
      atual.quantidade += r.quantidade;
      atual.registros += 1;
      // a mais proxima manda: e ela que define a urgencia da celula
      if (r.vencimento && (!atual.vencimento || r.vencimento < atual.vencimento)) {
        atual.vencimento = r.vencimento;
      }
    }
    linha.total += r.quantidade;
  }

  const porFornecedor = new Map<string, GrupoVisao>();
  for (const linha of porProduto.values()) {
    let g = porFornecedor.get(linha.fornecedor);
    if (!g) {
      g = {
        fornecedor: linha.fornecedor,
        linhas: [],
        totais: { 30: 0, 60: 0, 90: 0, 120: 0 },
        total: 0,
      };
      porFornecedor.set(linha.fornecedor, g);
    }
    g.linhas.push(linha);
    PERIODOS.forEach((p) => { g.totais[p] += linha.porPeriodo[p]?.quantidade ?? 0; });
    g.total += linha.total;
  }

  for (const g of porFornecedor.values()) {
    g.linhas.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  }

  // SEM FORNECEDOR por ultimo: e pendencia de cadastro, nao abre a lista
  return [...porFornecedor.values()].sort((a, b) => {
    if (a.fornecedor === SEM_FORNECEDOR) return 1;
    if (b.fornecedor === SEM_FORNECEDOR) return -1;
    return a.fornecedor.localeCompare(b.fornecedor, 'pt-BR');
  });
}
