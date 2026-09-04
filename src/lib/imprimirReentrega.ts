'use client';

/**
 * O cartaz que vai grudado no palete.
 *
 * Janela separada em vez de @media print na própria tela, pela mesma razão da
 * agenda: o CSS do app (tema escuro, sticky, grid) atrapalha a folha.
 *
 * O desenho segue a "PLACA DE REENTREGAS" que o depósito já usa: rótulo miúdo
 * em cima, valor gigante embaixo, blocos empilhados ocupando a folha inteira.
 * É papel lido de longe, no corredor, por quem passa empurrando o palete — não
 * documento de mesa. Por isso não há tabela de pedidos aqui: o detalhamento
 * fica na tela, onde dá para ler sentado.
 *
 * A folha é dividida por proporção (flex), não por altura fixa: assim o cartaz
 * enche a página com ou sem os blocos opcionais, sem sobrar branco no pé nem
 * empurrar para uma segunda folha.
 */

import { fmtData, fmtPeso } from './reentregas';
import type { Reentrega } from '@/types/database';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Um bloco do cartaz. `peso` é quanto da folha ele ocupa, em partes. */
interface Bloco {
  rotulo: string;
  valor: string;
  /** proporção da altura da folha */
  peso: number;
  /** valores curtos (data, número) aguentam corpo maior que uma frase */
  fonte: number;
}

export function imprimirReentrega(r: Reentrega, unidade: string) {
  const blocos: Bloco[] = [
    { rotulo: 'Praça / cliente', valor: r.rota || '—', peso: 3, fonte: 46 },
    { rotulo: 'Carregamento', valor: r.lote, peso: 4, fonte: 96 },
    { rotulo: 'Peso (kg)', valor: fmtPeso(r.peso), peso: 2, fonte: 60 },
    { rotulo: 'Data de conferência', valor: fmtData(r.data), peso: 2, fonte: 58 },
  ];

  // só entra quando existe: reentrega sem margem de retorno fica sem previsão,
  // e um bloco vazio no cartaz faria parecer que alguém esqueceu de preencher
  if (r.data_prevista) {
    blocos.push({
      rotulo: 'Previsão de saída', valor: fmtData(r.data_prevista), peso: 2, fonte: 58,
    });
  }

  const corpo = blocos.map((b) => `
    <div class="bl" style="flex:${b.peso}">
      <span class="rot">${esc(b.rotulo)}</span>
      <strong class="val" style="font-size:${b.fonte}px">${esc(b.valor)}</strong>
    </div>`).join('');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Reentrega — lote ${esc(r.lote)}</title>
<style>
 @page{size:A4 portrait;margin:8mm}
 *{box-sizing:border-box;margin:0;padding:0}
 html,body{height:100%}
 body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#000;
      display:flex;flex-direction:column;border:4px solid #000}

 .topo{display:flex;align-items:center;gap:10px;padding:6px 12px;
       border-bottom:4px solid #000;flex:none}
 .topo img{height:34px}
 .topo h1{font-size:34px;letter-spacing:4px;text-transform:uppercase;flex:1;text-align:center}
 .topo .num{font-size:13px;text-align:right;line-height:1.3}
 .topo .num b{font-size:20px;display:block}

 /* paletes e o aviso de lote à parte dividem a mesma faixa */
 .faixa{display:flex;border-bottom:4px solid #000;flex:none}
 .faixa .pal{flex:1;text-align:center;padding:8px 12px}
 .faixa .pal span{font-size:12px;letter-spacing:3px;text-transform:uppercase}
 .faixa .pal b{display:block;font-size:52px;line-height:1}
 .faixa .parte{background:#000;color:#fff;display:flex;flex-direction:column;
               justify-content:center;text-align:center;padding:8px 22px;min-width:34%}
 .faixa .parte b{font-size:26px;letter-spacing:2px;line-height:1.1}
 .faixa .parte span{font-size:11px;letter-spacing:1px}

 .blocos{flex:1;display:flex;flex-direction:column}
 .bl{display:flex;flex-direction:column;align-items:center;justify-content:center;
     text-align:center;padding:4px 10px;border-bottom:2px solid #000;overflow:hidden}
 .bl:last-child{border-bottom:none}
 .rot{font-size:13px;letter-spacing:3px;text-transform:uppercase;flex:none}
 .val{line-height:1.05;word-break:break-word;font-weight:700}

 .rod{flex:none;border-top:4px solid #000;padding:5px 12px;font-size:10px;
      display:flex;justify-content:space-between;gap:12px}
 .rod .obs{flex:1;text-align:left}
</style></head><body>

<div class="topo">
  <img src="/dilnor-logo.png" alt="">
  <h1>Reentregas</h1>
  <div class="num">${esc(unidade)}<b>Nº ${esc(r.id)}</b></div>
</div>

<div class="faixa">
  <div class="pal">
    <span>Paletes</span>
    <b>${esc(r.paletes)}</b>
  </div>
  ${r.lote_a_parte ? `<div class="parte">
    <b>LOTE À PARTE</b>
    <span>fica no depósito para sair noutro dia</span>
  </div>` : ''}
</div>

<div class="blocos">${corpo}</div>

<div class="rod">
  <span class="obs">${r.obs ? '<b>Obs.:</b> ' + esc(r.obs) : ''}</span>
  <span>${esc(r.motorista || '—')}</span>
  <span>${esc(new Date().toLocaleDateString('pt-BR'))}</span>
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
