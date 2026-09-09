'use client';

import { DoorOpen, Loader2, Plus, Power, Printer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Impressora, Sala } from '@/types/database';
import { cn } from '@/utils/cn';

export interface FormSala { nome: string; local: string | null }
export interface FormImpressora {
  sala_id: number; nome: string; modelo: string | null;
  patrimonio: string | null; toner_padrao: string | null;
}

/**
 * Cadastro de salas e das impressoras dentro delas.
 *
 * A impressora é criada DENTRO da sala — não há formulário solto pedindo "de
 * qual sala é esta máquina", porque uma impressora sem sala não serviria para
 * nada aqui: a sala é metade da pergunta que a tela responde.
 *
 * Desativar em vez de excluir é o caminho normal: a sala fechada continua
 * sendo onde toners foram gastos, e apagar levaria o histórico junto.
 */
export function Cadastro({
  salas, impressoras, podeEditar, ocupado,
  aoCriarSala, aoAlternarSala, aoExcluirSala,
  aoCriarImpressora, aoAlternarImpressora, aoExcluirImpressora,
}: {
  salas: Sala[];
  impressoras: Impressora[];
  podeEditar: boolean;
  /** id em ação; salas e impressoras usam faixas separadas para não colidir */
  ocupado: string | null;
  aoCriarSala: (f: FormSala) => Promise<void>;
  aoAlternarSala: (s: Sala) => Promise<void>;
  aoExcluirSala: (s: Sala) => Promise<void>;
  aoCriarImpressora: (f: FormImpressora) => Promise<void>;
  aoAlternarImpressora: (i: Impressora) => Promise<void>;
  aoExcluirImpressora: (i: Impressora) => Promise<void>;
}) {
  const [nomeSala, setNomeSala] = useState('');
  const [localSala, setLocalSala] = useState('');
  /** em qual sala o formulário de impressora está aberto */
  const [abrindoEm, setAbrindoEm] = useState<number | null>(null);
  const [nomeImp, setNomeImp] = useState('');
  const [modeloImp, setModeloImp] = useState('');
  const [patrimonio, setPatrimonio] = useState('');
  const [tonerPadrao, setTonerPadrao] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const porSala = useMemo(() => {
    const g = new Map<number, Impressora[]>();
    impressoras.forEach((i) => {
      const l = g.get(i.sala_id);
      if (l) l.push(i); else g.set(i.sala_id, [i]);
    });
    return g;
  }, [impressoras]);

  const ordenadas = useMemo(
    () => [...salas].sort((a, b) => Number(b.ativo) - Number(a.ativo)
      || a.nome.localeCompare(b.nome, 'pt-BR')),
    [salas],
  );

  async function criarSala() {
    setErro(null);
    if (!nomeSala.trim()) { setErro('Dê um nome à sala.'); return; }
    await aoCriarSala({ nome: nomeSala.trim(), local: localSala.trim() || null });
    setNomeSala(''); setLocalSala('');
  }

  function abrirForm(salaId: number) {
    setAbrindoEm(salaId);
    setNomeImp(''); setModeloImp(''); setPatrimonio(''); setTonerPadrao('');
    setErro(null);
  }

  async function criarImpressora(salaId: number) {
    setErro(null);
    if (!nomeImp.trim()) { setErro('Dê um nome à impressora — como a sala chama ela.'); return; }
    await aoCriarImpressora({
      sala_id: salaId,
      nome: nomeImp.trim(),
      modelo: modeloImp.trim() || null,
      patrimonio: patrimonio.trim() || null,
      toner_padrao: tonerPadrao.trim() || null,
    });
    setAbrindoEm(null);
  }

  return (
    <div className="grid gap-4">
      {!podeEditar && (
        <p className="rounded-xl painel-2 px-4 py-3 text-[12.5px] txt-fraco">
          Você pode consultar o cadastro, mas não tem a permissão <b>Editar</b> para mexer nele.
        </p>
      )}
      {erro && (
        <p role="alert" className="rounded-xl bg-erro-500/10 px-4 py-3 text-sm font-semibold text-erro-600">{erro}</p>
      )}

      {podeEditar && (
        <section className="painel sombra rounded-2xl p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
            <DoorOpen aria-hidden className="size-4.5 text-marinho-500" />
            Nova sala
          </h2>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-44 flex-1">
              <label htmlFor="ns" className="mb-1 block text-[12.5px] font-semibold">Nome</label>
              <input
                id="ns" value={nomeSala} onChange={(e) => setNomeSala(e.target.value)}
                placeholder="ex.: Faturamento"
                className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
              />
            </div>
            <div className="min-w-40 flex-1">
              <label htmlFor="ls" className="mb-1 block text-[12.5px] font-semibold">
                Local <span className="font-normal txt-fraco">— opcional</span>
              </label>
              <input
                id="ls" value={localSala} onChange={(e) => setLocalSala(e.target.value)}
                placeholder="ex.: 2º andar"
                className="painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500"
              />
            </div>
            <button
              type="button" onClick={() => void criarSala()} disabled={ocupado === 'sala-nova'}
              className="flex items-center gap-1.5 rounded-xl bg-marinho-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {ocupado === 'sala-nova' ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" />}
              Adicionar sala
            </button>
          </div>
        </section>
      )}

      {ordenadas.length === 0 ? (
        <div className="painel sombra rounded-2xl p-10 text-center">
          <DoorOpen aria-hidden className="mx-auto mb-3 size-8 txt-fraco" />
          <p className="text-[15px] font-semibold">Nenhuma sala cadastrada</p>
          <p className="mt-1 text-sm txt-fraco">Comece pela sala; as impressoras entram dentro dela.</p>
        </div>
      ) : ordenadas.map((s) => {
        const imps = (porSala.get(s.id) ?? [])
          .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
        return (
          <section key={s.id} className={cn('painel sombra rounded-2xl p-4', !s.ativo && 'opacity-60')}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <DoorOpen aria-hidden className="size-4.5 text-marinho-500" />
              <h3 className="text-[15px] font-bold">{s.nome}</h3>
              {s.local && <span className="text-[12px] txt-fraco">{s.local}</span>}
              {!s.ativo && (
                <span className="rounded bg-erro-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-erro-600">
                  Inativa
                </span>
              )}
              <span className="text-[12px] txt-fraco">
                {imps.length} impressora(s)
              </span>

              {podeEditar && (
                <span className="ml-auto flex items-center gap-1.5">
                  {ocupado === `sala-${s.id}` ? (
                    <Loader2 aria-hidden className="size-4 animate-spin text-marinho-500" />
                  ) : (
                    <>
                      <button
                        type="button" onClick={() => abrirForm(s.id)}
                        className="flex items-center gap-1 rounded-lg border borda px-2.5 py-1 text-[12px] font-semibold txt-fraco hover:bg-marinho-50"
                      >
                        <Plus aria-hidden className="size-3.5" /> Impressora
                      </button>
                      <button
                        type="button" onClick={() => void aoAlternarSala(s)}
                        title={s.ativo ? 'Desativar a sala' : 'Reativar a sala'}
                        className="flex items-center gap-1 rounded-lg border borda px-2.5 py-1 text-[12px] font-semibold txt-fraco hover:bg-marinho-50"
                      >
                        <Power aria-hidden className="size-3.5" /> {s.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                      <button
                        type="button" onClick={() => void aoExcluirSala(s)}
                        aria-label={`Excluir a sala ${s.nome}`}
                        className="rounded p-1 text-erro-500 hover:bg-erro-500/10"
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>

            {abrindoEm === s.id && podeEditar && (
              <div className="mb-3 grid gap-2 rounded-xl painel-2 p-3 motion-safe:animate-surgir sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Nome" valor={nomeImp} ao={setNomeImp} dica="ex.: Balcão" />
                <Campo rotulo="Modelo" valor={modeloImp} ao={setModeloImp} dica="ex.: HP LaserJet M404" />
                <Campo rotulo="Patrimônio" valor={patrimonio} ao={setPatrimonio} dica="opcional" />
                <Campo rotulo="Toner padrão" valor={tonerPadrao} ao={setTonerPadrao} dica="ex.: CF226A" />
                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
                  <button
                    type="button" onClick={() => void criarImpressora(s.id)}
                    className="rounded-xl bg-marinho-800 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Adicionar impressora
                  </button>
                  <button
                    type="button" onClick={() => setAbrindoEm(null)}
                    className="rounded-xl border borda px-4 py-2 text-sm font-semibold txt-fraco"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {imps.length === 0 ? (
              <p className="rounded-xl painel-2 px-3 py-2.5 text-[12.5px] txt-fraco">
                Nenhuma impressora nesta sala ainda.
              </p>
            ) : (
              <ul className="grid gap-1.5">
                {imps.map((i) => (
                  <li
                    key={i.id}
                    className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border borda px-3 py-2',
                      !i.ativo && 'opacity-60')}
                  >
                    <Printer aria-hidden className="size-4 txt-fraco" />
                    <b className="text-[13.5px]">{i.nome}</b>
                    {i.modelo && <span className="text-[12px] txt-fraco">{i.modelo}</span>}
                    {i.patrimonio && (
                      <span className="rounded painel-2 px-1.5 py-0.5 text-[11px] txt-fraco">
                        pat. {i.patrimonio}
                      </span>
                    )}
                    {i.toner_padrao && (
                      <span className="rounded bg-marinho-50 px-1.5 py-0.5 text-[11px] font-semibold text-marinho-800">
                        {i.toner_padrao}
                      </span>
                    )}
                    {!i.ativo && (
                      <span className="rounded bg-erro-500/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-erro-600">
                        Inativa
                      </span>
                    )}

                    {podeEditar && (
                      <span className="ml-auto flex items-center gap-1.5">
                        {ocupado === `imp-${i.id}` ? (
                          <Loader2 aria-hidden className="size-3.5 animate-spin text-marinho-500" />
                        ) : (
                          <>
                            <button
                              type="button" onClick={() => void aoAlternarImpressora(i)}
                              className="rounded-lg border borda px-2 py-0.5 text-[11.5px] font-semibold txt-fraco hover:bg-marinho-50"
                            >
                              {i.ativo ? 'Desativar' : 'Reativar'}
                            </button>
                            <button
                              type="button" onClick={() => void aoExcluirImpressora(i)}
                              aria-label={`Excluir a impressora ${i.nome}`}
                              className="rounded p-1 text-erro-500 hover:bg-erro-500/10"
                            >
                              <Trash2 aria-hidden className="size-3.5" />
                            </button>
                          </>
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Campo({ rotulo, valor, ao, dica }: {
  rotulo: string; valor: string; ao: (v: string) => void; dica: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold">{rotulo}</label>
      <input
        value={valor} onChange={(e) => ao(e.target.value)} placeholder={dica}
        className="painel w-full rounded-lg border borda px-2.5 py-1.5 text-[13px] outline-none focus:border-marinho-500"
      />
    </div>
  );
}
