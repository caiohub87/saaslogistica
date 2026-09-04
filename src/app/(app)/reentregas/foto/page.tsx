'use client';

import { Camera, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { comprimirFoto } from '@/lib/ocorrencias';
import { dica, fmtData, fmtPeso } from '@/lib/reentregas';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import type { Reentrega } from '@/types/database';
import { cn } from '@/utils/cn';

/**
 * Foto do palete — tela própria.
 *
 * Existe separada de /reentregas por causa de quem a usa: a conta do depósito
 * que SÓ fotografa. Dar a ela 'reentregas.ver' abriria o acompanhamento
 * inteiro — aprovações, desfechos, valores dos pedidos —, coisa que ela não
 * precisa nem deve ver. Então a foto ganhou permissão própria
 * ('reentregafoto'), e a policy de leitura da tabela aceita as duas portas.
 *
 * Aqui só existe uma ação: tirar a foto. Sem abas, sem filtro, sem histórico —
 * a fila do que falta fotografar, e nada mais. Quem tem acesso completo
 * continua fazendo tudo pela tela de Reentregas, como antes.
 */
export default function FotoPaletePage() {
  const { pode, demo, usuario } = useSessao();
  const podeVer = pode('reentregafoto', 'ver') || pode('reentregas', 'ver');
  const podeFotografar =
    pode('reentregafoto', 'fotografar') || pode('reentregas', 'fotografar');

  const [itens, setItens] = useState<Reentrega[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});

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
    // só o que ainda não foi fotografado: é a fila desta tela
    const { data, error } = await sb.from('reentregas').select('*')
      .is('foto', null).order('data', { ascending: false }).limit(500);
    if (error) { setErro(error.message + dica(error.message)); setItens([]); }
    else { setItens((data ?? []) as Reentrega[]); setErro(null); }
    setCarregando(false);
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** em demonstração a lista traz tudo; aqui fica só o que falta fotografar */
  const fila = itens.filter((r) => !r.foto);

  async function fotografar(r: Reentrega, arquivo: File) {
    setErro(null); setMsg(null);
    if (demo) {
      setErro('Modo de demonstração não grava no banco. Entre com seu login para fotografar.');
      return;
    }
    const sb = getSupabase();
    if (!sb) return;

    setOcupado(r.id);
    try {
      const foto = await comprimirFoto(arquivo);
      const { error } = await sb.rpc('reentrega_foto', {
        p_id: r.id, p_foto: foto, p_nome: usuario?.nome ?? '',
      });
      if (error) throw new Error(error.message + dica(error.message));
      setMsg(`Foto do lote ${r.lote} enviada.`);
      // sai da fila: o próximo passo é de outra pessoa
      setItens((l) => l.filter((x) => x.id !== r.id));
    } catch (e) {
      setErro((e as Error).message);
    }
    setOcupado(null);
  }

  if (!podeVer) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para esta tela.</p>
      </div>
    );
  }

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Camera aria-hidden className="size-5 text-marinho-500" />
            Foto do palete
          </h1>
          <p className="mt-1 text-sm txt-fraco">
            Os paletes que voltaram e ainda não têm foto. Tire a foto do palete montado —
            é ela que a gerência olha para aprovar.
          </p>
        </div>
        <button
          type="button" onClick={() => void carregar()}
          className="flex items-center gap-1.5 rounded-xl border borda px-3 py-2 text-[13px] font-semibold txt-fraco"
        >
          <RefreshCw aria-hidden className="size-4" />
          Atualizar
        </button>
      </header>

      {erro && (
        <p role="alert" className="mb-4 rounded-xl bg-erro-500/10 px-4 py-3 text-sm text-erro-600">{erro}</p>
      )}
      {msg && (
        <p className="mb-4 rounded-xl bg-ok-500/10 px-4 py-3 text-sm font-semibold text-ok-600">{msg}</p>
      )}

      {carregando ? (
        <div className="painel sombra flex justify-center rounded-2xl py-16">
          <Loader2 aria-hidden className="size-5 animate-spin text-marinho-500" />
        </div>
      ) : !fila.length ? (
        <section className="painel sombra rounded-2xl p-8 text-center">
          <CheckCircle2 aria-hidden className="mx-auto size-8 text-ok-600" />
          <h2 className="mt-2 text-[15px] font-bold">Nenhum palete esperando foto</h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] txt-fraco">
            Quando o depósito montar um palete de reentrega, ele aparece aqui.
          </p>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fila.map((r) => (
            <li key={r.id} className="painel sombra flex flex-col gap-2 rounded-2xl p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[20px] font-bold leading-none">{r.lote}</span>
                <span className="text-[11.5px] txt-fraco">nº {r.id}</span>
              </div>

              {r.rota && <p className="text-[13px] font-semibold">{r.rota}</p>}

              <p className="text-[12.5px] txt-fraco">
                {r.paletes} palete(s) · {fmtPeso(r.peso)} kg · {r.clientes} cliente(s)
              </p>
              <p className="text-[12px] txt-fraco">
                Voltou em {fmtData(r.data)}
                {r.data_prevista && ` · sai em ${fmtData(r.data_prevista)}`}
              </p>

              {r.lote_a_parte && (
                <span className="w-fit rounded-md bg-marinho-900 px-2 py-0.5 text-[11px] font-bold text-white">
                  LOTE À PARTE
                </span>
              )}

              {r.obs && <p className="text-[12px] txt-fraco">{r.obs}</p>}

              {podeFotografar ? (
                <>
                  <button
                    type="button" disabled={ocupado === r.id}
                    onClick={() => inputs.current[r.id]?.click()}
                    className={cn(
                      'mt-auto flex items-center justify-center gap-2 rounded-xl bg-marinho-800',
                      'px-3 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-60',
                    )}
                  >
                    {ocupado === r.id
                      ? <Loader2 aria-hidden className="size-4 animate-spin" />
                      : <Camera aria-hidden className="size-4" />}
                    {ocupado === r.id ? 'Enviando…' : 'Tirar foto'}
                  </button>
                  <input
                    ref={(el) => { inputs.current[r.id] = el; }}
                    type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void fotografar(r, f);
                      e.target.value = '';
                    }}
                  />
                </>
              ) : (
                <p className="mt-auto text-[12px] txt-fraco">
                  Seu acesso vê a fila, mas não anexa a foto.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
