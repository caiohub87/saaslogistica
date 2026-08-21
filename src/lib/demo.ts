'use client';

import { paraISO } from '@/lib/produtividade';
import type {
  Agendamento, Inventario, Motorista, Ocorrencia, ProdutoInventario, StatusAgendamento,
  TipoAgendamento, TipoOcorrencia, Usuario,
} from '@/types/database';
import type { Pedido } from '@/types/relatorio';

/**
 * Acesso de demonstracao — entra sem login para construir as telas.
 *
 * Existe SO em desenvolvimento. Em producao (`next build`/`next start`) o
 * NODE_ENV vira 'production', `demoDisponivel` fica falso e nada disto
 * funciona: nem o botao aparece, nem a sessao salva e aceita. Assim a porta
 * nao vai junto se este codigo for para o ar por engano.
 *
 * A pessoa fictícia entra como administrador para que todas as telas fiquem
 * visiveis durante a migracao. Escrever no banco continua dependendo da RLS,
 * que exige um login de verdade — ou seja, na demonstracao as telas abrem e
 * calculam, mas o Supabase recusa gravar. E o comportamento desejado.
 */
export const demoDisponivel = process.env.NODE_ENV === 'development';

const CHAVE = 'gl:demo';

export const USUARIO_DEMO: Usuario = {
  id: '00000000-0000-0000-0000-000000000000',
  unidade: 'Dilnor',
  nome: 'Demonstração',
  cargo: 'Modo de demonstração',
  admin: true,
  ativo: true,
  criado_em: new Date().toISOString(),
};

export function demoLigado(): boolean {
  if (!demoDisponivel || typeof window === 'undefined') return false;
  return sessionStorage.getItem(CHAVE) === '1';
}

/** Guarda em sessionStorage: fecha a aba, acaba a demonstracao. */
export function ligarDemo() {
  if (!demoDisponivel) return;
  sessionStorage.setItem(CHAVE, '1');
}

export function desligarDemo() {
  if (typeof window !== 'undefined') sessionStorage.removeItem(CHAVE);
}

/* ------------------------------------------------------------------ dados de exemplo
 * A demonstracao existe para construir e conferir as telas, entao precisa ter o que
 * mostrar. Os numeros abaixo sao os da planilha real da gerencia (maio/2026), o que
 * permite conferir a olho se a tela bate com o relatorio dela:
 *
 *   CANOINHAS    69.137,00  97,56%  1.037,00    649,00   388,00   0,56%
 *   NUTRIMENTAL  69.137,00  96,82%  1.063,00  1.135,00   -72,00  -0,10%
 *   MAIO        138.274,00  97,19%  2.100,00  1.784,00   316,00   0,23%
 *
 * Nada disto e gravado: some ao fechar a aba.
 */
function produtos(entrada: number, saida: number, itens: number): ProdutoInventario[] {
  const lista: ProdutoInventario[] = [];
  for (let i = 0; i < itens; i++) {
    lista.push({
      id: String(100000 + i),
      descricao: `PRODUTO DE EXEMPLO ${i + 1}`,
      embalagem: 'UN/24',
      sld_estoq: 100 + i,
      sld_contagem: 100 + i,
      dif_qtde: 0,
      dif_financeira: 0,
    });
  }
  // uma sobra e uma falta, para os totais fecharem com a planilha
  lista[0] = { ...lista[0], sld_contagem: lista[0].sld_estoq + 1, dif_qtde: 1, dif_financeira: entrada };
  lista[1] = { ...lista[1], sld_contagem: lista[1].sld_estoq - 1, dif_qtde: -1, dif_financeira: -saida };
  return lista;
}

const inv = (
  id: number, fornecedor: string, data: string, est: number,
  entrada: number, saida: number, itens: number,
  aprovado?: string,
): Inventario => ({
  id, unidade: 'Dilnor', fornecedor, data_inventario: data, valor_estoque: est,
  produtos: produtos(entrada, saida, itens),
  aprovado_por: aprovado ?? null,
  aprovado_em: aprovado ? '2026-05-20T14:30:00.000Z' : null,
  created_at: new Date().toISOString(),
});

