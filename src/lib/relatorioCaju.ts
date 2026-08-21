'use client';

/**
 * Relatório caju — o arquivo que sobe na plataforma de pagamento.
 *
 * Duas colunas e nada mais: NOME e SALDO, uma linha por pessoa, com o que ela
 * juntou na semana inteira somando todas as cargas. Qualquer coluna a mais
 * atrapalha a importação, então o resto do que a Produtividade sabe (carga,
 * faixa, dia) fica de fora de propósito.
 *
 * Sai como .xlsx de verdade (a biblioteca xlsx escreve o arquivo), com o saldo
 * como número — não texto — para a plataforma e o Excel somarem sem reclamar.
 */

export interface MembroPremiado {
  nome: string;
  valor: number;
}

/** O que o relatório precisa de cada premiação salva. */
export interface PremiacaoCaju {
  motorista: string | null;
  aj1: string | null;
  aj2: string | null;
  valor_mot: number | null;
  valor_aj1: number | null;
  valor_aj2: number | null;
  equipe: MembroPremiado[] | null;
}

export interface LinhaCaju {
  nome: string;
  saldo: number;
}

/** JOSE  RIBAMAR / Jose Ribamar caem na mesma chave — senão a pessoa vira duas linhas. */
const chave = (nome: string) => nome.trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Soma por pessoa o que foi premiado na semana.
 *
 * `equipe` é a fonte boa (guarda a equipe inteira); as colunas antigas
 * motorista/aj1/aj2 só entram quando o registro é velho e não tem `equipe`.
 * Quem terminou a semana zerado (chegou depois das 17:30 em tudo, ou foi
 * zerado na mão) fica de fora: linha de R$ 0,00 não tem o que pagar.
 */
export function somarSemana(premiacoes: PremiacaoCaju[]): LinhaCaju[] {
  const soma = new Map<string, LinhaCaju>();

  const juntar = (nome: string | null | undefined, valor: number | null | undefined) => {
    const limpo = (nome ?? '').trim().replace(/\s+/g, ' ');
    if (!limpo) return;
    const k = chave(limpo);
    const atual = soma.get(k) ?? { nome: limpo, saldo: 0 };
    atual.saldo += Number(valor ?? 0) || 0;
    soma.set(k, atual);
  };

  premiacoes.forEach((p) => {
    if (p.equipe?.length) {
      p.equipe.forEach((m) => juntar(m.nome, m.valor));
      return;
    }
    juntar(p.motorista, p.valor_mot);
    juntar(p.aj1, p.valor_aj1);
    juntar(p.aj2, p.valor_aj2);
  });

  return [...soma.values()]
    .filter((l) => l.saldo > 0)
    .map((l) => ({ ...l, saldo: Math.round(l.saldo * 100) / 100 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export const totalCaju = (linhas: LinhaCaju[]) => linhas.reduce((a, l) => a + l.saldo, 0);

/** Escreve o arquivo e dispara o download. Devolve o nome usado. */
export async function baixarRelatorioCaju(linhas: LinhaCaju[], semanaISO: string): Promise<string> {
  const XLSX = await import('xlsx');
  const planilha = XLSX.utils.aoa_to_sheet([
    ['NOME', 'SALDO'],
    ...linhas.map((l) => [l.nome, l.saldo]),
  ]);

  // saldo com 2 casas em todas as linhas; sem isso 35 aparece como "35"
  linhas.forEach((_, i) => {
    const cel = planilha[XLSX.utils.encode_cell({ c: 1, r: i + 1 })];
    if (cel) cel.z = '0.00';
  });
  planilha['!cols'] = [{ wch: 34 }, { wch: 12 }];

  const pasta = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(pasta, planilha, 'Caju');
  const nome = `relatorio-caju-${semanaISO}.xlsx`;
  XLSX.writeFile(pasta, nome);
  return nome;
}
