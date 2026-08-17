'use client';

/**
 * Impressao da agenda em formato de CALENDARIO, um mes por folha.
 *
 * Janela separada em vez de @media print na propria tela: o CSS do app (tema
 * escuro, sticky, grid) atrapalha a folha, e assim o que se ve na previa e
 * exatamente o que sai no papel.
 *
 * A4 deitado — sete colunas de dia nao cabem em pe sem espremer o texto.
 */

import { concluido, DIAS_SEMANA, MESES_NOME, type ConfigAgenda } from './agendamentos';
import type { Agendamento } from '@/types/database';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Monta a grade de um mês: semanas x 7 dias, com os agendamentos de cada dia. */
function grade(mes: string, porDia: Record<string, Agendamento[]>, cfg: ConfigAgenda) {
  const [ano, m] = mes.split('-').map(Number);
  const primeiro = new Date(ano, m - 1, 1).getDay();
  const dias = new Date(ano, m, 0).getDate();
  const total = primeiro + dias;
  const semanas = Math.ceil(total / 7);
  const hoje = new Date().toISOString().slice(0, 10);

  let html = '';
  for (let s = 0; s < semanas; s++) {
    html += '<tr>';
    for (let d = 0; d < 7; d++) {
      const n = s * 7 + d - primeiro + 1;
      if (n < 1 || n > dias) { html += '<td class="fora"></td>'; continue; }
      const iso = `${ano}-${String(m).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
      const doDia = porDia[iso] ?? [];
      const itens = doDia.map((a) => {
        const risco = concluido(cfg.tipo, a.status) ? ' feito' : '';
        const hora = cfg.temHora && a.hora ? `<b>${esc(a.hora)}</b> ` : '';
        const sec = a[cfg.campoSecundario] ? ` <i>${esc(a[cfg.campoSecundario])}</i>` : '';
        return `<li class="s${esc(a.status)}${risco}">${hora}${esc(a[cfg.campoNome])}${sec}</li>`;
      }).join('');
      html += `<td class="${iso === hoje ? 'hoje' : ''}">
        <span class="num">${n}</span>
        ${doDia.length ? `<ul>${itens}</ul>` : ''}
      </td>`;
    }
    html += '</tr>';
  }
  return html;
}

/**
 * @param mes  'YYYY-MM' — o mes escolhido para imprimir
 */
export function imprimirAgenda(
  cfg: ConfigAgenda, itens: Agendamento[], unidade: string, mes: string,
) {
  const [ano, m] = mes.split('-').map(Number);
  const doMes = itens.filter((a) => a.data.slice(0, 7) === mes);

  const porDia: Record<string, Agendamento[]> = {};
  doMes
    .slice()
    .sort((a, b) => (a.data + (a.hora ?? '')) < (b.data + (b.hora ?? '')) ? -1 : 1)
    .forEach((a) => { (porDia[a.data] ??= []).push(a); });

  const pendentes = doMes.filter((a) => !concluido(cfg.tipo, a.status));
  const feitos = doMes.length - pendentes.length;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(cfg.titulo)} — ${MESES_NOME[m - 1]} ${ano}</title>
<style>
 @page{size:A4 landscape;margin:8mm}
 *{box-sizing:border-box}
 body{font-family:"Segoe UI",Arial,sans-serif;color:#0d2038;margin:0}
 .ph{display:flex;align-items:center;gap:16px;border-bottom:3px solid #005da8;padding-bottom:8px;margin-bottom:10px}
 .ph img{height:44px}
 .tt{flex:1}
 .tt small{color:#5b6b80;font-size:10px;letter-spacing:1.5px;text-transform:uppercase}
 .tt h2{margin:0;font-size:18px;color:#005da8;text-transform:uppercase;letter-spacing:.5px}
 .pd{text-align:right;font-size:10px;color:#33465e;white-space:nowrap}
 .pd b{display:block;font-size:15px;color:#0d2038}
 .resumo{display:flex;gap:8px;margin-bottom:8px;font-size:9px;color:#5b6b80}
 .resumo span{border:1px solid #cfdae8;border-radius:8px;padding:3px 10px;text-transform:uppercase;letter-spacing:.4px}
 .resumo b{color:#0d2038;font-size:12px}
 table{width:100%;border-collapse:collapse;table-layout:fixed}
 th{background:#005da8;color:#fff;font-size:9.5px;text-transform:uppercase;letter-spacing:.6px;padding:5px;border:1px solid #005da8}
 td{border:1px solid #cfdae8;vertical-align:top;height:96px;padding:3px 4px;overflow:hidden}
 td.fora{background:#f4f7fb}
 td.hoje{background:#eaf3fc;border-color:#005da8}
 .num{font-size:11px;font-weight:800;color:#33465e}
 td.hoje .num{color:#005da8}
 ul{margin:2px 0 0;padding:0;list-style:none}
 li{font-size:8.3px;line-height:1.25;margin-bottom:2px;padding:1px 3px;border-radius:3px;border-left:2.5px solid #98a8bd;background:#f7f9fc;
    overflow-wrap:anywhere}
 li i{font-style:normal;color:#5b6b80}
 li.sAgendado{border-left-color:#155ba0;background:#eef5fc}
 li.sMontado{border-left-color:#9a6200;background:#fdf6ea}
 li.sEnviado,li.sRecebido{border-left-color:#1e7d43;background:#eef8f2}
 li.sCancelado{border-left-color:#b3261e;background:#fdeeed}
 li.feito{opacity:.6}
 .pfoot{margin-top:8px;display:flex;justify-content:space-between;font-size:9px;color:#5b6b80}
 .leg{display:flex;gap:10px;font-size:8.5px;color:#5b6b80}
 .leg i{font-style:normal;display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:3px;vertical-align:middle}
 @media print{ body{-webkit-print-color-adjust:exact;print-color-adjust:exact} }
</style></head><body>
<div class="ph">
  <img src="${location.origin}/dilnor-logo.png" alt="">
  <div class="tt"><small>Sistema de Gestão Logística · ${esc(unidade)}</small>
    <h2>${esc(cfg.titulo)}</h2></div>
  <div class="pd">Mês<b>${MESES_NOME[m - 1]} de ${ano}</b>Gerado em ${new Date().toLocaleString('pt-BR')}</div>
</div>
<div class="resumo">
  <span>Agendamentos <b>${doMes.length}</b></span>
  <span>Pendentes <b>${pendentes.length}</b></span>
  <span>Concluídos <b>${feitos}</b></span>
</div>
<table>
  <thead><tr>${DIAS_SEMANA.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
  <tbody>${grade(mes, porDia, cfg)}</tbody>
</table>
<div class="pfoot">
  <span class="leg">
    <span><i style="background:#155ba0"></i>Agendado</span>
    ${cfg.tipo === 'enviar' ? '<span><i style="background:#9a6200"></i>Montado</span>' : ''}
    <span><i style="background:#1e7d43"></i>${cfg.tipo === 'enviar' ? 'Enviado' : 'Recebido'}</span>
    <span><i style="background:#b3261e"></i>Cancelado</span>
  </span>
  <span>${esc(unidade)} · página gerada pelo sistema</span>
</div>
</body></html>`;

  const janela = window.open('', '_blank');
  if (!janela) { alert('O navegador bloqueou a janela de impressão. Libere os pop-ups para este site.'); return; }
  janela.document.write(html);
  janela.document.close();
  // espera a logo carregar para não sair um quadro vazio no cabeçalho
  janela.onload = () => { janela.focus(); janela.print(); };
}
