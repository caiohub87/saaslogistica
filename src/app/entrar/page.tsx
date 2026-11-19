'use client';

import { BarChart3, Boxes, Eye, EyeOff, FlaskConical, Loader2, LogIn, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { demoDisponivel, ligarDemo } from '@/lib/demo';
import { getSupabase, supabaseConfigurado } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';

export default function EntrarPage() {
  const router = useRouter();
  const { usuario, carregando, recarregar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!carregando && usuario) router.replace('/');
  }, [carregando, usuario, router]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado: falta preencher o .env.local.'); return; }

    setEnviando(true);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    setEnviando(false);

    if (error) {
      // mensagem genérica de propósito: não revela se o e-mail existe
      setErro(/invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message);
      return;
    }
    await recarregar();
    router.replace('/');
  }

  async function entrarDemo() {
    ligarDemo();
    await recarregar();
    router.replace('/');
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* ---- lado da marca: só em tela larga; no celular o formulário vem direto ---- */}
      <aside className="relative hidden overflow-hidden bg-marinho-950 p-12 text-white lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 size-[520px] rounded-full bg-marinho-500/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-[420px] rounded-full bg-ouro-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)', backgroundSize: '44px 44px' }} />

        <div className="relative flex items-center gap-3">
          <Image src="/dilnor-logo.png" alt="" width={44} height={44} className="rounded-xl bg-white p-1" priority />
          <span className="text-[15px] font-semibold tracking-tight">Gestão Logística</span>
        </div>

        <div className="relative mt-auto max-w-md">
          <h2 className="text-[34px] font-semibold leading-[1.15] tracking-tight">
            A operação inteira, <span className="text-ouro-400">num lugar só.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-marinho-100/80">
            Entregas, produtividade, estoque e agenda — cada pessoa com o seu acesso.
          </p>
          <ul className="mt-8 space-y-3 text-[14px] text-marinho-50/90">
            {[
              { Icone: BarChart3, txt: 'Produtividade e premiação calculadas na hora' },
              { Icone: Boxes, txt: 'Inventário, validade, faltas e reentregas' },
              { Icone: ShieldCheck, txt: 'Permissão por tela e por ação, conferida no banco' },
            ].map(({ Icone, txt }) => (
              <li key={txt} className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icone aria-hidden className="size-4" />
                </span>
                {txt}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-[12px] text-marinho-200/60">Dilnor · Nordece</p>
      </aside>

      <div className="flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7">
          <Image src="/dilnor-logo.png" alt="" width={56} height={56}
            className="mb-5 rounded-2xl bg-white p-1.5 ring-1 ring-black/5 sombra lg:hidden" priority />
          <h1 className="text-[26px] font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1 text-sm txt-fraco">Use seu usuário para continuar.</p>
        </div>

        <form onSubmit={entrar} noValidate className="painel sombra-lg rounded-2xl p-6">
          <label htmlFor="email" className="mb-1 block text-[13px] font-semibold">E-mail</label>
          <input
            id="email" type="email" autoComplete="username" required
            value={email} onChange={(ev) => setEmail(ev.target.value)}
            placeholder="seu.nome@dilnor.com"
            className="painel-2 mb-4 w-full rounded-xl border borda px-3.5 py-2.5 text-sm outline-none focus:border-marinho-500"
          />

          <label htmlFor="senha" className="mb-1 block text-[13px] font-semibold">Senha</label>
          <div className="relative mb-1">
            <input
              id="senha" type={verSenha ? 'text' : 'password'} autoComplete="current-password" required
              value={senha} onChange={(ev) => setSenha(ev.target.value)}
              className="painel-2 w-full rounded-xl border borda px-3.5 py-2.5 pr-11 text-sm outline-none focus:border-marinho-500"
            />
            <button
              type="button" onClick={() => setVerSenha((v) => !v)}
              aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg txt-fraco hover:bg-marinho-50"
            >
              {verSenha ? <EyeOff aria-hidden className="size-4.5" /> : <Eye aria-hidden className="size-4.5" />}
            </button>
          </div>

          {erro && (
            <p role="alert" className="mt-3 rounded-xl bg-erro-500/10 px-3.5 py-2.5 text-sm text-erro-600">{erro}</p>
          )}

          <button
            type="submit" disabled={enviando}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-marinho-800 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-marinho-900 disabled:opacity-60"
          >
            {enviando ? <Loader2 aria-hidden className="size-4.5 animate-spin" /> : <LogIn aria-hidden className="size-4.5" />}
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>

          {!supabaseConfigurado && (
            <p className="mt-4 rounded-xl bg-ouro-100 px-3.5 py-2.5 text-[12.5px] text-ouro-700">
              Banco não configurado. Copie o <b>.env.local.example</b> para <b>.env.local</b> e preencha as
              chaves do Supabase.
            </p>
          )}

          {demoDisponivel && (
            <div className="mt-5 border-t borda pt-4">
              <button
                type="button" onClick={() => void entrarDemo()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed borda px-4 py-2.5 text-[13px] font-semibold txt-fraco transition-colors hover:border-marinho-500 hover:text-marinho-800"
              >
                <FlaskConical aria-hidden className="size-4" />
                Entrar como demonstração (sem login)
              </button>
              <p className="mt-2 text-center text-[11.5px] txt-fraco">
                Só existe rodando localmente. As telas abrem e calculam; gravar no banco continua
                exigindo login de verdade.
              </p>
            </div>
          )}
        </form>

        <p className="mt-4 text-center text-[12px] txt-fraco">
          Esqueceu a senha? Procure o administrador do sistema.
        </p>
      </div>
      </div>
    </div>
  );
}
