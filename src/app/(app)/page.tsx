'use client';

import {
  ArrowRight, Boxes, CalendarClock, ClipboardList, Construction, LayoutGrid, Package, Settings2, Target,
  TrendingUp, Users,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { GraficoArea, type PontoArea } from '@/components/layout/GraficoArea';
import { acuracidadeDe, fmtBRL, totais } from '@/lib/inventario';
import { TELAS } from '@/lib/permissoes';
import { fmtPct, porDia } from '@/lib/produtividade';
import { getSupabase } from '@/lib/supabase';
import { useRelatorio } from '@/providers/RelatorioProvider';
import { useSessao } from '@/providers/SessionProvider';
import type { Agendamento, Inventario } from '@/types/database';
import { cn } from '@/utils/cn';

/**
 * Inicio — painel com a evolucao de cada area do sistema.
 *
 * Cada cartao mostra um numero grande (onde estamos) e um grafico de area
 * (como chegamos ate aqui). So aparece o cartao da area que a pessoa tem
 * permissao de ver.
 */
export default function InicioPage() {
  const { usuario, pode } = useSessao();
  const { cargas } = useRelatorio();

  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [agenda, setAgenda] = useState<Agendamento[]>([]);

  const carregar = useCallback(async () => {
    const { demoLigado } = await import('@/lib/demo');
    if (demoLigado()) {
      const { INVENTARIOS_DEMO, agendamentosDemo } = await import('@/lib/demo');
      setInventarios(INVENTARIOS_DEMO);
      setAgenda([...agendamentosDemo('enviar'), ...agendamentosDemo('receber')]);
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const [inv, ag] = await Promise.all([
      pode('inventario') ? sb.from('inventarios').select('*').order('data_inventario').limit(200)
        : Promise.resolve({ data: [] }),
      pode('agendamentos') || pode('recebimentos')
        ? sb.from('agendamentos').select('*').limit(2000) : Promise.resolve({ data: [] }),
    ]);
    setInventarios((inv.data ?? []) as Inventario[]);
    setAgenda((ag.data ?? []) as Agendamento[]);
  }, [pode]);

  useEffect(() => { void carregar(); }, [carregar]);

  const liberadas = TELAS.filter((t) => t.chave !== 'inicio' && pode(t.chave, 'ver'));
  const prontas = liberadas.filter((t) => t.migrada);
  const emBreve = liberadas.filter((t) => !t.migrada);

  const agora = new Date();
  const hora = agora.getHours();
  // "quinta-feira, 19 de novembro" -> só a primeira letra maiúscula
  const hojeExtenso = (() => {
    const t = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  // ---------- produtividade por dia ----------
  const dias = porDia(cargas);
  const serieProd: PontoArea[] = dias.map((d) => ({ rotulo: d.data.slice(0, 5), valor: d.prodFinal * 100 }));
  const mediaProd = dias.length ? dias.reduce((a, d) => a + d.prodFinal, 0) / dias.length : 0;

  // ---------- inventário: divergência por lançamento ----------
  // só o inventário normal, igual ao padrão do Comparativo: o corte é contagem
  // parcial e misturado aqui faria o resumo do dia divergir do que a gerência vê
  const invOrdenado = [...inventarios]
    .filter((l) => (l.tipo ?? 'normal') === 'normal')
    .sort((a, b) => (a.data_inventario < b.data_inventario ? -1 : 1));
  const serieInv: PontoArea[] = invOrdenado.map((l) => ({
    rotulo: l.data_inventario.slice(8, 10) + '/' + l.data_inventario.slice(5, 7),
    valor: totais(l.produtos ?? []).fin,
  }));
  const ultimoInv = invOrdenado[invOrdenado.length - 1];
  const acuUltimo = ultimoInv ? acuracidadeDe(totais(ultimoInv.produtos ?? []), ultimoInv.valor_estoque) : null;

  // ---------- agendamentos: por dia, nos próximos 14 ----------
  const hojeISO = new Date().toISOString().slice(0, 10);
  const serieAgenda: PontoArea[] = (() => {
    const m: Record<string, number> = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      m[d.toISOString().slice(0, 10)] = 0;
    }
    agenda.forEach((a) => { if (a.data in m) m[a.data]++; });
    return Object.entries(m).map(([d, n]) => ({ rotulo: d.slice(8, 10) + '/' + d.slice(5, 7), valor: n }));
  })();
  const pendentes = agenda.filter((a) =>
    !['Enviado', 'Recebido', 'Cancelado'].includes(a.status) && a.data >= hojeISO).length;

  return (
    <div className="motion-safe:animate-entrada">
      {/* banner de boas-vindas: a peça de maior peso visual da tela */}
      <header className="relative mb-6 overflow-hidden rounded-3xl px-6 py-7 text-white sm:px-8 sm:py-9"
        style={{ background: 'linear-gradient(120deg, #141c4d 0%, #2433a6 55%, #3d63f0 100%)' }}>
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-80 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-40 size-72 rounded-full bg-ouro-400/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
        <div className="relative">
          <p className="text-[13px] font-medium text-white/70">{hojeExtenso}</p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
            {saudacao}, {usuario?.nome.split(' ')[0]} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-2 max-w-xl text-[14.5px] text-white/75">
            {liberadas.length
              ? `Você tem acesso a ${liberadas.length} telas — ${prontas.length} já disponíveis aqui. Escolha por onde começar.`
              : 'Você ainda não tem nenhuma tela liberada. Procure o administrador.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {prontas.slice(0, 4).map((t) => (
              <Link key={t.chave} href={t.rota}
                className="rounded-full bg-white/12 px-3.5 py-1.5 text-[12.5px] font-semibold ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-white/20">
                {t.nome}
              </Link>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {pode('produtividade') && (
          <Cartao
            titulo="Produtividade" rota="/produtividade" Icone={Target}
            valor={cargas.length ? fmtPct(mediaProd) : '—'}
            nota={cargas.length ? `média de ${dias.length} dia(s) · ${cargas.length} cargas` : 'sem relatório carregado'}
          >
            <GraficoArea dados={serieProd} fmt={(v) => v.toFixed(1).replace('.', ',') + '%'} />
          </Cartao>
        )}

        {pode('inventario') && (
          <Cartao
            titulo="Inventário" rota="/inventario" Icone={Package}
            valor={acuUltimo != null ? acuUltimo.toFixed(2).replace('.', ',') + '%' : '—'}
            nota={ultimoInv ? `acuracidade · ${ultimoInv.fornecedor}` : 'nenhum inventário lançado'}
          >
            <GraficoArea
              dados={serieInv} incluirZero
              cor={(serieInv[serieInv.length - 1]?.valor ?? 0) < 0 ? 'var(--color-erro-500)' : 'var(--color-ok-500)'}
              fmt={fmtBRL}
            />
          </Cartao>
        )}

        {/* rota SEGUE a permissão real: quem só tem recebimentos (ex.: depósito) não
            pode ser mandado para /agendamentos — cairia num bloqueio de acesso */}
        {(pode('agendamentos') || pode('recebimentos')) && (
          <Cartao
            titulo={pode('agendamentos') ? 'Cargas a Enviar' : 'Cargas a Receber'}
            rota={pode('agendamentos') ? '/agendamentos' : '/recebimentos'}
            Icone={CalendarClock}
            valor={String(pendentes)}
            nota="pendentes nos próximos 14 dias"
          >
            <GraficoArea dados={serieAgenda} cor="var(--color-ouro-500)" fmt={(v) => `${v} agendamento(s)`} />
          </Cartao>
        )}
      </div>

      {prontas.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider txt-fraco">
            <TrendingUp aria-hidden className="size-3.5" /> Telas disponíveis
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {prontas.map((t) => (
              <li key={t.chave}>
                <Link href={t.rota}
                  className="painel sombra elevar group flex h-full flex-col rounded-2xl p-5">
                  <span className="flex items-center gap-3">
                    <IconeGrupo grupo={t.grupo} />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider txt-fraco">{t.grupo}</span>
                      <span className="block text-[15px] font-semibold leading-snug">{t.nome}</span>
                    </span>
                  </span>
                  <span className="mt-3 text-[12.5px] leading-relaxed txt-fraco">{t.descricao}</span>
                  <span className="mt-auto pt-4 text-[12.5px] font-semibold text-marinho-500">
                    Abrir <ArrowRight aria-hidden className="inline size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {emBreve.length > 0 && (
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-dashed borda p-5">
          <Construction aria-hidden className="mt-0.5 size-5 shrink-0 text-ouro-500" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold">Sistema em migração</p>
            <p className="mt-0.5 text-[12.5px] txt-fraco">
              O sistema atual continua no ar e funcionando normalmente. As telas vão sendo trazidas
              para cá uma a uma, sem parar a operação.
            </p>
            <p className="mt-2.5 text-[11.5px] font-bold uppercase tracking-wide txt-fraco">
              Ainda no sistema antigo
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {emBreve.map((t) => (
                <li key={t.chave} className="rounded-lg painel-2 px-2.5 py-1 text-[12px] txt-fraco">{t.nome}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Cartao({ titulo, rota, Icone, valor, nota, children }: {
  titulo: string; rota: string; Icone: typeof Target;
  valor: string; nota: string; children: React.ReactNode;
}) {
  return (
    <Link href={rota} className={cn(
      'painel sombra elevar group flex flex-col rounded-2xl p-5',
      'motion-safe:animate-subir',
    )}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg aba-ativa">
          <Icone aria-hidden className="size-4" />
        </span>
        <span className="text-[13.5px] font-semibold">{titulo}</span>
        <ArrowRight aria-hidden className="ml-auto size-4 txt-fraco transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-4 text-[32px] font-semibold leading-none tracking-tight tabular-nums">{valor}</p>
      <p className="mt-1.5 text-[12.5px] txt-fraco">{nota}</p>
      <div className="mt-2">{children}</div>
    </Link>
  );
}

/** Ícone do grupo do menu — dá um ponto de leitura rápida a cada cartão. */
const ICONE_GRUPO: Record<string, typeof Target> = {
  'Operação': TrendingUp,
  'Equipe': Users,
  'Planejamento': CalendarClock,
  'Estoque': Boxes,
  'Administração': Settings2,
  'Pessoal': ClipboardList,
};

function IconeGrupo({ grupo }: { grupo: string }) {
  const Icone = ICONE_GRUPO[grupo] ?? LayoutGrid;
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl painel-2 border borda text-marinho-500 transition-colors group-hover:border-marinho-300">
      <Icone aria-hidden className="size-[18px]" />
    </span>
  );
}
