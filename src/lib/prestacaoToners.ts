'use client';

/**
 * Prestação de contas dos toners: o que foi trocado num período, para onde foi
 * e quem registrou. Sai em folha para assinar e em Excel para anexar.
 */

import { fmtData, type TrocaComDuracao } from './toners';
import type { Impressora, Sala } from '@/types/database';

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** 'YYYY-MM' -> primeiro e último dia do mês, em 'aaaa-mm-dd'. */
export function limitesDoMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}` };
}

export interface LinhaPrestacao {
  data: string;
  sala: string;
  impressora: string;
  modelo: string;
  toner: string;
  registradoPor: string;
  obs: string;
}

export interface Prestacao {
  de: string;
  ate: string;
  linhas: LinhaPrestacao[];
  /** quantos de cada toner — é o número que bate com a saída do estoque */
  porToner: { toner: string; qtd: number }[];
  porSala: { sala: string; qtd: number }[];
}

export function montarPrestacao(
  trocas: TrocaComDuracao[], salas: Sala[], impressoras: Impressora[], de: string, ate: string,
): Prestacao {
  const salaPorId = new Map(salas.map((s) => [s.id, s]));
  const impPorId = new Map(impressoras.map((i) => [i.id, i]));

  const linhas = trocas
    .filter((t) => t.data >= de && t.data <= ate)
    .sort((a, b) => (a.data === b.data ? a.id - b.id : (a.data < b.data ? -1 : 1)))
    .map((t) => {
      const imp = impPorId.get(t.impressora_id);
      return {
        data: t.data,
        sala: (imp && salaPorId.get(imp.sala_id)?.nome) || '—',
        impressora: imp?.nome ?? '—',
        modelo: imp?.modelo ?? '',
        toner: t.toner,
        registradoPor: t.registrado_por ?? '—',
        obs: t.obs ?? '',
      };
    });

  const contar = (chave: (l: LinhaPrestacao) => string) => {
    const m = new Map<string, number>();
    linhas.forEach((l) => m.set(chave(l), (m.get(chave(l)) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
  };

  return {
    de, ate, linhas,
    porToner: contar((l) => l.toner.trim().toUpperCase()).map(([toner, qtd]) => ({ toner, qtd })),
    porSala: contar((l) => l.sala).map(([sala, qtd]) => ({ sala, qtd })),
  };
}

/** "Outubro de 2026" quando o período é o mês inteiro; senão "01/10/2026 a 15/10/2026". */
export function nomeDoPeriodo(de: string, ate: string): string {
  const mes = de.slice(0, 7);
  const l = limitesDoMes(mes);
  if (de === l.de && ate === l.ate) {
    const [a, m] = mes.split('-').map(Number);
    return `${MESES[m - 1]} de ${a}`;
  }
  return `${fmtData(de)} a ${fmtData(ate)}`;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function imprimirPrestacao(p: Prestacao, unidade: string, responsavel: string) {
  const periodo = nomeDoPeriodo(p.de, p.ate);
  const resumo = (titulo: string, itens: { nome: string; qtd: number }[]) => `
    <div class="bloco"><h3>${titulo}</h3><table class="res">
      ${itens.map((i) => `<tr><td>${esc(i.nome)}</td><td class="n">${i.qtd}</td></tr>`).join('')}
    </table></div>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Prestação de contas — Toners — ${esc(periodo)}</title>
