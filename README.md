# Gestão Logística — sistema novo

Reescrita do sistema da Dilnor/Nordece em **Next.js 16 + TypeScript + Tailwind v4 + Supabase**,
com **usuários individuais** e **permissões por tela e por ação**.

> O sistema atual (`produtividadecod/index.html`) **continua no ar e intocado**.
> Este projeto é separado. Só trocamos quando você aprovar.

---

## O que já está pronto

| Item | Situação |
|---|---|
| Projeto Next.js + TypeScript + Tailwind | ✅ |
| SQL de usuários, telas e permissões | ✅ (falta você rodar) |
| RLS de transição — os dois sistemas convivem | ✅ (falta você rodar) |
| Login por usuário individual | ✅ |
| Navegação no topo (sem hambúrguer) | ✅ |
| Tela "Usuários e acessos" | ✅ |
| Módulos (Escala, Inventário, Agendamentos…) | ⏳ migração em andamento |

---

## Como ligar (3 passos)

### 1. Rodar o SQL no Supabase

No **SQL Editor** do seu projeto, execute nesta ordem:

| Ordem | Arquivo | O que faz |
|---|---|---|
| 1 | `supabase/10_usuarios_permissoes.sql` | Cria `usuarios`, `usuario_permissoes`, `app_telas` e as funções de permissão. Já cadastra você como administrador reaproveitando a conta `dilnor.admin@gestao.app`. |
| 2 | `supabase/11_rls_transicao.sql` | Adiciona as regras de acesso novas nas 7 tabelas atuais. |

**Nenhum dos dois apaga ou altera dado existente.** O arquivo 11 apenas *adiciona*
policies — no Postgres elas se somam com OU, então o sistema antigo continua
funcionando exatamente como hoje enquanto o novo também funciona.

### 2. Configurar as chaves

O arquivo `.env.local` já foi criado apontando para o **mesmo** projeto Supabase
que o sistema atual usa. Nada a fazer, a não ser que troque de projeto.

### 3. Rodar

```bash
cd C:\Projetos\gestaologistica; npm run dev
```

Abra <http://localhost:3000> e entre com `dilnor.admin@gestao.app` e a senha que
você já usa hoje.

---

## Como o acesso funciona agora

**Antes:** existiam 2 contas por unidade (`admin` e `consulta`), o papel vinha do
e-mail, e as telas sensíveis pediam senha escrita no código-fonte —
`1987` (Salvos), `1609` (Receber e Inventário), `79513` (aprovação do gerente).
Qualquer pessoa que abrisse "Ver código" no navegador enxergava todas.

**Agora:** cada pessoa tem login próprio. Você, como administrador, marca na tela
**Usuários e acessos** o que ela vê e o que pode fazer:

| Tela | Ações possíveis |
|---|---|
| Análise de Entregas | ver · importar |
| Produtividade | ver · salvar · exportar |
| Premiações salvas | ver · exportar · excluir |
| Escala | ver · editar · salvar · imprimir |
| Cargas a Enviar / Receber | ver · editar · excluir · imprimir |
| Inventário | ver · lançar · excluir · **aprovar** · exportar |
| Cadastros / Configurações | ver · editar |

As senhas antigas deixam de existir. Quem podia aprovar inventário porque sabia
o `79513` agora precisa da permissão **aprovar** — concedida por você, nominalmente,
e revogável a qualquer momento.

Há **perfis prontos** (Operação, Escala/Tráfego, Depósito, Gerência, Motorista)
para não marcar tudo na mão; depois dá para ajustar caso a caso.

### Onde a regra é aplicada de verdade

No banco. As funções `pode(tela, acao)` e `minha_unidade()` são usadas pelas
policies de RLS — então mesmo que alguém burle a tela, o Postgres recusa. A
interface apenas evita mostrar botão que não vai funcionar.

---

## Estrutura

```
gestaologistica/
├─ supabase/
│  ├─ 10_usuarios_permissoes.sql   usuários, telas, permissões, funções
│  └─ 11_rls_transicao.sql         RLS nova nas 7 tabelas atuais (aditiva)
└─ src/
   ├─ app/
   │  ├─ entrar/                   login
   │  └─ (app)/                    área protegida
   │     ├─ page.tsx               Início
   │     └─ usuarios/              Usuários e acessos
   ├─ components/layout/TopNav.tsx navegação no topo
   ├─ lib/permissoes.ts            catálogo de telas, ações e perfis
   ├─ providers/SessionProvider    sessão + permissões da pessoa
   └─ types/database.ts            tipos das tabelas
```

---

## Próximo passo

Migrar os módulos um a um, do mais isolado para o mais acoplado. Ordem sugerida:

1. **Agendamentos** — CRUD simples, já valida o padrão de permissão por ação
2. **Inventário** — upload, gráficos e aprovação (onde a permissão mais importa)
3. **Escala + Diárias + Disponibilidade**
4. **Análise + Produtividade + Premiações salvas** (dependem do upload do Fusion)
5. **Cadastros, Configurações e Meu Desempenho**

Nada é removido sem consultar antes.
