'use client';

import { ClipboardList, Loader2, PackageCheck, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Acompanhamento } from '@/components/reentregas/Acompanhamento';
import { Solicitar } from '@/components/reentregas/Solicitar';
import { imprimirReentrega } from '@/lib/imprimirReentrega';
import { comprimirFoto } from '@/lib/ocorrencias';
import { dica } from '@/lib/reentregas';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import type { DesfechoReentrega, Reentrega } from '@/types/database';
import { cn } from '@/utils/cn';

type Aba = 'solicitar' | 'acompanhar';

/**
 * Reentregas — o palete que voltou para o depósito.
 *
 * Os cinco passos do fluxo em duas abas: "Solicitar" monta o palete a partir
 * do relatório (1º passo), "Acompanhamento" leva do 2º ao 5º.
 *
 * As três transições do meio — foto, aprovação e finalização — passam por
 * funções do banco (reentrega_foto, reentrega_aprovar, reentrega_finalizar) em
 * vez de UPDATE direto. Não é preciosismo: são todas escrita na MESMA linha
 * com permissões diferentes, e uma policy de UPDATE não sabe qual coluna
 * mudou — quem só fotografa poderia gravar a própria aprovação. As funções
 * conferem a permissão e escrevem só as suas colunas.
 */
export default function ReentregasPage() {
  const { pode, demo, usuario } = useSessao();
  const podeLancar = pode('reentregas', 'lancar');
  const podeFotografar = pode('reentregas', 'fotografar');
  const podeAprovar = pode('reentregas', 'aprovar');
  const podeFinalizar = pode('reentregas', 'finalizar');
  const podeExcluir = pode('reentregas', 'excluir');
  const podeImprimir = pode('reentregas', 'imprimir');

  const [aba, setAba] = useState<Aba>('solicitar');
  const [itens, setItens] = useState<Reentrega[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  /** fotos ja buscadas, por id — a listagem nao as traz */
  const [fotos, setFotos] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    if (demo) {
      const { reentregasDemo } = await import('@/lib/demo');
      setItens(reentregasDemo());
      setErro(null); setCarregando(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }
    // TUDO menos `foto`: ela é um data:image de até 900 KB por linha, e nesta
    // tela só aparece se alguém clicar em "ver a foto do palete". Trazer todas
    // para desenhar a lista são dezenas de MB no 4G do depósito. `foto_em` já
    // diz que a foto existe; a imagem vem sob demanda em carregarFoto().
    const { data, error } = await sb.from('reentregas')
      .select('id,unidade,lote,paletes,lote_a_parte,clientes,peso,motorista,ajudantes,'
        + 'pedidos,data,rota,data_prevista,obs,desfecho,registrado_por,registrado_por_id,'
        + 'foto_por,foto_por_id,foto_em,aprovado_por,aprovado_por_id,aprovado_em,'
        + 'finalizado_por,finalizado_por_id,finalizado_em,criado_em')
      .order('data', { ascending: false }).limit(2000);
    if (error) { setErro(error.message + dica(error.message)); setItens([]); }
    else { setItens((data ?? []) as Reentrega[]); setErro(null); }
    setCarregando(false);
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Modo de demonstração não grava: avisa e devolve true para quem chamou parar. */
  function barradoNoDemo() {
    if (!demo) return false;
    setErro('Modo de demonstração não grava no banco. Entre com seu login.');
    return true;
  }

  /**
   * Toda transição responde a linha inteira, então dá para trocar só ela na
   * lista em vez de reconsultar tudo — o que também evita a lista "piscar".
   *
   * A resposta vem com a foto inclusa. Guardamos a imagem
   * no cache e a lista fica com a linha sem ela — senão anexar uma foto
   * devolveria para o estado da lista exatamente o peso que a consulta evita.
   */
  function trocar(r: Reentrega) {
    const { foto, ...semFoto } = r;
    if (foto) setFotos((m) => ({ ...m, [r.id]: foto }));
    setItens((l) => l.map((x) => (x.id === r.id ? { ...semFoto, foto: null } : x)));
  }

  /**
   * Busca a foto de uma solicitação quando alguém pede para vê-la, e guarda.
   * Segunda abertura da mesma não volta ao banco.
   */
  const carregarFoto = useCallback(async (id: number): Promise<string | null> => {
    if (fotos[id]) return fotos[id];
    if (demo) {
      const { reentregasDemo } = await import('@/lib/demo');
      const f = reentregasDemo().find((x) => x.id === id)?.foto ?? null;
      if (f) setFotos((m) => ({ ...m, [id]: f }));
      return f;
    }
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error } = await sb.from('reentregas').select('foto').eq('id', id).single();
    if (error || !data?.foto) return null;
    setFotos((m) => ({ ...m, [id]: data.foto as string }));
    return data.foto as string;
  }, [fotos, demo]);

  async function chamar(
    r: Reentrega, fn: string, args: Record<string, unknown>, sucesso: string,
  ) {
    setErro(null); setMsg(null);
    if (barradoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    setOcupado(r.id);
    const { data, error } = await sb.rpc(fn, { p_id: r.id, ...args });
    setOcupado(null);
    if (error) { setErro(error.message + dica(error.message)); return; }
    if (data) trocar(data as Reentrega);
    setMsg(sucesso);
  }

  // ---------- 1º passo ----------
  async function salvarSolicitacao(dados: Partial<Reentrega>) {
    setErro(null); setMsg(null);
    if (barradoNoDemo()) return;
    const sb = getSupabase();
    if (!sb || !usuario) return;
    setSalvando(true);
    const { data, error } = await sb.from('reentregas').insert({
      ...dados,
      unidade: usuario.unidade,
      registrado_por: usuario.nome,
      registrado_por_id: usuario.id,
    }).select('*').single();
    setSalvando(false);
    if (error) { setErro('Não enviou: ' + error.message + dica(error.message)); return; }

    const nova = data as Reentrega;
    setItens((l) => [nova, ...l]);
    setMsg(`Solicitação nº ${nova.id} enviada — lote ${nova.lote}. O depósito já pode fotografar o palete.`);
    // o documento é o próximo passo físico: sai na hora, sem clique a mais
    if (podeImprimir) imprimirReentrega(nova, usuario.unidade);
  }

  // ---------- 2º ao 5º ----------
  async function anexarFoto(r: Reentrega, arquivo: File) {
    setErro(null); setMsg(null);
    if (barradoNoDemo()) return;
    setOcupado(r.id);
    let foto: string;
    try {
      foto = await comprimirFoto(arquivo);
    } catch (e) {
      setOcupado(null);
      setErro((e as Error).message);
      return;
    }
    setOcupado(null);
    await chamar(r, 'reentrega_foto', { p_foto: foto, p_nome: usuario?.nome ?? '' },
      `Foto do palete do lote ${r.lote} anexada. Agora falta aprovar.`);
  }

  const aprovar = (r: Reentrega) =>
    chamar(r, 'reentrega_aprovar', { p_nome: usuario?.nome ?? '' },
      `Lote ${r.lote} aprovado.`);

  const desaprovar = (r: Reentrega) =>
    chamar(r, 'reentrega_desaprovar', {}, `Aprovação do lote ${r.lote} retirada.`);

  async function finalizar(r: Reentrega, desfecho: DesfechoReentrega) {
    const rotulo = desfecho === 'reenviada' ? 'REENVIADA' : 'DEVOLVIDA';
    if (!confirm(`Finalizar o lote ${r.lote} como ${rotulo}?\n\nDá para reabrir depois, se errar.`)) return;
    await chamar(r, 'reentrega_finalizar', { p_desfecho: desfecho, p_nome: usuario?.nome ?? '' },
      `Lote ${r.lote} finalizado como ${rotulo.toLowerCase()}.`);
  }

  const reabrir = (r: Reentrega) =>
    chamar(r, 'reentrega_reabrir', {}, `Lote ${r.lote} reaberto.`);

  async function excluir(r: Reentrega) {
    if (!confirm(
      `Excluir a solicitação nº ${r.id} (lote ${r.lote})?\n\n`
      + `${(r.pedidos ?? []).length} pedido(s) marcados. Não dá para desfazer.`,
    )) return;
    setErro(null); setMsg(null);
    if (barradoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    setOcupado(r.id);
    const { data, error } = await sb.from('reentregas').delete().eq('id', r.id).select('id');
    setOcupado(null);
    if (error) { setErro('Não excluiu: ' + error.message + dica(error.message)); return; }
    // delete barrado pela RLS volta sem erro e sem apagar nada: sem conferir o
    // retorno, a tela diria que deu certo
    if (!(data ?? []).length) {
      setErro('Nada foi excluído — seu acesso não tem permissão de excluir reentrega.');
      return;
    }
    setItens((l) => l.filter((x) => x.id !== r.id));
    setMsg('Solicitação excluída.');
  }

  if (!pode('reentregas', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver as reentregas.</p>
      </div>
    );
  }

  const abas: { id: Aba; nome: string; Icone: typeof PackageCheck }[] = [
    { id: 'solicitar', nome: 'Solicitar', Icone: PackageCheck },
    { id: 'acompanhar', nome: 'Acompanhamento', Icone: ClipboardList },
  ];
  const emAberto = itens.filter((r) => !r.finalizado_em).length;

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Undo2 aria-hidden className="size-5 text-marinho-500" />
          Reentregas
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          O palete que voltou para o depósito, da solicitação ao reenvio ou devolução.
          {emAberto > 0 && <> · <b>{emAberto}</b> em aberto</>}
        </p>
      </header>

      <div className="mb-4 flex gap-1.5">
        {abas.map((a) => (
          <button
            key={a.id} type="button" onClick={() => setAba(a.id)}
            aria-pressed={aba === a.id}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
              aba === a.id ? 'bg-marinho-800 text-white' : 'painel txt-fraco hover:bg-marinho-50',
            )}
          >
            <a.Icone aria-hidden className="size-4" />
            {a.nome}
            {a.id === 'acompanhar' && emAberto > 0 && (
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold',
                aba === a.id ? 'bg-white/20' : 'bg-ouro-100 text-ouro-700')}>
                {emAberto}
              </span>
            )}
          </button>
        ))}
      </div>

      {erro && <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm font-semibold text-erro-600">{erro}</p>}
      {msg && <p className="mb-4 rounded-xl bg-ok-500/10 px-4 py-3 text-sm font-semibold text-ok-600">{msg}</p>}

      {aba === 'solicitar' ? (
        <Solicitar podeLancar={podeLancar} salvando={salvando} aoSalvar={salvarSolicitacao} />
      ) : carregando ? (
        <div className="flex justify-center py-16"><Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" /></div>
      ) : (
        <Acompanhamento
          itens={itens}
          unidade={usuario?.unidade ?? ''}
          ocupado={ocupado}
          podeFotografar={podeFotografar}
          podeAprovar={podeAprovar}
          podeFinalizar={podeFinalizar}
          podeExcluir={podeExcluir}
          podeImprimir={podeImprimir}
          fotos={fotos}
          aoCarregarFoto={carregarFoto}
          aoFotografar={anexarFoto}
          aoAprovar={aprovar}
          aoDesaprovar={desaprovar}
          aoFinalizar={finalizar}
          aoReabrir={reabrir}
          aoExcluir={excluir}
        />
      )}
    </div>
  );
}
