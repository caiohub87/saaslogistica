/** Tipos que espelham as tabelas do Supabase. */

import type { Acao } from '@/lib/permissoes';

export type Unidade = 'Dilnor' | 'Nordece';

export interface Usuario {
  id: string;
  unidade: Unidade;
  nome: string;
  cargo: string | null;
  admin: boolean;
  ativo: boolean;
  criado_em: string;
}

export interface UsuarioPermissao {
  usuario_id: string;
  tela: string;
  acoes: Acao[];
}

/** Usuario + permissoes, como a tela de acessos usa. */
export interface UsuarioComAcessos extends Usuario {
  permissoes: Record<string, Acao[]>;
  email?: string | null;
}

// ---------- tabelas que ja existiam ----------

export interface Premiacao {
  id: number;
  unidade: string;
  data_saida: string;
  carga: string;
  motorista: string | null;
  aj1: string | null;
  aj2: string | null;
  tipo: string | null;
  prod_final: number | null;
  faixa: string | null;
  pagar: boolean;
  valor_mot: number;
  valor_aj1: number;
  valor_aj2: number;
  problemas: unknown[];
  created_at: string;
}

export interface LinhaEscala {
  lote?: string; rota?: string; ent?: string; pent?: string; ree?: string; pree?: string;
  mot?: string; aj1?: string; aj2?: string; veic?: string; dia?: string; ext?: string; obs?: string;
}

export interface Escala {
  id: number;
  unidade: string;
  data_saida: string;
  data_carrego: string | null;
  linhas: LinhaEscala[];
  created_at: string;
}

export type StatusEquipe = 'disponivel' | 'ferias' | 'viajando' | 'afastado' | 'folga';

export interface EquipeStatus {
  id: number;
  unidade: string;
  nome: string;
  tipo: 'motorista' | 'ajudante' | null;
  status: StatusEquipe;
}

export interface Diaria {
  id: number;
  unidade: string;
  data_saida: string;
  nome: string;
  funcao: string | null;
  veiculo: string | null;
  lote: string | null;
  valor: number;
  created_at: string;
}

export type TipoAgendamento = 'enviar' | 'receber';
export type StatusAgendamento = 'Agendado' | 'Montado' | 'Enviado' | 'Recebido' | 'Cancelado';

export interface Agendamento {
  id: number;
  unidade: string;
  tipo: TipoAgendamento;
  data: string;
  hora: string | null;
  cliente: string | null;
  rota: string | null;
  fornecedor: string | null;
  volumes: string | null;
  status: StatusAgendamento;
  obs: string | null;
  created_at: string;
}

export interface ProdutoInventario {
  id: string;
  descricao: string;
  embalagem: string;
  sld_estoq: number;
  sld_contagem: number;
  dif_qtde: number;
  dif_financeira: number;
  /**
   * Só no corte: o "Id Fabricante" que veio na linha, sem os zeros à esquerda.
   * É ele que decidiu em qual fornecedor o produto caiu.
   */
  fabricante?: string;
  /** Só no corte: a razão social da mesma linha — identifica código novo. */
  razao_social?: string;
}

/**
 * normal — um arquivo, um fornecedor, contagem completa.
 * corte  — um arquivo com vários fornecedores, separados por Id Fabricante.
 */
export type TipoInventario = 'normal' | 'corte';

export interface Inventario {
  id: number;
  unidade: string;
  fornecedor: string;
  data_inventario: string;
  valor_estoque: number;
  produtos: ProdutoInventario[];
  /**
   * Linhas gravadas antes de 15_inventario_corte.sql não têm a coluna;
   * quem lê deve tratar a ausência como 'normal'.
   */
  tipo: TipoInventario;
  /** null = aguardando aprovação do gerente */
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
}

// ---------- controle de validade ----------

/** Uma linha da "Relação Preventiva de Validade": um lote num endereço. */
export interface ItemValidade {
  id: number;
  unidade: string;
  produto_id: string;
  descricao: string;
  endereco: string;
  emb_padrao: number | null;
  qtd_cx: number | null;
  qtd_un: number | null;
  validade: string;
  /** como o WMS calculou no dia do relatório; negativo = já venceu */
  dias: number | null;
  observacao: string | null;
  lido_em: string;
}

/**
 * Quanto vai escoar em qual prazo. O período é decisão de quem olha o
 * depósito — não sai da validade do lote.
 */
export interface RegistroValidade {
  id: number;
  unidade: string;
  produto_id: string;
  endereco: string;
  quantidade: number;
  periodo: 30 | 60 | 90 | 120;
  /** a validade copiada do item quando o registro foi feito */
  vencimento: string | null;
  obs: string | null;
  registrado_por: string | null;
  registrado_por_id: string | null;
  criado_em: string;
}

/**
 * De quem é cada SKU. O PDF de validade não traz fabricante, então o vínculo
 * é deduzido dos inventários já lançados ou escolhido à mão.
 */
export interface ProdutoFornecedor {
  unidade: string;
  produto_id: string;
  fornecedor: string;
  origem: 'corte' | 'manual';
  atualizado_em: string;
}

// ---------- faltas e sobras ----------

export type TipoOcorrencia = 'falta' | 'sobra';

export type FuncaoEquipe = 'motorista' | 'ajudante';

/**
 * Quem sai na rota — motoristas e ajudantes na mesma lista.
 * A tabela ainda se chama `motoristas`: nasceu só com eles.
 */
export interface PessoaEquipe {
  id: number;
  unidade: string;
  nome: string;
  funcao: FuncaoEquipe;
  ativo: boolean;
  criado_em: string;
}

/**
 * Um veículo da frota. A placa escolhida ao registrar é gravada como texto na
 * ocorrência — este cadastro só alimenta a lista de opções.
 */
export interface Veiculo {
  id: number;
  unidade: string;
  placa: string;
  ativo: boolean;
  criado_em: string;
}

export interface Ocorrencia {
  id: number;
  unidade: string;
  tipo: TipoOcorrencia;
  data: string;
  lote: string;
  /**
   * Código do produto e embalagem ('65696' · '48UNID').
   * Na falta vem no registro; na sobra só aparece na validação — é o que
   * identifica o que voltou.
   */
  produto: string | null;
  embalagem: string | null;
  /**
   * Nome do produto no momento do registro — achado nos inventários pelo código
   * ou digitado à mão. Null nos registros anteriores a esta coluna.
   */
  descricao: string | null;
  /** só sobra: quanto voltou */
  quantidade: number | null;
  /** texto, não vínculo: o registro não muda se o cadastro mudar depois */
  motorista: string;
  /** só falta: até 3, conforme a rota do dia */
  ajudantes: string[];
  placa: string | null;
  /** só sobra: a foto embutida como data:image/jpeg;base64 */
  foto: string | null;
  obs: string | null;
  registrado_por: string | null;
  registrado_por_id: string | null;
  /** só falta: null enquanto aguarda a aprovação */
  aprovado_por: string | null;
  aprovado_em: string | null;
  /** só sobra: null enquanto ninguém identificou o produto */
  validado_por: string | null;
  validado_em: string | null;
  criado_em: string;
}
