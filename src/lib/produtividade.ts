/**
 * Regras de produtividade e premiacao — portadas do index.html antigo SEM
 * alterar nenhum calculo.
 *
 * O que NAO pode mudar aqui (cada linha vale dinheiro no fim do mes):
 *   - sucesso e SO "entregue"; "devolvido parcial" conta metade do peso e NAO
 *     entra na falha de quantidade;
 *   - prodFinal e a MEDIA de prodQtd e prodPeso, nao uma delas;
 *   - a faixa verde exige >= 99,995% (nao 100% exato, por causa de arredondamento);
 *   - o valor da devolucao nao entra em valorProblema: o sistema nao sabe
 *     quanto foi devolvido.
 */

import type { Pedido } from '@/types/relatorio';

// ---------------------------------------------------------------- config

export interface ConfigProdutividade {
  /** sábado entra na apuração? */
  sabadoConta: boolean;
  /** piso da faixa azul (%) */
  meta90: number;
  /** piso da faixa laranja (%) */
  meta80: number;
  /** horário limite de finalização — quem chega depois não recebe */
  horario: string;
  pagamentoAtivo: boolean;
}

export const CONFIG_PADRAO: ConfigProdutividade = {
  sabadoConta: false, meta90: 90, meta80: 80, horario: '17:30', pagamentoAtivo: true,
};

export const CARGOS_MOT = ['Motorista de Praça', 'Motorista de Viagem', 'Motorista Agregado'] as const;
export const CARGOS_AJU = ['Ajudante de Praça', 'Ajudante de Viagem', 'Ajudante de Praça (Agregado)'] as const;
export const isAgregado = (c: string) => /agregado/i.test(c);

/** R$ por cargo x faixa (tier 0=100%, 1=azul, 2=laranja, 3=vermelha). */
export type TabelaPremio = Record<string, [number, number, number, number]>;
export const PREMIO_PADRAO: TabelaPremio = {
  'Motorista de Praça': [35, 25, 10, 0],
  'Motorista de Viagem': [45, 35, 15, 0],
  'Motorista Agregado': [20, 0, 0, 0],
  'Ajudante de Praça': [15, 10, 5, 0],
  'Ajudante de Viagem': [20, 15, 10, 0],
  'Ajudante de Praça (Agregado)': [20, 15, 10, 0],
};

// ---------------------------------------------------------------- status

export type Categoria = 'entregue' | 'reentrega' | 'devolvido' | 'pendente';

/** Classifica o "Status da Entrega" já em minúsculas e sem acento. */
export function classificar(stl: string): Categoria {
  if (stl === 'entregue') return 'entregue';
  if (stl === 'reentrega' || stl === 'entrega nao realizada') return 'reentrega';
  if (stl === 'devolvido' || stl === 'devolvido parcial') return 'devolvido';
  return 'pendente'; // faturado, aguardando, etc.
}

// ---------------------------------------------------------------- datas

/** 'dd-mm-aaaa' ou 'dd/mm/aaaa' -> Date */
export function parseDataBR(s: string): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  const dt = new Date(y, +m[2] - 1, +m[1]);
  return isNaN(dt.getTime()) ? null : dt;
}

export const ehSabado = (p: Pedido) => {
  const dt = parseDataBR(p.dataSaida);
  return dt ? dt.getDay() === 6 : false;
};

/** Base de trabalho: sábado sai fora, a menos que a configuração mande contar. */
export const baseDeTrabalho = (base: Pedido[], cfg: ConfigProdutividade) =>
  cfg.sabadoConta ? base : base.filter((p) => !ehSabado(p));

// ---------------------------------------------------------------- faixas

export interface Faixa {
  k: 'green' | 'blue' | 'orange' | 'red';
  label: string;
  tier: 0 | 1 | 2 | 3;
}

export function faixaDe(prodFinal: number, cfg: ConfigProdutividade): Faixa {
  const p = prodFinal * 100;
  // 99,995 e não 100: a média de duas frações raramente fecha exato
  if (p >= 99.995) return { k: 'green', label: '100%', tier: 0 };
  if (p >= cfg.meta90) return { k: 'blue', label: `≥${cfg.meta90}%`, tier: 1 };
  if (p >= cfg.meta80) return { k: 'orange', label: `${cfg.meta80}–${cfg.meta90}%`, tier: 2 };
  return { k: 'red', label: `<${cfg.meta80}%`, tier: 3 };
}

