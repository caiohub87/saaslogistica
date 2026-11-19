'use client';

import {
  Award, BarChart3, Camera, CalendarClock, CalendarRange, ChevronsUpDown, ClipboardCheck, Database,
  FlaskConical, History, House, LayoutGrid, LogOut, Moon, PackageOpen, PackageX, PieChart, Printer,
  RotateCcw, Settings, ShieldCheck, Sun, Target, Trophy, Truck, Users, Wallet,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { useTema } from '@/hooks/useTema';
import { TELAS, type Tela } from '@/lib/permissoes';
import { useSessao } from '@/providers/SessionProvider';
import { cn } from '@/utils/cn';

/** Ícone de cada tela no menu. Tela nova sem ícone cai no LayoutGrid. */
export const ICONE_TELA: Record<string, typeof House> = {
  inicio: House,
  analise: BarChart3,
  produtividade: Target,
  salvos: Trophy,
  escala: CalendarRange,
  escalasalvas: History,
  diarias: Wallet,
  equipe: Users,
  agendamentos: Truck,
  recebimentos: PackageOpen,
  inventario: ClipboardCheck,
  faltasanalise: PieChart,
  reentregas: RotateCcw,
  reentregafoto: Camera,
  validade: CalendarClock,
  ocorrencias: PackageX,
  cadastros: Database,
  config: Settings,
  toners: Printer,
  usuarios: ShieldCheck,
  desempenho: Award,
};

/** Tela atual pela rota: a mais específica que casa com o caminho. */
export function telaDaRota(visiveis: Tela[], caminho: string) {
  return visiveis.find((t) => t.rota === caminho)
    ?? visiveis.filter((t) => t.rota !== '/' && caminho.startsWith(t.rota))
      .sort((a, b) => b.rota.length - a.rota.length)[0];
}

/**
 * Menu lateral — computador (lg para cima).
 *
 * Todas as telas ficam à vista, agrupadas, a um clique — sem menus que abrem.
 * No celular ele some e quem aparece é o TopNav, com a faixa rolável.
 */
export function Sidebar() {
  const { usuario, pode, sair, demo } = useSessao();
  const caminho = usePathname();
  const { escuro, alternar } = useTema();
  const [menuUsuario, setMenuUsuario] = useState(false);
  const rodape = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (rodape.current && !rodape.current.contains(e.target as Node)) setMenuUsuario(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const visiveis = TELAS.filter((t) => pode(t.chave, 'ver'));
  const grupos: { nome: string; telas: Tela[] }[] = [];
  visiveis.forEach((t) => {
    const g = grupos.find((x) => x.nome === t.grupo);
    if (g) g.telas.push(t); else grupos.push({ nome: t.grupo, telas: [t] });
  });
  const atual = telaDaRota(visiveis, caminho);
  const cargo = usuario?.admin ? 'Administrador' : usuario?.cargo || 'Equipe';

  return (
    <aside
      aria-label="Menu principal"
      className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r lg:flex"
      style={{ background: 'var(--lateral)', borderColor: 'var(--lateral-borda)', color: 'var(--lateral-txt)' }}
    >
      {/* brilho da marca no topo */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-60"
        style={{ background: 'radial-gradient(120% 80% at 0% 0%, rgb(61 99 240 / .35), transparent 60%)' }} />

      <Link href="/" className="relative flex items-center gap-3 px-5 pb-5 pt-6" aria-label="Ir para o início">
        <Image src="/dilnor-logo.png" alt="" width={40} height={40} className="rounded-xl bg-white p-1 shadow-lg shadow-black/30" priority />
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-white">Gestão Logística</span>
          <span className="block text-[12px]">{usuario?.unidade}</span>
        </span>
      </Link>

      <nav className="sem-barra relative flex-1 overflow-y-auto px-3 pb-4">
        {grupos.map((g) => (
          <div key={g.nome} className="mt-4 first:mt-0">
            <p className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] opacity-60">{g.nome}</p>
            <ul className="space-y-0.5">
              {g.telas.map((t) => {
                const Icone = ICONE_TELA[t.chave] ?? LayoutGrid;
                const ativo = t.chave === atual?.chave;
                if (!t.migrada) {
                  return (
                    <li key={t.chave}>
                      <span title="Ainda no sistema antigo"
                        className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] opacity-40">
                        <Icone aria-hidden className="size-[18px] shrink-0" />
                        <span className="flex-1 truncate">{t.nome}</span>
                        <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide">breve</span>
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={t.chave}>
                    <Link
                      href={t.rota}
                      aria-current={ativo ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors',
                        ativo ? 'text-white' : 'hover:bg-white/5 hover:text-white',
                      )}
                      style={ativo ? {
                        background: 'linear-gradient(90deg, rgb(61 99 240 / .9), rgb(42 73 224 / .55))',
                        boxShadow: '0 8px 20px -10px rgb(61 99 240 / .9), inset 0 1px 0 rgb(255 255 255 / .15)',
                      } : undefined}
                    >
                      <Icone aria-hidden className={cn('size-[18px] shrink-0', ativo ? 'text-white' : 'opacity-80 group-hover:opacity-100')} />
                      <span className="truncate">{t.nome}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div ref={rodape} className="relative border-t p-3" style={{ borderColor: 'var(--lateral-borda)' }}>
        {demo && (
          <p className="mb-2 flex items-center gap-2 rounded-xl bg-ouro-500/15 px-3 py-2 text-[11.5px] font-semibold text-ouro-300">
            <FlaskConical aria-hidden className="size-3.5 shrink-0" />
            Demonstração — nada é gravado
          </p>
        )}

        {menuUsuario && (
          <div role="menu" className="absolute inset-x-3 bottom-[calc(100%-4px)] rounded-2xl border p-1.5 shadow-2xl shadow-black/40 motion-safe:animate-abrir"
            style={{ background: 'var(--lateral-2)', borderColor: 'var(--lateral-borda)' }}>
            <button type="button" role="menuitem" onClick={alternar}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-white/5 hover:text-white">
              {escuro ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
              {escuro ? 'Usar tema claro' : 'Usar tema escuro'}
            </button>
            <button type="button" role="menuitem" onClick={() => void sair()}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-red-300 hover:bg-red-500/10">
              <LogOut aria-hidden className="size-4" />
              Sair
            </button>
          </div>
        )}

        <button
          type="button" aria-expanded={menuUsuario} aria-haspopup="menu"
          onClick={() => setMenuUsuario((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-marinho-400 to-marinho-700 text-[12px] font-bold text-white ring-2 ring-white/10">
            {(usuario?.nome ?? '?').slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13.5px] font-semibold text-white">{usuario?.nome}</span>
            <span className="block truncate text-[11.5px]">{cargo}</span>
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 opacity-60" />
        </button>
      </div>
    </aside>
  );
}

/**
 * Barra fina no topo do conteúdo (computador): onde estou + data + tema.
 */
export function BarraTopo() {
  const { pode } = useSessao();
  const caminho = usePathname();
  const { escuro, alternar } = useTema();
  const atual = telaDaRota(TELAS.filter((t) => pode(t.chave, 'ver')), caminho);
  const hoje = (() => {
    const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();

  return (
    <div className="vidro sticky top-0 z-30 hidden border-b borda lg:block">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-8">
        <nav aria-label="Você está em" className="flex items-center gap-2 text-[13px] txt-fraco">
          {atual && <>
            <span>{atual.grupo}</span>
            <span aria-hidden className="opacity-50">/</span>
            <span className="font-semibold" style={{ color: 'var(--texto)' }}>{atual.nome}</span>
          </>}
        </nav>
        <span className="ml-auto text-[12.5px] txt-fraco">{hoje}</span>
        <button
          type="button" onClick={alternar}
          aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
          className="painel flex size-9 items-center justify-center rounded-full txt-fraco transition-colors hover:text-[var(--texto)]"
        >
          {escuro ? <Moon aria-hidden className="size-4" /> : <Sun aria-hidden className="size-4" />}
        </button>
      </div>
    </div>
  );
}
