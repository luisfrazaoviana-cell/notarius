# Notarius — regras de trabalho do Claude

Este repositório é **só do cartório** (Cartório de Santana de Bujaru/PA): o app Notarius e o fluxo das escrituras.
Qualquer pedido sem relação com isso (placa solar, tráfego pago, vídeos, Finest, jogos, outros apps) **não é feito aqui**:
avise o Luis e peça para abrir uma sessão em outro projeto ou sem repositório. Nunca crie arquivos de outro assunto neste repositório.

## Dados de clientes nunca entram no Git

Este repositório é público. Documentos, minutas, escrituras, CPFs, matrículas e planilhas ficam **no HD**
(`E:\ESCRITURAS ORGANIZADAS\`), nunca aqui. Se aparecer arquivo de cliente na pasta do projeto, mova para o HD e não faça commit.

## Uma sessão para cada coisa

- **Sessão "Notarius – app"**: única que altera o código do app. Nunca duas sessões mexendo no app ao mesmo tempo.
- **Uma sessão por escritura**, com o nome do caso (ex.: `Escritura Lote 12 – Anderson`). Documentos, minuta, lavratura,
  orçamento e arquivamento do caso ficam todos nela. Não misture dois casos na mesma sessão.
- Se o pedido for de um caso que não é o da sessão, avise antes de começar.

## Os cinco fluxos e as skills aprovadas

| Fluxo | O que fazer | Skill |
|---|---|---|
| 1. Envio de documentos | Ler todos; converter para PDF; guardar em `03 - DOCUMENTOS` da pasta do parceiro. Documento de parceiro sem escritura vai para a pasta de avulsos do parceiro, nunca é descartado. | `arquivar-escritura-por-parceiro` |
| 2. Elaboração de minuta | Sempre **duas versões**: tradicional e revisada, no Word **modelo 13** (gerador do app) + PDF. Lavratura pelo substituto Luís Alberto Frazão Modesto. Dado faltante em vermelho `xxx`, nunca inventado. | `minuta-escritura-modelo-tradicional` + `minuta-escritura-modelo-revisado` |
| 3. Orçamento | Guia PIX pela Tabela 2026 (Grupo 1, ISS 5%), salvo em `04 - ORCAMENTOS`. | `orcamento-escritura-bujaru` |
| 4. Lavratura | Com o selo digital: salvar em `02 - ESCRITURA LAVRADA (COM SELO)`, atualizar capa, renomear `MINUTA -` para `LAVRADA -`, atualizar índice e planilha de repasse. Depois, ficha de DOI/CENSEC. | `arquivar-escritura-por-parceiro` + `leitura-escrituras-doi-censec` |
| 5. Análise de documentos e notas devolutivas | Qualificar título, responder item por item da nota de exigência com base no CNSNR-PA, CNN e súmulas. | `regularizacao-fundiaria-notarial-para` (TAF do ITCD: `taf-itcd-sefa-pa`) |

## Quando um ato é LAVRADA (regra do Luis)

Só é LAVRADA o ato cujo documento tem **selo digital do TJPA**, ou **CNIB com livro e folha** corretos e sem campos `xxx` pendentes.
O nome da pasta não prova nada. Nunca renomeie uma pasta para `LAVRADA -`, nem lance no índice ou no repasse, sem abrir o documento e conferir isso.
Antes de alterar o índice ou a planilha de repasse, salve uma cópia em `E:\ESCRITURAS ORGANIZADAS\00 - BACKUPS\` com a data.

## Conferências obrigatórias antes de entregar

1. Nomes, CPF/RG, estado civil, regime, matrícula, área e valor batem com os documentos (CPF sempre do documento oficial).
2. Partes, imóvel e parceiro são do caso desta sessão.
3. Nenhum dado inventado: o que faltar fica em vermelho e é listado na resposta, junto com as divergências.
4. O arquivo foi salvo na pasta certa do parceiro e não duplicou pasta existente.
5. Nada é enviado (WhatsApp, e-mail), apagado ou sobrescrito sem o Luis confirmar.