// ---------------------------------------------------------------- cargas

export interface Carga {
  id: string;
  dataSaida: string;
  motorista: string;
  rota: string;
  placa: string;
  regiao: string;
  ajudantes: string[];
  pedidos: number;
  /** clientes DISTINTOS na carga — informativo, não entra em nenhum cálculo */
  clientes: number;
  peso: number;
  valor: number;
  peds: Pedido[];
  cEnt: number; cReent: number; cDev: number; cPend: number;
  pesoProblema: number; valorProblema: number;
  falhaQtd: number; falhaPeso: number;
  status: Record<string, number>;
  prodQtd: number; prodPeso: number; prodFinal: number;
  pctEnt: number;
  faixa: Faixa;
}

export function montarCargas(base: Pedido[], cfg: ConfigProdutividade): Carga[] {
  const mapa: Record<string, Carga> = {};
  const clientesPorCarga: Record<string, Set<string>> = {};

  for (const p of baseDeTrabalho(base, cfg)) {
    const id = p.carga || '(sem carga)';
    if (!mapa[id]) {
      mapa[id] = {
        id, dataSaida: '', motorista: p.motorista, rota: p.rota, placa: p.placa, regiao: p.regiao,
        ajudantes: [], pedidos: 0, clientes: 0, peso: 0, valor: 0, peds: [],
        cEnt: 0, cReent: 0, cDev: 0, cPend: 0, pesoProblema: 0, valorProblema: 0,
        falhaQtd: 0, falhaPeso: 0, status: {},
        prodQtd: 0, prodPeso: 0, prodFinal: 0, pctEnt: 0,
        faixa: { k: 'red', label: '', tier: 3 },
      };
    }
    const c = mapa[id];
    (clientesPorCarga[id] ??= new Set()).add(p.codcli || p.cliente);
    c.peds.push(p);
    if (!c.dataSaida && p.dataSaida) c.dataSaida = p.dataSaida;
    if (!c.motorista && p.motorista) c.motorista = p.motorista;
    if (!c.rota && p.rota) c.rota = p.rota;
    [p.aj1, p.aj2, p.aj3, p.aj4].forEach((a) => { if (a && !c.ajudantes.includes(a)) c.ajudantes.push(a); });

    c.pedidos++; c.peso += p.peso; c.valor += p.valor;
    c.status[p.stl] = (c.status[p.stl] || 0) + 1;

    if (p.cat === 'entregue') c.cEnt++;
    else if (p.cat === 'reentrega') { c.cReent++; c.pesoProblema += p.peso; c.valorProblema += p.valor; }
    // valor de devolução não conta: o sistema não sabe quanto foi devolvido
    else if (p.cat === 'devolvido') { c.cDev++; c.pesoProblema += p.peso; }
    else c.cPend++;

    // produtividade: sucesso = só entregue; parcial = 50% do peso e não conta na qtd
    const ent = p.stl === 'entregue';
    const parc = p.stl === 'devolvido parcial';
    if (!ent && !parc) { c.falhaQtd++; c.falhaPeso += p.peso; }
    else if (parc) { c.falhaPeso += p.peso * 0.5; }
  }

  return Object.values(mapa).map((c) => {
    c.clientes = clientesPorCarga[c.id]?.size ?? 0;
    c.prodQtd = c.pedidos > 0 ? Math.max(0, 1 - c.falhaQtd / c.pedidos) : 0;
    c.prodPeso = c.peso > 0 ? Math.max(0, 1 - c.falhaPeso / c.peso) : 0;
    c.prodFinal = (c.prodQtd + c.prodPeso) / 2;
    c.faixa = faixaDe(c.prodFinal, cfg);
    c.pctEnt = c.pedidos > 0 ? c.cEnt / c.pedidos : 0;
    return c;
  });
}

// ---------------------------------------------------------------- agregação avulsa

/**
 * Totais de um conjunto qualquer de pedidos — usado pela Analise, que recalcula
 * os numeros da carga conforme os status marcados no filtro.
 *
 * Repare que `valorProblema` soma so a REENTREGA: o valor da devolucao nao
 * entra, porque o sistema nao sabe quanto foi devolvido. Mesma regra do
 * montarCargas.
 */
