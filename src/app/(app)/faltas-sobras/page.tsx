'use client';

import {
  Camera, Loader2, Plus, Search, Trash2, UserCog, UserPlus, X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CONFIG, comprimirFoto, fmtData, hojeISO, normNome, normPlaca, produtoTexto,
} from '@/lib/ocorrencias';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import type { Motorista, Ocorrencia, TipoOcorrencia } from '@/types/database';
import { cn } from '@/utils/cn';

type Aba = TipoOcorrencia | 'motoristas';

interface Form {
  data: string; lote: string; produto: string; embalagem: string;
  motorista: string; placa: string; foto: string | null; obs: string;
}
const formVazio = (): Form => ({
  data: hojeISO(), lote: '', produto: '', embalagem: '',
  motorista: '', placa: '', foto: null, obs: '',
});

const dica = (msg: string) => (/relation|does not exist/i.test(msg)
  ? ' — rode o SQL 14_faltas_sobras.sql no Supabase.'
  : /permission|policy|row-level/i.test(msg)
    ? ' — seu acesso não tem permissão para isso.'
    : '');

export default function FaltasSobrasPage() {
  const { pode, demo, usuario } = useSessao();
  const podeLancar = pode('ocorrencias', 'lancar');
  const podeExcluir = pode('ocorrencias', 'excluir');

  const [aba, setAba] = useState<Aba>('falta');
  const tipoAtivo: TipoOcorrencia | null = aba === 'motoristas' ? null : aba;
  const cfg = CONFIG[tipoAtivo ?? 'falta'];

  const [itens, setItens] = useState<Ocorrencia[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState<Form>(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [fotoAberta, setFotoAberta] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const [ini, setIni] = useState('');
  const [fim, setFim] = useState('');
  const [novoMotorista, setNovoMotorista] = useState('');
  const inputFoto = useRef<HTMLInputElement>(null);

  // ---------- carga ----------
  const carregar = useCallback(async () => {
    if (!tipoAtivo) return;
    setCarregando(true);
    if (demo) {
      const { ocorrenciasDemo } = await import('@/lib/demo');
      setItens(ocorrenciasDemo(tipoAtivo));
      setErro(null); setCarregando(false);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setErro('Banco não configurado.'); setCarregando(false); return; }
    const { data, error } = await sb.from('ocorrencias').select('*')
      .eq('tipo', tipoAtivo).order('data', { ascending: false }).limit(2000);
    if (error) { setErro(error.message + dica(error.message)); setItens([]); }
    else { setItens((data ?? []) as Ocorrencia[]); setErro(null); }
    setCarregando(false);
  }, [tipoAtivo, demo]);

  const carregarMotoristas = useCallback(async () => {
    if (demo) {
      const { motoristasDemo } = await import('@/lib/demo');
      setMotoristas(motoristasDemo());
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('motoristas').select('*').order('nome');
    if (!error) setMotoristas((data ?? []) as Motorista[]);
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void carregarMotoristas(); }, [carregarMotoristas]);

  function bloqueadoNoDemo() {
    if (!demo) return false;
    setMsg(null);
    setErro('Modo de demonstração não grava no banco. Entre com seu login para registrar.');
    return true;
  }

  // ---------- foto ----------
  async function escolherFoto(file: File) {
    setErro(null);
    setLendoFoto(true);
    try {
      setForm((f) => ({ ...f, foto: null }));
      const dados = await comprimirFoto(file);
      setForm((f) => ({ ...f, foto: dados }));
    } catch (e) {
      setErro((e as Error).message);
    }
    setLendoFoto(false);
  }

  // ---------- registrar ----------
  async function registrar() {
    if (!tipoAtivo) return;
    setMsg(null); setErro(null);
    if (!form.lote.trim()) { setErro('Informe o lote.'); return; }
    if (!form.motorista.trim()) { setErro('Escolha o motorista.'); return; }
    if (cfg.temProduto && !form.produto.trim()) { setErro('Informe o código do produto.'); return; }
    // a foto é o que identifica a sobra, mas não trava o registro: se o
    // celular falhar na hora, o lote e o motorista já valem mais que nada
    if (cfg.temFoto && !form.foto && !confirm('Registrar a sobra sem foto?')) return;
    if (bloqueadoNoDemo()) return;

    const sb = getSupabase();
    if (!sb) return;
    setSalvando(true);
    const { error } = await sb.from('ocorrencias').insert({
      unidade: usuario!.unidade,
      tipo: tipoAtivo,
      data: form.data,
      lote: form.lote.trim(),
      produto: cfg.temProduto ? form.produto.trim() : null,
      embalagem: cfg.temProduto ? (form.embalagem.trim() || null) : null,
      motorista: form.motorista,
      placa: form.placa ? normPlaca(form.placa) : null,
      foto: cfg.temFoto ? form.foto : null,
      obs: form.obs.trim() || null,
      registrado_por: usuario!.nome,
      registrado_por_id: usuario!.id,
    });
    setSalvando(false);

    if (error) { setErro('Não registrou: ' + error.message + dica(error.message)); return; }
    setMsg(`${cfg.temProduto ? 'Falta' : 'Sobra'} do lote ${form.lote.trim()} registrada.`);
    setForm(formVazio());
    await carregar();
  }

  async function excluir(o: Ocorrencia) {
    if (!confirm(`Excluir o registro do lote ${o.lote} — ${o.motorista}, ${fmtData(o.data)}?`)) return;
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('ocorrencias').delete().eq('id', o.id).select('id');
    if (error) { setErro('Não excluiu: ' + error.message + dica(error.message)); return; }
    if (!(data ?? []).length) {
      setErro('Nada foi excluído — seu acesso não tem permissão de excluir registro.');
      return;
    }
    setMsg('Registro excluído.');
    await carregar();
  }

  // ---------- motoristas ----------
  async function adicionarMotorista() {
    const nome = normNome(novoMotorista);
    setMsg(null); setErro(null);
    if (!nome) { setErro('Escreva o nome do motorista.'); return; }
    if (motoristas.some((m) => m.nome === nome)) { setErro(`${nome} já está na lista.`); return; }
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('motoristas').insert({ unidade: usuario!.unidade, nome });
    if (error) { setErro('Não cadastrou: ' + error.message + dica(error.message)); return; }
    setNovoMotorista('');
    setMsg(`${nome} entrou na lista.`);
    await carregarMotoristas();
  }

  async function alternarAtivo(m: Motorista) {
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('motoristas').update({ ativo: !m.ativo }).eq('id', m.id);
    if (error) { setErro(error.message + dica(error.message)); return; }
    setMsg(m.ativo ? `${m.nome} saiu da lista de ativos.` : `${m.nome} voltou para os ativos.`);
    await carregarMotoristas();
  }

  async function excluirMotorista(m: Motorista) {
    if (!confirm(`Tirar ${m.nome} do cadastro?\n\nOs registros antigos guardam o nome e não mudam.`)) return;
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('motoristas').delete().eq('id', m.id);
    if (error) { setErro(error.message + dica(error.message)); return; }
    setMsg(`${m.nome} saiu do cadastro.`);
    await carregarMotoristas();
  }

  // ---------- consultas ----------
  const ativos = useMemo(() => motoristas.filter((m) => m.ativo), [motoristas]);
  // placas já usadas viram sugestão: quem digita no celular erra menos
  const placas = useMemo(
    () => [...new Set(itens.map((o) => o.placa).filter(Boolean) as string[])].sort(),
    [itens],
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((o) => (!ini || o.data >= ini) && (!fim || o.data <= fim))
      .filter((o) => !q || [o.lote, o.motorista, o.placa, o.produto, o.embalagem, o.obs]
        .some((x) => (x ?? '').toLowerCase().includes(q)));
  }, [itens, busca, ini, fim]);

  if (!pode('ocorrencias', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver faltas e sobras.</p>
      </div>
    );
  }

  const ENTRADA = 'painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500';

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <cfg.Icone aria-hidden className="size-5 text-marinho-500" />
          Faltas e sobras
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          <b>Falta</b> é o que não chegou: lote, produto e quem levou.{' '}
          <b>Sobra</b> é o que voltou na carroceria — com foto, que explica melhor que descrição.
        </p>
      </header>

      {erro && (
        <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm font-semibold text-erro-600">{erro}</p>
      )}
      {msg && (
        <p className="mb-4 rounded-xl bg-ok-500/10 px-4 py-3 text-sm font-semibold text-ok-600">{msg}</p>
      )}

      <div className="sem-barra mb-4 flex gap-1 overflow-x-auto">
        {([CONFIG.falta, CONFIG.sobra] as const).map((c) => (
          <button
            key={c.tipo} type="button"
            onClick={() => { setAba(c.tipo); setForm(formVazio()); setMsg(null); setErro(null); }}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
              aba === c.tipo ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50',
            )}
          >
            <c.Icone aria-hidden className="size-4" />
            {c.nome}
          </button>
        ))}
        <button
          type="button" onClick={() => { setAba('motoristas'); setMsg(null); setErro(null); }}
          className={cn(
            'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
            aba === 'motoristas' ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50',
          )}
        >
          <UserCog aria-hidden className="size-4" />
          Motoristas
        </button>
      </div>

      {/* ---------------- cadastro de motoristas ---------------- */}
      {aba === 'motoristas' && (
        <section className="painel sombra rounded-2xl p-4 motion-safe:animate-subir">
          <h2 className="mb-1 text-[15px] font-bold">Motoristas</h2>
          <p className="mb-3 text-[12.5px] txt-fraco">
            Quem aparece na lista ao registrar falta ou sobra. Desativar tira das opções sem
            apagar nada — os registros antigos guardam o nome como texto.
          </p>

          {podeLancar && (
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={novoMotorista} onChange={(e) => setNovoMotorista(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void adicionarMotorista(); }}
                placeholder="Nome do motorista" aria-label="Nome do motorista"
                className={cn(ENTRADA, 'sm:max-w-xs')}
              />
              <button
                type="button" onClick={() => void adicionarMotorista()}
                className="flex items-center gap-1.5 rounded-xl bg-marinho-800 px-3 py-2 text-[13px] font-semibold text-white"
              >
                <UserPlus aria-hidden className="size-4" /> Adicionar
              </button>
            </div>
          )}

          {!motoristas.length ? (
            <p className="rounded-xl painel-2 px-3 py-6 text-center text-[13px] txt-fraco">
              Nenhum motorista cadastrado ainda.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {motoristas.map((m) => (
                <li
                  key={m.id}
                  className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2',
                    m.ativo ? 'borda' : 'borda opacity-60')}
                >
                  <span className="text-[13.5px] font-semibold">{m.nome}</span>
                  {!m.ativo && (
                    <span className="rounded-md painel-2 px-2 py-0.5 text-[11px] font-bold txt-fraco">inativo</span>
                  )}
                  {podeLancar && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        type="button" onClick={() => void alternarAtivo(m)}
                        className="rounded-lg border borda px-2 py-1 text-[11.5px] font-semibold txt-fraco"
                      >
                        {m.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                      <button
                        type="button" onClick={() => void excluirMotorista(m)}
                        aria-label={`Tirar ${m.nome} do cadastro`}
                        className="rounded-lg border borda px-2 py-1 text-[11.5px] font-semibold text-erro-600 hover:bg-erro-500/10"
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---------------- registrar ---------------- */}
      {tipoAtivo && podeLancar && (
        <section className="painel sombra mb-4 rounded-2xl p-4 motion-safe:animate-subir">
          <h2 className="mb-3 text-[15px] font-bold">{cfg.acao}</h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="oc-data" className="mb-1 block text-[12.5px] font-semibold">Data</label>
              <input
                id="oc-data" type="date" value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className={ENTRADA}
              />
            </div>
            <div>
              <label htmlFor="oc-lote" className="mb-1 block text-[12.5px] font-semibold">Lote</label>
              <input
                id="oc-lote" inputMode="numeric" placeholder="96661" autoComplete="off"
                value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })}
                className={ENTRADA}
              />
            </div>

            {cfg.temProduto && (
              <>
                <div>
                  <label htmlFor="oc-prod" className="mb-1 block text-[12.5px] font-semibold">Código do produto</label>
                  <input
                    id="oc-prod" inputMode="numeric" placeholder="65696" autoComplete="off"
                    value={form.produto} onChange={(e) => setForm({ ...form, produto: e.target.value })}
                    className={ENTRADA}
                  />
                </div>
                <div>
                  <label htmlFor="oc-emb" className="mb-1 block text-[12.5px] font-semibold">Unidade / embalagem</label>
                  <input
                    id="oc-emb" placeholder="48UNID" autoComplete="off"
                    value={form.embalagem} onChange={(e) => setForm({ ...form, embalagem: e.target.value })}
                    className={ENTRADA}
                  />
                </div>
              </>
            )}

            <div>
              <label htmlFor="oc-mot" className="mb-1 block text-[12.5px] font-semibold">Motorista</label>
              <select
                id="oc-mot" value={form.motorista}
                onChange={(e) => setForm({ ...form, motorista: e.target.value })}
                className={ENTRADA}
              >
                <option value="">Selecione…</option>
                {ativos.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
              </select>
              {!ativos.length && (
                <p className="mt-1 text-[11.5px] txt-fraco">
                  Nenhum motorista cadastrado — cadastre na aba <b>Motoristas</b>.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="oc-placa" className="mb-1 block text-[12.5px] font-semibold">Placa</label>
              <input
                id="oc-placa" list="lista-placas" placeholder="OEY 8503" autoComplete="off"
                value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })}
                className={ENTRADA}
              />
              <datalist id="lista-placas">
                {placas.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>

            <div className={cn(cfg.temFoto ? '' : 'lg:col-span-2', 'sm:col-span-2')}>
              <label htmlFor="oc-obs" className="mb-1 block text-[12.5px] font-semibold">
                Observação <span className="txt-fraco">(opcional)</span>
              </label>
              <input
                id="oc-obs" placeholder="o que ajudar a entender depois" autoComplete="off"
                value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })}
                className={ENTRADA}
              />
            </div>
          </div>

          {cfg.temFoto && (
            <div className="mt-3">
              <span className="mb-1 block text-[12.5px] font-semibold">Foto da sobra</span>
              {form.foto ? (
                <div className="flex items-center gap-3">
                  <Image
                    src={form.foto} alt="Foto da sobra" width={112} height={112} unoptimized
                    className="size-28 rounded-xl border borda object-cover"
                  />
                  <button
                    type="button" onClick={() => setForm({ ...form, foto: null })}
                    className="flex items-center gap-1 rounded-lg border borda px-2.5 py-1.5 text-[12px] font-semibold txt-fraco"
                  >
                    <X aria-hidden className="size-3.5" /> Trocar foto
                  </button>
                </div>
              ) : (
                <button
                  type="button" onClick={() => inputFoto.current?.click()} disabled={lendoFoto}
                  className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed borda px-4 py-5 transition-colors hover:border-marinho-500 disabled:opacity-60"
                >
                  {lendoFoto
                    ? <Loader2 aria-hidden className="size-5 animate-spin text-marinho-500" />
                    : <Camera aria-hidden className="size-5 text-marinho-500" />}
                  <span className="text-[13.5px] font-semibold">
                    {lendoFoto ? 'Preparando a foto…' : 'Tirar ou escolher a foto'}
                  </span>
                  <span className="text-[11.5px] txt-fraco">
                    No celular abre a câmera. A foto é reduzida antes de subir.
                  </span>
                </button>
              )}
              <input
                ref={inputFoto} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void escolherFoto(f); e.target.value = ''; }}
              />
            </div>
          )}

          <button
            type="button" onClick={() => void registrar()} disabled={salvando || lendoFoto}
            className="mt-3 flex items-center gap-1.5 rounded-xl bg-marinho-800 px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-60"
          >
            {salvando ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
            {cfg.acao}
          </button>
        </section>
      )}

      {/* ---------------- lista ---------------- */}
      {tipoAtivo && (
        <section className="painel sombra rounded-2xl p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-bold">{cfg.nome} registradas</h2>
            <span className="rounded-md painel-2 px-2 py-0.5 text-[11.5px] font-bold txt-fraco">
              {lista.length}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-[12px] txt-fraco">
                De <input
                  type="date" value={ini} onChange={(e) => setIni(e.target.value)}
                  className="painel-2 rounded-lg border borda px-2 py-1.5"
                />
              </label>
              <label className="flex items-center gap-1 text-[12px] txt-fraco">
                Até <input
                  type="date" value={fim} onChange={(e) => setFim(e.target.value)}
                  className="painel-2 rounded-lg border borda px-2 py-1.5"
                />
              </label>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 txt-fraco" />
                <input
                  value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="lote, motorista, placa…" aria-label="Buscar"
                  className="painel-2 rounded-lg border borda py-1.5 pl-7 pr-2 text-[12.5px] outline-none focus:border-marinho-500"
                />
              </div>
            </div>
          </div>

          {carregando ? (
            <div className="flex justify-center py-12">
              <Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" />
            </div>
          ) : !lista.length ? (
            <p className="rounded-xl painel-2 px-3 py-8 text-center text-[13px] txt-fraco">{cfg.vazio}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lista.map((o) => (
                <li key={o.id} className="rounded-xl border borda p-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold uppercase', cfg.cor)}>
                      {o.tipo}
                    </span>
                    <span className="text-[14px] font-bold">Lote {o.lote}</span>
                    {o.produto && (
                      <span className="rounded-md painel-2 px-2 py-0.5 text-[12px] font-semibold">
                        {produtoTexto(o.produto, o.embalagem)}
                      </span>
                    )}
                    <span className="text-[12.5px] txt-fraco">{fmtData(o.data)}</span>
                    {podeExcluir && (
                      <button
                        type="button" onClick={() => void excluir(o)}
                        aria-label={`Excluir o registro do lote ${o.lote}`}
                        className="ml-auto rounded-lg border borda px-2 py-1 text-erro-600 hover:bg-erro-500/10"
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] txt-fraco">
                    <span>
                      <b className="text-[12.5px]" style={{ color: 'var(--texto)' }}>{o.motorista}</b>
                      {o.placa ? ` · ${o.placa}` : ''}
                    </span>
                    {o.obs && <span>· {o.obs}</span>}
                    {o.registrado_por && <span className="ml-auto">registrado por {o.registrado_por}</span>}
                  </div>

                  {o.foto && (
                    <button
                      type="button" onClick={() => setFotoAberta(fotoAberta === o.id ? null : o.id)}
                      className="mt-2 block"
                      aria-label={fotoAberta === o.id ? 'Fechar a foto' : 'Ver a foto maior'}
                    >
                      <Image
                        src={o.foto} alt={`Sobra do lote ${o.lote}`} unoptimized
                        width={fotoAberta === o.id ? 1280 : 96}
                        height={fotoAberta === o.id ? 960 : 96}
                        className={cn('rounded-xl border borda',
                          fotoAberta === o.id ? 'h-auto w-full max-w-xl' : 'size-24 object-cover')}
                      />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