<style>
 @page{size:A4;margin:12mm}
 *{box-sizing:border-box}
 body{font-family:"Segoe UI",Arial,sans-serif;color:#0d2038;margin:0;font-size:11px}
 .ph{display:flex;align-items:center;gap:16px;border-bottom:3px solid #005da8;padding-bottom:8px;margin-bottom:12px}
 .ph img{height:42px}
 .tt{flex:1}
 .tt small{color:#5b6b80;font-size:9.5px;letter-spacing:1.5px;text-transform:uppercase}
 .tt h2{margin:0;font-size:17px;color:#005da8;text-transform:uppercase;letter-spacing:.5px}
 .pd{text-align:right;font-size:9.5px;color:#33465e;white-space:nowrap}
 .pd b{display:block;font-size:14px;color:#0d2038}
 .resumos{display:flex;gap:12px;margin-bottom:12px}
 .bloco{flex:1;border:1px solid #cfdae8;border-radius:8px;padding:8px 10px}
 .bloco.total{flex:0 0 120px;text-align:center}
 .bloco.total b{display:block;font-size:30px;color:#005da8;line-height:1.1}
 h3{margin:0 0 6px;font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;color:#5b6b80}
 table{width:100%;border-collapse:collapse}
 .res td{padding:2px 0;border-bottom:1px dotted #cfdae8}
 .res td.n{text-align:right;font-weight:800;width:40px}
 .det th{background:#005da8;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.5px;padding:5px;text-align:left}
 .det td{border-bottom:1px solid #e1e8f1;padding:4px 5px;vertical-align:top}
 .det tr:nth-child(even) td{background:#f6f9fc}
 .det td.obs{color:#5b6b80;font-size:9.5px}
 .vazio{padding:24px;text-align:center;color:#5b6b80}
 .ass{display:flex;gap:40px;margin-top:48px}
 .ass div{flex:1;border-top:1px solid #0d2038;padding-top:4px;text-align:center;font-size:10px}
 .pfoot{margin-top:16px;font-size:9px;color:#5b6b80;text-align:right}
 @media print{ body{-webkit-print-color-adjust:exact;print-color-adjust:exact} tr{page-break-inside:avoid} }
</style></head><body>
<div class="ph">
  <img src="${location.origin}/dilnor-logo.png" alt="">
  <div class="tt"><small>Sistema de Gestão Logística · ${esc(unidade)}</small>
    <h2>Prestação de contas — Toners</h2></div>
  <div class="pd">Período<b>${esc(periodo)}</b>Gerado em ${new Date().toLocaleString('pt-BR')}</div>
</div>
<div class="resumos">
  <div class="bloco total"><h3>Toners trocados</h3><b>${p.linhas.length}</b></div>
  ${resumo('Por toner', p.porToner.map((t) => ({ nome: t.toner, qtd: t.qtd })))}
  ${resumo('Por sala', p.porSala.map((s) => ({ nome: s.sala, qtd: s.qtd })))}
</div>
<table class="det">
  <thead><tr><th>Data</th><th>Sala</th><th>Impressora</th><th>Toner</th><th>Registrado por</th><th>Obs.</th></tr></thead>
  <tbody>
  ${p.linhas.length ? p.linhas.map((l) => `<tr>
    <td>${fmtData(l.data)}</td><td>${esc(l.sala)}</td>
    <td>${esc(l.impressora)}${l.modelo ? ` <span style="color:#5b6b80">· ${esc(l.modelo)}</span>` : ''}</td>
    <td><b>${esc(l.toner)}</b></td><td>${esc(l.registradoPor)}</td><td class="obs">${esc(l.obs)}</td>
  </tr>`).join('') : '<tr><td colspan="6" class="vazio">Nenhuma troca registrada neste período.</td></tr>'}
  </tbody>
</table>
<div class="ass">
  <div>${esc(responsavel || 'Responsável')}<br>Responsável pela prestação</div>
  <div>Conferido por</div>
</div>
<div class="pfoot">${esc(unidade)} · documento gerado pelo sistema</div>
</body></html>`;

  const janela = window.open('', '_blank');
  if (!janela) { alert('O navegador bloqueou a janela de impressão. Libere os pop-ups para este site.'); return; }
  janela.document.write(html);
  janela.document.close();
  janela.onload = () => { janela.focus(); janela.print(); };
}

/** Excel com o detalhe e o resumo por toner. Devolve o nome do arquivo. */
export async function baixarPrestacaoExcel(p: Prestacao): Promise<string> {
  const XLSX = await import('xlsx');
  const detalhe = XLSX.utils.aoa_to_sheet([
    ['DATA', 'SALA', 'IMPRESSORA', 'MODELO', 'TONER', 'REGISTRADO POR', 'OBS'],
    ...p.linhas.map((l) => [fmtData(l.data), l.sala, l.impressora, l.modelo, l.toner, l.registradoPor, l.obs]),
  ]);
  detalhe['!cols'] = [{ wch: 11 }, { wch: 20 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 30 }];

  const resumo = XLSX.utils.aoa_to_sheet([
    ['TONER', 'QUANTIDADE'],
    ...p.porToner.map((t) => [t.toner, t.qtd]),
    [],
    ['TOTAL', p.linhas.length],
  ]);
  resumo['!cols'] = [{ wch: 22 }, { wch: 12 }];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, detalhe, 'Trocas');
  XLSX.utils.book_append_sheet(pasta, resumo, 'Resumo por toner');
  const nome = `prestacao-toners-${p.de}_a_${p.ate}.xlsx`;
  XLSX.writeFile(pasta, nome);
  return nome;
}
