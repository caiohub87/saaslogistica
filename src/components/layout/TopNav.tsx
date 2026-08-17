'use client';

import { ChevronDown, LogOut, Moon, Sun, User } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { TELAS, TELA_POR_CHAVE } from '@/lib/permissoes';
import { useSessao } from '@/providers/SessionProvider';
import { cn } from '@/utils/cn';

/**
 * Navegacao no topo — sem menu hamburguer.
 *
 * Os grupos (Operacao, Equipe, Planejamento...) viram abas horizontais. Cada
 * aba abre as telas do grupo. So aparece o que a pessoa tem permissao de ver:
 * grupo sem nenhuma tela liberada simplesmente nao existe para ela.
 *
 * No celular a faixa de abas rola na horizontal, o que mantem tudo a um toque
 * de distancia (um hamburguer esconderia a navegacao atras de dois toques).
 */
export function TopNav() {
  const { usuario, pode, sair } = useSessao();
  const caminho = usePathname();
  const [aberto, setAberto] = useState<string | null>(null);
  /**
   * Posição do menu aberto, em coordenadas de viewport.
   *
   * O <nav> rola na horizontal (overflow-x-auto, para caber no celular), e um
   * ancestral com overflow RECORTA filhos position:absolute — o menu existia,
   * com opacidade 1, mas era cortado para fora da tela. Com position:fixed ele
   * escapa do recorte; por isso guardamos onde o botão está.
   */
  const [posMenu, setPosMenu] = useState<{ left: number; top: number } | null>(null);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const [escuro, setEscuro] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  // tema: lembra a escolha entre visitas
  useEffect(() => {
    const salvo = localStorage.getItem('gl:tema') === 'escuro';
    setEscuro(salvo);
    document.documentElement.classList.toggle('escuro', salvo);
  }, []);
  function alternarTema() {
    const novo = !escuro;
    setEscuro(novo);
    document.documentElement.classList.toggle('escuro', novo);
    localStorage.setItem('gl:tema', novo ? 'escuro' : 'claro');
  }

  // fecha os menus ao clicar fora ou apertar Esc
  useEffect(() => {
    function fora(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setAberto(null);
        setMenuUsuario(false);
      }
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') { setAberto(null); setMenuUsuario(false); }
    }
    // o menu é posicionado em coordenadas de viewport: rolar ou redimensionar
    // deixaria a posição velha, então fecha
    function mexeu() { setAberto(null); setMenuUsuario(false); }
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', mexeu, true);
    window.addEventListener('resize', mexeu);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', mexeu, true);
      window.removeEventListener('resize', mexeu);
    };
  }, []);

  // fecha ao trocar de tela
  useEffect(() => { setAberto(null); setMenuUsuario(false); }, [caminho]);

  const visiveis = TELAS.filter((t) => pode(t.chave, 'ver'));
  const grupos: { nome: string; telas: typeof visiveis }[] = [];
  visiveis.forEach((t) => {
    const g = grupos.find((x) => x.nome === t.grupo);
    if (g) g.telas.push(t);
    else grupos.push({ nome: t.grupo, telas: [t] });
  });

  const telaAtual = visiveis.find((t) => t.rota === caminho)
    ?? visiveis.filter((t) => t.rota !== '/' && caminho.startsWith(t.rota)).sort((a, b) => b.rota.length - a.rota.length)[0];

  return (
    <header ref={navRef} className="sticky top-0 z-40 painel border-b sombra">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="Ir para o início">
          <Image src="/dilnor-logo.png" alt="" width={34} height={34} className="rounded-lg bg-white p-0.5" priority />
          <span className="hidden leading-tight sm:block">
            <span className="block text-[13px] font-bold tracking-tight">Gestão Logística</span>
            <span className="block text-[11px] txt-fraco">{usuario?.unidade}</span>
          </span>
        </Link>

        {/* ---- abas por grupo ---- */}
        <nav aria-label="Navegação principal" className="sem-barra -mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1">
          {grupos.map((g) => {
            const unico = g.telas.length === 1;
            const ativo = g.telas.some((t) => t.chave === telaAtual?.chave);
            // grupo em que nenhuma tela foi migrada: abrir um menu só de itens
            // mortos parece defeito. Melhor não abrir e dizer o porquê.
            const nenhumaPronta = !g.telas.some((t) => t.migrada);
            if (nenhumaPronta) {
              return (
                <span
                  key={g.nome}
                  title="Estas telas ainda estão no sistema antigo"
                  className="flex cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold opacity-45"
                >
                  {g.nome}
                  <span className="rounded bg-ouro-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-ouro-700">
                    em breve
                  </span>
                </span>
              );
            }

            // grupo com uma tela só vira link direto — menu com 1 item é atrito à toa
            if (unico) {
              const t = g.telas[0];
              // tela ainda no sistema antigo: mostra desativada em vez de levar a um 404
              if (!t.migrada) {
                return (
                  <span
                    key={g.nome}
                    title="Ainda no sistema antigo"
                    className="flex cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold opacity-45"
                  >
                    {t.nome}
                    <span className="rounded bg-ouro-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-ouro-700">
                      em breve
                    </span>
                  </span>
                );
              }
              return (
                <Link
                  key={g.nome}
                  href={t.rota}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors',
                    ativo ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50 hover:text-marinho-800',
                  )}
                >
                  {t.nome}
                </Link>
              );
            }

            return (
              <div key={g.nome} className="relative">
                <button
                  type="button"
                  aria-expanded={aberto === g.nome}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    if (aberto === g.nome) { setAberto(null); return; }
                    const r = e.currentTarget.getBoundingClientRect();
                    setPosMenu({ left: r.left, top: r.bottom + 6 });
                    setAberto(g.nome);
                  }}
                  className={cn(
                    'flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors',
                    ativo ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50 hover:text-marinho-800',
                  )}
                >
                  {g.nome}
                  <ChevronDown aria-hidden className={cn('size-3.5 transition-transform', aberto === g.nome && 'rotate-180')} />
                </button>

                {aberto === g.nome && posMenu && (
                  <div
                    role="menu"
                    style={{ position: 'fixed', left: posMenu.left, top: posMenu.top }}
                    className="painel sombra-lg z-50 min-w-64 rounded-xl p-1.5 motion-safe:animate-abrir"
                  >
                    {g.telas.map((t) => t.migrada ? (
                      <Link
                        key={t.chave}
                        href={t.rota}
                        role="menuitem"
                        className={cn(
                          'block rounded-lg px-3 py-2 transition-colors',
                          t.chave === telaAtual?.chave ? 'bg-marinho-50 text-marinho-800' : 'hover:bg-marinho-50',
                        )}
                      >
                        <span className="block text-[13.5px] font-semibold">{t.nome}</span>
                        <span className="block text-[11.5px] txt-fraco">{t.descricao}</span>
                      </Link>
                    ) : (
                      <span
                        key={t.chave}
                        title="Ainda no sistema antigo"
                        className="block cursor-not-allowed rounded-lg px-3 py-2 opacity-45"
                      >
                        <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                          {t.nome}
                          <span className="rounded bg-ouro-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-ouro-700">
                            em breve
                          </span>
                        </span>
                        <span className="block text-[11.5px] txt-fraco">{t.descricao}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={alternarTema}
          aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg txt-fraco transition-colors hover:bg-marinho-50 hover:text-marinho-800"
        >
          {escuro ? <Moon aria-hidden className="size-4.5" /> : <Sun aria-hidden className="size-4.5" />}
        </button>

        {/* ---- pessoa logada ---- */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-expanded={menuUsuario}
            aria-haspopup="menu"
            onClick={() => setMenuUsuario((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-marinho-50"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-marinho-800 text-[12px] font-bold text-white">
              {(usuario?.nome ?? '?').slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden text-left leading-tight lg:block">
              <span className="block max-w-32 truncate text-[13px] font-semibold">{usuario?.nome}</span>
              <span className="block text-[11px] txt-fraco">{usuario?.admin ? 'Administrador' : usuario?.cargo || 'Equipe'}</span>
            </span>
            <ChevronDown aria-hidden className="size-3.5 txt-fraco" />
          </button>

          {menuUsuario && (
            <div role="menu" className="painel sombra-lg absolute right-0 top-[calc(100%+6px)] z-50 min-w-56 rounded-xl p-1.5 motion-safe:animate-abrir">
              <div className="border-b borda px-3 py-2">
                <p className="text-[13.5px] font-semibold">{usuario?.nome}</p>
                <p className="text-[11.5px] txt-fraco">
                  {usuario?.unidade} · {usuario?.admin ? 'Administrador' : usuario?.cargo || 'Equipe'}
                </p>
              </div>
              {pode('desempenho', 'ver') && TELA_POR_CHAVE.desempenho?.migrada && (
                <Link href="/meu-desempenho" role="menuitem" className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] hover:bg-marinho-50">
                  <User aria-hidden className="size-4" />
                  Meu desempenho
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => void sair()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13.5px] text-erro-500 hover:bg-erro-500/10"
              >
                <LogOut aria-hidden className="size-4" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      {/* trilha da tela atual — ajuda a não se perder com muitas telas */}
      {telaAtual && (
        <div className="border-t borda painel-2">
          <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 py-1.5 text-[12px] txt-fraco">
            <span>{telaAtual.grupo}</span>
            <span aria-hidden>›</span>
            <span className="font-semibold" style={{ color: 'var(--texto)' }}>{telaAtual.nome}</span>
          </div>
        </div>
      )}
    </header>
  );
}
