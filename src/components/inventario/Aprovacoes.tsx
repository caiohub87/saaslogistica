'use client';

import { Loader2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

import { fmtBRL, fmtData, totais } from '@/lib/inventario';
import { getSupabase } from '@/lib/supabase';
import type { Inventario } from '@/types/database';
import { cn } from '@/utils/cn';

/**
 * Aprovacao do inventario.
 *
 * Substitui a senha 79513 do sistema antigo: quem aprova e quem tem a
 * permissao `inventario.aprovar`, e o nome gravado e o da pessoa logada. Nao e
 * assinatura digital com certificado — e um registro de aprovacao, e a tela
 * diz isso para ninguem confundir com validade juridica.
 */
export function Aprovacoes({ lancamentos, podeAprovar, nomeUsuario, demo, aoMudar }: {
  lancamentos: Inventario[];
  podeAprovar: boolean;
  nomeUsuario: string;
  demo: boolean;
  aoMudar: () => Promise<void>;
}) {
  const [filtro, setFiltro] = useState<'pendentes' | 'aprovados' | 'todos'>('pendentes');
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lancamentos
      .filter((l) => filtro === 'todos' || (filtro === 'aprovados' ? !!l.aprovado_em : !l.aprovado_em))
      .filter((l) => !q || l.fornecedor.toLowerCase().includes(q))
      .sort((a, b) => (a.data_inventario < b.data_inventario ? 1 : -1));
  }, [lancamentos, filtro, busca]);

  const pendentes = lancamentos.filter((l) => !l.aprovado_em).length;

  async function gravar(l: Inventario, aprovar: boolean) {
    setErro(null); setMsg(null);
    if (demo) { setErro('Modo de demonstração não grava no banco.'); return; }
    if (!aprovar && !confirm(`Retirar a aprovação de ${l.fornecedor} de ${fmtData(l.data_inventario)}?`)) return;

    const sb = getSupabase();
    if (!sb) return;
    setOcupado(l.id);
    const dados = aprovar
      ? { aprovado_por: nomeUsuario, aprovado_em: new Date().toISOString() }
      : { aprovado_por: null, aprovado_em: null };
    const { error } = await sb.from('inventarios').update(dados).eq('id', l.id);
    setOcupado(null);

    if (error) {
      setErro(
        error.message +
        (/permission|policy|row-level/i.test(error.message)
          ? ' — seu acesso não tem permissão de aprovar.'
          : /aprovado_/i.test(error.message)
            ? ' — faltam as colunas aprovado_por/aprovado_em: rode o ALTER TABLE no Supabase.'
            : ''),
      );
      return;
    }
    setMsg(aprovar
      ? `${l.fornecedor} de ${fmtData(l.data_inventario)} aprovado por ${nomeUsuario}.`
      : 'Aprovação retirada.');
    await aoMudar();
  }

  return (
    <section className="painel sombra rounded-2xl p-4 motion-safe:animate-entrada">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-bold">
          <ShieldCheck aria-hidden className="size-4.5 text-ok-500" />
          Aprovação de inventários
        </h2>
        <select
          value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}
          className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
        >
          <option value="pendentes">Aguardando aprovação</option>
          <option value="aprovados">Já aprovados</option>
          <option value="todos">Todos</option>
        </select>
        <input
          value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar fornecedor…"
          className="painel-2 min-w-44 flex-1 rounded-lg border borda px-2.5 py-1.5 text-[12.5px] outline-none focus:border-marinho-500"
        />
        <span className="text-[12px] txt-fraco">
          {pendentes ? `${pendentes} aguardando` : 'Tudo aprovado.'}
        </span>
      </div>

      {!podeAprovar && (
        <p className="mb-3 rounded-xl painel-2 px-3.5 py-2.5 text-[12.5px] txt-fraco">
          Você pode acompanhar, mas não tem a permissão <b>Aprovar</b> do inventário. Quem libera isso
          é o administrador, na tela de Usuários e acessos.
        </p>
      )}
      {erro && <p role="alert" className="mb-3 rounded-xl bg-erro-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-erro-600">{erro}</p>}
      {msg && <p className="mb-3 rounded-xl bg-ok-500/10 px-3.5 py-2.5 text-[13px] font-semibold text-ok-600">{msg}</p>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="painel-2 text-left">
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide txt-fraco">Data</th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide txt-fraco">Fornecedor</th>
              <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide txt-fraco">Produtos</th>
              <th className="px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wide txt-fraco">Diferença</th>
              <th className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide txt-fraco">Situação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-sm txt-fraco">
                {lancamentos.length ? 'Nada neste filtro.' : 'Nenhum inventário lançado ainda.'}
              </td></tr>
            ) : lista.map((l) => {
              const t = totais(l.produtos ?? []);
              return (
                <tr key={l.id} className="border-b borda">
                  <td className="whitespace-nowrap px-3 py-2">{fmtData(l.data_inventario)}</td>
                  <td className="px-3 py-2"><b>{l.fornecedor}</b></td>
                  <td className="px-3 py-2 text-right">{t.total}</td>
                  <td className={cn('whitespace-nowrap px-3 py-2 text-right font-bold',
                    t.fin < 0 ? 'text-erro-600' : 'text-ok-600')}>
                    {fmtBRL(t.fin)}
                  </td>
                  <td className="px-3 py-2">
                    {l.aprovado_em ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-ok-500/15 px-2 py-0.5 text-[11px] font-bold text-ok-600">Aprovado</span>
                        <span className="text-[11.5px] txt-fraco">
                          {l.aprovado_por} · {new Date(l.aprovado_em).toLocaleString('pt-BR')}
                        </span>
                      </span>
                    ) : (
                      <span className="rounded-md bg-ouro-100 px-2 py-0.5 text-[11px] font-bold text-ouro-700">Aguardando</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {ocupado === l.id ? (
                      <Loader2 aria-hidden className="inline size-4 animate-spin text-marinho-500" />
                    ) : l.aprovado_em ? (
                      <button
                        type="button" disabled={!podeAprovar}
                        onClick={() => void gravar(l, false)}
                        className="rounded-lg border borda px-2.5 py-1 text-[12px] font-semibold disabled:opacity-40"
                      >
                        Retirar
                      </button>
                    ) : (
                      <button
                        type="button" disabled={!podeAprovar}
                        onClick={() => void gravar(l, true)}
                        className="rounded-lg bg-marinho-800 px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
                      >
                        Aprovar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px] txt-fraco">
        A aprovação registra <b>quem</b> aprovou, com <b>data e hora</b>. Não é assinatura digital com
        certificado ICP-Brasil — é um registro de aprovação, controlado pela permissão de cada pessoa.
      </p>
    </section>
  );
}