/** Motoristas de exemplo — a lista de verdade é cadastrada na própria tela. */
export function motoristasDemo(): Motorista[] {
  return ['ANTONIO CARLOS', 'FRANCISCO DAS CHAGAS', 'JOSE RIBAMAR', 'PAULO SERGIO', 'RAIMUNDO NONATO']
    .map((nome, i) => ({
      id: 9100 + i, unidade: 'Dilnor', nome, ativo: true,
      criado_em: new Date().toISOString(),
    }));
}

/** Faltas e sobras de exemplo. Sem foto: a do demo viria embutida no código. */
export function ocorrenciasDemo(tipo: TipoOcorrencia): Ocorrencia[] {
  const dia = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  let seq = 9200;
  const mk = (
    data: string, lote: string, motorista: string, placa: string,
    produto: string | null, embalagem: string | null, obs = '',
  ): Ocorrencia => ({
    id: seq++, unidade: 'Dilnor', tipo, data, lote, produto, embalagem,
    motorista, placa, foto: null, obs: obs || null,
    registrado_por: 'Demonstração', registrado_por_id: null,
    criado_em: new Date().toISOString(),
  });

  return tipo === 'falta'
    ? [
      mk(dia(0), '96661', 'ANTONIO CARLOS', 'OEY 8503', '65696', '48UNID'),
      mk(dia(-1), '96540', 'JOSE RIBAMAR', 'NQB 4C56', '70112', '12UNID', 'cliente recusou o volume'),
      mk(dia(-3), '96488', 'PAULO SERGIO', 'OGD 2E34', '65210', '24UNID'),
    ]
    : [
      mk(dia(0), '96526', 'FRANCISCO DAS CHAGAS', 'NQC 2532', null, null),
      mk(dia(-2), '96501', 'RAIMUNDO NONATO', 'MYY 5F67', null, null, 'voltou sem etiqueta'),
    ];
}

/** Agendamentos de exemplo, ancorados na semana de hoje para os selos aparecerem. */
export function agendamentosDemo(tipo: TipoAgendamento): Agendamento[] {
  const dia = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  let seq = 8000;
  const mk = (
    data: string, status: StatusAgendamento,
    nome: string, secundario: string, obs = '', hora: string | null = null,
  ): Agendamento => ({
    id: seq++, unidade: 'Dilnor', tipo, data, hora,
    cliente: tipo === 'enviar' ? nome : null,
    rota: tipo === 'enviar' ? secundario : null,
    fornecedor: tipo === 'receber' ? nome : null,
    volumes: tipo === 'receber' ? secundario : null,
    status, obs: obs || null, created_at: new Date().toISOString(),
  });

  if (tipo === 'enviar') {
    return [
      mk(dia(-3), 'Agendado', 'NUTRIMENTAL', 'São Paulo', 'ficou de trás — cobrar'),
      mk(dia(0), 'Agendado', 'J. MACEDO', 'Fortaleza', 'carga urgente'),
      mk(dia(0), 'Montado', 'COLGATE', 'Recife'),
      mk(dia(0), 'Agendado', 'MARILAN', 'Natal'),
      mk(dia(1), 'Agendado', 'FALCON', 'Salvador', 'entrega em 2 parcelas'),
      mk(dia(2), 'Agendado', 'CIA CANOINHAS', 'Teresina'),
      mk(dia(5), 'Enviado', 'ADL', 'São Luís'),
      mk(dia(-8), 'Cancelado', 'VITAO', 'Maceió', 'cliente cancelou'),
    ];
  }
  return [
    mk(dia(-2), 'Agendado', 'ENERGIZER', '30 volumes', 'conferir avaria', '09:00'),
    mk(dia(0), 'Agendado', 'MARILAN', '50 volumes', '', '14:00'),
    mk(dia(0), 'Recebido', 'GRENDENE', '18 volumes', '', '08:30'),
    mk(dia(1), 'Agendado', 'ONTEX', '120 volumes', 'carreta fechada', '10:00'),
    mk(dia(4), 'Agendado', 'CONSERVA ODERICH', '64 volumes', '', '16:00'),
    mk(dia(-6), 'Recebido', 'SANTA MARIA', '22 volumes', '', '11:00'),
  ];
}

