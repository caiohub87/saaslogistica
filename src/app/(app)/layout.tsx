'use client';

import { FlaskConical, Loader2, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { TopNav } from '@/components/layout/TopNav';
import { RelatorioProvider } from '@/providers/RelatorioProvider';
import { useSessao } from '@/providers/SessionProvider';

/**
 * Camada protegida: sem login válido, ninguém passa daqui.
 * O bloqueio de verdade é a RLS no banco — isto aqui só evita telas quebradas.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { carregando, usuario, erro, demo } = useSessao();
  const router = useRouter();

  useEffect(() => {
    if (!carregando && !usuario && !erro) router.replace('/entrar');
  }, [carregando, usuario, erro, router]);

  if (carregando) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 aria-hidden className="size-7 animate-spin text-marinho-500" />
        <span className="sr-only">Carregando…</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="painel sombra w-full max-w-md rounded-2xl p-6 text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-ouro-100 text-ouro-700">
            <ShieldAlert aria-hidden className="size-6" />
          </span>
          <h1 className="text-lg font-bold">Acesso não liberado</h1>
          <p className="mt-2 text-sm txt-fraco">{erro}</p>
          <button
            type="button"
            onClick={() => router.replace('/entrar')}
            className="mt-5 rounded-xl bg-marinho-800 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Voltar para a entrada
          </button>
        </div>
      </div>
    );
  }

  if (!usuario) return null;

  return (
    <div className="min-h-dvh">
      {demo && (
        <div className="flex items-center justify-center gap-2 bg-ouro-500 px-4 py-1.5 text-center text-[12.5px] font-semibold text-marinho-900">
          <FlaskConical aria-hidden className="size-3.5 shrink-0" />
          Modo de demonstração — sem login. Nada aqui é gravado no banco.
        </div>
      )}
      <RelatorioProvider unidade={usuario.unidade}>
        <TopNav />
        <main id="conteudo" className="mx-auto max-w-[1600px] px-4 py-5">
          {children}
        </main>
      </RelatorioProvider>
    </div>
  );
}
