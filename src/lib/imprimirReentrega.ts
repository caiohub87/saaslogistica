'use client';

/**
 * O documento que vai grudado no palete.
 *
 * Janela separada em vez de @media print na própria tela, pela mesma razão da
 * agenda: o CSS do app (tema escuro, sticky, grid) atrapalha a folha.
 *
 * A4 em pé, uma folha. O que precisa ser lido de longe — LOTE e o aviso de
 * LOTE À PARTE — vem grande no topo, porque este papel é lido no corredor do
 * depósito, não na mesa.
 */

import { fmtBRL, fmtData, fmtPeso } from './reentregas';
import type { Reentrega } from '@/types/database';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function imprimirReentrega(r: Reentrega, unidade: string) {
  const linhas = (r.pedidos ?? []).map((p) => `
    <tr>
      <td>${esc(p.pedido)}</td>
      <td>${esc(p.codcli)}</td>
      <td class="cli">${esc(p.cliente)}</td>
      <td>${esc(p.carga)}</td>
      <td class="n">${esc(fmtPeso(p.peso))}</td>
      <td class="n">${esc(fmtBRL(p.valor))}</td>
      <td class="mot">${esc(p.motivo)}</td>
    </tr>`).join('');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Reentrega — lote ${esc(r.lote)}</title>
<style>
 @page{size:A4 portrait;margin:10mm}
 *{box-sizing:border-box}
 body{font-family:"Segoe UI",Arial,sans-serif;color:#0d2038;margin:0;font-size:12px}
 .ph{display:flex;align-items:center;gap:14px;border-bottom:3px solid #005da8;padding-bottom:8px;margin-bottom:10px}
 .ph img{height:42px}
 .tt{flex:1}
 .tt small{color:#5b6b80;font-size:9px;letter-spacing:1.5px;text-transform:uppercase}
 .tt h2{margin:0;font-size:17px;color:#005da8;text-transform:uppercase;letter-spacing:.5px}
 /* o bloco que se le de longe */
 .lote{display:flex;align-items:stretch;gap:10px;margin-bottom:10px}
 .lote .cx{flex:1;border:2px solid #0d2038;border-radius:8px;padding:8px 12px}
 .lote .cx small{display:block;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#5b6b80}
 .lote .cx b{display:block;font-size:30px;line-height:1.1;letter-spacing:1px}
 .parte{background:#111;color:#fff;border-color:#111;display:flex;flex-direction:column;justify-content:center;text-align:center;padding:8px 16px}
 .parte b{font-size:17px;letter-spacing:1px}
 .parte small{color:#cfd8e3}
 .grade{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
 .g{border:1px solid #c3cede;border-radius:6px;padding:6px 8px}
 .g small{display:block;font-size:8.5px;letter-spacing:1px;text-transform:uppercase;color:#5b6b80}
 .g b{font-size:15px}
 .eq{border:1px solid #c3cede;border-radius:6px;padding:6px 8px;margin-bottom:10px}
 .eq small{font-size:8.5px;letter-spacing:1px;text-transform:uppercase;color:#5b6b80}
 table{width:100%;border-collapse:collapse;font-size:10.5px}
 th{background:#eef3fa;text-align:left;padding:4px 6px;font-size:8.5px;letter-spacing:.5px;text-transform:uppercase;color:#41556e;border-bottom:1px solid #c3cede}
 td{padding:4px 6px;border-bottom:1px solid #e4eaf3}
 td.n{text-align:right;white-space:nowrap}
 td.cli{max-width:150px}
 td.mot{color:#5b6b80;font-size:9.5px}
 tfoot td{font-weight:bold;border-top:2px solid #0d2038;border-bottom:none}
 .ass{display:flex;gap:24px;margin-top:22px}
 .ass div{flex:1;border-top:1px solid #0d2038;padding-top:4px;font-size:9px;color:#5b6b80;text-align:center}
 .rod{margin-top:10px;font-size:8.5px;color:#5b6b80;display:flex;justify-content:space-between}
 @media print{.no{display:none}}
</style></head><body>

<div class="ph">
  <img src="/dilnor-logo.png" alt="">
  <div class="tt">
    <small>${esc(unidade)} · Solicitação de reentrega</small>
    <h2>Reentrega para o depósito</h2>
  </div>
  <div style="text-align:right">
    <small style="font-size:9px;color:#5b6b80;text-transform:uppercase;letter-spacing:1px">Solicitação</small>
    <div style="font-size:19px;font-weight:bold">Nº ${esc(r.id)}</div>
  </div>
</div>

<div class="lote">
  <div class="cx">
    <small>Lote destinado</small>
    <b>${esc(r.lote)}</b>
  </div>
  ${r.lote_a_parte ? `<div class="cx parte">
    <b>LOTE À PARTE</b>
    <small>fica no depósito para sair noutro dia</small>
  </div>` : ''}
</div>

<div class="grade">
  <div class="g"><small>Clientes</small><b>${esc(r.clientes)}</b></div>
  <div class="g"><small>Paletes</small><b>${esc(r.paletes)}</b></div>
  <div class="g"><small>Peso (kg)</small><b>${esc(fmtPeso(r.peso))}</b></div>
  <div class="g"><small>Voltou em</small><b>${esc(fmtData(r.data))}</b></div>
</div>

<div class="eq">
  <small>Motorista</small> <b>${esc(r.motorista || '—')}</b>
  &nbsp;·&nbsp; <small>Ajudante(s)</small> ${esc((r.ajudantes ?? []).join(', ') || '—')}
</div>

<table>
  <thead>
    <tr>
      <th>Pedido</th><th>Cód.</th><th>Cliente</th><th>Carga</th>
      <th style="text-align:right">Peso</th><th style="text-align:right">Valor</th><th>Motivo</th>
    </tr>
  </thead>
  <tbody>${linhas || '<tr><td colspan="7">Nenhum pedido.</td></tr>'}</tbody>
  <tfoot>
    <tr>
      <td colspan="4">${esc((r.pedidos ?? []).length)} pedido(s)</td>
      <td class="n">${esc(fmtPeso(r.peso))}</td>
      <td class="n">${esc(fmtBRL((r.pedidos ?? []).reduce((a, p) => a + (p.valor || 0), 0)))}</td>
      <td></td>
    </tr>
  </tfoot>
</table>

${r.obs ? `<p style="margin-top:8px;font-size:10.5px"><b>Observação:</b> ${esc(r.obs)}</p>` : ''}

<div class="ass">
  <div>Conferido no depósito</div>
  <div>Aprovado por</div>
</div>

<div class="rod">
  <span>Solicitado por ${esc(r.registrado_por || '—')}</span>
  <span>Impresso em ${esc(new Date().toLocaleString('pt-BR'))}</span>
</div>

<script>window.onload=function(){window.print()}</script>
</body></html>`;

  const janela = window.open('', '_blank');
  if (!janela) {
    alert('O navegador bloqueou a janela de impressão. Libere os pop-ups para este site e tente de novo.');
    return;
  }
  janela.document.write(html);
  janela.document.close();
}
