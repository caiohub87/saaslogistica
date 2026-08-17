'use client';

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';

import { demoLigado } from '@/lib/demo';
import {
  CONFIG_PADRAO, montarCargas, PREMIO_PADRAO,
  type Carga, type ConfigProdutividade, type TabelaPremio,
} from '@/lib/produtividade';
import type { MetaRelatorio, Pedido } from '@/types/relatorio';

/**
 * Base Tratada — o relatorio do Fusion carregado UMA vez e usado por todos os
 * modulos (Analise, Produtividade, Salvos), como no sistema antigo.
 *
 * Fica no localStorage por unidade: relatorio de uma unidade nao aparece na
 * outra. E arquivo do dia, nao dado historico — o historico mora no banco,
 * na tabela de premiacoes.
 */

interface RelatorioCtx {
  pedidos: Pedido[];
  meta: MetaRelatorio | null;
  cargas: Carga[];
  config: ConfigProdutividade;
  premio: TabelaPremio;
  carregando: boolean;
  definirRelatorio: (pedidos: Pedido[], meta: MetaRelatorio) => void;
  limpar: () => void;
  ajustarConfig: (c: Partial<ConfigProdutividade>) => void;
}

const Ctx = createContext<RelatorioCtx | null>(null);

const chave = (unidade: string, o: string) => `gl:${o}:${(unidade || 'dilnor').toLowerCase()}`;

export function RelatorioProvider({ unidade, children }: { unidade: string; children: ReactNode }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [meta, setMeta] = useState<MetaRelatorio | null>(null);
  const [config, setConfig] = useState<ConfigProdutividade>(CONFIG_PADRAO);
  const [premio] = useState<TabelaPremio>(PREMIO_PADRAO);
  const [carregando, setCarregando] = useState(true);

  // restaura o que estava salvo para esta unidade
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (demoLigado()) {
          const { pedidosDemo } = await import('@/lib/demo');
          if (!vivo) return;
          const p = pedidosDemo();
          setPedidos(p);
          setMeta({ arquivo: 'exemplo.xlsx', carregadoEm: new Date().toISOString(), pedidos: p.length });
          setCarregando(false);
          return;
        }
        const bruto = localStorage.getItem(chave(unidade, 'base'));
        if (bruto && vivo) {
          const j = JSON.parse(bruto);
          setPedidos(j.pedidos ?? []);
          setMeta(j.meta ?? null);
        }
        const cfg = localStorage.getItem(chave(unidade, 'config'));
        if (cfg && vivo) setConfig({ ...CONFIG_PADRAO, ...JSON.parse(cfg) });
      } catch { /* base corrompida: começa vazia */ }
      if (vivo) setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [unidade]);

  const definirRelatorio = useCallback((p: Pedido[], m: MetaRelatorio) => {
    setPedidos(p);
    setMeta(m);
    try { localStorage.setItem(chave(unidade, 'base'), JSON.stringify({ pedidos: p, meta: m })); } catch { /* cota cheia */ }
  }, [unidade]);

  const limpar = useCallback(() => {
    setPedidos([]); setMeta(null);
    try { localStorage.removeItem(chave(unidade, 'base')); } catch { /* ignora */ }
  }, [unidade]);

  const ajustarConfig = useCallback((c: Partial<ConfigProdutividade>) => {
    setConfig((atual) => {
      const novo = { ...atual, ...c };
      try { localStorage.setItem(chave(unidade, 'config'), JSON.stringify(novo)); } catch { /* ignora */ }
      return novo;
    });
  }, [unidade]);

  const cargas = useMemo(() => montarCargas(pedidos, config), [pedidos, config]);

  const valor = useMemo<RelatorioCtx>(() => ({
    pedidos, meta, cargas, config, premio, carregando,
    definirRelatorio, limpar, ajustarConfig,
  }), [pedidos, meta, cargas, config, premio, carregando, definirRelatorio, limpar, ajustarConfig]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useRelatorio() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRelatorio precisa estar dentro de <RelatorioProvider>.');
  return c;
}
