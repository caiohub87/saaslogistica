'use client';

import { AlertTriangle, Check, Loader2, Save, ShieldCheck, UserCog, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSupabase } from '@/lib/supabase';
import {
  ACAO_LABEL, ACAO_PESO, PERFIS, TELAS,
  type Acao, type MapaPermissoes,
} from '@/lib/permissoes';
import { useSessao } from '@/providers/SessionProvider';
import type { Usuario } from '@/types/database';
import { cn } from '@/utils/cn';

/**
 * Usuários e acessos — só o administrador entra aqui.
 *
 * A matriz mostra, por pessoa, cada tela e cada ação. Marcar "Ver" é o que
 * coloca a tela no menu dela; as demais ações liberam o que pode fazer lá
 * dentro. Ações fortes (aprovar, excluir) ficam destacadas para não passarem
 * despercebidas.
 */
export default function UsuariosPage() {
  const { usuario: eu, pode } = useSessao();
  const podeEditar = pode('usuarios', 'editar');

  const [lista, setLista] = useState<Usuario[]>([]);
  const [permsPorUsuario, setPerms] = useState<Record<string, MapaPermissoes>>({});
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<MapaPermissoes>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }
    setCarregando(true);

    const [{ data: us, error: e1 }, { data: ps, error: e2 }] = await Promise.all([
      sb.from('usuarios').select('*').order('nome'),
      sb.from('usuario_permissoes').select('usuario_id,tela,acoes'),
    ]);

    if (e1 || e2) { setErro((e1 ?? e2)!.message); setCarregando(false); return; }

    const mapa: Record<string, MapaPermissoes> = {};
    (ps ?? []).forEach((p: { usuario_id: string; tela: string; acoes: Acao[] }) => {
      (mapa[p.usuario_id] ??= {})[p.tela] = p.acoes ?? [];
    });

    setLista((us ?? []) as Usuario[]);
    setPerms(mapa);
    setCarregando(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // ao trocar de pessoa, o rascunho recomeça do que está gravado
  useEffect(() => {
    if (selecionado) setRascunho({ ...(permsPorUsuario[selecionado] ?? {}) });
  }, [selecionado, permsPorUsuario]);

  const pessoa = lista.find((u) => u.id === selecionado) ?? null;
  const gravadas = selecionado ? permsPorUsuario[selecionado] ?? {} : {};
  const mudou = useMemo(
    () => JSON.stringify(normaliza(rascunho)) !== JSON.stringify(normaliza(gravadas)),
    [rascunho, gravadas],
  );

  function alternar(tela: string, acao: Acao) {
    setRascunho((r) => {
      const atuais = new Set(r[tela] ?? []);
      if (atuais.has(acao)) {
        atuais.delete(acao);
        // sem "Ver" a tela some do menu — as outras ações ficariam órfãs
        if (acao === 'ver') return omitir(r, tela);
      } else {
        atuais.add(acao);
        if (acao !== 'ver') atuais.add('ver'); // qualquer ação implica enxergar a tela
      }
      if (!atuais.size) return omitir(r, tela);
      return { ...r, [tela]: [...atuais] as Acao[] };
    });
  }

  function aplicarPerfil(id: string) {
    const p = PERFIS.find((x) => x.id === id);
    if (p) setRascunho({ ...p.permissoes });
  }

  async function salvar() {
    if (!selecionado) return;
    const sb = getSupabase();
    if (!sb) return;
    setSalvando(true); setMsg(null); setErro(null);

    // troca o conjunto inteiro: apaga o que havia e grava o rascunho
    const { error: eDel } = await sb.from('usuario_permissoes').delete().eq('usuario_id', selecionado);
    if (eDel) { setErro(eDel.message); setSalvando(false); return; }

    const linhas = Object.entries(rascunho)
      .filter(([, acoes]) => acoes.length)
      .map(([tela, acoes]) => ({ usuario_id: selecionado, tela, acoes }));

    if (linhas.length) {
      const { error } = await sb.from('usuario_permissoes').insert(linhas);
      if (error) { setErro(error.message); setSalvando(false); return; }
    }

    setPerms((m) => ({ ...m, [selecionado]: { ...rascunho } }));
    setSalvando(false);
    setMsg('Acessos salvos. A pessoa vê a mudança no próximo carregamento.');
  }

  async function alternarAtivo(u: Usuario) {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('usuarios').update({ ativo: !u.ativo }).eq('id', u.id);
    if (error) { setErro(error.message); return; }
    setLista((l) => l.map((x) => (x.id === u.id ? { ...x, ativo: !x.ativo } : x)));
  }

  if (!pode('usuarios', 'ver')) {
    return <Aviso titulo="Sem acesso" texto="Esta tela é restrita à administração." />;
  }

  const grupos = [...new Set(TELAS.map((t) => t.grupo))];

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Users aria-hidden className="size-5 text-marinho-500" />
          Usuários e acessos
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          Marque, por pessoa, o que ela enxerga e o que pode fazer em cada tela.
        </p>
      </header>

      {erro && (
        <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm text-erro-600">{erro}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---------- lista de pessoas ---------- */}
        <aside className="painel sombra h-fit rounded-2xl p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[13px] font-bold uppercase tracking-wide txt-fraco">Pessoas</h2>
            <span className="text-[12px] txt-fraco">{lista.length}</span>
          </div>

          {carregando ? (
            <div className="flex justify-center py-8"><Loader2 aria-hidden className="size-5 animate-spin text-marinho-500" /></div>
          ) : lista.length === 0 ? (
            <p className="px-2 py-6 text-center text-[13px] txt-fraco">
              Ninguém cadastrado ainda. Crie a pessoa no Supabase (Authentication → Users) e depois
              a libere aqui.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {lista.map((u) => {
                const n = Object.keys(permsPorUsuario[u.id] ?? {}).length;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => setSelecionado(u.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                        selecionado === u.id ? 'bg-marinho-800 text-white' : 'hover:bg-marinho-50',
                        !u.ativo && 'opacity-55',
                      )}
                    >
                      <span className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                        selecionado === u.id ? 'bg-white/15 text-white' : 'bg-marinho-100 text-marinho-800',
                      )}>
                        {u.nome.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{u.nome}</span>
                        <span className={cn('block truncate text-[11.5px]', selecionado === u.id ? 'text-white/70' : 'txt-fraco')}>
                          {u.admin ? 'Administrador · tudo liberado' : `${u.cargo || 'Equipe'} · ${n} tela(s)`}
                        </span>
                      </span>
                      {!u.ativo && <span className="shrink-0 rounded-md bg-erro-500/15 px-1.5 py-0.5 text-[10px] font-bold text-erro-600">OFF</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex items-start gap-2 rounded-xl painel-2 p-3 text-[11.5px] txt-fraco">
            <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Para adicionar alguém: crie o login em <b>Supabase → Authentication → Users</b> e rode o
              <b> insert</b> descrito em <b>supabase/10_usuarios_permissoes.sql</b>. A pessoa aparece aqui.
            </span>
          </div>
        </aside>

        {/* ---------- matriz de permissões ---------- */}
        <section className="painel sombra rounded-2xl p-4">
          {!pessoa ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <UserCog aria-hidden className="mb-3 size-9 txt-fraco" />
              <p className="text-[15px] font-semibold">Escolha uma pessoa</p>
              <p className="mt-1 text-sm txt-fraco">Os acessos dela aparecem aqui para você marcar.</p>
            </div>
          ) : pessoa.admin ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShieldCheck aria-hidden className="mb-3 size-9 text-ok-500" />
              <p className="text-[15px] font-semibold">{pessoa.nome} é administrador</p>
              <p className="mt-1 max-w-sm text-sm txt-fraco">
                Administrador enxerga e faz tudo na unidade — não há o que marcar. Para limitar,
                primeiro tire o status de administrador no banco.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b borda pb-4">
                <div>
                  <h2 className="text-[15px] font-bold">{pessoa.nome}</h2>
                  <p className="text-[12.5px] txt-fraco">{pessoa.cargo || 'Sem cargo'} · {pessoa.unidade}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[12px] txt-fraco" htmlFor="perfil">Perfil pronto:</label>
                  <select
                    id="perfil" disabled={!podeEditar} defaultValue=""
                    onChange={(e) => { if (e.target.value) aplicarPerfil(e.target.value); e.target.value = ''; }}
                    className="painel-2 rounded-lg border borda px-2.5 py-1.5 text-[12.5px]"
                  >
                    <option value="">escolher…</option>
                    {PERFIS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                  <button
                    type="button" onClick={() => void alternarAtivo(pessoa)} disabled={!podeEditar || pessoa.id === eu?.id}
                    title={pessoa.id === eu?.id ? 'Você não pode desativar a si mesmo' : undefined}
                    className="rounded-lg border borda px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50"
                  >
                    {pessoa.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {grupos.map((g) => (
                  <div key={g}>
                    <h3 className="mb-2 text-[11.5px] font-bold uppercase tracking-wide txt-fraco">{g}</h3>
                    <div className="flex flex-col gap-2">
                      {TELAS.filter((t) => t.grupo === g).map((t) => {
                        const acoes = rascunho[t.chave] ?? [];
                        const ligada = acoes.includes('ver');
                        return (
                          <div key={t.chave} className={cn('rounded-xl border borda p-3 transition-colors', ligada && 'bg-marinho-50/60')}>
                            <div className="mb-1 flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-semibold">{t.nome}</p>
                                <p className="text-[11.5px] txt-fraco">{t.descricao}</p>
                              </div>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {t.acoes.map((a) => {
                                const marcada = acoes.includes(a);
                                const forte = ACAO_PESO[a] === 'forte';
                                return (
                                  <button
                                    key={a} type="button" disabled={!podeEditar}
                                    onClick={() => alternar(t.chave, a)}
                                    aria-pressed={marcada}
                                    className={cn(
                                      'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors disabled:opacity-50',
                                      marcada
                                        ? forte ? 'border-erro-500 bg-erro-500 text-white' : 'border-marinho-800 bg-marinho-800 text-white'
                                        : 'borda txt-fraco hover:bg-marinho-50',
                                    )}
                                  >
                                    {marcada && <Check aria-hidden className="size-3" />}
                                    {ACAO_LABEL[a]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t borda pt-4">
                <p className="flex items-center gap-1.5 text-[12px] txt-fraco">
                  <AlertTriangle aria-hidden className="size-3.5 text-ouro-500" />
                  Ações em vermelho (aprovar, excluir) não têm volta — confira antes de salvar.
                </p>
                <div className="flex items-center gap-3">
                  {msg && <span className="text-[12.5px] text-ok-600">{msg}</span>}
                  <button
                    type="button" onClick={() => void salvar()} disabled={!podeEditar || !mudou || salvando}
                    className="flex items-center gap-2 rounded-xl bg-marinho-800 px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
                    {salvando ? 'Salvando…' : 'Salvar acessos'}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function omitir(m: MapaPermissoes, chave: string): MapaPermissoes {
  const copia = { ...m };
  delete copia[chave];
  return copia;
}
/** Ordena para a comparação "mudou?" não depender da ordem dos cliques. */
function normaliza(m: MapaPermissoes) {
  return Object.keys(m).sort().map((k) => [k, [...m[k]].sort()]);
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
      <h1 className="text-lg font-bold">{titulo}</h1>
      <p className="mt-2 text-sm txt-fraco">{texto}</p>
    </div>
  );
}
