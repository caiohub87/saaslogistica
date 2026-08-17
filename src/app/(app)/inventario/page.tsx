'use client';

import {
  AlertTriangle, ClipboardList, FileSpreadsheet, Loader2, Save, Search, SignatureIcon,
  Trash2, TrendingUp, Upload, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Aprovacoes } from '@/components/inventario/Aprovacoes';
import { Comparativo } from '@/components/inventario/Comparativo';
import {
  acuracidadeDe, comDivAnt, fmtBRL, fmtData, fmtPct, fmtQtd, FORNECEDORES,
  lerArquivo, low, montarProdutos, normFornecedor, parseNum, pctEstoque, totais,
  type ProdutoComAnt,
} from '@/lib/inventario';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import type { Inventario, ProdutoInventario } from '@/types/database';
import { cn } from '@/utils/cn';

const hojeISO = () => new Date().toISOString().slice(0, 10);

type Aba = 'lancamentos' | 'comparativo' | 'aprovacao';
const ABAS: { id: Aba; nome: string; Icone: typeof ClipboardList }[] = [
  { id: 'lancamentos', nome: 'Lançamentos', Icone: ClipboardList },
  { id: 'comparativo', nome: 'Comparativo', Icone: TrendingUp },
  { id: 'aprovacao', nome: 'Aprovações', Icone: SignatureIcon },
];

interface Pendente {
  fornecedor: string;
  data_inventario: string;
  valor_estoque: number;
  produtos: ProdutoInventario[];
  substitui: boolean;
}

