/**
 * Faltas e sobras — o que faltou na carga e o que voltou sobrando.
 *
 * São duas coisas diferentes, mas com o mesmo esqueleto (lote, motorista,
 * placa, data), então dividem a tabela `ocorrencias` e a mesma tela, separadas
 * pela coluna `tipo` — igual aos agendamentos (enviar/receber). O que muda:
 *   FALTA  pede o produto (código + embalagem) e a equipe da rota: é o item
 *          que não chegou. Depois passa por aprovação.
 *   SOBRA  pede quantidade e foto: é o que voltou na carroceria, e no momento
 *          do registro ninguém sabe ainda de que produto é aquilo. A validação
 *          vem depois, informando o código — é o que fecha o registro.
 *
 * Aprovar a falta e validar a sobra são a mesma permissão ('aprovar'): as duas
 * são a segunda conferência, feita por quem não registrou.
 */

import { PackageMinus, PackagePlus, type LucideIcon } from 'lucide-react';

import type { TipoOcorrencia } from '@/types/database';

export interface ConfigOcorrencia {
  tipo: TipoOcorrencia;
  nome: string;
  /** título do formulário */
  acao: string;
  Icone: LucideIcon;
  /** produto (código + embalagem) no registro: só a falta já sabe qual é */
  temProduto: boolean;
  /** equipe da rota: só a falta */
  temAjudantes: boolean;
  /** quantidade e foto: só a sobra */
  temQuantidade: boolean;
  temFoto: boolean;
  /** rótulo da segunda conferência */
  conferencia: string;
  /** como a ocorrência aparece enquanto ela não acontece */
  pendente: string;
  cor: string;
  vazio: string;
}

/** Quantos ajudantes cabem numa rota — acima disso é outra carga. */
export const MAX_AJUDANTES = 3;

export const CONFIG: Record<TipoOcorrencia, ConfigOcorrencia> = {
  falta: {
    tipo: 'falta',
    nome: 'Faltas',
    acao: 'Registrar falta',
    Icone: PackageMinus,
    temProduto: true,
    temAjudantes: true,
    temQuantidade: false,
    temFoto: false,
    conferencia: 'Aprovar',
    pendente: 'aguardando aprovação',
    cor: 'bg-erro-500/15 text-erro-600',
    vazio: 'Nenhuma falta registrada neste período.',
  },
  sobra: {
    tipo: 'sobra',
    nome: 'Sobras',
    acao: 'Registrar sobra',
    Icone: PackagePlus,
    temProduto: false,
    temAjudantes: false,
    temQuantidade: true,
    temFoto: true,
    conferencia: 'Validar',
    pendente: 'aguardando validação',
    cor: 'bg-ouro-100 text-ouro-700',
    vazio: 'Nenhuma sobra registrada neste período.',
  },
};

/** Já passou pela segunda conferência? */
export const conferida = (o: { tipo: TipoOcorrencia; aprovado_em: string | null; validado_em: string | null }) =>
  Boolean(o.tipo === 'falta' ? o.aprovado_em : o.validado_em);

/** Quantidade digitada como a operação escreve: '12' ou '1,5'. */
export function parseQtd(s: string): number | null {
  const n = Number(String(s).trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const fmtQtd = (n: number | null) =>
  n == null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** '65696' + '48UNID' -> '65696/48UNID', como a operação escreve. */
export const produtoTexto = (produto: string | null, embalagem: string | null) =>
  [produto, embalagem].filter(Boolean).join('/');

/** Placa aceita com ou sem traço; guarda em maiúsculas e sem espaço sobrando. */
export const normPlaca = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');

export const normNome = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

/** Teto do que vai para o banco: acima disto a foto é recomprimida mais forte. */
const LIMITE_BYTES = 900_000;

/**
 * Reduz a foto no próprio navegador antes de gravar.
 *
 * Foto de celular chega com 3–8 MB, o que não cabe bem numa coluna de texto e
 * demora para subir no 4G do depósito. 1280px no lado maior mantém legível o
 * que interessa (rótulo, lote, volume) e cai para algo perto de 150 KB.
 *
 * `imageOrientation: 'from-image'` respeita o EXIF — sem isso, foto tirada em
 * pé aparece deitada.
 */
export async function comprimirFoto(file: File, maxLado = 1280): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Isso não é uma imagem. Tire a foto ou escolha um arquivo de imagem.');
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));

  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new Error('Não consegui preparar a foto neste navegador.');
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  // se ainda vier grande (foto muito detalhada), aperta a qualidade em vez de
  // recusar — quem está no depósito não vai ficar editando imagem
  for (const qualidade of [0.7, 0.5, 0.35]) {
    const dados = tela.toDataURL('image/jpeg', qualidade);
    if (dados.length <= LIMITE_BYTES) return dados;
  }
  throw new Error('A foto ficou grande demais mesmo depois de reduzir. Tente outra foto.');
}

/** '2026-08-21' -> '21/08/2026' */
export const fmtData = (iso: string) => {
  const [a, m, d] = String(iso ?? '').split('-');
  return d ? `${d}/${m}/${a}` : (iso ?? '');
};