export interface AgregadoPedidos {
  pedidos: number; peso: number; valor: number;
  cEnt: number; cReent: number; cDev: number; cPend: number;
  valorProblema: number; pctEnt: number;
}

export function agregarPedidos(peds: Pedido[]): AgregadoPedidos {
  const a: AgregadoPedidos = {
    pedidos: peds.length, peso: 0, valor: 0,
    cEnt: 0, cReent: 0, cDev: 0, cPend: 0, valorProblema: 0, pctEnt: 0,
  };
  peds.forEach((p) => {
    a.peso += p.peso; a.valor += p.valor;
    if (p.cat === 'entregue') a.cEnt++;
    else if (p.cat === 'reentrega') { a.cReent++; a.valorProblema += p.valor; }
    else if (p.cat === 'devolvido') a.cDev++;
    else a.cPend++;
  });
  a.pctEnt = a.pedidos ? a.cEnt / a.pedidos : 0;
  return a;
}

// ---------------------------------------------------------------- premiação

export interface PessoaNaCarga {
  chave: string;              // nome original, usado como identidade
  tipo: 'mot' | 'aju';
  cargo: string;
  /** nome que vai para o pagamento — editável, com histórico */
  display: string;
}

export interface ConfigCarga {
  /** false = não recebe (chegou depois do horário de corte) */
  ganha: boolean;
  pessoas: Record<string, PessoaNaCarga>;
}

/** Cargos padrão de uma carga: placa AGREG muda o cargo de todo mundo. */
export function configPadraoDaCarga(c: Carga): ConfigCarga {
  const agreg = c.placa === 'AGREG';
  const pessoas: Record<string, PessoaNaCarga> = {};
  if (c.motorista) {
    pessoas[c.motorista] = {
      chave: c.motorista, tipo: 'mot',
      cargo: agreg ? 'Motorista Agregado' : 'Motorista de Praça',
      display: c.motorista,
    };
  }
  c.ajudantes.forEach((a) => {
    pessoas[a] = {
      chave: a, tipo: 'aju',
      cargo: agreg ? 'Ajudante de Praça (Agregado)' : 'Ajudante de Praça',
      display: a,
    };
  });
  return { ganha: true, pessoas };
}

export function premioDaPessoa(tabela: TabelaPremio, cargo: string, tier: number, ganha: boolean) {
  if (!ganha) return 0;
  const t = tabela[cargo];
  return t ? t[tier] ?? 0 : 0;
}

/** Total da carga somando todas as pessoas. */
export function premioDaCarga(tabela: TabelaPremio, c: Carga, conf: ConfigCarga) {
  return Object.values(conf.pessoas)
    .reduce((a, p) => a + premioDaPessoa(tabela, p.cargo, c.faixa.tier, conf.ganha), 0);
}

// ---------------------------------------------------------------- semana

/**
 * Produtividade da semana = MEDIA das produtividades dos dias.
 *
 * O usuario definiu assim: "a media da semana e calculada pela media dos 5
 * dias". Nao e peso entregue da semana / peso total da semana — os dois so
 * coincidem quando todos os dias tem o mesmo volume.
 */
export interface DiaDaSemana {
  data: string;          // 'dd-mm-aaaa', como vem do relatório
  prodFinal: number;     // média das cargas do dia
  cargas: number;
}

export function mediaDaSemana(dias: DiaDaSemana[]): number {
  const comDado = dias.filter((d) => d.cargas > 0);
  if (!comDado.length) return 0;
  return comDado.reduce((a, d) => a + d.prodFinal, 0) / comDado.length;
}

/** Agrupa as cargas por dia e devolve a produtividade média de cada dia. */
export function porDia(cargas: Carga[]): DiaDaSemana[] {
  const m: Record<string, Carga[]> = {};
  cargas.forEach((c) => { (m[c.dataSaida] ??= []).push(c); });
  return Object.entries(m)
    .map(([data, cs]) => ({
      data,
      cargas: cs.length,
      prodFinal: cs.reduce((a, c) => a + c.prodFinal, 0) / cs.length,
    }))
    .sort((a, b) => {
      const da = parseDataBR(a.data)?.getTime() ?? 0;
      const db = parseDataBR(b.data)?.getTime() ?? 0;
      return da - db;
    });
}

// ---------------------------------------------------------------- formatação

export const fmtPct = (n: number) =>
  ((+n || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
export const fmtKg = (n: number) =>
  (+n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
