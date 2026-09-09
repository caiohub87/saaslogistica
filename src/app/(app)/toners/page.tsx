'use client';

import { BarChart3, DoorOpen, Loader2, Package, Printer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Cadastro, type FormImpressora, type FormSala } from '@/components/toners/Cadastro';
import { Consumo } from '@/components/toners/Consumo';
import { Trocas, type FormTroca } from '@/components/toners/Trocas';
import { getSupabase } from '@/lib/supabase';
import { comDuracao, dica, type TrocaComDuracao } from '@/lib/toners';
import { useSessao } from '@/providers/SessionProvider';
import type { Impressora, Sala, TrocaToner } from '@/types/database';
import { cn } from '@/utils/cn';

type Aba = 'trocas' | 'consumo' | 'cadastro';

/**
 * Toners — para onde vai cada um e quanto tempo dura.
 *
 * Três abas: registrar a troca, ver o consumo consolidado, e o cadastro de
 * salas e impressoras que sustenta os dois.
 *
 * A duração de cada toner é calculada aqui, na leitura, e não guardada no
 * banco: é a distância até a troca seguinte da mesma impressora, então gravá-la
 * exigiria reescrever a linha anterior a cada registro novo — e uma exclusão no
 * meio deixaria a conta errada sem ninguém perceber.
 */
