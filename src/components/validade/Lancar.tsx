'use client';

import { AlertTriangle, Loader2, Search, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { FORNECEDORES } from '@/lib/inventario';
import {
  diasAte, fmtDataBR, lerPdfValidade, PERIODOS, SEM_FORNECEDOR, type Periodo,
} from '@/lib/validade';
import type { ItemValidade, RegistroValidade } from '@/types/database';
import { cn } from '@/utils/cn';

const low = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Aba Lancar.
 *
 * Duas coisas acontecem aqui, e elas sao independentes de proposito:
 *   1. subir o PDF, que atualiza o retrato do deposito;
 *   2. registrar quanto de cada lote escoa em 30/60/90/120 dias.
 *
 * O upload NUNCA apaga registro: item que veio no PDF novo tem os numeros
 * atualizados, item que nao veio fica como estava. O relatorio e recortado por
 * faixa de dias, entao sumir da listagem nao quer dizer sumir do deposito.
 */
export function Lancar({
  itens, registros, fornecedores, podeLancar, podeExcluir, demo, unidade, nomeUsuario,
  aoSubirPdf, aoRegistrar, aoExcluirRegistro, aoDefinirFornecedor,
}: {
  itens: ItemValidade[];
  registros: RegistroValidade[];
  fornecedores: Record<string, string>;
  podeLancar: boolean;
  podeExcluir: boolean;
  demo: boolean;
  unidade: string;
  nomeUsuario: string;
  aoSubirPdf: (linhas: Awaited<ReturnType<typeof lerPdfValidade>>) => Promise<string>;
  aoRegistrar: (r: Omit<RegistroValidade, 'id' | 'criado_em'>) => Promise<string | null>;
  aoExcluirRegistro: (id: number) => Promise<string | null>;
  aoDefinirFornecedor: (produtoId: string, fornecedor: string) => Promise<string | null>;
}) {
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro' | 'info'; texto: string } | null>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'sem_registro' | 'com_registro' | 'vencidos'>('todos');
  const [fornFiltro, setFornFiltro] = useState('__todos');

  /** quantidade digitada por linha, antes de escolher o periodo */
  const [qtd, setQtd] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const chave = (i: ItemValidade) => i.produto_id + '@' + i.endereco;

  const porItem = useMemo(() => {
    const m: Record<string, RegistroValidade[]> = {};
    registros.forEach((r) => {
      const k = r.produto_id + '@' + r.endereco;
      (m[k] ??= []).push(r);
    });
    return m;
  }, [registros]);

  const listaFornecedores = useMemo(
    () => [...new Set([...FORNECEDORES, ...Object.values(fornecedores)])].sort(),
    [fornecedores],
  );

  const filtrados = useMemo(() => {
    const q = low(busca);
    return itens
      .filter((i) => {
        const temReg = (porItem[chave(i)]?.length ?? 0) > 0;
        if (filtro === 'sem_registro' && temReg) return false;
        if (filtro === 'com_registro' && !temReg) return false;
        if (filtro === 'vencidos' && (diasAte(i.validade) ?? 0) >= 0) return false;
        return true;
      })
      .filter((i) => fornFiltro === '__todos'
        || (fornecedores[i.produto_id] ?? SEM_FORNECEDOR) === fornFiltro)
      .filter((i) => !q || low(i.produto_id).includes(q) || low(i.descricao).includes(q)
        || low(i.endereco).includes(q))
      .sort((a, b) => (a.validade < b.validade ? -1 : a.validade > b.validade ? 1
        : a.descricao.localeCompare(b.descricao, 'pt-BR')));
  }, [itens, porItem, busca, filtro, fornFiltro, fornecedores]);

  const semFornecedor = useMemo(
    () => new Set(itens.filter((i) => !fornecedores[i.produto_id]).map((i) => i.produto_id)).size,
    [itens, fornecedores],
  );

  async function processar(file: File) {
    setAviso({ tipo: 'info', texto: `Lendo ${file.name}…` });
    setLendo('abrindo o PDF…');
    try {
      const linhas = await lerPdfValidade(file, (p, t) => setLendo(`página ${p} de ${t}…`));
      setLendo('gravando…');
      const msg = await aoSubirPdf(linhas);
      setAviso({ tipo: 'ok', texto: msg });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message });
    } finally {
      setLendo('');
    }
  }

  async function registrar(i: ItemValidade, periodo: Periodo) {
    const k = chave(i);
    const n = Number(String(qtd[k] ?? '').replace(',', '.'));
    if (!n || n <= 0) {
      setAviso({ tipo: 'erro', texto: 'Digite a quantidade antes de escolher o prazo.' });
      return;
    }
    setOcupado(k);
    const erro = await aoRegistrar({
      unidade,
      produto_id: i.produto_id,
      endereco: i.endereco,
      quantidade: n,
      periodo,
      vencimento: i.validade,
      obs: null,
      registrado_por: nomeUsuario,
      registrado_por_id: null,
    });
    setOcupado(null);
    if (erro) { setAviso({ tipo: 'erro', texto: erro }); return; }
    setQtd((q) => ({ ...q, [k]: '' }));
    setAviso({
      tipo: 'ok',
      texto: `${n} un. de ${i.descricao || i.produto_id} em ${periodo} dias.`,
    });
  }

  return (
    <div className="flex flex-col gap-4 motion-safe:animate-entrada">
      {/* ---------------- upload ---------------- */}
      {podeLancar && (
        <section className="painel sombra rounded-2xl p-4">
          <h2 className="text-[15px] font-bold">Subir a relação de validade</h2>
          <p className="mb-3 mt-1 text-[12.5px] txt-fraco">
            O PDF que o WMS gera. Cada linha é um lote num endereço — o mesmo produto aparece
            várias vezes, uma por endereço. Subir de novo <b>atualiza</b> os números e{' '}
            <b>não apaga</b> nada que você já registrou.
          </p>

          <button
            type="button" onClick={() => inputArquivo.current?.click()} disabled={!!lendo}
            className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed borda px-4 py-6 transition-colors hover:border-marinho-500 disabled:opacity-60"
          >
            {lendo
              ? <Loader2 aria-hidden className="size-5 animate-spin text-marinho-500" />
              : <Upload aria-hidden className="size-5 text-marinho-500" />}
            <span className="text-[14px] font-semibold">
              {lendo ? `Lendo — ${lendo}` : 'Escolher a Relação Preventiva de Validade'}
            </span>
            <span className="text-[12px] txt-fraco">Aceita o PDF do WMS · lido aqui no navegador</span>
          </button>
          <input
            ref={inputArquivo} type="file" accept=".pdf,application/pdf" className="hidden"
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

          {semFornecedor > 0 && (
            <p className="mt-3 rounded-xl bg-ouro-100 px-3.5 py-2.5 text-[12.5px] font-semibold text-ouro-700">
              <AlertTriangle aria-hidden className="mr-1 inline size-3.5" />
              {semFornecedor} produto(s) sem fornecedor conhecido — nenhum inventário lançado tem
              esse código ainda. Escolha na coluna <b>Fornecedor</b> abaixo; fica salvo para sempre.
            </p>
          )}
        </section>
      )}

      {/* ---------------- lista ---------------- */}
      <section className="painel sombra rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-[15px] font-bold">
            Lotes
            <span className="ml-2 rounded-md painel-2 px-2 py-0.5 text-[12px] font-semibold txt-fraco">
              {filtrados.length} de {itens.length}
            </span>
          </h2>

          <div className="relative min-w-52 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código, descrição ou endereço…"
              className="painel-2 w-full rounded-lg border borda py-1.5 pl-8 pr-2.5 text-[12.5px] outline-none focus:border-marinho-500"
            />
          </div>

          <select
            value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}
            className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="todos">Todos os lotes</option>
            <option value="sem_registro">Ainda sem registro</option>
            <option value="com_registro">Já registrados</option>
            <option value="vencidos">Já vencidos</option>
          </select>

          <select
            value={fornFiltro} onChange={(e) => setFornFiltro(e.target.value)}
            className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
          >
            <option value="__todos">Todos os fornecedores</option>
            {[...new Set(itens.map((i) => fornecedores[i.produto_id] ?? SEM_FORNECEDOR))]
              .sort().map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>

        {itens.length === 0 ? (
          <p className="py-10 text-center text-sm txt-fraco">
            Nenhuma relação de validade carregada ainda.
            {podeLancar ? ' Suba o PDF acima para começar.' : ''}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="painel-2 text-left">
                  <Th>Produto</Th><Th>Endereço</Th>
                  <Th num>Estoque</Th><Th>Validade</Th><Th>Fornecedor</Th>
                  <Th>Registrar</Th><Th>Registrado</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-sm txt-fraco">
                    Nenhum lote no filtro atual.
                  </td></tr>
                ) : filtrados.map((i) => {
                  const k = chave(i);
                  const meus = porItem[k] ?? [];
                  const restantes = diasAte(i.validade);
                  return (
                    <tr key={k} className="border-b borda align-top">
                      <td className="px-3 py-2">
                        <span className="font-mono text-[12px] txt-fraco">{i.produto_id}</span>
                        <span className="block max-w-64 text-[12.5px] font-semibold">{i.descricao}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-[12px]">{i.endereco}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <b className={cn((i.qtd_un ?? 0) < 0 && 'text-erro-600')}>
                          {(i.qtd_un ?? 0).toLocaleString('pt-BR')}
                        </b>
                        <span className="block text-[11px] txt-fraco">
                          {(i.qtd_cx ?? 0).toLocaleString('pt-BR')} cx · emb {i.emb_padrao ?? '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {fmtDataBR(i.validade)}
                        <span className={cn(
                          'block text-[11px] font-bold',
                          restantes == null ? 'txt-fraco'
                            : restantes < 0 ? 'text-erro-600'
                              : restantes <= 30 ? 'text-ouro-700' : 'txt-fraco',
                        )}>
                          {restantes == null ? '—'
                            : restantes < 0 ? `vencido há ${Math.abs(restantes)}d`
                              : `faltam ${restantes}d`}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Fornecedor
                          valor={fornecedores[i.produto_id]}
                          opcoes={listaFornecedores}
                          podeEditar={podeLancar}
                          aoEscolher={(f) => aoDefinirFornecedor(i.produto_id, f)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {podeLancar ? (
                          <div className="flex flex-col gap-1">
                            <input
                              value={qtd[k] ?? ''} inputMode="decimal" placeholder="qtd un."
                              onChange={(e) => setQtd((q) => ({ ...q, [k]: e.target.value }))}
                              className="painel-2 w-24 rounded-lg border borda px-2 py-1 text-[12.5px] outline-none focus:border-marinho-500"
                            />
                            <div className="flex gap-1">
                              {PERIODOS.map((p) => (
                                <button
                                  key={p} type="button" disabled={ocupado === k}
                                  onClick={() => void registrar(i, p)}
                                  title={`Registrar em ${p} dias`}
                                  className="rounded-md border borda px-1.5 py-1 text-[11px] font-bold txt-fraco transition-colors hover:border-marinho-500 hover:bg-marinho-50 hover:text-marinho-800 disabled:opacity-50"
                                >
                                  {p}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : <span className="text-[12px] txt-fraco">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        {meus.length === 0 ? (
                          <span className="text-[12px] txt-fraco">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {meus.map((r) => (
                              <span
                                key={r.id}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-marinho-50 px-2 py-0.5 text-[11.5px] font-bold text-marinho-800"
                              >
                                {r.quantidade.toLocaleString('pt-BR')} un · {r.periodo}d
                                {podeExcluir && !demo && (
                                  <button
                                    type="button" aria-label="Remover registro"
                                    onClick={() => void aoExcluirRegistro(r.id)}
                                    className="opacity-60 hover:opacity-100"
                                  >
                                    <X aria-hidden className="size-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ pedaços */

/** Selo do fornecedor; vira campo de escolha enquanto ninguem soube dizer qual e. */
function Fornecedor({ valor, opcoes, podeEditar, aoEscolher }: {
  valor: string | undefined;
  opcoes: string[];
  podeEditar: boolean;
  aoEscolher: (f: string) => Promise<string | null>;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (valor && !aberto) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="whitespace-nowrap rounded-md painel-2 px-2 py-0.5 text-[11.5px] font-bold txt-fraco">
          {valor}
        </span>
        {podeEditar && (
          <button
            type="button" onClick={() => { setTexto(valor); setAberto(true); }}
            className="text-[11px] txt-fraco underline decoration-dotted"
          >
            trocar
          </button>
        )}
      </span>
    );
  }

  if (!podeEditar) {
    return (
      <span className="whitespace-nowrap rounded-md bg-ouro-100 px-2 py-0.5 text-[11.5px] font-bold text-ouro-700">
        {SEM_FORNECEDOR}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <input
        list="forn-validade" value={texto} autoComplete="off" placeholder="fornecedor…"
        onChange={(e) => setTexto(e.target.value)}
        className="painel-2 w-32 rounded-lg border borda px-2 py-1 text-[12px] outline-none focus:border-marinho-500"
      />
      <datalist id="forn-validade">
        {opcoes.map((o) => <option key={o} value={o} />)}
      </datalist>
      <button
        type="button" disabled={salvando || !texto.trim()}
        onClick={async () => {
          setSalvando(true);
          await aoEscolher(texto.trim().toUpperCase());
          setSalvando(false);
          setAberto(false);
        }}
        className="rounded-md bg-marinho-800 px-2 py-1 text-[11px] font-bold text-white disabled:opacity-50"
      >
        {salvando ? '…' : 'ok'}
      </button>
    </span>
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
