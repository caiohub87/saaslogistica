'use client';

import { ArrowRight, CalendarClock, Construction, Package, Target, TrendingUp } from 'lucide-react';
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

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  // ---------- produtividade por dia ----------
  const dias = porDia(cargas);
  const serieProd: PontoArea[] = dias.map((d) => ({ rotulo: d.data.slice(0, 5), valor: d.prodFinal * 100 }));
  const mediaProd = dias.length ? dias.reduce((a, d) => a + d.prodFinal, 0) / dias.length : 0;

  // ---------- inventário: divergência por lançamento ----------
  const invOrdenado = [...inventarios].sort((a, b) => (a.data_inventario < b.data_inventario ? -1 : 1));
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
      <header className="mb-5">
        <h1 className="text-2xl font-bold">{saudacao}, {usuario?.nome.split(' ')[0]}</h1>
        <p className="mt-1 text-sm txt-fraco">
          {liberadas.length
            ? `Você tem acesso a ${liberadas.length} tela(s) — ${prontas.length} já disponível(is) aqui.`
            : 'Você ainda não tem nenhuma tela liberada. Procure o administrador.'}
        </p>
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
          <h2 className="mb-2 mt-6 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide txt-fraco">
            <TrendingUp aria-hidden className="size-3.5" /> Telas disponíveis
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {prontas.map((t) => (
              <li key={t.chave}>
                <Link href={t.rota}
                  className="painel sombra group flex h-full flex-col rounded-2xl p-4 transition-shadow hover:sombra-lg">
                  <span className="text-[11px] font-bold uppercase tracking-wide txt-fraco">{t.grupo}</span>
                  <span className="mt-1 text-[15px] font-bold">{t.nome}</span>
                  <span className="mt-1 text-[12.5px] txt-fraco">{t.descricao}</span>
                  <span className="mt-auto pt-3 text-[12px] font-semibold text-marinho-500">
                    Abrir <ArrowRight aria-hidden className="inline size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {emBreve.length > 0 && (
        <div className="painel mt-6 flex items-start gap-3 rounded-2xl p-4">
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
      'painel sombra group flex flex-col rounded-2xl p-4 transition-shadow hover:sombra-lg',
      'motion-safe:animate-subir',
    )}>
      <div className="flex items-center gap-2">
        <Icone aria-hidden className="size-4 text-marinho-500" />
        <span className="text-[13.5px] font-bold">{titulo}</span>
        <ArrowRight aria-hidden className="ml-auto size-3.5 txt-fraco transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-1 text-[26px] font-bold leading-tight">{valor}</p>
      <p className="text-[12px] txt-fraco">{nota}</p>
      <div className="mt-2">{children}</div>
    </Link>
  );
}
