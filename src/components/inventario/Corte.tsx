'use client';

import { AlertTriangle, Loader2, Save, Scissors, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import {
  acuracidadeDe, baseEstoqueCorte, fmtBRL, fmtData, fmtPct, lerArquivo, montarCorte,
  NAO_IDENTIFICADO, totais, type GrupoCorte,
} from '@/lib/inventario';
import { getSupabase } from '@/lib/supabase';
import type { Inventario } from '@/types/database';
import { cn } from '@/utils/cn';

/**
 * Inventario de corte.
 *
 * Diferenca para o lancamento normal: o arquivo traz produtos de VARIOS
 * fornecedores misturados, separados pela coluna "Id Fabricante". A tela quebra
 * o arquivo em um lancamento por fornecedor — todos com tipo='corte', na mesma
 * tabela do inventario normal, para o resto do sistema continuar enxergando
 * tudo junto.
 *
 * O valor do estoque nao e digitado: e herdado do inventario normal mais
 * recente de cada fornecedor. Quem nunca teve inventario normal fica sem
 * acuracidade — a tela mostra '—' em vez de inventar um denominador.
 */
export function Corte({ lancamentos, unidade, podeLancar, demo, aoMudar }: {
  lancamentos: Inventario[];
  unidade: string;
  podeLancar: boolean;
  demo: boolean;
  aoMudar: () => Promise<void>;
}) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [grupos, setGrupos] = useState<GrupoCorte[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro' | 'info'; texto: string } | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  /** Cada grupo com o que a tela precisa mostrar antes de gravar. */
  const preview = useMemo(() => (grupos ?? []).map((g) => {
    const t = totais(g.produtos);
    const base = baseEstoqueCorte(g.fornecedor, data, lancamentos);
    return {
      g,
      t,
      base,
      acu: base.valor ? acuracidadeDe(t, base.valor) : null,
      substitui: lancamentos.some((l) =>
        l.fornecedor === g.fornecedor
        && l.data_inventario === data
        && (l.tipo ?? 'normal') === 'corte'),
    };
  }), [grupos, data, lancamentos]);

  const totalItens = preview.reduce((a, p) => a + p.t.total, 0);
  const totalDif = preview.reduce((a, p) => a + p.t.fin, 0);
  const semBase = preview.filter((p) => !p.base.valor).length;
  const desconhecidos = grupos?.find((g) => g.fornecedor === NAO_IDENTIFICADO)?.desconhecidos ?? [];

  async function processar(file: File) {
    if (!data) { setAviso({ tipo: 'erro', texto: 'Escolha a data do corte antes de subir o arquivo.' }); return; }

    setAviso({ tipo: 'info', texto: `Lendo ${file.name}…` });
    try {
      const lidos = montarCorte(await lerArquivo(file));
      setGrupos(lidos);
      setNomeArquivo(file.name);
      const conhecidos = lidos.filter((g) => g.fornecedor !== NAO_IDENTIFICADO).length;
      setAviso({
        tipo: 'info',
        texto: `Arquivo lido: ${conhecidos} fornecedor(es) identificado(s). Confira e clique em Salvar corte.`,
      });
    } catch (e) {
      setGrupos(null);
      setNomeArquivo('');
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  async function salvar() {
    if (!grupos?.length) return;
    if (demo) {
      setAviso({ tipo: 'erro', texto: 'Modo de demonstração não grava no banco. Entre com seu login para lançar.' });
      return;
    }
    const sb = getSupabase();
    if (!sb) return;

    setSalvando(true);
    const { error } = await sb.from('inventarios').upsert(
      preview.map((p) => ({
        unidade,
        fornecedor: p.g.fornecedor,
        data_inventario: data,
        valor_estoque: p.base.valor,
        produtos: p.g.produtos,
        tipo: 'corte',
      })),
      { onConflict: 'unidade,fornecedor,data_inventario,tipo' },
    );
    setSalvando(false);

    if (error) {
      setAviso({
        tipo: 'erro',
        texto: 'Não salvou: ' + error.message +
          (/permission|policy|row-level/i.test(error.message)
            ? ' — seu acesso não tem permissão de lançar inventário.'
            : /tipo|column|constraint|conflict/i.test(error.message)
              ? ' — falta a coluna tipo: rode supabase/15_inventario_corte.sql no Supabase.'
              : ''),
      });
      return;
    }

    const n = grupos.length;
    setGrupos(null);
    setNomeArquivo('');
    setAviso({
      tipo: 'ok',
      texto: `Corte de ${fmtData(data)} salvo: ${n} fornecedor(es), ${totalItens} itens.`,
    });
    await aoMudar();
  }

  if (!podeLancar) {
    return (
      <section className="painel sombra rounded-2xl p-6 text-center motion-safe:animate-entrada">
        <h2 className="text-[15px] font-bold">Sem permissão para lançar</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] txt-fraco">
          Você pode consultar o resultado do corte na <b>Visão geral</b>, mas não tem a permissão
          <b> Lançar</b> do inventário. Quem libera isso é o administrador, na tela de Usuários e acessos.
        </p>
      </section>
    );
  }

  return (
    <section className="painel sombra rounded-2xl p-4 motion-safe:animate-entrada">
      <h2 className="flex items-center gap-2 text-[15px] font-bold">
        <Scissors aria-hidden className="size-4.5 text-marinho-500" />
        Lançar inventário de corte
      </h2>
      <p className="mb-3 mt-1 text-[12.5px] txt-fraco">
        Um arquivo só, com vários fornecedores. O sistema separa produto por produto pela coluna
        <b> Id Fabricante</b> e grava um lançamento para cada fornecedor.
      </p>

      <div className="mb-3 max-w-56">
        <label htmlFor="dt-corte" className="mb-1 block text-[12.5px] font-semibold">Data do corte</label>
        <input
          id="dt-corte" type="date" value={data}
          onChange={(e) => { setData(e.target.value); setAviso(null); }}
          className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
        />
      </div>

      <button
        type="button" onClick={() => inputArquivo.current?.click()}
        className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed borda px-4 py-6 transition-colors hover:border-marinho-500"
      >
        <Upload aria-hidden className="size-5 text-marinho-500" />
        <span className="text-[14px] font-semibold">Escolher o relatório de corte</span>
        <span className="text-[12px] txt-fraco">
          Aceita o .xls do ERP e .xlsx · o fornecedor sai do Id Fabricante, não precisa escolher
        </span>
      </button>
      <input
        ref={inputArquivo} type="file" accept=".xls,.xlsx,.htm,.html" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void processar(f); e.target.value = ''; }}
      />

      {aviso && (
        <p
          role={aviso.tipo === 'erro' ? 'alert' : undefined}
          className={cn(
            'mt-3 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold',
            aviso.tipo === 'erro' && 'bg-erro-500/10 text-erro-600',
            aviso.tipo === 'ok' && 'bg-ok-500/10 text-ok-600',
            aviso.tipo === 'info' && 'painel-2 txt-fraco',
          )}
        >
          {aviso.texto}
        </p>
      )}

      {preview.length > 0 && (
        <div className="mt-3 rounded-xl border-2 border-marinho-500 painel-2 p-4 motion-safe:animate-subir">
          <p className="text-[15px] font-bold">
            Corte de {fmtData(data)}
            <span className="ml-2 text-[12.5px] font-semibold txt-fraco">{nomeArquivo}</span>
          </p>
          <p className="mt-1 text-[13px] txt-fraco">
            <b>{preview.length}</b> fornecedor(es) · <b>{totalItens}</b> itens ·
            diferença <b className={totalDif < 0 ? 'text-erro-600' : 'text-ok-600'}>{fmtBRL(totalDif)}</b>
          </p>

          {desconhecidos.length > 0 && (
            <p className="mt-2 rounded-lg bg-ouro-100 px-3 py-2 text-[12.5px] font-semibold text-ouro-700">
              <AlertTriangle aria-hidden className="mr-1 inline size-3.5" />
              {desconhecidos.length} código(s) fora da lista de fornecedores — vão para
              <b> {NAO_IDENTIFICADO}</b>, sem se perder:{' '}
              {desconhecidos.map((d) => `${d.codigo}${d.razao ? ` (${d.razao})` : ''}`).join(' · ')}
            </p>
          )}

          {semBase > 0 && (
            <p className="mt-2 rounded-lg painel px-3 py-2 text-[12.5px] txt-fraco">
              {semBase} fornecedor(es) sem inventário normal anterior: a divergência é gravada,
              mas a acuracidade fica como “—” até existir um inventário completo para servir de base.
            </p>
          )}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="painel text-left">
                  <Th>Fornecedor</Th><Th>Id Fabricante</Th>
                  <Th num>Itens</Th><Th num>Divergentes</Th>
                  <Th num>Entrada</Th><Th num>Saída</Th><Th num>Diferença</Th>
                  <Th num>Base do estoque</Th><Th num>Acuracidade</Th>
                </tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.g.fornecedor} className="border-b borda">
                    <Td>
                      <b>{p.g.fornecedor}</b>
                      {p.substitui && (
                        <span className="ml-1.5 rounded-md bg-ouro-100 px-1.5 py-0.5 text-[10.5px] font-bold text-ouro-700">
                          substitui
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[12px] txt-fraco">{p.g.codigos.join(', ') || '—'}</span>
                    </Td>
                    <Td num>{p.t.total}</Td>
                    <Td num>{p.t.ndiv}</Td>
                    <Td num cor="ok">{p.t.pos ? fmtBRL(p.t.pos) : '—'}</Td>
                    <Td num cor="erro">{p.t.neg ? fmtBRL(Math.abs(p.t.neg)) : '—'}</Td>
                    <Td num sinal={p.t.fin}>{fmtBRL(p.t.fin)}</Td>
                    <Td num>
                      {p.base.valor ? (
                        <>
                          {fmtBRL(p.base.valor)}
                          <span className="block text-[10.5px] font-normal txt-fraco">
                            de {fmtData(p.base.de!)}
                          </span>
                        </>
                      ) : '—'}
                    </Td>
                    <Td num>{fmtPct(p.acu)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button" onClick={() => void salvar()} disabled={salvando}
              className="flex items-center gap-2 rounded-xl bg-marinho-800 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
            >
              {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
              {salvando ? 'Salvando…' : `Salvar corte (${preview.length} lançamentos)`}
            </button>
            <button
              type="button" onClick={() => { setGrupos(null); setNomeArquivo(''); setAviso(null); }}
              className="flex items-center gap-1.5 rounded-xl border borda px-3 py-2.5 text-[13px] font-semibold txt-fraco"
            >
              <X aria-hidden className="size-4" />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ pedaços */

function Th({ children, num }: { children: React.ReactNode; num?: boolean }) {
  return (
    <th className={cn(
      'whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wide txt-fraco',
      num && 'text-right',
    )}>
      {children}
    </th>
  );
}

function Td({ children, num, sinal, cor }: {
  children: React.ReactNode; num?: boolean; sinal?: number; cor?: 'ok' | 'erro';
}) {
  return (
    <td className={cn(
      'px-3 py-2',
      num && 'whitespace-nowrap text-right',
      cor === 'ok' && 'font-bold text-ok-600',
      cor === 'erro' && 'font-bold text-erro-600',
      sinal != null && sinal > 0 && 'font-bold text-ok-600',
      sinal != null && sinal < 0 && 'font-bold text-erro-600',
    )}>
      {children}
    </td>
  );
}
