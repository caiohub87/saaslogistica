/** Um pedido do "Relatório de Entregas" já normalizado. */

import type { Categoria } from '@/lib/produtividade';

export interface Pedido {
  dataSaida: string;      // 'dd-mm-aaaa', como vem do ERP
  carga: string;          // Número da Carga ERP — o LOTE
  romaneio: string;
  motorista: string;
  aj1: string; aj2: string; aj3: string; aj4: string;
  rota: string;
  cliente: string;
  codcli: string;
  pedido: string;
  /**
   * Número da nota fiscal do pedido. Fica '' quando o relatório exportado não
   * trouxe a coluna — o Fusion permite montar a exportação sem ela, então a
   * tela precisa saber mostrar o pedido mesmo sem NF.
   */
  notaFiscal: string;
  cidade: string;
  regiao: string;
  placa: string;
  peso: number;
  valor: number;
  status: string;         // como veio
  stl: string;            // status em minúsculas e sem acento
  cat: Categoria;
  motivo: string;
  checkin: string;
  checkout: string;
  leadtime: string;
}

export interface MetaRelatorio {
  arquivo: string;
  carregadoEm: string;
  pedidos: number;
  /**
   * Formato dos pedidos gravados. A base fica no localStorage e volta como foi
   * lida, então campo acrescentado ao Pedido depois fica vazio numa base velha
   * — sem nada na tela explicando o porquê. Comparar isto com VERSAO_BASE é o
   * que permite avisar em vez de mostrar coluna vazia.
   *
   * Ausente nas bases gravadas antes desta checagem: tratar como versão 1.
   */
  versao?: number;
  /**
   * O arquivo importado tinha coluna de nota fiscal? Separa "sua base é
   * velha, reimporte" de "esta exportação não traz NF" — que se resolvem de
   * formas diferentes.
   */
  temNotaFiscal?: boolean;
}
