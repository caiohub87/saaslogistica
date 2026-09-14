'use client';

import {
  Camera, Check, Loader2, Plus, Search, ShieldCheck, Trash2, UserPlus, Users, X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  acharProduto, catalogoDeInventarios, CONFIG, comprimirFoto, conferida, fmtData, fmtQtd,
  hojeISO, MAX_AJUDANTES, normNome, normPlaca, parseQtd, produtosDe, produtoTexto,
  variantesDeCodigo,
  type ProdutoConhecido,
} from '@/lib/ocorrencias';
import { getSupabase } from '@/lib/supabase';
import { useSessao } from '@/providers/SessionProvider';
import type {
  FuncaoEquipe, Inventario, Ocorrencia, PessoaEquipe, TipoOcorrencia, Veiculo,
} from '@/types/database';
import { cn } from '@/utils/cn';

type Aba = TipoOcorrencia | 'equipe';

/** Uma linha da lista de produtos do formulário. */
interface LinhaProduto {
  produto: string;
  embalagem: string;
  /** só usado quando o código não está em inventário nem no catálogo do ERP */
  descricao: string;
}
const linhaVazia = (): LinhaProduto => ({ produto: '', embalagem: '', descricao: '' });

interface Form {
  data: string; lote: string; quantidade: string;
  motorista: string; ajudantes: string[]; placa: string; foto: string | null; obs: string;
  produtos: LinhaProduto[];
}
/** O cadastro da aba Equipe guarda três coisas na mesma lista. */
type TipoCadastro = FuncaoEquipe | 'veiculo';

/** Uma linha da lista de cadastro, seja pessoa ou veículo. */
interface LinhaCadastro {
  id: number;
  tipo: TipoCadastro;
  rotulo: string;
  ativo: boolean;
  alternar: () => Promise<void>;
  excluir: () => Promise<void>;
}

const formVazio = (): Form => ({
  data: hojeISO(), lote: '', quantidade: '',
  motorista: '', ajudantes: [''], placa: '', foto: null, obs: '',
  produtos: [linhaVazia()],
});

/** De qual arquivo SQL vem cada tabela desta tela — faltando uma, rodar a outra não resolve. */
const ORIGEM: Record<string, string> = {
  ocorrencias: '14_faltas_sobras.sql',
  motoristas: '14_faltas_sobras.sql',
  produtos: '18_produtos.sql',
  veiculos: '20_veiculos.sql',
};

/**
 * Traduz o erro do banco em instrução.
 *
 * São DUAS frases diferentes para "a tabela não existe", e a tela precisa das
 * duas: o Postgres escreve `relation "x" does not exist`, mas quando a tabela
 * nunca foi criada quem responde antes dele é o PostgREST, com
 * `Could not find the table 'public.x' in the schema cache` — que não tem
 * nenhuma das palavras da outra. Sem este caso a pessoa recebia a mensagem
 * técnica crua, sem saber que o que faltava era rodar um SQL.
 */
const dica = (msg: string) => {
  const semTabela = /Could not find the table '(?:public\.)?(\w+)'/i.exec(msg);
  if (semTabela) {
    const tabela = semTabela[1];
    const arquivo = ORIGEM[tabela];
    return arquivo
      ? ` — a tabela ${tabela} não existe: rode supabase/${arquivo} no Supabase.`
      : ` — a tabela ${tabela} não existe no banco: falta rodar o SQL que a cria.`;
  }
  if (/relation|does not exist|column|schema cache/i.test(msg)) {
    return ' — rode o SQL 14_faltas_sobras.sql no Supabase.';
  }
  return /permission|policy|row-level/i.test(msg)
    ? ' — seu acesso não tem permissão para isso.'
    : '';
};

