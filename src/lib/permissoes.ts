/**
 * Catalogo de telas e acoes — espelha a tabela app_telas do banco.
 *
 * Ficar em codigo (alem do banco) permite ao menu e aos botoes decidirem o que
 * mostrar sem esperar uma consulta, e da autocomplete/erro de digitacao no
 * editor. O banco continua sendo a autoridade: a RLS decide de verdade.
 */

export type Acao = 'ver' | 'importar' | 'salvar' | 'editar' | 'excluir' | 'aprovar' | 'lancar' | 'exportar' | 'imprimir';

export interface Tela {
  chave: string;
  nome: string;
  grupo: string;
  rota: string;
  acoes: Acao[];
  /** Texto curto que explica a tela na administracao de acessos. */
  descricao: string;
  /**
   * Ja existe aqui no sistema novo? As que ainda estao no index.html antigo
   * aparecem no menu desativadas, com o selo "em breve" — sem isso o menu
   * oferece rotas que caem no 404. Marcar true ao migrar a tela.
   */
  migrada?: boolean;
}

export const TELAS: Tela[] = [
  { chave: 'inicio', nome: 'Início', grupo: 'Operação', rota: '/', acoes: ['ver'],
    descricao: 'Painel com o resumo do dia e atalhos.', migrada: true },
  { chave: 'analise', nome: 'Análise de Entregas', grupo: 'Operação', rota: '/analise', acoes: ['ver', 'importar'],
    descricao: 'Importa o relatório do Fusion e mostra as entregas por carga.' , migrada: true },
  { chave: 'produtividade', nome: 'Produtividade', grupo: 'Operação', rota: '/produtividade', acoes: ['ver', 'salvar', 'exportar'],
    descricao: 'Calcula o desempenho das cargas e grava a premiação.' , migrada: true },
  { chave: 'salvos', nome: 'Premiações salvas', grupo: 'Operação', rota: '/salvos', acoes: ['ver', 'exportar', 'excluir'],
    descricao: 'Histórico do que já foi premiado. Antes pedia a senha 1987.' , migrada: true },

  { chave: 'escala', nome: 'Escala', grupo: 'Equipe', rota: '/escala', acoes: ['ver', 'editar', 'salvar', 'imprimir'],
    descricao: 'Monta a grade de carregamento, o rascunho e imprime a portaria.' },
  { chave: 'escalasalvas', nome: 'Escalas salvas', grupo: 'Equipe', rota: '/escalas-salvas', acoes: ['ver', 'imprimir'],
    descricao: 'Consulta escalas de dias anteriores e busca por placa.' },
  { chave: 'diarias', nome: 'Diárias', grupo: 'Equipe', rota: '/diarias', acoes: ['ver', 'exportar'],
    descricao: 'Histórico de diárias pagas por pessoa.' },
  { chave: 'equipe', nome: 'Disponibilidade', grupo: 'Equipe', rota: '/equipe', acoes: ['ver', 'editar'],
    descricao: 'Quem está disponível, de férias, viajando ou afastado.' },

  { chave: 'agendamentos', nome: 'Cargas a Enviar', grupo: 'Planejamento', rota: '/agendamentos', acoes: ['ver', 'editar', 'excluir', 'imprimir'],
    descricao: 'Agenda do montador de cargas.' , migrada: true },
  { chave: 'recebimentos', nome: 'Cargas a Receber', grupo: 'Planejamento', rota: '/recebimentos', acoes: ['ver', 'editar', 'excluir', 'imprimir'],
    descricao: 'Agenda do depósito. Antes pedia a senha 1609.' , migrada: true },

  { chave: 'inventario', nome: 'Inventário', grupo: 'Estoque', rota: '/inventario', acoes: ['ver', 'lancar', 'excluir', 'aprovar', 'exportar'],
    descricao: 'Conferência por fornecedor. "Aprovar" era a senha do gerente (79513).', migrada: true },

  { chave: 'cadastros', nome: 'Cadastros', grupo: 'Administração', rota: '/cadastros', acoes: ['ver', 'editar'],
    descricao: 'Tabela de premiação e tipo de operação de cada pessoa.' },
  { chave: 'config', nome: 'Configurações', grupo: 'Administração', rota: '/configuracoes', acoes: ['ver', 'editar'],
    descricao: 'Metas, horário de corte e regras de apuração.' },
  { chave: 'usuarios', nome: 'Usuários e acessos', grupo: 'Administração', rota: '/usuarios', acoes: ['ver', 'editar'],
    descricao: 'Cadastra pessoas e define o que cada uma enxerga.', migrada: true },

  { chave: 'desempenho', nome: 'Meu Desempenho', grupo: 'Pessoal', rota: '/meu-desempenho', acoes: ['ver'],
    descricao: 'Cada pessoa consulta o próprio histórico e ranking.' },
];