/**
 * Relatorio de exemplo: cargas com desempenhos diferentes de proposito, para a
 * tela mostrar as quatro faixas (100%, azul, laranja e vermelha).
 */
export function pedidosDemo() {
  const MOT = ['ANTONIO CARLOS', 'JOSE RIBAMAR', 'FRANCISCO DAS CHAGAS', 'RAIMUNDO NONATO',
    'PAULO SERGIO', 'MARCOS AURELIO', 'JOAO BATISTA', 'LUIS FERNANDO'];
  const AJU = ['EDVAN SOUSA', 'CLEITON ALVES', 'WELLINGTON DIAS', 'ROBSON LIMA',
    'VALDENIO ANTONIO', 'GILVAN COSTA'];
  const ROTAS = ['CENTRO', 'ZONA SUL', 'INTERIOR', 'LITORAL', 'ZONA NORTE'];
  const CLI = ['SUPERMERCADO SAO LUIS', 'MERCADINHO BOA VISTA', 'ATACADAO CENTRAL',
    'MERCEARIA DO JOAO', 'REDE COMPRE BEM', 'DISTRIBUIDORA NORTE'];

  // 5 dias úteis terminando na sexta desta semana
  const dias: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda desta semana
  for (let i = 0; i < 5; i++) {
    const x = new Date(d); x.setDate(d.getDate() + i);
    dias.push(`${String(x.getDate()).padStart(2, '0')}-${String(x.getMonth() + 1).padStart(2, '0')}-${x.getFullYear()}`);
  }

  // quantos pedidos falham em cada carga — define a faixa que ela cai
  const perfis = [0, 0, 0, 1, 1, 2, 3, 5];
  const pedidos: Pedido[] = [];
  let nCarga = 94800;

  dias.forEach((data, di) => {
    for (let c = 0; c < 6; c++) {
      const carga = String(nCarga++);
      const mot = MOT[(di * 6 + c) % MOT.length];
      const a1 = AJU[(di * 3 + c) % AJU.length];
      const a2 = c % 3 === 0 ? AJU[(di * 3 + c + 2) % AJU.length] : '';
      const rota = ROTAS[c % ROTAS.length];
      const agreg = c === 5;
      const qtd = 8 + ((di + c) % 9);
      const falhas = perfis[(di + c) % perfis.length];
      // uma carga por dia é de CLIENTE ÚNICO (cliente grande) — é o caso em que
      // a tela libera acrescentar ajudante na mão
      const clienteUnico = c === 2;

      for (let i = 0; i < qtd; i++) {
        let status = 'Entregue';
        if (i < falhas) status = i % 3 === 0 ? 'Reentrega' : i % 3 === 1 ? 'Devolvido' : 'Devolvido Parcial';
        const stl = status.toLowerCase();
        pedidos.push({
          dataSaida: data, carga, romaneio: 'R' + carga,
          motorista: mot, aj1: a1, aj2: a2, aj3: '', aj4: '',
          rota,
          cliente: clienteUnico ? 'REDE COMPRE BEM' : CLI[(i + c) % CLI.length],
          codcli: clienteUnico ? '2050' : String(1000 + ((i * 7 + c) % 400)),
          pedido: `${carga}-${i + 1}`, cidade: 'SAO LUIS', regiao: 'MA',
          placa: agreg ? 'AGREG' : ['OEY1A23', 'NQB4C56', 'NQC7D89', 'OGD2E34', 'MYY5F67'][c % 5],
          peso: 180 + ((i * 37 + c * 13) % 520),
          valor: 900 + ((i * 211 + c * 97) % 4200),
          status, stl,
          cat: stl === 'entregue' ? 'entregue'
            : stl === 'reentrega' ? 'reentrega'
              : stl.startsWith('devolvido') ? 'devolvido' : 'pendente',
          motivo: status === 'Reentrega' ? 'Tempo insuficiente'
            : status.startsWith('Devolvido') ? 'Cliente não fez pedido' : '',
          checkin: '', checkout: '', leadtime: '',
        });
      }
    }
  });
  return pedidos;
}

