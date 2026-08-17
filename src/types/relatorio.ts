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
}
