'use client';

import { useId } from 'react';

/**
 * Grafico de area — a forma que o usuario pediu para a Home.
 *
 * Area preenchida com degrade sob a linha: o olho le o VOLUME acumulado, nao
 * so o ponto. Bom para "como isso vem evoluindo", que e a pergunta da Home.
 *
 * A escala gruda nos dados (nao comeca no zero a forca) quando a variacao e
 * pequena, senao a linha vira um risco reto e esconde justamente o que
 * interessa. Quando o zero e referencia de verdade — dinheiro que pode ser
 * negativo — ele entra na escala.
 */
export interface PontoArea { rotulo: string; valor: number }

export function GraficoArea({ dados, cor = 'var(--color-marinho-500)', fmt, incluirZero, altura = 150 }: {
  dados: PontoArea[];
  cor?: string;
  fmt: (v: number) => string;
  /** força o zero na escala — use para valores que podem ser negativos */
  incluirZero?: boolean;
  altura?: number;
}) {
  const id = useId().replace(/:/g, '');
  if (dados.length < 2) {
    return (
      <p className="py-8 text-center text-[13px] txt-fraco">
        {dados.length ? 'Um ponto só — sem evolução para mostrar ainda.' : 'Sem dados.'}
      </p>
    );
  }

  const W = 600, H = altura, pl = 8, pr = 8, pt = 16, pb = 22;
  const iw = W - pl - pr, ih = H - pt - pb;
  const vals = dados.map((d) => d.valor);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (incluirZero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  const folga = (hi - lo) * 0.18 || Math.abs(hi) * 0.1 || 1;
  lo -= folga; hi += folga;

  const x = (i: number) => pl + (iw / (dados.length - 1)) * i;
  const y = (v: number) => pt + ih - ((v - lo) / ((hi - lo) || 1)) * ih;

  const pts = dados.map((d, i) => `${x(i).toFixed(1)},${y(d.valor).toFixed(1)}`).join(' ');
  const area = `${pl},${(pt + ih).toFixed(1)} ${pts} ${(W - pr).toFixed(1)},${(pt + ih).toFixed(1)}`;
  const ult = dados[dados.length - 1];

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full overflow-visible">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={cor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {incluirZero && lo < 0 && hi > 0 && (
          <line x1={pl} y1={y(0)} x2={W - pr} y2={y(0)} stroke="var(--borda)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        <polygon points={area} fill={`url(#g${id})`} />
        <polyline points={pts} fill="none" stroke={cor} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {dados.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.valor)} r={i === dados.length - 1 ? 4 : 2.5} fill={cor}>
            <title>{`${d.rotulo}: ${fmt(d.valor)}`}</title>
          </circle>
        ))}
        {/* só o primeiro e o último rótulo: mais que isso vira poluição num card */}
        <text x={pl} y={H - 6} fontSize={11} fill="var(--texto-fraco)">{dados[0].rotulo}</text>
        <text x={W - pr} y={H - 6} fontSize={11} textAnchor="end" fill="var(--texto-fraco)">{ult.rotulo}</text>
      </svg>
    </div>
  );
}