/** Premiações já salvas, para a tela de Salvos e a média semanal terem o que mostrar. */
export function premiacoesDemo() {
  const cargas = montarCargasDemo();
  return cargas.map((c, i) => {
    const equipe = c.equipe.map((p) => ({ ...p, valor: c.pagar ? p.valor : 0 }));
    const mot = equipe.find((p) => p.tipo === 'mot');
    const ajus = equipe.filter((p) => p.tipo === 'aju');
    return {
      id: 7000 + i, unidade: 'Dilnor',
      // ISO, igual ao que vem do banco (coluna `date`) — o relatório é que usa dd-mm-aaaa
      data_saida: paraISO(c.data) ?? c.data, carga: c.carga,
      motorista: mot?.nome ?? null, aj1: ajus[0]?.nome ?? null, aj2: ajus[1]?.nome ?? null,
      prod_final: c.prod, faixa: c.faixa, pagar: c.pagar,
      valor_mot: mot?.valor ?? 0, valor_aj1: ajus[0]?.valor ?? 0, valor_aj2: ajus[1]?.valor ?? 0,
      equipe, created_at: new Date().toISOString(),
    };
  });
}

/** Deriva as cargas de exemplo do mesmo relatório fictício, para os números fecharem. */
function montarCargasDemo() {
  const peds = pedidosDemo();
  const porCarga: Record<string, Pedido[]> = {};
  peds.forEach((p) => { (porCarga[p.carga] ??= []).push(p); });

  return Object.entries(porCarga).map(([carga, ps], i) => {
    const peso = ps.reduce((a, p) => a + p.peso, 0);
    let falhaQtd = 0, falhaPeso = 0;
    ps.forEach((p) => {
      const ent = p.stl === 'entregue', parc = p.stl === 'devolvido parcial';
      if (!ent && !parc) { falhaQtd++; falhaPeso += p.peso; }
      else if (parc) falhaPeso += p.peso * 0.5;
    });
    const prodQtd = Math.max(0, 1 - falhaQtd / ps.length);
    const prodPeso = peso > 0 ? Math.max(0, 1 - falhaPeso / peso) : 0;
    const prod = (prodQtd + prodPeso) / 2;
    const pct = prod * 100;
    const tier = pct >= 99.995 ? 0 : pct >= 90 ? 1 : pct >= 80 ? 2 : 3;
    const faixa = ['100%', '≥90%', '80–90%', '<80%'][tier];
    const agreg = ps[0].placa === 'AGREG';
    const vMot = agreg ? [20, 0, 0, 0][tier] : [35, 25, 10, 0][tier];
    const vAju = agreg ? [20, 15, 10, 0][tier] : [15, 10, 5, 0][tier];

    const equipe: { chave: string; nome: string; tipo: 'mot' | 'aju'; cargo: string; valor: number }[] = [];
    if (ps[0].motorista) equipe.push({
      chave: ps[0].motorista, nome: ps[0].motorista, tipo: 'mot',
      cargo: agreg ? 'Motorista Agregado' : 'Motorista de Praça', valor: vMot,
    });
    [...new Set([ps[0].aj1, ps[0].aj2].filter(Boolean))].forEach((a) => equipe.push({
      chave: a, nome: a, tipo: 'aju',
      cargo: agreg ? 'Ajudante de Praça (Agregado)' : 'Ajudante de Praça', valor: vAju,
    }));

    return { carga, data: ps[0].dataSaida, prod, faixa, equipe, pagar: i % 11 !== 0 };
  });
}

export const INVENTARIOS_DEMO: Inventario[] = [
  inv(9001, 'CANOINHAS', '2026-05-18', 69137, 1037, 649, 82, 'Regigledson'),
  inv(9002, 'NUTRIMENTAL', '2026-05-18', 69137, 1063, 1135, 63),
  inv(9003, 'COLGATE', '2026-06-15', 120000, 2500, 900, 105),
  inv(9004, 'COLGATE', '2026-04-20', 118000, 3100, 2400, 98, 'Regigledson'),
  inv(9005, 'MARILAN', '2026-06-22', 95000, 840, 1620, 47),
];