export default function TonersPage() {
  const { pode, demo, usuario } = useSessao();
  const podeLancar = pode('toners', 'lancar');
  const podeEditar = pode('toners', 'editar');
  const podeExcluir = pode('toners', 'excluir');

  const [aba, setAba] = useState<Aba>('trocas');
  const [salas, setSalas] = useState<Sala[]>([]);
  const [impressoras, setImpressoras] = useState<Impressora[]>([]);
  const [trocas, setTrocas] = useState<TrocaToner[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [ocupadoCad, setOcupadoCad] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    if (demo) {
      const { tonersDemo } = await import('@/lib/demo');
      const d = tonersDemo();
      setSalas(d.salas); setImpressoras(d.impressoras); setTrocas(d.trocas);
      setErro(null); setCarregando(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }
    const [s, i, t] = await Promise.all([
      sb.from('salas').select('*').order('nome'),
      sb.from('impressoras').select('*').order('nome'),
      sb.from('toner_trocas').select('*').order('data', { ascending: false }).limit(5000),
    ]);
    const falhou = s.error ?? i.error ?? t.error;
    if (falhou) {
      setErro(falhou.message + dica(falhou.message));
      setSalas([]); setImpressoras([]); setTrocas([]);
    } else {
      setSalas((s.data ?? []) as Sala[]);
      setImpressoras((i.data ?? []) as Impressora[]);
      setTrocas((t.data ?? []) as TrocaToner[]);
      setErro(null);
    }
    setCarregando(false);
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** As trocas com a duração já calculada — a leitura que todas as abas usam. */
  const comDur: TrocaComDuracao[] = useMemo(() => comDuracao(trocas), [trocas]);

  function barradoNoDemo() {
    if (!demo) return false;
    setErro('Modo de demonstração não grava no banco. Entre com seu login.');
    return true;
  }

  // ---------- trocas ----------
  async function registrar(f: FormTroca) {
    setErro(null); setMsg(null);
    if (barradoNoDemo()) return;
    const sb = getSupabase();
    if (!sb || !usuario) return;
    setSalvando(true);
    const { data, error } = await sb.from('toner_trocas').insert({
      ...f,
      unidade: usuario.unidade,
      registrado_por: usuario.nome,
      registrado_por_id: usuario.id,
    }).select('*').single();
    setSalvando(false);
    if (error) { setErro('Não gravou: ' + error.message + dica(error.message)); return; }
    setTrocas((l) => [data as TrocaToner, ...l]);
    const imp = impressoras.find((i) => i.id === f.impressora_id);
    setMsg(`Toner ${f.toner} registrado em ${imp?.nome ?? 'impressora'}.`);
  }

  async function excluirTroca(t: TrocaComDuracao) {
    if (!confirm(`Excluir a troca de ${t.toner}?\n\nIsso muda a duração calculada das trocas vizinhas.`)) return;
    setErro(null); setMsg(null);
    if (barradoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    setOcupado(t.id);
    const { data, error } = await sb.from('toner_trocas').delete().eq('id', t.id).select('id');
    setOcupado(null);
    if (error) { setErro('Não excluiu: ' + error.message + dica(error.message)); return; }
    // delete barrado pela RLS volta sem erro e sem apagar nada
    if (!(data ?? []).length) {
      setErro('Nada foi excluído — seu acesso não tem permissão de excluir troca.');
      return;
    }
    setTrocas((l) => l.filter((x) => x.id !== t.id));
    setMsg('Troca excluída.');
  }

  // ---------- cadastro ----------
  async function comCadastro<T>(
    chave: string, acao: () => Promise<{ data: T | null; error: { message: string } | null }>,
    aoDarCerto: (d: T) => void, sucesso: string,
  ) {
    setErro(null); setMsg(null);
    if (barradoNoDemo()) return;
    setOcupadoCad(chave);
    const { data, error } = await acao();
    setOcupadoCad(null);
    if (error) { setErro(error.message + dica(error.message)); return; }
    if (data) aoDarCerto(data);
    setMsg(sucesso);
  }

  const sb = () => getSupabase()!;

  const criarSala = (f: FormSala) => comCadastro(
    'sala-nova',
    () => sb().from('salas').insert({ ...f, unidade: usuario!.unidade }).select('*').single(),
    (d) => setSalas((l) => [...l, d as Sala]),
    `Sala ${f.nome} cadastrada.`,
  );

  const alternarSala = (s: Sala) => comCadastro(
    `sala-${s.id}`,
    () => sb().from('salas').update({ ativo: !s.ativo }).eq('id', s.id).select('*').single(),
    (d) => setSalas((l) => l.map((x) => (x.id === s.id ? d as Sala : x))),
    s.ativo ? `${s.nome} desativada.` : `${s.nome} reativada.`,
  );

  async function excluirSala(s: Sala) {
    const daSala = impressoras.filter((i) => i.sala_id === s.id);
    if (daSala.length) {
      setErro(`${s.nome} tem ${daSala.length} impressora(s) cadastrada(s). `
        + 'Exclua as impressoras primeiro, ou desative a sala para preservar o histórico.');
      return;
    }
    if (!confirm(`Excluir a sala ${s.nome}?\n\nDesativar preserva o histórico; excluir não dá para desfazer.`)) return;
    await comCadastro(
      `sala-${s.id}`,
      () => sb().from('salas').delete().eq('id', s.id).select('id').single(),
      () => setSalas((l) => l.filter((x) => x.id !== s.id)),
      'Sala excluída.',
    );
  }

  const criarImpressora = (f: FormImpressora) => comCadastro(
    `sala-${f.sala_id}`,
    () => sb().from('impressoras').insert({ ...f, unidade: usuario!.unidade }).select('*').single(),
    (d) => setImpressoras((l) => [...l, d as Impressora]),
    `Impressora ${f.nome} cadastrada.`,
  );

  const alternarImpressora = (i: Impressora) => comCadastro(
    `imp-${i.id}`,
    () => sb().from('impressoras').update({ ativo: !i.ativo }).eq('id', i.id).select('*').single(),
    (d) => setImpressoras((l) => l.map((x) => (x.id === i.id ? d as Impressora : x))),
    i.ativo ? `${i.nome} desativada.` : `${i.nome} reativada.`,
  );

  async function excluirImpressora(i: Impressora) {
    const n = trocas.filter((t) => t.impressora_id === i.id).length;
    if (!confirm(
      `Excluir a impressora ${i.nome}?\n\n`
      + (n ? `As ${n} troca(s) registradas nela vão junto. ` : '')
      + 'Desativar preserva o histórico.',
    )) return;
    await comCadastro(
      `imp-${i.id}`,
      () => sb().from('impressoras').delete().eq('id', i.id).select('id').single(),
      () => {
        setImpressoras((l) => l.filter((x) => x.id !== i.id));
        // o banco apaga em cascata; a tela acompanha para os números não mentirem
        setTrocas((l) => l.filter((t) => t.impressora_id !== i.id));
      },
      'Impressora excluída.',
    );
  }

  if (!pode('toners', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver o controle de toners.</p>
      </div>
    );
  }

  const abas: { id: Aba; nome: string; Icone: typeof Package }[] = [
    { id: 'trocas', nome: 'Trocas', Icone: Package },
    { id: 'consumo', nome: 'Consumo', Icone: BarChart3 },
    { id: 'cadastro', nome: 'Salas e impressoras', Icone: DoorOpen },
  ];

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Printer aria-hidden className="size-5 text-marinho-500" />
          Toners
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          Para onde vai cada toner e quanto tempo ele dura, por sala e por impressora.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {abas.map((a) => (
          <button
            key={a.id} type="button" onClick={() => setAba(a.id)} aria-pressed={aba === a.id}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
              aba === a.id ? 'bg-marinho-800 text-white' : 'painel txt-fraco hover:bg-marinho-50',
            )}
          >
            <a.Icone aria-hidden className="size-4" />
            {a.nome}
          </button>
        ))}
      </div>

      {erro && <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm font-semibold text-erro-600">{erro}</p>}
      {msg && <p className="mb-4 rounded-xl bg-ok-500/10 px-4 py-3 text-sm font-semibold text-ok-600">{msg}</p>}

      {carregando ? (
        <div className="flex justify-center py-16"><Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" /></div>
      ) : aba === 'trocas' ? (
        <Trocas
          trocas={comDur} salas={salas} impressoras={impressoras}
          podeLancar={podeLancar} podeExcluir={podeExcluir}
          salvando={salvando} ocupado={ocupado}
          aoRegistrar={registrar} aoExcluir={excluirTroca}
        />
      ) : aba === 'consumo' ? (
        <Consumo trocas={comDur} salas={salas} impressoras={impressoras} />
      ) : (
        <Cadastro
          salas={salas} impressoras={impressoras}
          podeEditar={podeEditar} ocupado={ocupadoCad}
          aoCriarSala={criarSala} aoAlternarSala={alternarSala} aoExcluirSala={excluirSala}
          aoCriarImpressora={criarImpressora}
          aoAlternarImpressora={alternarImpressora}
          aoExcluirImpressora={excluirImpressora}
        />
      )}
    </div>
  );
}
