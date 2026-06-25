# SaaS Logística · Dilnor

Sistema web **100% client-side** (roda no navegador, sem backend) para análise de entregas e
cálculo de produtividade/premiação a partir do **Relatório de Entregas (.xlsx)** da Dilnor.

Nenhum dado é enviado para a internet — a planilha é lida localmente no navegador via
[SheetJS](https://sheetjs.com/).

## 📦 Módulos

| Página | Descrição |
|--------|-----------|
| [`index.html`](index.html) | **Análise por lote** — agrupa pedidos por Carga ERP e filtra por status (reentregas, devoluções etc.). |
| [`produtividade.html`](produtividade.html) | **Produtividade & Premiação** — calcula a produtividade por carga e a premiação por cargo. |

As duas páginas se conectam por botões de navegação no topo.

## 🧮 Regras de cálculo (Produtividade)

Por **carga** (`Número da Carga ERP`):

- **Produtividade por Quantidade** = `1 − falhas / total de pedidos`
  Sucesso = somente status **"Entregue"**. Qualquer outro status conta como falha
  (o relatório é do fim do turno, tudo deve estar concluído).
- **Produtividade por Peso** = `1 − peso das falhas / peso total`
  `Devolvido Parcial` entra com **50% do peso** e não conta na quantidade.
- **Produtividade Final** = média das duas.

Faixas: 🟢 100% · 🔵 90–99,99% · 🟠 80–89,99% · 🔴 < 80%.

A regra das **17h30** não é calculável pela planilha → é marcada manualmente por carga
(botão "Recebe" / "Não"). A tabela de premiação é aplicada por cargo
(Motorista/Ajudante · Praça/Viagem/Agregado).

## 🚀 Como usar

1. Baixe ou clone o repositório.
2. Abra `index.html` ou `produtividade.html` no navegador (duplo clique).
3. Carregue o Relatório de Entregas (`.xlsx`).

> Para acessar online, publique via **GitHub Pages** (Settings → Pages → branch `main` → `/root`).

## 🛠️ Stack

- HTML + CSS + JavaScript puro (sem build, sem dependências de instalação).
- [SheetJS (`xlsx.full.min.js`)](https://sheetjs.com/) embarcado para leitura offline do Excel.

## 📁 Estrutura

```
.
├── index.html            # App de análise por lote
├── produtividade.html    # App de produtividade & premiação
├── xlsx.full.min.js      # Biblioteca SheetJS (leitura de .xlsx)
└── assets/
    └── dilnor-logo.png
```