export default function InventarioPage() {
  const { pode, demo, usuario } = useSessao();
  const podeLancar = pode('inventario', 'lancar');
  const podeExcluir = pode('inventario', 'excluir');
  const podeAprovar = pode('inventario', 'aprovar');
  const podeExportar = pode('inventario', 'exportar');
  const [aba, setAba] = useState<Aba>('lancamentos');

  const [lancamentos, setLancamentos] = useState<Inventario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro' | 'info'; texto: string } | null>(null);

  // formulário de lançamento
  const [fornecedor, setFornecedor] = useState('');
  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState('');
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  // filtros da listagem
  const [fornAtivo, setFornAtivo] = useState('');
  const [lancAtivo, setLancAtivo] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const [soDiv, setSoDiv] = useState(false);
  const [ini, setIni] = useState('');
  const [fim, setFim] = useState('');

  const carregar = useCallback(async () => {
    if (demo) {                       // demonstração usa dados de exemplo, não o banco
      const { INVENTARIOS_DEMO } = await import('@/lib/demo');
      setLancamentos(INVENTARIOS_DEMO);
      setErro(null);
      setCarregando(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }
    setCarregando(true);
    const { data: rows, error } = await sb
      .from('inventarios').select('*')
      .order('data_inventario', { ascending: false }).limit(500);
    if (error) {
      setErro(
        error.message +
        (/relation|does not exist/i.test(error.message)
          ? ' — rode o SQL dos inventários no Supabase.' : ''),
      );
      setLancamentos([]);
    } else {
      setLancamentos((rows ?? []) as Inventario[]);
      setErro(null);
    }
    setCarregando(false);
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);

  // ---------- leitura do arquivo ----------
  async function processar(file: File) {
    const forn = normFornecedor(fornecedor);
    const est = parseNum(valor);
    if (!forn) { setAviso({ tipo: 'erro', texto: 'Selecione o fornecedor antes de subir o arquivo.' }); return; }
    if (!data) { setAviso({ tipo: 'erro', texto: 'Escolha a data do inventário antes de subir o arquivo.' }); return; }
    if (!est) { setAviso({ tipo: 'erro', texto: `Digite o valor do estoque de ${forn} antes de subir o arquivo.` }); return; }

    setAviso({ tipo: 'info', texto: `Lendo ${file.name}…` });
    try {
      const produtos = montarProdutos(await lerArquivo(file));
      setPendente({
        fornecedor: forn, data_inventario: data, valor_estoque: est, produtos,
        substitui: lancamentos.some((l) => l.fornecedor === forn && l.data_inventario === data),
      });
      setAviso({ tipo: 'info', texto: 'Arquivo lido. Confira os números e clique em Salvar inventário.' });
    } catch (e) {
      setPendente(null);
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    }
  }

  async function salvar() {
    if (!pendente) return;
    if (demo) {
      setAviso({ tipo: 'erro', texto: 'Modo de demonstração não grava no banco. Entre com seu login para lançar.' });
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    setSalvando(true);
    const { error } = await sb.from('inventarios').upsert(
      {
        unidade: usuario!.unidade,
        fornecedor: pendente.fornecedor,
        data_inventario: pendente.data_inventario,
        valor_estoque: pendente.valor_estoque,
        produtos: pendente.produtos,
      },
      { onConflict: 'unidade,fornecedor,data_inventario' },
    );
    setSalvando(false);
    if (error) {
      setAviso({
        tipo: 'erro',
        texto: 'Não salvou: ' + error.message +
          (/permission|policy|row-level/i.test(error.message)
            ? ' — seu acesso não tem permissão de lançar inventário.' : ''),
      });
      return;
    }
    const { fornecedor: f, data_inventario: d, produtos } = pendente;
    setPendente(null);
    setValor('');
    setAviso({ tipo: 'ok', texto: `${f} de ${fmtData(d)} salvo (${produtos.length} produtos).` });
    setFornAtivo(f);
    setLancAtivo(null);
    await carregar();
  }

  async function excluir(l: Inventario) {
    if (!confirm(`Excluir o inventário de ${l.fornecedor} de ${fmtData(l.data_inventario)}?`)) return;
    if (demo) { setAviso({ tipo: 'erro', texto: 'Modo de demonstração não grava no banco.' }); return; }
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('inventarios').delete().eq('id', l.id);
    if (error) { setAviso({ tipo: 'erro', texto: error.message }); return; }
    setLancAtivo(null);
    setAviso({ tipo: 'info', texto: 'Lançamento excluído.' });
    await carregar();
  }

  // ---------- consultas ----------
  const noPeriodo = useMemo(
    () => lancamentos.filter((l) =>
      (!ini || l.data_inventario >= ini) && (!fim || l.data_inventario <= fim)),
    [lancamentos, ini, fim],
  );
  const fornecedoresComDados = useMemo(
    () => [...new Set(noPeriodo.map((l) => l.fornecedor))].sort(),
    [noPeriodo],
  );
  const fornEfetivo = fornecedoresComDados.includes(fornAtivo) ? fornAtivo : (fornecedoresComDados[0] ?? '');
  const doFornecedor = useMemo(
    () => noPeriodo.filter((l) => l.fornecedor === fornEfetivo)
      .sort((a, b) => (a.data_inventario < b.data_inventario ? 1 : -1)),
    [noPeriodo, fornEfetivo],
  );
  const lanc = doFornecedor.find((l) => l.id === lancAtivo) ?? doFornecedor[0] ?? null;

  const produtos: ProdutoComAnt[] = useMemo(
    () => (lanc ? comDivAnt(lanc, lancamentos) : []),
    [lanc, lancamentos],
  );
  const filtrados = useMemo(() => {
    const q = low(busca);
    return produtos
      .filter((p) => !soDiv || p.dif_qtde)
      .filter((p) => !q || low(p.id).includes(q) || low(p.descricao).includes(q));
  }, [produtos, busca, soDiv]);

  const t = useMemo(() => totais(filtrados), [filtrados]);
  const acu = lanc ? acuracidadeDe(t, lanc.valor_estoque) : null;
  const pct = lanc ? pctEstoque(lanc.valor_estoque, t.fin) : null;

  if (!pode('inventario', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver o inventário.</p>
      </div>
    );
  }

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <FileSpreadsheet aria-hidden className="size-5 text-marinho-500" />
          Inventário
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          Divergência da conferência por fornecedor. O <b>Div Ant</b> vem do inventário anterior do
          mesmo fornecedor, calculado na hora.
        </p>
      </header>

      {erro && (
        <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm text-erro-600">{erro}</p>
      )}

      <div className="sem-barra mb-4 flex gap-1 overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.id} type="button" onClick={() => setAba(a.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
              aba === a.id ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50',
            )}
          >
            <a.Icone aria-hidden className="size-4" />
            {a.nome}
          </button>
        ))}
      </div>

      {aba === 'comparativo' && (
        <Comparativo
          lancamentos={lancamentos}
          unidade={usuario?.unidade ?? 'Dilnor'}
          podeExportar={podeExportar}
        />
      )}

      {aba === 'aprovacao' && (
        <Aprovacoes
          lancamentos={lancamentos}
          podeAprovar={podeAprovar}
          nomeUsuario={usuario?.nome ?? ''}
          demo={demo}
          aoMudar={carregar}
        />
      )}

      {/* ---------------- lançar ---------------- */}
      {aba === 'lancamentos' && podeLancar && (
        <section className="painel sombra mb-4 rounded-2xl p-4 motion-safe:animate-subir">
          <h2 className="mb-3 text-[15px] font-bold">Lançar inventário</h2>

          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="forn" className="mb-1 block text-[12.5px] font-semibold">Fornecedor</label>
              <input
                id="forn" list="lista-forn" autoComplete="off" placeholder="Selecione…"
                value={fornecedor} onChange={(e) => { setFornecedor(e.target.value); setAviso(null); }}
                className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
              />
              <datalist id="lista-forn">
                {[...new Set([...FORNECEDORES, ...lancamentos.map((l) => l.fornecedor)])].sort()
                  .map((f) => <option key={f} value={f} />)}
              </datalist>
            </div>
            <div>
              <label htmlFor="dt" className="mb-1 block text-[12.5px] font-semibold">Data do inventário</label>
              <input
                id="dt" type="date" value={data}
                onChange={(e) => { setData(e.target.value); setAviso(null); }}
                className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
              />
            </div>
            <div>
              <label htmlFor="vl" className="mb-1 block text-[12.5px] font-semibold">Valor do estoque (R$)</label>
              <input
                id="vl" inputMode="decimal" placeholder="286.130,96" autoComplete="off"
                value={valor} onChange={(e) => { setValor(e.target.value); setAviso(null); }}
                className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
              />
            </div>
          </div>

          <button
            type="button" onClick={() => inputArquivo.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed borda px-4 py-6 transition-colors hover:border-marinho-500"
          >
            <Upload aria-hidden className="size-5 text-marinho-500" />
            <span className="text-[14px] font-semibold">Escolher o relatório do inventário</span>
            <span className="text-[12px] txt-fraco">
              Aceita o .xls do ERP e .xlsx · preencha fornecedor, data e valor antes
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

          {pendente && <Preview p={pendente} salvando={salvando} onSalvar={salvar} onCancelar={() => { setPendente(null); setAviso(null); }} />}
        </section>
      )}

      {/* ---------------- divergências ---------------- */}
      {aba === 'lancamentos' && (
      <section className="painel sombra rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold">
            Divergências
            {lanc && (
              <span className="ml-2 rounded-md painel-2 px-2 py-0.5 text-[12px] font-semibold txt-fraco">
                {filtrados.length} de {produtos.length} produtos
              </span>
            )}
          </h2>
          {lanc && podeExcluir && (
            <button
              type="button" onClick={() => void excluir(lanc)}
              className="flex items-center gap-1.5 rounded-lg border borda px-2.5 py-1.5 text-[12.5px] font-semibold text-erro-600 hover:bg-erro-500/10"
            >
              <Trash2 aria-hidden className="size-3.5" />
              Excluir lançamento
            </button>
          )}
        </div>

        {carregando ? (
          <div className="flex justify-center py-10"><Loader2 aria-hidden className="size-5 animate-spin text-marinho-500" /></div>
        ) : !lancamentos.length ? (
          <p className="py-10 text-center text-sm txt-fraco">
            Nenhum inventário lançado ainda.{podeLancar ? ' Suba o relatório acima para começar.' : ''}
          </p>
        ) : (
          <>
            {/* abas por fornecedor */}
            {fornecedoresComDados.length > 0 && (
              <div className="sem-barra mb-3 flex gap-1 overflow-x-auto">
                {fornecedoresComDados.map((f) => (
                  <button
                    key={f} type="button"
                    onClick={() => { setFornAtivo(f); setLancAtivo(null); }}
                    className={cn(
                      'whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                      f === fornEfetivo ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50',
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                value={lanc?.id ?? ''} onChange={(e) => setLancAtivo(Number(e.target.value))}
                className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
              >
                {doFornecedor.map((l) => (
                  <option key={l.id} value={l.id}>
                    {fmtData(l.data_inventario)} — {(l.produtos ?? []).length} produtos
                  </option>
                ))}
              </select>

              <div className="relative min-w-52 flex-1">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
                <input
                  value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar produto (id ou descrição)…"
                  className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
                />
              </div>

              <label className="flex items-center gap-1 text-[12.5px] txt-fraco">
                De <input type="date" value={ini} onChange={(e) => { setIni(e.target.value); setLancAtivo(null); }}
                  className="painel-2 rounded-lg border borda px-2 py-1.5" />
              </label>
              <label className="flex items-center gap-1 text-[12.5px] txt-fraco">
                Até <input type="date" value={fim} onChange={(e) => { setFim(e.target.value); setLancAtivo(null); }}
                  className="painel-2 rounded-lg border borda px-2 py-1.5" />
              </label>
              <label className="flex items-center gap-1.5 text-[12.5px] txt-fraco">
                <input type="checkbox" checked={soDiv} onChange={(e) => setSoDiv(e.target.checked)} />
                só divergências
              </label>
            </div>

            {lanc && (
              <div className="mb-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Caixa rotulo="Produtos" valor={String(t.total)} />
                <Caixa rotulo="Com divergência" valor={String(t.ndiv)} destaque />
                <Caixa rotulo="Acuracidade" valor={fmtPct(acu)} />
                <Caixa rotulo="Entrada" valor={fmtBRL(t.pos)} cor="ok" />
                <Caixa rotulo="Saída" valor={fmtBRL(Math.abs(t.neg))} cor="erro" />
                <Caixa rotulo="Diferença" valor={fmtBRL(t.fin)} cor={t.fin < 0 ? 'erro' : 'ok'} />
                <Caixa rotulo="Valor do estoque" valor={lanc.valor_estoque ? fmtBRL(lanc.valor_estoque) : '—'} />
                <Caixa rotulo="% Dif" valor={fmtPct(pct)} cor={(pct ?? 0) < 0 ? 'erro' : 'ok'} />
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="painel-2 text-left">
                    <Th>Id</Th><Th>Descrição</Th><Th>Embalagem</Th>
                    <Th num>Sld Estoq</Th><Th num>Sld Contagem</Th>
                    <Th num>Div Ant</Th><Th num>Dif Qtde</Th><Th num>Dif Financeira</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-8 text-center text-sm txt-fraco">Nenhum produto no filtro atual.</td></tr>
                  ) : filtrados.map((p, i) => (
                    <tr key={p.id + i} className={cn('border-b borda', !p.dif_qtde && 'opacity-55')}>
                      <Td>{p.id}</Td>
                      <Td>{p.descricao}</Td>
                      <Td>{p.embalagem}</Td>
                      <Td num>{fmtQtd(p.sld_estoq)}</Td>
                      <Td num>{fmtQtd(p.sld_contagem)}</Td>
                      <Td num sinal={p.div_ant}>{p.div_ant ? fmtQtd(p.div_ant) : '—'}</Td>
                      <Td num sinal={p.dif_qtde}>{p.dif_qtde ? fmtQtd(p.dif_qtde) : '—'}</Td>
                      <Td num sinal={p.dif_financeira}>{p.dif_financeira ? fmtBRL(p.dif_financeira) : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ pedaços */

function Preview({ p, salvando, onSalvar, onCancelar }: {
  p: Pendente; salvando: boolean; onSalvar: () => void; onCancelar: () => void;
}) {
  const t = totais(p.produtos);
  const acu = acuracidadeDe(t, p.valor_estoque);
  const pct = pctEstoque(p.valor_estoque, t.fin);
  return (
    <div className="mt-3 rounded-xl border-2 border-marinho-500 painel-2 p-4 motion-safe:animate-subir">
      <p className="text-[15px] font-bold">
        {p.fornecedor} — {fmtData(p.data_inventario)}
        {p.substitui && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-ouro-100 px-2 py-0.5 text-[11px] font-bold text-ouro-700">
            <AlertTriangle aria-hidden className="size-3" />
            já existe nesta data — será substituído
          </span>
        )}
      </p>
      <p className="mt-1.5 text-[13px] txt-fraco">
        <b>{t.total}</b> produtos · <b>{t.ndiv}</b> com divergência · acuracidade <b>{fmtPct(acu)}</b> ·
        entrada <b>{fmtBRL(t.pos)}</b> · saída <b>{fmtBRL(Math.abs(t.neg))}</b> · diferença <b>{fmtBRL(t.fin)}</b>
      </p>
      <p className="mt-1 text-[13px] txt-fraco">
        Valor do estoque: <b>{fmtBRL(p.valor_estoque)}</b>
        {pct != null && <> · a diferença representa <b>{fmtPct(pct)}</b> do estoque</>}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button" onClick={onSalvar} disabled={salvando}
          className="flex items-center gap-2 rounded-xl bg-marinho-800 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
          {salvando ? 'Salvando…' : 'Salvar inventário'}
        </button>
        <button
          type="button" onClick={onCancelar}
          className="flex items-center gap-1.5 rounded-xl border borda px-3 py-2.5 text-[13px] font-semibold txt-fraco"
        >
          <X aria-hidden className="size-4" />
          Cancelar
        </button>
      </div>
    </div>
  );
}

function Caixa({ rotulo, valor, cor, destaque }: {
  rotulo: string; valor: string; cor?: 'ok' | 'erro'; destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border borda px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide txt-fraco">{rotulo}</p>
      <p className={cn(
        'mt-0.5 text-[17px] font-bold',
        cor === 'ok' && 'text-ok-600',
        cor === 'erro' && 'text-erro-600',
        destaque && !cor && 'text-marinho-500',
      )}>
        {valor}
      </p>
    </div>
  );
}

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

function Td({ children, num, sinal }: { children: React.ReactNode; num?: boolean; sinal?: number }) {
  return (
    <td className={cn(
      'px-3 py-2',
      num && 'whitespace-nowrap text-right',
      sinal != null && sinal > 0 && 'font-bold text-ok-600',
      sinal != null && sinal < 0 && 'font-bold text-erro-600',
    )}>
      {children}
    </td>
  );
}