export const TELA_POR_CHAVE = Object.fromEntries(TELAS.map((t) => [t.chave, t])) as Record<string, Tela>;

/** Rotulo amigavel de cada acao, usado na tela de acessos. */
export const ACAO_LABEL: Record<Acao, string> = {
  ver: 'Ver',
  importar: 'Importar',
  salvar: 'Salvar',
  editar: 'Editar',
  excluir: 'Excluir',
  aprovar: 'Aprovar',
  lancar: 'Lançar',
  exportar: 'Exportar',
  imprimir: 'Imprimir',
};

/** Explica o peso de cada acao — evita dar 'excluir' sem perceber. */
export const ACAO_PESO: Record<Acao, 'leve' | 'media' | 'forte'> = {
  ver: 'leve',
  imprimir: 'leve',
  exportar: 'leve',
  importar: 'media',
  lancar: 'media',
  editar: 'media',
  salvar: 'media',
  aprovar: 'forte',
  excluir: 'forte',
};

/** Permissoes de uma pessoa: { inventario: ['ver','lancar'], ... } */
export type MapaPermissoes = Record<string, Acao[]>;

/** Perfis prontos, para o administrador nao marcar tudo na mao. */
export interface Perfil {
  id: string;
  nome: string;
  descricao: string;
  permissoes: MapaPermissoes;
}

export const PERFIS: Perfil[] = [
  {
    id: 'operacao',
    nome: 'Operação',
    descricao: 'Acompanha entregas e produtividade, sem mexer em pagamento.',
    permissoes: {
      inicio: ['ver'],
      analise: ['ver', 'importar'],
      produtividade: ['ver'],
      escalasalvas: ['ver', 'imprimir'],
      desempenho: ['ver'],
    },
  },
  {
    id: 'escala',
    nome: 'Escala / Tráfego',
    descricao: 'Monta a escala do dia, imprime portaria e vê a equipe.',
    permissoes: {
      inicio: ['ver'],
      analise: ['ver'],
      escala: ['ver', 'editar', 'salvar', 'imprimir'],
      escalasalvas: ['ver', 'imprimir'],
      equipe: ['ver', 'editar'],
      diarias: ['ver'],
      agendamentos: ['ver', 'editar', 'imprimir'],
      desempenho: ['ver'],
    },
  },
  {
    id: 'deposito',
    nome: 'Depósito',
    descricao: 'Recebimentos e lançamento de inventário, sem aprovar.',
    permissoes: {
      inicio: ['ver'],
      recebimentos: ['ver', 'editar', 'imprimir'],
      inventario: ['ver', 'lancar', 'exportar'],
      desempenho: ['ver'],
    },
  },
  {
    id: 'gerencia',
    nome: 'Gerência',
    descricao: 'Enxerga tudo e aprova inventário. Não administra usuários.',
    permissoes: {
      inicio: ['ver'],
      analise: ['ver', 'importar'],
      produtividade: ['ver', 'salvar', 'exportar'],
      salvos: ['ver', 'exportar'],
      escala: ['ver', 'editar', 'salvar', 'imprimir'],
      escalasalvas: ['ver', 'imprimir'],
      diarias: ['ver', 'exportar'],
      equipe: ['ver', 'editar'],
      agendamentos: ['ver', 'editar', 'excluir', 'imprimir'],
      recebimentos: ['ver', 'editar', 'excluir', 'imprimir'],
      inventario: ['ver', 'lancar', 'aprovar', 'exportar'],
      cadastros: ['ver', 'editar'],
      config: ['ver'],
      desempenho: ['ver'],
    },
  },
  {
    id: 'motorista',
    nome: 'Motorista / Ajudante',
    descricao: 'Só o próprio desempenho.',
    permissoes: { desempenho: ['ver'] },
  },
];

/** Confere uma permissao no cliente (o banco confere de novo, via RLS). */
export function pode(perm: MapaPermissoes | null, admin: boolean, tela: string, acao: Acao = 'ver'): boolean {
  if (admin) return true;
  return Boolean(perm?.[tela]?.includes(acao));
}