export default function FaltasSobrasPage() {
  const { pode, demo, usuario } = useSessao();
  const podeLancar = pode('ocorrencias', 'lancar');
  const podeAprovar = pode('ocorrencias', 'aprovar');
  const podeExcluir = pode('ocorrencias', 'excluir');

  const [aba, setAba] = useState<Aba>('falta');
  const tipoAtivo: TipoOcorrencia | null = aba === 'equipe' ? null : aba;
  const cfg = CONFIG[tipoAtivo ?? 'falta'];

  const [itens, setItens] = useState<Ocorrencia[]>([]);
  const [equipe, setEquipe] = useState<PessoaEquipe[]>([]);
  /**
   * Código do produto -> nome. Começa nos inventários lançados e recebe também
   * o que o catálogo do ERP responde: com a busca por linha, ter um lugar só
   * evita um "achado" por campo do formulário.
   */
  const [catalogo, setCatalogo] = useState<Record<string, ProdutoConhecido>>({});
  const [buscandoProduto, setBuscandoProduto] = useState(false);
  /** códigos que já foram perguntados ao ERP — evita repetir o que não existe */
  const jaConsultados = useRef<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState<Form>(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [fotoAberta, setFotoAberta] = useState<number | null>(null);
  /** fotos ja buscadas, por id — a listagem nao as traz */
  const [fotos, setFotos] = useState<Record<number, string>>({});
  const [buscandoFoto, setBuscandoFoto] = useState<number | null>(null);

  /**
   * Busca a foto de um registro quando alguem pede para ve-la, e guarda.
   * Reabrir a mesma nao volta ao banco.
   */
  async function abrirFoto(id: number) {
    if (fotos[id]) { setFotoAberta(id); return; }
    setBuscandoFoto(id);
    if (demo) {
      const { ocorrenciasDemo } = await import('@/lib/demo');
      const f = ocorrenciasDemo(tipoAtivo ?? 'sobra').find((x) => x.id === id)?.foto ?? null;
      if (f) setFotos((m) => ({ ...m, [id]: f }));
      setBuscandoFoto(null);
      if (f) setFotoAberta(id);
      return;
    }
    const sb = getSupabase();
    if (!sb) { setBuscandoFoto(null); return; }
    const { data, error } = await sb.from('ocorrencias').select('foto').eq('id', id).single();
    setBuscandoFoto(null);
    if (error || !data?.foto) { setErro('Nao consegui carregar a foto deste registro.'); return; }
    setFotos((m) => ({ ...m, [id]: data.foto as string }));
    setFotoAberta(id);
  }
  const [validando, setValidando] = useState<number | null>(null);
  const [formValida, setFormValida] = useState<LinhaProduto[]>([linhaVazia()]);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<'todos' | 'pendentes' | 'ok'>('todos');
  const [ini, setIni] = useState('');
  const [fim, setFim] = useState('');
  const [frota, setFrota] = useState<Veiculo[]>([]);
  /** pessoas e veículos entram pelo mesmo formulário; o tipo decide o destino */
  const [novoCadastro, setNovoCadastro] = useState<{ valor: string; tipo: TipoCadastro }>({
    valor: '', tipo: 'motorista',
  });
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
    // TUDO menos `foto`: ela é um data:image de até 900 KB por linha e só
    // aparece se alguém clicar em "ver foto". Baixar todas para desenhar a
    // lista são dezenas de MB no 4G do depósito. `tem_foto` é calculada no
    // banco e diz se existe; a imagem vem sob demanda em carregarFoto().
    const { data, error } = await sb.from('ocorrencias')
      .select('id,unidade,tipo,data,lote,produtos,produto,embalagem,descricao,quantidade,'
        + 'motorista,ajudantes,placa,tem_foto,obs,registrado_por,registrado_por_id,'
        + 'aprovado_por,aprovado_em,validado_por,validado_em,criado_em')
      .eq('tipo', tipoAtivo).order('data', { ascending: false }).limit(2000);
    if (error) { setErro(error.message + dica(error.message)); setItens([]); }
    else { setItens((data ?? []) as Ocorrencia[]); setErro(null); }
    setCarregando(false);
  }, [tipoAtivo, demo]);

  const carregarEquipe = useCallback(async () => {
    if (demo) {
      const { equipeDemo, frotaDemo } = await import('@/lib/demo');
      setEquipe(equipeDemo());
      setFrota(frotaDemo());
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const [p, v] = await Promise.all([
      sb.from('motoristas').select('*').order('nome'),
      sb.from('veiculos').select('*').order('placa'),
    ]);
    if (!p.error) setEquipe((p.data ?? []) as PessoaEquipe[]);
    if (!v.error) setFrota((v.data ?? []) as Veiculo[]);
  }, [demo]);

  /**
   * Nome dos produtos, tirado dos inventários já lançados. SÓ LEITURA: nada
   * aqui grava no inventário.
   *
   * Falhar aqui não atrapalha a tela — quem não tem permissão de ver inventário
   * simplesmente digita o nome do produto na mão, que é o mesmo caminho de quem
   * registra um código que nunca foi contado.
   */
  const carregarCatalogo = useCallback(async () => {
    if (demo) {
      const { INVENTARIOS_DEMO } = await import('@/lib/demo');
      setCatalogo(catalogoDeInventarios(INVENTARIOS_DEMO));
      return;
    }
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from('inventarios')
      .select('data_inventario, produtos')
      .order('data_inventario', { ascending: false }).limit(300);
    if (!error && data) {
      setCatalogo(catalogoDeInventarios(data as unknown as Inventario[]));
    }
  }, [demo]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void carregarEquipe(); }, [carregarEquipe]);
  useEffect(() => { void carregarCatalogo(); }, [carregarCatalogo]);

  /**
   * O catálogo do ERP tem ~11 mil produtos — carregar tudo a cada visita pesaria
   * no 4G do depósito, então a consulta é pelo código que está sendo digitado.
   * Espera meio segundo depois da última tecla para não consultar letra a letra.
   */
  const codigosDigitados = form.produtos.map((p) => p.produto.trim()).filter(Boolean).join('|');

  useEffect(() => {
    if (demo) { setBuscandoProduto(false); return; }
    const pendentes = [...new Set(codigosDigitados.split('|').filter(Boolean))]
      .filter((c) => !acharProduto(c, catalogo) && !jaConsultados.current.has(c));
    if (!pendentes.length) { setBuscandoProduto(false); return; }

    let vivo = true;
    // marca "procurando" já: sem isso a tela diz "não encontrado" no meio da
    // digitação e some depois, o que parece erro
    setBuscandoProduto(true);
    const t = setTimeout(async () => {
      const sb = getSupabase();
      if (!sb) { setBuscandoProduto(false); return; }
      // uma consulta para todas as linhas: com cinco produtos no formulário,
      // cinco idas ao banco a cada tecla seria desperdício no 4G do depósito
      const { data } = await sb.from('produtos')
        .select('codigo, descricao, embalagem')
        .in('codigo', pendentes.flatMap(variantesDeCodigo)).limit(200);
      if (!vivo) return;
      pendentes.forEach((c) => jaConsultados.current.add(c));
      const achados = (data ?? []) as { codigo: string; descricao: string; embalagem: string | null }[];
      if (achados.length) {
        // entra no mesmo catálogo do inventário: daí para frente toda a tela
        // — formulário, lista, busca — enxerga por um caminho só
        setCatalogo((atual) => {
          const novo = { ...atual };
          achados.forEach((p) => {
            novo[p.codigo] ??= { id: p.codigo, descricao: p.descricao, embalagem: p.embalagem ?? '' };
          });
          return novo;
        });
      }
      setBuscandoProduto(false);
    }, 500);

    return () => { vivo = false; clearTimeout(t); };
  }, [codigosDigitados, catalogo, demo]);

  /**
   * O que se sabe do código de uma linha.
   *
   * O inventário vem primeiro porque traz a embalagem que foi realmente contada;
   * o catálogo do ERP entra para o produto que nunca passou por um inventário —
   * e, quando responde, é fundido no mesmo catálogo, então aqui há só uma busca.
   */
  const infoProduto = (codigo: string) => {
    const c = codigo.trim();
    const achado = c ? acharProduto(c, catalogo) : null;
    return {
      achado,
      procurando: Boolean(c) && !achado && buscandoProduto,
      /** nem o inventário nem o ERP conhecem: o nome vai na mão */
      desconhecido: Boolean(c) && !achado && !buscandoProduto,
    };
  };

  /**
   * Registros antigos, gravados antes de existir a coluna do nome, mostram só o
   * código. Uma consulta ao catálogo do ERP com os códigos que aparecem na lista
   * resolve todos de uma vez — e o resultado entra no mesmo catálogo, então
   * serve também ao formulário.
   */
  useEffect(() => {
    if (demo) return;
    const faltando = [...new Set(itens
      .flatMap(produtosDe)
      .filter((p) => p.produto && !p.descricao)
      .map((p) => p.produto))]
      .filter((c) => !acharProduto(c, catalogo) && !jaConsultados.current.has(c));
    if (!faltando.length) return;

    faltando.forEach((c) => jaConsultados.current.add(c));
    let vivo = true;
    void (async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { data } = await sb.from('produtos')
        .select('codigo, descricao, embalagem')
        .in('codigo', faltando.flatMap(variantesDeCodigo)).limit(2000);
      if (!vivo || !data?.length) return;
      setCatalogo((atual) => {
        const novo = { ...atual };
        (data as { codigo: string; descricao: string; embalagem: string | null }[])
          .forEach((p) => {
            novo[p.codigo] ??= { id: p.codigo, descricao: p.descricao, embalagem: p.embalagem ?? '' };
          });
        return novo;
      });
    })();
    return () => { vivo = false; };
  }, [itens, catalogo, demo]);

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

  // ---------- ajudantes ----------
  // um campo só na tela; quem levou mais gente clica e ganha o próximo, até 3
  const mudarAjudante = (i: number, nome: string) =>
    setForm((f) => ({ ...f, ajudantes: f.ajudantes.map((a, j) => (j === i ? nome : a)) }));
  const tirarAjudante = (i: number) =>
    setForm((f) => {
      const resto = f.ajudantes.filter((_, j) => j !== i);
      return { ...f, ajudantes: resto.length ? resto : [''] };
    });
  const maisUmAjudante = () =>
    setForm((f) => (f.ajudantes.length >= MAX_AJUDANTES ? f : { ...f, ajudantes: [...f.ajudantes, ''] }));

  // ---------- produtos ----------
  // mesmo desenho dos ajudantes: um campo na tela e o botão que dá o próximo.
  // Sem teto, ao contrário deles: a rota leva no máximo 3 pessoas, mas não há
  // número máximo de produtos que podem faltar numa carga.
  const mudarProduto = (i: number, campo: keyof LinhaProduto, valor: string) =>
    setForm((f) => ({
      ...f,
      produtos: f.produtos.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)),
    }));
  const tirarProduto = (i: number) =>
    setForm((f) => {
      const resto = f.produtos.filter((_, j) => j !== i);
      return { ...f, produtos: resto.length ? resto : [linhaVazia()] };
    });
  const maisUmProduto = () =>
    setForm((f) => ({ ...f, produtos: [...f.produtos, linhaVazia()] }));

  // ---------- registrar ----------
  async function registrar() {
    if (!tipoAtivo) return;
    setMsg(null); setErro(null);
    if (!form.lote.trim()) { setErro('Informe o lote.'); return; }
    if (!form.motorista.trim()) { setErro('Escolha o motorista.'); return; }

    // linha em branco não é erro: é o campo vazio que sempre sobra embaixo
    // depois de clicar em "mais um produto" e desistir
    const produtos = form.produtos
      .filter((p) => p.produto.trim())
      .map((p) => {
        const achado = infoProduto(p.produto).achado;
        return {
          produto: p.produto.trim(),
          embalagem: p.embalagem.trim() || achado?.embalagem || null,
          // o nome achado fica GRAVADO junto, e não é lido do inventário toda
          // vez: o registro é a foto do momento, igual ao motorista desta tabela
          descricao: achado?.descricao || p.descricao.trim() || null,
        };
      });
    if (cfg.temProduto && !produtos.length) {
      setErro('Informe ao menos um código de produto.');
      return;
    }
    const repetido = produtos.find((p, i) => produtos.findIndex((q) => q.produto === p.produto) !== i);
    if (repetido) {
      setErro(`O produto ${repetido.produto} está repetido na lista.`);
      return;
    }

    const qtd = cfg.temQuantidade ? parseQtd(form.quantidade) : null;
    if (cfg.temQuantidade && qtd == null) { setErro('Informe quanto sobrou (quantidade maior que zero).'); return; }
    // a foto é o que identifica a sobra, mas não trava o registro: se o
    // celular falhar na hora, o lote e o motorista já valem mais que nada
    if (cfg.temFoto && !form.foto && !confirm('Registrar a sobra sem foto?')) return;
    if (bloqueadoNoDemo()) return;

    const sb = getSupabase();
    if (!sb) return;
    setSalvando(true);
    const equipe = [...new Set(form.ajudantes.map(normNome).filter(Boolean))];
    const { error } = await sb.from('ocorrencias').insert({
      unidade: usuario!.unidade,
      tipo: tipoAtivo,
      data: form.data,
      lote: form.lote.trim(),
      // na sobra os produtos entram só na validação — aqui ninguém sabe ainda
      // quais são
      produtos: cfg.temProduto ? produtos : [],
      quantidade: qtd,
      motorista: form.motorista,
      ajudantes: cfg.temAjudantes ? equipe : [],
      placa: form.placa ? normPlaca(form.placa) : null,
      foto: cfg.temFoto ? form.foto : null,
      obs: form.obs.trim() || null,
      registrado_por: usuario!.nome,
      registrado_por_id: usuario!.id,
    });
    setSalvando(false);

    if (error) { setErro('Não registrou: ' + error.message + dica(error.message)); return; }
    setMsg(tipoAtivo === 'falta'
      ? `Falta do lote ${form.lote.trim()} registrada — aguardando aprovação.`
      : `Sobra do lote ${form.lote.trim()} registrada — falta validar o código do produto.`);
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

  // ---------- segunda conferência ----------
  /**
   * Aprovar (falta) e validar (sobra) são a mesma permissão e o mesmo update.
   *
   * O update pede as linhas de volta (.select): barrado pela RLS, o Supabase
   * responde sem erro e sem linha nenhuma — e a tela diria que deu certo.
   */
  async function conferir(o: Ocorrencia, dados: Record<string, unknown>, aviso: string) {
    setMsg(null); setErro(null);
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    setOcupado(o.id);
    const { data, error } = await sb.from('ocorrencias').update(dados).eq('id', o.id).select('id');
    setOcupado(null);
    if (error) { setErro(error.message + dica(error.message)); return; }
    if (!(data ?? []).length) {
      setErro(`Nada mudou — seu acesso não tem a permissão ${cfg.conferencia === 'Aprovar' ? 'de aprovar falta' : 'de validar sobra'}.`);
      return;
    }
    setValidando(null);
    setMsg(aviso);
    await carregar();
  }

  const aprovarFalta = (o: Ocorrencia) => conferir(
    o,
    { aprovado_por: usuario!.nome, aprovado_em: new Date().toISOString() },
    `Falta do lote ${o.lote} aprovada por ${usuario!.nome}.`,
  );

  function retirarAprovacao(o: Ocorrencia) {
    if (!confirm(`Retirar a aprovação da falta do lote ${o.lote}?`)) return;
    void conferir(o, { aprovado_por: null, aprovado_em: null }, 'Aprovação retirada.');
  }

  function abrirValidacao(o: Ocorrencia) {
    setValidando(o.id);
    const jaTem = produtosDe(o);
    setFormValida(jaTem.length
      ? jaTem.map((p) => ({ produto: p.produto, embalagem: p.embalagem ?? '', descricao: '' }))
      : [linhaVazia()]);
    setMsg(null); setErro(null);
  }

  const mudarValida = (i: number, campo: keyof LinhaProduto, valor: string) =>
    setFormValida((l) => l.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));
  const tirarValida = (i: number) =>
    setFormValida((l) => {
      const resto = l.filter((_, j) => j !== i);
      return resto.length ? resto : [linhaVazia()];
    });

  /**
   * A sobra volta sem etiqueta e alguém diz depois o que era. Aceita vários
   * produtos pela mesma razão da falta: uma carroceria raramente volta com um
   * item só, e antes cada um exigiria uma sobra separada — com a mesma foto.
   */
  async function validarSobra(o: Ocorrencia) {
    const digitados = formValida.filter((p) => p.produto.trim());
    if (!digitados.length) {
      setErro('Informe ao menos um código de produto para validar a sobra.');
      return;
    }

    // mesma busca da falta: identificar a sobra é dizer que produto é aquele.
    // O inventário primeiro (traz a embalagem contada), o catálogo do ERP depois.
    const semNome = digitados
      .map((p) => p.produto.trim())
      .filter((c) => !acharProduto(c, catalogo));
    const doErp: Record<string, ProdutoConhecido> = {};
    if (semNome.length && !demo) {
      const sb = getSupabase();
      const { data } = await (sb?.from('produtos')
        .select('codigo, descricao, embalagem')
        .in('codigo', semNome.flatMap(variantesDeCodigo)).limit(200)
        ?? Promise.resolve({ data: null }));
      (data ?? []).forEach((p: { codigo: string; descricao: string; embalagem: string | null }) => {
        doErp[p.codigo] = { id: p.codigo, descricao: p.descricao, embalagem: p.embalagem ?? '' };
      });
    }

    const produtos = digitados.map((p) => {
      const codigo = p.produto.trim();
      const achado = acharProduto(codigo, catalogo) ?? acharProduto(codigo, doErp);
      return {
        produto: codigo,
        embalagem: p.embalagem.trim() || achado?.embalagem || null,
        descricao: achado?.descricao || p.descricao.trim() || null,
      };
    });

    void conferir(
      o,
      {
        produtos,
        validado_por: usuario!.nome,
        validado_em: new Date().toISOString(),
      },
      `Sobra do lote ${o.lote} validada como ${produtos.map((p) => produtoTexto(p.produto, p.embalagem)).join(', ')}.`,
    );
  }

  // ---------- equipe ----------
  async function adicionarPessoa(bruto: string, funcao: FuncaoEquipe) {
    const nome = normNome(bruto);
    setMsg(null); setErro(null);
    if (!nome) { setErro('Escreva o nome.'); return; }
    // o mesmo nome pode existir nas duas funções — quem ajuda e às vezes dirige
    if (equipe.some((p) => p.nome === nome && p.funcao === funcao)) {
      setErro(`${nome} já está na lista de ${funcao}s.`);
      return;
    }
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('motoristas').insert({ unidade: usuario!.unidade, nome, funcao });
    if (error) { setErro('Não cadastrou: ' + error.message + dica(error.message)); return; }
    setNovoCadastro((c) => ({ ...c, valor: '' }));
    setMsg(`${nome} entrou na lista de ${funcao}s.`);
    await carregarEquipe();
  }

  async function alternarAtivo(p: PessoaEquipe) {
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('motoristas').update({ ativo: !p.ativo }).eq('id', p.id);
    if (error) { setErro(error.message + dica(error.message)); return; }
    setMsg(p.ativo ? `${p.nome} saiu da lista de ativos.` : `${p.nome} voltou para os ativos.`);
    await carregarEquipe();
  }

  async function excluirPessoa(p: PessoaEquipe) {
    if (!confirm(`Tirar ${p.nome} do cadastro?\n\nOs registros antigos guardam o nome e não mudam.`)) return;
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('motoristas').delete().eq('id', p.id);
    if (error) { setErro(error.message + dica(error.message)); return; }
    setMsg(`${p.nome} saiu do cadastro.`);
    await carregarEquipe();
  }

  // ---------- frota ----------
  async function adicionarVeiculo(bruta: string) {
    const placa = normPlaca(bruta);
    setMsg(null); setErro(null);
    if (!placa) { setErro('Escreva a placa.'); return; }
    if (frota.some((v) => v.placa === placa)) {
      setErro(`A placa ${placa} já está cadastrada.`);
      return;
    }
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('veiculos').insert({ unidade: usuario!.unidade, placa });
    if (error) { setErro('Não cadastrou: ' + error.message + dica(error.message)); return; }
    setNovoCadastro((c) => ({ ...c, valor: '' }));
    setMsg(`${placa} entrou na frota.`);
    await carregarEquipe();
  }

  /** O formulário é um só: aqui o tipo escolhido decide para onde vai. */
  async function adicionarCadastro() {
    const { valor, tipo } = novoCadastro;
    if (tipo === 'veiculo') { await adicionarVeiculo(valor); return; }
    await adicionarPessoa(valor, tipo);
  }

  async function alternarVeiculo(v: Veiculo) {
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('veiculos').update({ ativo: !v.ativo }).eq('id', v.id);
    if (error) { setErro(error.message + dica(error.message)); return; }
    setMsg(v.ativo ? `${v.placa} saiu da frota ativa.` : `${v.placa} voltou para a frota ativa.`);
    await carregarEquipe();
  }

  async function excluirVeiculo(v: Veiculo) {
    if (!confirm(`Tirar ${v.placa} do cadastro?\n\nOs registros antigos guardam a placa e não mudam.`)) return;
    if (bloqueadoNoDemo()) return;
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('veiculos').delete().eq('id', v.id);
    if (error) { setErro(error.message + dica(error.message)); return; }
    setMsg(`${v.placa} saiu do cadastro.`);
    await carregarEquipe();
  }

  // ---------- consultas ----------
  const motoristasAtivos = useMemo(
    () => equipe.filter((p) => p.ativo && p.funcao === 'motorista'),
    [equipe],
  );
  const ajudantesAtivos = useMemo(
    () => equipe.filter((p) => p.ativo && p.funcao === 'ajudante'),
    [equipe],
  );
  /**
   * Pessoas e veículos numa lista só, que é como a tela mostra: motoristas,
   * depois ajudantes, depois a frota — cada grupo em ordem alfabética.
   *
   * Cada linha carrega o que fazer com ela, porque desativar um motorista e
   * desativar um carro batem em tabelas diferentes.
   */
  const cadastro: LinhaCadastro[] = useMemo(() => {
    const ordem: Record<TipoCadastro, number> = { motorista: 0, ajudante: 1, veiculo: 2 };
    const pessoas: LinhaCadastro[] = equipe.map((p) => ({
      id: p.id, tipo: p.funcao, rotulo: p.nome, ativo: p.ativo,
      alternar: () => alternarAtivo(p), excluir: () => excluirPessoa(p),
    }));
    const carros: LinhaCadastro[] = frota.map((v) => ({
      id: v.id, tipo: 'veiculo' as const, rotulo: v.placa, ativo: v.ativo,
      alternar: () => alternarVeiculo(v), excluir: () => excluirVeiculo(v),
    }));
    return [...pessoas, ...carros].sort((a, b) => (a.tipo === b.tipo
      ? a.rotulo.localeCompare(b.rotulo, 'pt-BR')
      : ordem[a.tipo] - ordem[b.tipo]));
    // as funções de ação são estáveis o bastante: dependem só de equipe/frota
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipe, frota],
  );
  const frotaAtiva = useMemo(() => frota.filter((v) => v.ativo), [frota]);
  /**
   * As placas que a tela oferece: a frota cadastrada, mais as que aparecem em
   * registros antigos e ainda não foram cadastradas — assim ninguém perde a
   * placa de um carro que saiu da frota antes deste cadastro existir.
   */
  const placas = useMemo(() => {
    const doCadastro = frotaAtiva.map((v) => v.placa);
    const doHistorico = (itens.map((o) => o.placa).filter(Boolean) as string[])
      .filter((p) => !doCadastro.includes(p));
    return [...new Set([...doCadastro, ...doHistorico])].sort();
  }, [frotaAtiva, itens]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((o) => (!ini || o.data >= ini) && (!fim || o.data <= fim))
      .filter((o) => situacao === 'todos' || (situacao === 'ok' ? conferida(o) : !conferida(o)))
      // busca em TODOS os produtos do registro: procurar por um código tem de
      // achar a falta mesmo quando ele é o terceiro da lista
      .filter((o) => !q || [o.lote, o.motorista, o.placa, o.obs,
        ...(o.ajudantes ?? []),
        ...produtosDe(o).flatMap((p) => [p.produto, p.embalagem, p.descricao])]
        .some((x) => (x ?? '').toLowerCase().includes(q)));
  }, [itens, busca, ini, fim, situacao]);

  const pendentes = useMemo(() => itens.filter((o) => !conferida(o)).length, [itens]);

  if (!pode('ocorrencias', 'ver')) {
    return (
      <div className="painel sombra mx-auto max-w-md rounded-2xl p-6 text-center">
        <h1 className="text-lg font-bold">Sem acesso</h1>
        <p className="mt-2 text-sm txt-fraco">Você não tem permissão para ver faltas e sobras.</p>
      </div>
    );
  }

  const ENTRADA = 'painel-2 w-full rounded-xl border borda px-3 py-2 text-sm outline-none focus:border-marinho-500';
  const BOTAO_LINHA = 'flex items-center gap-1 rounded-lg border borda px-2 py-1 text-[11.5px] font-semibold';

  return (
    <div className="motion-safe:animate-entrada">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <cfg.Icone aria-hidden className="size-5 text-marinho-500" />
          Faltas e sobras
        </h1>
        <p className="mt-1 text-sm txt-fraco">
          <b>Falta</b> é o que não chegou: produto, lote e a equipe da rota — e passa por aprovação.{' '}
          <b>Sobra</b> é o que voltou na carroceria: quantidade e foto na hora, e depois alguém
          valida dizendo de que produto é.
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
            onClick={() => {
              setAba(c.tipo); setForm(formVazio()); setMsg(null); setErro(null); setValidando(null);
            }}
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
          type="button" onClick={() => { setAba('equipe'); setMsg(null); setErro(null); }}
          className={cn(
            'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition-colors',
            aba === 'equipe' ? 'bg-marinho-800 text-white' : 'txt-fraco hover:bg-marinho-50',
          )}
        >
          <Users aria-hidden className="size-4" />
          Equipe
        </button>
      </div>

      {/* ---------------- cadastro da equipe ---------------- */}
      {aba === 'equipe' && (
        <section className="painel sombra rounded-2xl p-4 motion-safe:animate-subir">
          <h2 className="mb-1 text-[15px] font-bold">Equipe e veículos</h2>
          <p className="mb-3 text-[12.5px] txt-fraco">
            Quem e o que aparece para escolher ao registrar falta ou sobra. Desativar tira das
            opções sem apagar nada: os registros antigos guardam o nome e a placa como texto.
            Quem ajuda e às vezes dirige pode entrar nas duas funções.
          </p>

          {podeLancar && (
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={novoCadastro.valor}
                onChange={(e) => setNovoCadastro({ ...novoCadastro, valor: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void adicionarCadastro(); }}
                placeholder={novoCadastro.tipo === 'veiculo' ? 'OEY 8503' : 'Nome'}
                aria-label={novoCadastro.tipo === 'veiculo' ? 'Placa' : 'Nome'}
                autoComplete="off"
                className={cn(ENTRADA, 'sm:max-w-xs')}
              />
              <select
                value={novoCadastro.tipo} aria-label="O que está cadastrando"
                onChange={(e) => setNovoCadastro({
                  ...novoCadastro, tipo: e.target.value as TipoCadastro,
                })}
                className={cn(ENTRADA, 'sm:max-w-40')}
              >
                <option value="motorista">Motorista</option>
                <option value="ajudante">Ajudante</option>
                <option value="veiculo">Veículo</option>
              </select>
              <button
                type="button" onClick={() => void adicionarCadastro()}
                className="flex items-center gap-1.5 rounded-xl bg-marinho-800 px-3 py-2 text-[13px] font-semibold text-white"
              >
                <UserPlus aria-hidden className="size-4" /> Adicionar
              </button>
            </div>
          )}

          {!cadastro.length ? (
            <p className="rounded-xl painel-2 px-3 py-6 text-center text-[13px] txt-fraco">
              Nada cadastrado ainda.
            </p>
          ) : (
            <>
              <p className="mb-2 text-[12px] txt-fraco">
                {motoristasAtivos.length} motorista(s), {ajudantesAtivos.length} ajudante(s) e{' '}
                {frotaAtiva.length} veículo(s) ativos.
              </p>
              <ul className="flex flex-col gap-1.5">
                {cadastro.map((c) => (
                  <li
                    key={c.tipo + c.id}
                    className={cn('flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2',
                      c.ativo ? 'borda' : 'borda opacity-60')}
                  >
                    <span
                      className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold uppercase',
                        c.tipo === 'motorista' ? 'bg-marinho-100 text-marinho-800'
                          : c.tipo === 'veiculo' ? 'bg-ouro-100 text-ouro-700'
                            : 'painel-2 txt-fraco')}
                    >
                      {c.tipo}
                    </span>
                    <span className={cn('text-[13.5px] font-semibold',
                      c.tipo === 'veiculo' && 'font-mono tracking-wide')}>
                      {c.rotulo}
                    </span>
                    {!c.ativo && (
                      <span className="rounded-md painel-2 px-2 py-0.5 text-[11px] font-bold txt-fraco">inativo</span>
                    )}
                    {podeLancar && (
                      <div className="ml-auto flex items-center gap-1.5">
                        <button type="button" onClick={() => void c.alternar()} className={cn(BOTAO_LINHA, 'txt-fraco')}>
                          {c.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                        <button
                          type="button" onClick={() => void c.excluir()}
                          aria-label={`Tirar ${c.rotulo} do cadastro`}
                          className={cn(BOTAO_LINHA, 'text-erro-600 hover:bg-erro-500/10')}
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
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
              <div className="sm:col-span-2 lg:col-span-3">
                <span className="mb-1 block text-[12.5px] font-semibold">
                  Produtos <span className="txt-fraco">(um por linha)</span>
                </span>
                <datalist id="oc-catalogo">
                  {Object.values(catalogo).slice(0, 1000).map((p) => (
                    <option key={p.id} value={p.id}>{p.descricao}</option>
                  ))}
                </datalist>

                <div className="flex flex-col gap-2">
                  {form.produtos.map((linha, i) => {
                    const info = infoProduto(linha.produto);
                    return (
                      <div key={`prod-${i}`} className="rounded-xl border borda p-2">
                        <div className="flex items-start gap-1.5">
                          <div className="flex-1">
                            <input
                              inputMode="numeric" placeholder="65696" autoComplete="off"
                              list="oc-catalogo" aria-label={`Código do produto ${i + 1}`}
                              value={linha.produto}
                              onChange={(e) => mudarProduto(i, 'produto', e.target.value)}
                              className={ENTRADA}
                            />
                          </div>
                          <div className="flex-1">
                            <input
                              placeholder={info.achado?.embalagem || '48UNID'} autoComplete="off"
                              aria-label={`Embalagem do produto ${i + 1}`}
                              value={linha.embalagem}
                              onChange={(e) => mudarProduto(i, 'embalagem', e.target.value)}
                              className={ENTRADA}
                            />
                          </div>
                          {form.produtos.length > 1 && (
                            <button
                              type="button" onClick={() => tirarProduto(i)}
                              aria-label={`Tirar o produto ${i + 1}`}
                              className="rounded-lg border borda p-2 txt-fraco hover:bg-erro-500/10 hover:text-erro-600"
                            >
                              <X aria-hidden className="size-3.5" />
                            </button>
                          )}
                        </div>

                        <p className="mt-1 text-[12px] leading-snug">
                          {info.achado ? (
                            <span className="font-semibold text-ok-600">
                              {info.achado.descricao || 'Produto encontrado'}
                            </span>
                          ) : info.procurando ? (
                            <span className="txt-fraco">Procurando…</span>
                          ) : info.desconhecido ? (
                            <span className="txt-fraco">Código não encontrado — escreva o nome abaixo.</span>
                          ) : (
                            <span className="txt-fraco">O nome aparece sozinho a partir do código.</span>
                          )}
                        </p>

                        {/* só quando ninguém conhece o código: o nome vai na mão */}
                        {info.desconhecido && (
                          <input
                            placeholder="BISC MARILAN RECH 80G CHOCOLATE" autoComplete="off"
                            aria-label={`Nome do produto ${i + 1}`}
                            value={linha.descricao}
                            onChange={(e) => mudarProduto(i, 'descricao', e.target.value)}
                            className={cn(ENTRADA, 'mt-1')}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button" onClick={maisUmProduto}
                  className="mt-1.5 flex items-center gap-1 rounded-lg border borda px-2.5 py-1 text-[11.5px] font-semibold txt-fraco"
                >
                  <Plus aria-hidden className="size-3.5" /> Mais um produto
                </button>
              </div>
            )}

            {cfg.temQuantidade && (
              <div>
                <label htmlFor="oc-qtd" className="mb-1 block text-[12.5px] font-semibold">Quantidade que sobrou</label>
                <input
                  id="oc-qtd" inputMode="decimal" placeholder="3" autoComplete="off"
                  value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                  className={ENTRADA}
                />
              </div>
            )}

            <div>
              <label htmlFor="oc-mot" className="mb-1 block text-[12.5px] font-semibold">Motorista</label>
              <select
                id="oc-mot" value={form.motorista}
                onChange={(e) => setForm({ ...form, motorista: e.target.value })}
                className={ENTRADA}
              >
                <option value="">Selecione…</option>
                {motoristasAtivos.map((m) => <option key={m.id} value={m.nome}>{m.nome}</option>)}
              </select>
              {!motoristasAtivos.length && (
                <p className="mt-1 text-[11.5px] txt-fraco">
                  Nenhum motorista cadastrado — cadastre na aba <b>Equipe</b>.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="oc-placa" className="mb-1 block text-[12.5px] font-semibold">Placa</label>
              {/* escolher em vez de digitar: 'OEY 8503' e 'OEY8503' digitados a
                  mao viram dois veiculos na hora de somar as ocorrencias */}
              <select
                id="oc-placa" value={form.placa}
                onChange={(e) => setForm({ ...form, placa: e.target.value })}
                className={ENTRADA}
              >
                <option value="">Selecione…</option>
                {placas.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {!placas.length && (
                <p className="mt-1 text-[11.5px] txt-fraco">
                  Nenhum veículo cadastrado — cadastre na aba <b>Equipe</b>.
                </p>
              )}
            </div>

            {cfg.temAjudantes && (
              <div className="sm:col-span-2 lg:col-span-1">
                <span className="mb-1 block text-[12.5px] font-semibold">
                  Ajudantes <span className="txt-fraco">(opcional, até {MAX_AJUDANTES})</span>
                </span>
                <div className="flex flex-col gap-1.5">
                  {form.ajudantes.map((a, i) => (
                    <div key={`aj-${i}`} className="flex items-center gap-1.5">
                      <select
                        value={a} aria-label={`Ajudante ${i + 1}`}
                        onChange={(e) => mudarAjudante(i, e.target.value)}
                        className={ENTRADA}
                      >
                        <option value="">Ajudante {i + 1}…</option>
                        {/* quem já está em outro campo sai da lista, para não repetir */}
                        {ajudantesAtivos
                          .filter((p) => p.nome === a || !form.ajudantes.includes(p.nome))
                          .map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                      </select>
                      {form.ajudantes.length > 1 && (
                        <button
                          type="button" onClick={() => tirarAjudante(i)}
                          aria-label={`Tirar o ajudante ${i + 1}`}
                          className="rounded-lg border borda p-2 txt-fraco hover:bg-erro-500/10 hover:text-erro-600"
                        >
                          <X aria-hidden className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {form.ajudantes.length < MAX_AJUDANTES && (
                  <button
                    type="button" onClick={maisUmAjudante}
                    className="mt-1.5 flex items-center gap-1 rounded-lg border borda px-2.5 py-1 text-[11.5px] font-semibold txt-fraco"
                  >
                    <Plus aria-hidden className="size-3.5" /> Mais um ajudante
                  </button>
                )}
                {!ajudantesAtivos.length && (
                  <p className="mt-1 text-[11.5px] txt-fraco">
                    Nenhum ajudante cadastrado — cadastre na aba <b>Equipe</b>.
                  </p>
                )}
              </div>
            )}

            <div className="sm:col-span-2">
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
            {!!pendentes && (
              <span className="rounded-md bg-ouro-100 px-2 py-0.5 text-[11.5px] font-bold text-ouro-700">
                {pendentes} {cfg.pendente}
              </span>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}
                aria-label="Situação"
                className="painel-2 rounded-lg border borda px-2 py-1.5 text-[12.5px]"
              >
                <option value="todos">Todas</option>
                <option value="pendentes">{cfg.pendente}</option>
                <option value="ok">{cfg.tipo === 'falta' ? 'Já aprovadas' : 'Já validadas'}</option>
              </select>
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

          {!podeAprovar && (
            <p className="mb-3 rounded-xl painel-2 px-3.5 py-2.5 text-[12.5px] txt-fraco">
              Você registra e acompanha, mas não tem a permissão <b>Aprovar</b> desta tela — a que
              libera a falta e valida a sobra. Quem concede é o administrador, em Usuários e acessos.
            </p>
          )}

          {carregando ? (
            <div className="flex justify-center py-12">
              <Loader2 aria-hidden className="size-6 animate-spin text-marinho-500" />
            </div>
          ) : !lista.length ? (
            <p className="rounded-xl painel-2 px-3 py-8 text-center text-[13px] txt-fraco">{cfg.vazio}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {lista.map((o) => {
                const ok = conferida(o);
                const emValidacao = validando === o.id;
                return (
                  <li key={o.id} className={cn('rounded-xl border p-3', ok ? 'borda' : 'border-ouro-500')}>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold uppercase', cfg.cor)}>
                        {o.tipo}
                      </span>
                      <span className="text-[14px] font-bold">Lote {o.lote}</span>
                      {produtosDe(o).map((p, i) => {
                        // registro antigo não tem o nome gravado; aí vale o que
                        // os inventários souberem hoje sobre o código
                        const nome = p.descricao || acharProduto(p.produto, catalogo)?.descricao;
                        return (
                          <span
                            key={`${p.produto}-${i}`}
                            className="rounded-md painel-2 px-2 py-0.5 text-[12px] font-semibold"
                          >
                            {produtoTexto(p.produto, p.embalagem)}
                            {nome && <span className="ml-1.5 font-normal txt-fraco">{nome}</span>}
                          </span>
                        );
                      })}
                      {o.quantidade != null && (
                        <span className="text-[12.5px] font-semibold">{fmtQtd(o.quantidade)} un</span>
                      )}
                      <span className="text-[12.5px] txt-fraco">{fmtData(o.data)}</span>

                      {ok ? (
                        <span className="flex items-center gap-1 rounded-md bg-ok-500/15 px-2 py-0.5 text-[11px] font-bold text-ok-600">
                          <ShieldCheck aria-hidden className="size-3" />
                          {o.tipo === 'falta'
                            ? `aprovada por ${o.aprovado_por}`
                            : `validada por ${o.validado_por}`}
                        </span>
                      ) : (
                        <span className="rounded-md bg-ouro-100 px-2 py-0.5 text-[11px] font-bold text-ouro-700">
                          {cfg.pendente}
                        </span>
                      )}

                      <div className="ml-auto flex items-center gap-1.5">
                        {podeAprovar && o.tipo === 'falta' && (
                          ok ? (
                            <button
                              type="button" onClick={() => retirarAprovacao(o)} disabled={ocupado === o.id}
                              className={cn(BOTAO_LINHA, 'txt-fraco')}
                            >
                              Retirar aprovação
                            </button>
                          ) : (
                            <button
                              type="button" onClick={() => void aprovarFalta(o)} disabled={ocupado === o.id}
                              className={cn(BOTAO_LINHA, 'border-ok-500 text-ok-600 hover:bg-ok-500/10')}
                            >
                              {ocupado === o.id
                                ? <Loader2 aria-hidden className="size-3.5 animate-spin" />
                                : <Check aria-hidden className="size-3.5" />}
                              Aprovar
                            </button>
                          )
                        )}
                        {podeAprovar && o.tipo === 'sobra' && !emValidacao && (
                          <button
                            type="button" onClick={() => abrirValidacao(o)}
                            className={cn(BOTAO_LINHA, ok ? 'txt-fraco' : 'border-ok-500 text-ok-600 hover:bg-ok-500/10')}
                          >
                            <Check aria-hidden className="size-3.5" />
                            {ok ? 'Corrigir código' : 'Validar'}
                          </button>
                        )}
                        {podeExcluir && (
                          <button
                            type="button" onClick={() => void excluir(o)}
                            aria-label={`Excluir o registro do lote ${o.lote}`}
                            className={cn(BOTAO_LINHA, 'text-erro-600 hover:bg-erro-500/10')}
                          >
                            <Trash2 aria-hidden className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] txt-fraco">
                      <span>
                        <b className="text-[12.5px]" style={{ color: 'var(--texto)' }}>{o.motorista}</b>
                        {o.placa ? ` · ${o.placa}` : ''}
                      </span>
                      {!!(o.ajudantes ?? []).length && (
                        <span>
                          {o.ajudantes.length === 1 ? 'ajudante' : 'ajudantes'}: {o.ajudantes.join(', ')}
                        </span>
                      )}
                      {o.obs && <span>· {o.obs}</span>}
                      {o.registrado_por && <span className="ml-auto">registrado por {o.registrado_por}</span>}
                    </div>

                    {/* validação da sobra: o código do produto é o que fecha o registro */}
                    {emValidacao && (
                      <div className="mt-2 rounded-xl painel-2 p-3 motion-safe:animate-surgir">
                        <p className="mb-2 text-[12px] font-semibold">
                          De que produto é esta sobra? A foto e o lote ajudam a identificar.
                        </p>
                        <div className="mb-2 flex flex-col gap-1.5">
                          {formValida.map((linha, i) => (
                            <div key={`val-${i}`} className="flex items-center gap-1.5">
                              <input
                                autoFocus={i === 0} inputMode="numeric" placeholder="65696"
                                autoComplete="off" aria-label={`Código do produto ${i + 1}`}
                                value={linha.produto}
                                onChange={(e) => mudarValida(i, 'produto', e.target.value)}
                                className="painel w-full rounded-lg border borda px-2.5 py-1.5 text-[13px] font-semibold outline-none focus:border-marinho-500 sm:w-36"
                              />
                              <input
                                placeholder="48UNID" autoComplete="off"
                                aria-label={`Embalagem do produto ${i + 1}`}
                                value={linha.embalagem}
                                onChange={(e) => mudarValida(i, 'embalagem', e.target.value)}
                                className="painel w-full rounded-lg border borda px-2.5 py-1.5 text-[13px] outline-none focus:border-marinho-500 sm:w-36"
                              />
                              <span className="text-[11.5px] txt-fraco">
                                {acharProduto(linha.produto, catalogo)?.descricao}
                              </span>
                              {formValida.length > 1 && (
                                <button
                                  type="button" onClick={() => tirarValida(i)}
                                  aria-label={`Tirar o produto ${i + 1}`}
                                  className="rounded-lg border borda p-1.5 txt-fraco hover:bg-erro-500/10 hover:text-erro-600"
                                >
                                  <X aria-hidden className="size-3" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setFormValida((l) => [...l, linhaVazia()])}
                            className="flex w-fit items-center gap-1 rounded-lg border borda px-2.5 py-1 text-[11.5px] font-semibold txt-fraco"
                          >
                            <Plus aria-hidden className="size-3.5" /> Mais um produto
                          </button>
                        </div>

                        <div className="flex flex-wrap items-end gap-2">
                          <button
                            type="button" onClick={() => void validarSobra(o)} disabled={ocupado === o.id}
                            className="flex items-center gap-1.5 rounded-lg bg-marinho-800 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60"
                          >
                            {ocupado === o.id
                              ? <Loader2 aria-hidden className="size-3.5 animate-spin" />
                              : <ShieldCheck aria-hidden className="size-3.5" />}
                            Confirmar validação
                          </button>
                          <button
                            type="button" onClick={() => setValidando(null)}
                            className={cn(BOTAO_LINHA, 'txt-fraco px-2.5 py-1.5 text-[12.5px]')}
                          >
                            <X aria-hidden className="size-3.5" /> Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {/*
                      A foto vem sob demanda: a listagem não a traz (ver o
                      comentário da consulta). Antes havia miniatura sempre
                      visível, o que custava baixar até 900 KB por linha para
                      desenhar 96 pixels — caro demais para a lista inteira.
                    */}
                    {o.tem_foto && (
                      <div className="mt-2">
                        {fotos[o.id] ? (
                          <button
                            type="button" onClick={() => setFotoAberta(fotoAberta === o.id ? null : o.id)}
                            className="block"
                            aria-label={fotoAberta === o.id ? 'Fechar a foto' : 'Ver a foto maior'}
                          >
                            <Image
                              src={fotos[o.id]} alt={`Sobra do lote ${o.lote}`} unoptimized
                              width={fotoAberta === o.id ? 1280 : 96}
                              height={fotoAberta === o.id ? 960 : 96}
                              className={cn('rounded-xl border borda',
                                fotoAberta === o.id ? 'h-auto w-full max-w-xl' : 'size-24 object-cover')}
                            />
                          </button>
                        ) : (
                          <button
                            type="button" onClick={() => void abrirFoto(o.id)}
                            disabled={buscandoFoto === o.id}
                            className="flex items-center gap-1.5 rounded-lg border borda px-2.5 py-1.5 text-[12px] font-semibold txt-fraco hover:bg-marinho-50 disabled:opacity-60"
                          >
                            {buscandoFoto === o.id
                              ? <Loader2 aria-hidden className="size-3.5 animate-spin" />
                              : <Camera aria-hidden className="size-3.5" />}
                            {buscandoFoto === o.id ? 'Carregando…' : 'Ver a foto'}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
