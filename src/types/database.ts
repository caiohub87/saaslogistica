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
}

export interface Inventario {
  id: number;
  unidade: string;
  fornecedor: string;
  data_inventario: string;
  valor_estoque: number;
  produtos: ProdutoInventario[];
  /** null = aguardando aprovação do gerente */
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
}

// ---------- faltas e sobras ----------

export type TipoOcorrencia = 'falta' | 'sobra';

export interface Motorista {
  id: number;
  unidade: string;
  nome: string;
  ativo: boolean;
  criado_em: string;
}

export interface Ocorrencia {
  id: number;
  unidade: string;
  tipo: TipoOcorrencia;
  data: string;
  lote: string;
  /** só falta: código do produto e a embalagem ('65696' · '48UNID') */
  produto: string | null;
  embalagem: string | null;
  /** texto, não vínculo: o registro não muda se o cadastro mudar depois */
  motorista: string;
  placa: string | null;
  /** só sobra: a foto embutida como data:image/jpeg;base64 */
  foto: string | null;
  obs: string | null;
  registrado_por: string | null;
  registrado_por_id: string | null;
  criado_em: string;
}
