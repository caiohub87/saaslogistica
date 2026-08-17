'use client';

/**
 * Graficos do comparativo, em SVG proprio — sem biblioteca.
 *
 * Portados do sistema antigo com as correcoes que ja tinham sido feitas la:
 *  - barras ancoradas no zero (verde acima, vermelho abaixo), porque valor que
 *    sobe e desce do zero nao se le em barra comum;
 *  - eixo com passo redondo (1, 2, 5, 10...) para a grade nao sair quebrada;
 *  - na acuracidade a escala gruda nos dados: entre 96% e 99% um eixo 0–100
 *    achata a linha e esconde justamente a variacao que interessa;
 *  - com muitos inventarios os rotulos do eixo X sao rareados para nao se
 *    sobreporem.
 */

export interface Ponto {
  label: string;
  value: number;
}

/** Escala com passo redondo. */
function escala(min: number, max: number, divisoes: number) {
  if (min === max) { min = Math.min(0, min - 1); max = Math.max(0, max + 1); }
  const bruto = (max - min) / divisoes;
  const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(bruto) || 1)));
  const n = bruto / exp;
  const passo = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
  return { lo: Math.floor(min / passo) * passo, hi: Math.ceil(max / passo) * passo, passo };
}

export function GraficoBarras({ dados, fmt, fmtEixo, vazio }: {
  dados: Ponto[];
  fmt: (v: number) => string;
  fmtEixo?: (v: number) => string;
  vazio?: string;
}) {
  if (!dados.length) return <p className="py-8 text-center text-sm txt-fraco">{vazio ?? 'Sem dados no período.'}</p>;

  const W = 900, H = 310, pl = 88, pr = 18, pt = 30, pb = 52;
  const iw = W - pl - pr, ih = H - pt - pb;
  const vals = dados.map((d) => d.value);
  const e = escala(Math.min(0, ...vals), Math.max(0, ...vals), 4);
  const y = (v: number) => pt + ih - ((v - e.lo) / ((e.hi - e.lo) || 1)) * ih;
  const y0 = y(0);
  const passoX = iw / dados.length;
  const bw = Math.min(64, passoX * 0.58);
  const pular = Math.ceil(dados.length / 14);
  const eixo = fmtEixo ?? fmt;

  const linhas: number[] = [];
  for (let v = e.lo; v <= e.hi + 1e-9; v += e.passo) linhas.push(v);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full overflow-visible">
        {linhas.map((v, i) => (
          <g key={i}>
            <line
              x1={pl} y1={y(v)} x2={W - pr} y2={y(v)}
              stroke={Math.abs(v) < 1e-9 ? 'var(--texto-fraco)' : 'var(--borda)'}
              strokeWidth={Math.abs(v) < 1e-9 ? 1.6 : 1}
            />
            <text x={pl - 9} y={y(v) + 4.5} textAnchor="end" fontSize={13} fill="var(--texto-fraco)">
              {eixo(v)}
            </text>
          </g>
        ))}
        {dados.map((d, i) => {
          const cx = pl + passoX * i + passoX / 2;
          const alto = d.value >= 0 ? y(d.value) : y0;
          const h = Math.max(2, Math.abs(y(d.value) - y0));
          const cor = d.value >= 0 ? '#1e7d43' : '#b3261e';
          return (
            <g key={i}>
              <rect x={cx - bw / 2} y={alto} width={bw} height={h} rx={3} fill={cor}>
                <title>{`${d.label}: ${fmt(d.value)}`}</title>
              </rect>
              {dados.length <= 12 && (
                <text
                  x={cx} y={d.value >= 0 ? alto - 8 : alto + h + 17}
                  textAnchor="middle" fontSize={13} fontWeight={700} fill={cor}
                >
                  {fmt(d.value)}
                </text>
              )}
              {i % pular === 0 && (
                <text x={cx} y={H - 16} textAnchor="middle" fontSize={13} fill="var(--texto-fraco)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GraficoLinha({ dados, vazio }: { dados: Ponto[]; vazio?: string }) {
  if (!dados.length) return <p className="py-8 text-center text-sm txt-fraco">{vazio ?? 'Sem dados no período.'}</p>;

  const W = 900, H = 310, pl = 74, pr = 18, pt = 30, pb = 52;
  const iw = W - pl - pr, ih = H - pt - pb;
  const vals = dados.map((d) => d.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const folga = Math.max(0.5, (hi - lo) * 0.25);
  lo = Math.max(0, lo - folga); hi = Math.min(100, hi + folga);
  if (hi - lo < 1) { lo = Math.max(0, lo - 0.5); hi = Math.min(100, hi + 0.5); }

  const y = (v: number) => pt + ih - ((v - lo) / ((hi - lo) || 1)) * ih;
  const x = (i: number) => (dados.length === 1 ? pl + iw / 2 : pl + (iw / (dados.length - 1)) * i);
  const pular = Math.ceil(dados.length / 14);
  const pts = dados.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="block h-auto w-full overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const v = lo + (hi - lo) * f;
          return (
            <g key={i}>
              <line x1={pl} y1={y(v)} x2={W - pr} y2={y(v)} stroke="var(--borda)" strokeWidth={1} />
              <text x={pl - 9} y={y(v) + 4.5} textAnchor="end" fontSize={13} fill="var(--texto-fraco)">
                {v.toFixed(1).replace('.', ',')}%
              </text>
            </g>
          );
        })}
        {dados.length > 1 && (
          <polygon
            points={`${pl},${pt + ih} ${pts} ${W - pr},${pt + ih}`}
            fill="var(--marinho-500, #2563eb)" opacity={0.1}
          />
        )}
        <polyline
          points={pts} fill="none" stroke="var(--marinho-500, #2563eb)"
          strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
        />
        {dados.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.value)} r={5} fill="var(--marinho-500, #2563eb)">
              <title>{`${d.label}: ${d.value.toFixed(2)}%`}</title>
            </circle>
            {dados.length <= 12 && (
              <text x={x(i)} y={y(d.value) - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--texto)">
                {d.value.toFixed(2).replace('.', ',')}%
              </text>
            )}
            {i % pular === 0 && (
              <text x={x(i)} y={H - 16} textAnchor="middle" fontSize={13} fill="var(--texto-fraco)">
                {d.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function Ranking({ dados, fmt, vazio }: {
  dados: Ponto[]; fmt: (v: number) => string; vazio?: string;
}) {
  if (!dados.length) return <p className="py-8 text-center text-sm txt-fraco">{vazio ?? 'Sem dados.'}</p>;
  const max = Math.max(1, ...dados.map((d) => Math.abs(d.value)));
  return (
    <div className="flex flex-col gap-2">
      {dados.map((d, i) => {
        const cor = d.value >= 0 ? '#1e7d43' : '#b3261e';
        return (
          <div key={i} className="grid grid-cols-[1fr_2.1fr_auto] items-center gap-2.5 text-[12.5px]">
            <span className="truncate" title={d.label}>{d.label}</span>
            <span className="h-3.5 overflow-hidden rounded-full" style={{ background: 'var(--borda)' }}>
              <span
                className="block h-full rounded-full"
                style={{ width: `${(Math.abs(d.value) / max) * 100}%`, background: cor }}
              />
            </span>
            <span className="whitespace-nowrap font-bold" style={{ color: cor }}>{fmt(d.value)}</span>
          </div>
        );
      })}
    </div>
  );
}
