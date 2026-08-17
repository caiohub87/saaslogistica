'use client';

/**
 * Excel no formato da planilha da gerencia.
 *
 * Sai como HTML-Excel (.xls) — o mesmo formato que o ERP gera — porque e o
 * unico jeito de levar as cores e a logo junto: a biblioteca xlsx na versao
 * livre nao escreve formatacao.
 *
 * Cada celula guarda o valor numerico em x:num e a exibicao em pt-BR no texto.
 * Assim a gerencia consegue somar e filtrar; nao vira texto.
 */

import { fmtData, fmtMoeda, fmtPct, MESES, totalGerencia, type LinhaGerencia } from './inventario';

const MOEDA = '#,##0.00;[Red]-#,##0.00';
const PCT = '0.00%;[Red]-0.00%';

const cel = (valor: string, formato: string, texto: string, classe: string) =>
  `<td class="${classe}" style='mso-number-format:"${formato}"' x:num="${valor}">${texto}</td>`;

function celulas(l: LinhaGerencia, classe: 'n' | 'tn') {
  return (
    cel(l.est.toFixed(2), '#,##0.00', fmtMoeda(l.est), classe) +
    cel(((l.acu ?? 0) / 100).toFixed(6), '0.00%', fmtPct(l.acu), classe) +
    cel(l.entrada.toFixed(2), '#,##0.00', fmtMoeda(l.entrada), classe) +
    cel(l.saida.toFixed(2), '#,##0.00', fmtMoeda(l.saida), classe) +
    cel(l.dif.toFixed(2), MOEDA, fmtMoeda(l.dif), classe) +
    cel(((l.pct ?? 0) / 100).toFixed(6), PCT, fmtPct(l.pct), classe)
  );
}

async function logoDataUri(): Promise<string> {
  try {
    const r = await fetch('/dilnor-logo.png');
    if (!r.ok) return '';
    const b = await r.blob();
    return await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => res('');
      fr.readAsDataURL(b);
    });
  } catch {
    return '';
  }
}

const escapar = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Gera o arquivo e dispara o download. Devolve o nome usado. */
export async function montarExcelGerencia(linhas: LinhaGerencia[], unidade: string): Promise<string> {
  const anos = [...new Set(linhas.map((r) => r.data.slice(0, 4)))].sort();
  const meses = [...new Set(linhas.map((r) => r.data.slice(0, 7)))].sort();
  const empresa = (unidade || 'Dilnor').toUpperCase() + ' DISTRIBUIDORA';
  const titulo =
    'INVENTÁRIOS ' + empresa + ' ' +
    (anos.length === 1 ? anos[0] : `${anos[0]} a ${anos[anos.length - 1]}`);

  let corpo = '';
  meses.forEach((mk) => {
    const doMes = linhas.filter((r) => r.data.slice(0, 7) === mk);
    corpo += doMes
      .map((r) =>
        `<tr><td class="d">${fmtData(r.data)}</td><td class="f">${escapar(r.fornecedor)}</td>${celulas(r, 'n')}</tr>`)
      .join('');
    const t = totalGerencia(doMes);
    corpo +=
      `<tr class="tt"><td>${MESES[Number(mk.slice(5, 7)) - 1]}</td>` +
      `<td>TOTALIZADORES ------&gt;&gt;&gt;</td>${celulas(t, 'tn')}</tr>` +
      '<tr class="vazia"><td colspan="8"></td></tr>';
  });
  anos.forEach((a) => {
    const t = totalGerencia(linhas.filter((r) => r.data.slice(0, 4) === a));
    corpo += `<tr class="tt"><td>${a}</td><td>TOTALIZADORES ------&gt;&gt;&gt;</td>${celulas(t, 'tn')}</tr>`;
  });

  const logo = await logoDataUri();
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Inventários</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
 table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt}
 td{border:.5pt solid #000;padding:3px 7px;vertical-align:middle}
 .tit{background:#1F3864;color:#FFFF00;font-size:18pt;font-weight:bold;text-align:center;height:38px;border:.5pt solid #1F3864}
 .logo{background:#1F3864;text-align:center;border:.5pt solid #1F3864}
 .h{background:#1F3864;color:#FFFF00;font-weight:bold;text-align:center}
 .d{text-align:center;mso-number-format:"@"}
 .f{text-align:left}
 .n{text-align:right}
 .tt td{background:#1F3864;color:#FFFF00;font-weight:bold}
 .tt .tn{text-align:right;background:#1F3864;color:#FFFF00;font-weight:bold}
 .vazia td{border:none;height:10px}
</style></head><body>
<table>
 <tr><td class="logo" width="130">${logo ? `<img src="${logo}" width="118" height="58">` : ''}</td>
     <td class="tit" colspan="7">${escapar(titulo)}</td></tr>
 <tr><td class="h">DATA</td><td class="h">FORNECEDOR</td><td class="h">R$ EST. INVENT.</td>
     <td class="h">ACURACIDADE</td><td class="h">ENTRADA</td><td class="h">SAÍDA</td>
     <td class="h">DIFERENÇA</td><td class="h">% DIF</td></tr>
 ${corpo}
</table></body></html>`;

  const nome = `Inventarios_${unidade || 'Dilnor'}_${anos.join('-')}.xls`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }));
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return nome;
}
