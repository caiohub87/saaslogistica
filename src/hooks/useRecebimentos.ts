'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { agendamentosDemo, demoLigado } from '@/lib/demo';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import type { Agendamento } from '@/types/database';

interface Estado {
  chave: string;
  itens: Agendamento[];
  carregando: boolean;
  erro: string | null;
}

/**
 * Leitura da unidade atual; `desde`, quando informado, é YYYY-MM-DD inclusivo.
 * Realtime e atualização de reserva compartilham a mesma fila de leitura.
 */
export function useRecebimentos(desde?: string) {
  const { usuario, pode, demo, carregando: sessaoCarregando } = useSessao();
  const unidade = usuario?.unidade;
  const podeVer = pode('recebimentos', 'ver');
  const canalId = useId();
  const chave = `${usuario?.id ?? ''}|${unidade ?? ''}|${desde ?? ''}|${demo}|${podeVer}`;
  const [estado, setEstado] = useState<Estado>({ chave: '', itens: [], carregando: true, erro: null });
  const carregarRef = useRef<() => Promise<void>>(async () => {});
  const recarregar = useCallback(() => carregarRef.current(), []);

  useEffect(() => {
    if (sessaoCarregando || !unidade || !podeVer) return;
    let ativo = true;
    let emCurso: Promise<void> | null = null;
    let repetir = false;
    const demonstracao = demo || demoLigado();
    const sb = demonstracao ? null : getSupabase();

    async function ler() {
      do {
        repetir = false;
        try {
          let itens: Agendamento[] = [];
          if (demonstracao) {
            itens = agendamentosDemo('receber').filter((a) => a.unidade === unidade && (!desde || a.data >= desde));
          } else {
            if (!sb) throw new Error('Banco não configurado.');
            // Paginação evita o limite padrão de 1.000 linhas do Supabase.
            const tamanho = 1000;
            for (let inicio = 0; ativo; inicio += tamanho) {
              let consulta = sb.from('agendamentos').select('*').eq('tipo', 'receber').eq('unidade', unidade)
                .order('data', { ascending: true }).order('id', { ascending: true }).range(inicio, inicio + tamanho - 1);
              if (desde) consulta = consulta.gte('data', desde);
              const { data, error } = await consulta;
              if (error) throw new Error(error.message);
              const pagina = (data ?? []) as Agendamento[];
              itens = itens.concat(pagina);
              if (pagina.length < tamanho) break;
            }
          }
          if (ativo) setEstado({ chave, itens, carregando: false, erro: null });
        } catch (e) {
          if (ativo) setEstado((anterior) => ({
            chave, itens: anterior.chave === chave ? anterior.itens : [], carregando: false,
            erro: `Não foi possível atualizar os recebimentos: ${e instanceof Error ? e.message : 'tente novamente.'}`,
          }));
        }
      } while (ativo && repetir);
    }

    function carregar(): Promise<void> {
      if (!ativo) return Promise.resolve();
      if (emCurso) { repetir = true; return emCurso; }
      emCurso = ler().finally(() => { emCurso = null; });
      return emCurso;
    }
    carregarRef.current = carregar;
    void carregar();
    const intervalo = window.setInterval(() => { void carregar(); }, 60_000);
    const canal = sb?.channel(`recebimentos-${canalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `unidade=eq.${unidade}` }, () => { void carregar(); })
      .subscribe();
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      if (canal && sb) void sb.removeChannel(canal);
      if (carregarRef.current === carregar) carregarRef.current = async () => {};
    };
  }, [unidade, desde, demo, podeVer, sessaoCarregando, chave, canalId]);

  // A troca de unidade/permissão nunca expõe a resposta da sessão anterior.
  const liberado = Boolean(unidade && podeVer && !sessaoCarregando);
  const atual = liberado && estado.chave === chave;
  return {
    itens: atual ? estado.itens : [],
    carregando: sessaoCarregando || (liberado && (!atual || estado.carregando)),
    erro: atual ? estado.erro : null,
    recarregar,
  };
}
