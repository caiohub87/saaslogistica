'use client';

/**
 * Toners — para onde vai cada um e quanto tempo dura.
 *
 * O toner sai do estoque e vai para uma impressora, que fica numa sala. A
 * troca é gravada contra a IMPRESSORA: como ela pertence a uma sala, isso
 * responde as duas perguntas ("quanto durou nesta sala" e "quanto durou nesta
 * impressora"); gravar na sala misturaria máquinas de consumo diferente num
 * número só.
 *
 * Quanto um toner durou NÃO fica no banco. É a distância até a troca seguinte
 * da mesma impressora — guardar isso obrigaria a reescrever a linha anterior a
 * cada registro, e uma exclusão no meio deixaria a conta errada sem ninguém
 * ver. Aqui se calcula na leitura.
 */

import type { Impressora, Sala, TrocaToner } from '@/types/database';

/** Uma troca com o que dá para deduzir dela. */
export interface TrocaComDuracao extends TrocaToner {
  /**
   * Dias até a troca seguinte na mesma impressora. Null na mais recente: ela
   * ainda está em uso, e chutar "até hoje" a faria parecer encerrada.
   */
  duracao: number | null;
  /** Só na mais recente: há quantos dias está na máquina. */
  emUsoHa: number | null;
}

/** '2026-08-21' -> Date, no fuso local (evita o -1 dia do parse ISO puro). */
function dia(iso: string): Date {
  const [a, m, d] = String(iso ?? '').split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

/** Dias inteiros entre duas datas 'aaaa-mm-dd'. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((dia(ate).getTime() - dia(de).getTime()) / 86400000);
}

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Calcula a duração de cada troca, por impressora.
 *
 * Devolve na mesma ordem de entrada, para a tela poder ordenar como quiser
 * sem perder a conta.
 */
export function comDuracao(trocas: TrocaToner[]): TrocaComDuracao[] {
  const hoje = hojeISO();
  // agrupa por impressora: a duração só faz sentido dentro da mesma máquina
  const porImpressora = new Map<number, TrocaToner[]>();
  trocas.forEach((t) => {
    const lista = porImpressora.get(t.impressora_id);
    if (lista) lista.push(t); else porImpressora.set(t.impressora_id, [t]);
  });

  const calculado = new Map<number, TrocaComDuracao>();
  porImpressora.forEach((lista) => {
    // da mais antiga para a mais nova; o id desempata o mesmo dia, porque duas
    // trocas na mesma data têm distância zero e a ordem viraria sorteio
    const ordenada = [...lista].sort((a, b) => (a.data === b.data ? a.id - b.id : (a.data < b.data ? -1 : 1)));
    ordenada.forEach((t, i) => {
      const seguinte = ordenada[i + 1];
      calculado.set(t.id, {
        ...t,
        duracao: seguinte ? diasEntre(t.data, seguinte.data) : null,
        emUsoHa: seguinte ? null : Math.max(0, diasEntre(t.data, hoje)),
      });
    });
  });

  return trocas.map((t) => calculado.get(t.id)!);
}

/** O consumo consolidado de uma impressora ou de uma sala. */
export interface Consumo {
  trocas: number;
  /**
   * Média de dias por toner. Só entram as trocas JÁ encerradas: a que está na
   * máquina ainda não durou o que vai durar, e incluí-la puxaria a média para
   * baixo justo quando o toner é novo.
   */
  media: number | null;
  ultima: string | null;
  /** dias desde a última troca — é o número que diz se está perto de trocar */
  desdeUltima: number | null;
  toner: string | null;
}

export function consolidar(trocas: TrocaComDuracao[]): Consumo {
  if (!trocas.length) {
    return { trocas: 0, media: null, ultima: null, desdeUltima: null, toner: null };
  }
  const encerradas = trocas.filter((t) => t.duracao != null);
  const soma = encerradas.reduce((a, t) => a + (t.duracao ?? 0), 0);
  const maisRecente = trocas.reduce((a, t) => (a.data > t.data ? a : (a.data < t.data ? t : (a.id > t.id ? a : t))));
  return {
    trocas: trocas.length,
    media: encerradas.length ? Math.round(soma / encerradas.length) : null,
    ultima: maisRecente.data,
    desdeUltima: diasEntre(maisRecente.data, hojeISO()),
    toner: maisRecente.toner,
  };
}

/** Uma linha da aba Consumo: a impressora, a sala dela e os números. */
export interface LinhaConsumo {
  impressora: Impressora;
  sala: Sala | undefined;
  consumo: Consumo;
}

export function porImpressora(
  impressoras: Impressora[], salas: Sala[], trocas: TrocaComDuracao[],
): LinhaConsumo[] {
  const salaPorId = new Map(salas.map((s) => [s.id, s]));
  return impressoras.map((imp) => ({
    impressora: imp,
    sala: salaPorId.get(imp.sala_id),
    consumo: consolidar(trocas.filter((t) => t.impressora_id === imp.id)),
  }));
}

export interface LinhaSala {
  sala: Sala;
  impressoras: number;
  consumo: Consumo;
}

export function porSala(
  salas: Sala[], impressoras: Impressora[], trocas: TrocaComDuracao[],
): LinhaSala[] {
  return salas.map((s) => {
    const daSala = impressoras.filter((i) => i.sala_id === s.id);
    const ids = new Set(daSala.map((i) => i.id));
    return {
      sala: s,
      impressoras: daSala.length,
      consumo: consolidar(trocas.filter((t) => ids.has(t.impressora_id))),
    };
  });
}

// ---------------------------------------------------------------- formato

/** '2026-08-21' -> '21/08/2026' */
export const fmtData = (iso: string | null) => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).split('-');
  return d ? `${d}/${m}/${a}` : iso;
};

/** '18 dias', '1 dia', 'hoje' — o plural certo evita "1 dias" na tela. */
export const fmtDias = (n: number | null) =>
  n == null ? '—' : n === 0 ? 'hoje' : n === 1 ? '1 dia' : `${n} dias`;

export const normNome = (s: string) => s.trim().replace(/\s+/g, ' ');

/** Traduz o erro do banco em instrução. */
export const dica = (msg: string) => {
  const semTabela = /Could not find the table '(?:public\.)?(\w+)'/i.exec(msg);
  if (semTabela) return ` — a tabela ${semTabela[1]} não existe: rode supabase/25_toners.sql no Supabase.`;
  if (/does not exist|schema cache/i.test(msg)) return ' — rode supabase/25_toners.sql no Supabase.';
  // a FK de impressoras -> salas é restrict: apagar sala com máquina é barrado
  if (/violates foreign key|foreign key constraint/i.test(msg)) {
    return ' — esta sala ainda tem impressora cadastrada. Desative a sala em vez de excluir.';
  }
  if (/duplicate key|unique/i.test(msg)) return ' — já existe um com esse nome.';
  if (/permission|policy|row-level/i.test(msg)) return ' — seu acesso não tem permissão para isso.';
  return '';
};
