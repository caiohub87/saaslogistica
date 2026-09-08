'use client';

import { CalendarClock, ClipboardList, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Lancar } from '@/components/validade/Lancar';
import { Visao } from '@/components/validade/Visao';
import { getSupabase } from '@/lib/supabase';
import { fornecedoresPorProduto, type LinhaValidade } from '@/lib/validade';
import { useSessao } from '@/providers/SessionProvider';
import type {
  Inventario, ItemValidade, ProdutoFornecedor, RegistroValidade,
} from '@/types/database';
import { cn } from '@/utils/cn';

type Aba = 'lancar' | 'visao';
const ABAS: { id: Aba; nome: string; Icone: typeof ClipboardList }[] = [
  { id: 'lancar', nome: 'Lançar', Icone: ClipboardList },
  { id: 'visao', nome: 'Visão', Icone: CalendarClock },
];

const dica = (msg: string) => (/relation|does not exist|column|schema cache/i.test(msg)
  ? ' — rode o SQL 16_validade.sql no Supabase.'
  : /permission|policy|row-level/i.test(msg)
    ? ' — seu acesso não tem permissão para isso.'
    : '');

export default function ValidadePage() {
  const { pode, demo, usuario } = useSessao();
  const podeLancar = pode('validade', 'lancar');
  const podeExcluir = pode('validade', 'excluir');
  const unidade = usuario?.unidade ?? 'Dilnor';

  const [aba, setAba] = useState<Aba>('lancar');
  const [itens, setItens] = useState<ItemValidade[]>([]);
  const [registros, setRegistros] = useState<RegistroValidade[]>([]);
  /** produto_id -> fornecedor, já com o manual sobrepondo o deduzido */
  const [fornecedores, setFornecedores] = useState<Record<string, string>>({});
  /** os SKU que acabaram no depósito */
  const [zerados, setZerados] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    if (demo) {
      const { VALIDADE_DEMO } = await import('@/lib/demo');
      setItens(VALIDADE_DEMO.itens);
      setRegistros(VALIDADE_DEMO.registros);
      setFornecedores(VALIDADE_DEMO.fornecedores);
      setZerados(new Set(VALIDADE_DEMO.zerados));
      setErro(null); setCarregando(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }

    const [i, r, f, z] = await Promise.all([
      sb.from('validade_itens').select('*').order('validade').limit(5000),
      sb.from('validade_registros').select('*').limit(5000),
      sb.from('produto_fornecedor').select('*').limit(20000),
      sb.from('validade_zerados').select('produto_id').limit(20000),
    ]);

    // zerados é acessório: se a tabela ainda não existe, a tela abre igual e
    // só o selo fica de fora — não é motivo para não mostrar a validade
    setZerados(new Set(((z.data ?? []) as { produto_id: string }[]).map((p) => p.produto_id)));

    const falha = i.error ?? r.error ?? f.error;
    if (falha) {
      setErro(falha.message + dica(falha.message));
      setItens([]); setRegistros([]); setFornecedores({});
      setCarregando(false);
      return;
    }

    setItens((i.data ?? []) as ItemValidade[]);
    setRegistros((r.data ?? []) as RegistroValidade[]);
    setFornecedores(Object.fromEntries(
      ((f.data ?? []) as ProdutoFornecedor[]).map((p) => [p.produto_id, p.fornecedor]),
    ));
    setErro(null);
    setCarregando(false);
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);

  /**
   * Descobre de quem sao os SKU do PDF olhando os inventarios ja lancados.
   *
   * Todo lancamento de inventario esta amarrado a um fornecedor e os produtos
   * dentro dele sao dele — serve tanto o normal (um fornecedor por arquivo)
   * quanto o corte (que a tela ja separou por Id Fabricante).
   *
   * Grava com origem='corte' e ignoreDuplicates: escolha feita a mao na tela
   * vence a deducao e nao pode ser sobrescrita por um upload posterior.
   */
  const deduzirFornecedores = useCallback(async (produtoIds: string[]): Promise<number> => {
    const sb = getSupabase();
    if (!sb) return 0;

    const { data, error } = await sb.from('inventarios')
      .select('fornecedor, data_inventario, produtos')
      .order('data_inventario').limit(500);
    if (error || !data?.length) return 0;

    const mapa = fornecedoresPorProduto(data as unknown as Inventario[]);
    const alvo = new Set(produtoIds);
    const linhas = Object.entries(mapa)
      .filter(([id]) => alvo.has(id))
      .map(([produto_id, fornecedor]) => ({
        unidade, produto_id, fornecedor, origem: 'corte' as const,
      }));
    if (!linhas.length) return 0;

    const { error: e2 } = await sb.from('produto_fornecedor')
      .upsert(linhas, { onConflict: 'unidade,produto_id', ignoreDuplicates: true });
    return e2 ? 0 : linhas.length;
  }, [unidade]);

  /**
   * Grava o retrato do PDF.
   *
   * UPSERT por (unidade, produto_id, endereco): o que veio no PDF novo tem os
   * numeros atualizados, o que nao veio fica como estava. Nada e apagado — o
   * relatorio e recortado por faixa de dias, e sumir da listagem nao quer dizer
   * ter sumido do deposito. Os registros de quantidade/prazo vivem em outra
   * tabela justamente para nao serem tocados aqui.
   */
  const subirPdf = useCallback(async (linhas: LinhaValidade[]): Promise<string> => {
    if (demo) throw new Error('Modo de demonstração não grava no banco. Entre com seu login para lançar.');
    const sb = getSupabase();
    if (!sb) throw new Error('Banco não configurado.');

    const { error } = await sb.from('validade_itens').upsert(
      linhas.map((l) => ({
        unidade,
        produto_id: l.produto_id,
        descricao: l.descricao,
        endereco: l.endereco,
        emb_padrao: l.emb_padrao,
        qtd_cx: l.qtd_cx,
        qtd_un: l.qtd_un,
        validade: l.validade,
        dias: l.dias,
        observacao: l.observacao || null,
        lido_em: new Date().toISOString(),
      })),
      { onConflict: 'unidade,produto_id,endereco' },
    );
    if (error) throw new Error('Não salvou: ' + error.message + dica(error.message));

    const novos = await deduzirFornecedores(linhas.map((l) => l.produto_id));
    await carregar();

    const skus = new Set(linhas.map((l) => l.produto_id)).size;
    return `${linhas.length} lotes de ${skus} produtos lidos e gravados.`
      + (novos ? ` ${novos} produto(s) tiveram o fornecedor identificado pelos inventários.` : '');
  }, [demo, unidade, carregar, deduzirFornecedores]);

  const registrar = useCallback(async (
    r: Omit<RegistroValidade, 'id' | 'criado_em'>,
  ): Promise<string | null> => {
    if (demo) return 'Modo de demonstração não grava no banco.';
    const sb = getSupabase();
    if (!sb) return 'Banco não configurado.';
    const { error } = await sb.from('validade_registros').insert({
      ...r, registrado_por_id: usuario?.id ?? null,
    });
    if (error) return 'Não salvou: ' + error.message + dica(error.message);
    await carregar();
    return null;
  }, [demo, usuario, carregar]);

  const excluirRegistro = useCallback(async (id: number): Promise<string | null> => {
    if (demo) return 'Modo de demonstração não grava no banco.';
    const sb = getSupabase();
    if (!sb) return 'Banco não configurado.';
    const { error } = await sb.from('validade_registros').delete().eq('id', id);
    if (error) return error.message + dica(error.message);
    await carregar();
    return null;
  }, [demo, carregar]);

  /**
   * Marca ou desmarca que o produto acabou.
   *
   * A linha existir É a marca — desmarcar apaga, em vez de guardar um booleano
   * falso. Menos estado para manter e o histórico de quem zerou não some.
   */
  const alternarZerado = useCallback(async (
    produtoId: string, zerar: boolean,
  ): Promise<string | null> => {
    if (demo) return 'Modo de demonstração não grava no banco.';
    const sb = getSupabase();
    if (!sb) return 'Banco não configurado.';

    const { error } = zerar
      ? await sb.from('validade_zerados').upsert({
        unidade, produto_id: produtoId,
        zerado_por: usuario?.nome ?? null, zerado_por_id: usuario?.id ?? null,
        zerado_em: new Date().toISOString(),
      }, { onConflict: 'unidade,produto_id' })
      : await sb.from('validade_zerados').delete()
        .eq('unidade', unidade).eq('produto_id', produtoId);

    if (error) {
      return error.message + (/schema cache|does not exist|relation/i.test(error.message)
        ? ' — rode supabase/24_validade_zerado.sql no Supabase.' : '');
    }
    setZerados((s) => {
      const n = new Set(s);
      if (zerar) n.add(produtoId); else n.delete(produtoId);
      return n;
    });
    return null;
  }, [demo, unidade, usuario]);

  /** Escolha manual: origem='manual' para nenhum upload futuro sobrescrever. */
  const definirFornecedor = useCallback(async (
    produtoId: string, fornecedor: string,
  ): Promise<string | null> => {
    if (demo) return 'Modo de demonstração não grava no banco.';
    const sb = getSupabase();
    if (!sb) return 'Banco não configurado.';
    const { error } = await sb.from('produto_fornecedor').upsert(
      { unidade, produto_id: produtoId, fornecedor, origem: 'manual', atualizado_em: new Date().toISOString() },
      { onConflict: 'unidade,produto_id' },
    );
    if (error) return error.message + dica(error.message);
    setFornecedores((f) => ({ ...f, [produtoId]: fornecedor }));
    return null;
  }, [demo, unidade]);

  if (!pode('validade', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver o controle de validade.</p>
      </div>
    );
  }

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <CalendarClock aria-hidden className="size-5 text-marinho-500" />
          Validade
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          A relação preventiva do WMS, organizada por prazo de escoamento. O prazo é decisão de
          quem olha o depósito — não é a validade do lote.
        </p>
      </header>

      {erro && (
        <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm text-erro-600">{erro}</p>
      )}

      <div className="sem-barra mb-4 flex gap-1 overflow-x-auto">
        {ABAS.map((a) => (
          <button
            key={a.id} type="button" onClick={() => setAba(a.id)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
              aba === a.id ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50',
            )}
          >
            <a.Icone aria-hidden className="size-4" />
            {a.nome}
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="painel sombra flex justify-center rounded-2xl py-16">
          <Loader2 aria-hidden className="size-5 animate-spin text-marinho-500" />
        </div>
      ) : aba === 'lancar' ? (
        <Lancar
          itens={itens}
          registros={registros}
          fornecedores={fornecedores}
          podeLancar={podeLancar}
          podeExcluir={podeExcluir}
          demo={demo}
          unidade={unidade}
          nomeUsuario={usuario?.nome ?? ''}
          aoSubirPdf={subirPdf}
          aoRegistrar={registrar}
          aoExcluirRegistro={excluirRegistro}
          aoDefinirFornecedor={definirFornecedor}
          zerados={zerados}
          aoAlternarZerado={alternarZerado}
        />
      ) : (
        <Visao itens={itens} registros={registros} fornecedores={fornecedores} />
      )}
    </div>
  );
}
