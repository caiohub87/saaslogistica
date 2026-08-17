'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { demoLigado, desligarDemo, USUARIO_DEMO } from '@/lib/demo';
import { getSupabase, supabaseConfigurado } from '@/lib/supabase';
import { pode as podeRaw, type Acao, type MapaPermissoes } from '@/lib/permissoes';
import type { Usuario } from '@/types/database';

interface SessaoCtx {
  carregando: boolean;
  /** null = ninguem logado */
  usuario: Usuario | null;
  permissoes: MapaPermissoes;
  /** Erro de configuracao/acesso que impede o uso do sistema. */
  erro: string | null;
  /** true quando a sessao e a de demonstracao, sem login de verdade. */
  demo: boolean;
  pode: (tela: string, acao?: Acao) => boolean;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
}

const Ctx = createContext<SessaoCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [permissoes, setPermissoes] = useState<MapaPermissoes>({});
  const [erro, setErro] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  const carregar = useCallback(async () => {
    // demonstração tem prioridade: entra sem tocar no Auth
    if (demoLigado()) {
      setDemo(true);
      setUsuario(USUARIO_DEMO);
      setPermissoes({});          // admin: o pode() libera tudo sem precisar de linhas
      setErro(null);
      setCarregando(false);
      return;
    }
    setDemo(false);

    const sb = getSupabase();
    if (!sb) {
      setErro('Banco não configurado: falta preencher o .env.local.');
      setCarregando(false);
      return;
    }

    const { data: auth } = await sb.auth.getUser();
    if (!auth?.user) {
      setUsuario(null);
      setPermissoes({});
      setErro(null);
      setCarregando(false);
      return;
    }

    // a pessoa precisa ter cadastro em `usuarios`; só existir no Auth não basta
    const { data: u, error: erroU } = await sb
      .from('usuarios')
      .select('*')
      .eq('id', auth.user.id)
      .maybeSingle();

    if (erroU) {
      setErro('Não consegui ler seu cadastro: ' + erroU.message);
      setCarregando(false);
      return;
    }
    if (!u) {
      setErro('Seu login existe, mas ainda não foi liberado por um administrador.');
      setUsuario(null);
      setCarregando(false);
      return;
    }
    if (!(u as Usuario).ativo) {
      setErro('Seu acesso está desativado. Procure o administrador.');
      setUsuario(null);
      setCarregando(false);
      return;
    }

    const { data: perms } = await sb
      .from('usuario_permissoes')
      .select('tela,acoes')
      .eq('usuario_id', auth.user.id);

    const mapa: MapaPermissoes = {};
    (perms ?? []).forEach((p: { tela: string; acoes: Acao[] }) => {
      mapa[p.tela] = p.acoes ?? [];
    });

    setUsuario(u as Usuario);
    setPermissoes(mapa);
    setErro(null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
    const sb = getSupabase();
    if (!sb) return;
    // login/logout em outra aba reflete aqui
    const { data } = sb.auth.onAuthStateChange(() => void carregar());
    return () => data.subscription.unsubscribe();
  }, [carregar]);

  const sair = useCallback(async () => {
    desligarDemo();
    setDemo(false);
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setUsuario(null);
    setPermissoes({});
  }, []);

  const valor = useMemo<SessaoCtx>(
    () => ({
      carregando,
      usuario,
      permissoes,
      erro,
      demo,
      pode: (tela, acao = 'ver') => podeRaw(permissoes, usuario?.admin ?? false, tela, acao),
      recarregar: carregar,
      sair,
    }),
    [carregando, usuario, permissoes, erro, demo, carregar, sair],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSessao precisa estar dentro de <SessionProvider>.');
  return ctx;
}

/** Atalho para telas que só existem com alguém logado. */
export function useUsuario() {
  const { usuario, ...resto } = useSessao();
  if (!usuario) throw new Error('Tela protegida usada sem usuário carregado.');
  return { usuario, ...resto };
}

export { supabaseConfigurado };
