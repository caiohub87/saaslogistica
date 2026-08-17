'use client';

/**
 * Leitura do "Relatorio de Entregas" do Fusion.
 *
 * Mapa de colunas por NOME, nao por posicao — o ERP muda a ordem entre
 * versoes, mas os titulos ficam. Cabecalho tolerante a acento e caixa.
 */

import { classificar } from './produtividade';
import type { MetaRelatorio, Pedido } from '@/types/relatorio';

const semAcento = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const low = (s: unknown) => semAcento(s).trim().toLowerCase();
export const norm = (s: unknown) => String(s ?? '').trim();

/** Número no formato brasileiro: "3.806,87" -> 3806.87 */
export function parseNum(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Nome de cada coluna no relatório, na grafia do ERP. */
const COLUNAS: Record<string, string[]> = {
  pedido: ['numero pedido erp'],
  cliente: ['razao social'],
  fantasia: ['nome fantasia'],
  codcli: ['cod erp cliente', 'codigo erp cliente'],
  cidade: ['cidade'],
  rota: ['rota'],
  peso: ['peso'],
  valor: ['valor do pedido'],
  dataSaida: ['data saida'],
  carga: ['numero da carga erp'],
  romaneio: ['romaneio'],
  motorista: ['motorista'],
  aj1: ['ajudante 1'], aj2: ['ajudante 2'], aj3: ['ajudante 3'], aj4: ['ajudante 4'],
  checkin: ['check-in'], checkout: ['check-out'], leadtime: ['lead time'],
  placa: ['placa'],
  status: ['status da entrega'],
  motivo: ['motivo devolucao/reentrega'],
  regiao: ['regiao'],
};

function mapear(cabecalho: unknown[]) {
  const lh = (cabecalho ?? []).map(low);
  const idx: Record<string, number> = {};
  for (const k in COLUNAS) {
    idx[k] = -1;
    for (const nome of COLUNAS[k]) {
      const i = lh.indexOf(nome);
      if (i >= 0) { idx[k] = i; break; }
    }
  }
  return idx;
}

export interface RelatorioLido {
  pedidos: Pedido[];
  meta: MetaRelatorio;
}

export async function lerRelatorio(file: File): Promise<RelatorioLido> {
  const XLSX = await import('xlsx');
  const buf = new Uint8Array(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('A planilha está vazia.');
  const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];

  // o cabeçalho fica na linha 2 (a 1 é o título), mas procuramos para não depender disso
  let hi = linhas.findIndex(
    (r) => r && r.some((c) => low(c) === 'status da entrega' || low(c).includes('numero da carga erp')),
  );
  if (hi < 0) hi = 1;

  const cm = mapear(linhas[hi]);
  if (cm.carga < 0 || cm.status < 0) {
    throw new Error('Não encontrei "Número da Carga ERP" e/ou "Status da Entrega" no arquivo.');
  }

  const pedidos: Pedido[] = [];
  linhas.slice(hi + 1).forEach((row) => {
    if (!row) return;
    const g = (k: string) => (cm[k] >= 0 ? row[cm[k]] : null);
    if (norm(g('carga')) === '') return;
    const stl = low(g('status'));
    pedidos.push({
      dataSaida: norm(g('dataSaida')),
      carga: norm(g('carga')),
      romaneio: norm(g('romaneio')),
      motorista: norm(g('motorista')),
      aj1: norm(g('aj1')), aj2: norm(g('aj2')), aj3: norm(g('aj3')), aj4: norm(g('aj4')),
      rota: norm(g('rota')),
      cliente: norm(g('cliente')) || norm(g('fantasia')),
      codcli: norm(g('codcli')),
      pedido: norm(g('pedido')),
      cidade: norm(g('cidade')),
      regiao: norm(g('regiao')),
      placa: norm(g('placa')),
      peso: parseNum(g('peso')),
      valor: parseNum(g('valor')),
      status: norm(g('status')),
      stl,
      cat: classificar(stl),
      motivo: norm(g('motivo')),
      checkin: norm(g('checkin')),
      checkout: norm(g('checkout')),
      leadtime: norm(g('leadtime')),
    });
  });

  if (!pedidos.length) throw new Error('O arquivo não tem nenhuma linha de pedido.');

  return {
    pedidos,
    meta: { arquivo: file.name, carregadoEm: new Date().toISOString(), pedidos: pedidos.length },
  };
}
