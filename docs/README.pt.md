# MiNiMail

[简体中文](../README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Deutsch](README.de.md) | [Français](README.fr.md) | [Español](README.es.md) | Português

MiNiMail é um cliente de e-mail desktop nativo de AI, criado para tornar os e-mails do dia a dia mais fáceis de ler, entender e processar.

Ele combina um cache de e-mail local-first com recursos AI atentos à privacidade para resumir mensagens longas, extrair informações importantes, criar rascunhos de resposta, traduzir conteúdo e rotear diferentes tipos de e-mail.

> Estado atual: MiNiMail está em fase release candidate. É adequado para testes, demonstrações e feedback inicial, mas ainda não é recomendado para fluxos críticos de e-mail em produção.

## Principais Destaques

- Cache local-first para listas de e-mail, corpos de mensagem e metadados de anexos.
- Resumos AI, sugestões de resposta, tradução, roteamento e extração estruturada de informações importantes.
- Categorias AI genéricas e roteamento dedicado para notificações do GitHub.
- Usa a AI API Key do usuário e não revende AI tokens.
- Bloqueia imagens remotas e pixels de rastreamento por padrão.
- Sanitiza e-mails HTML antes da renderização.
- Suporta composição, rascunhos, anexos, recuperação de e-mails enviados e desfazer envio por 5 segundos.
- Suporta interface e documentação README multilíngues.

## Modelo de Privacidade

MiNiMail é projetado em torno do controle do usuário.

- Os usuários fornecem sua própria AI API Key.
- MiNiMail não revende AI tokens.
- O processamento de e-mails considera a privacidade por padrão.
- Imagens remotas e pixels de rastreamento são bloqueados por padrão.
- E-mails HTML são sanitizados antes da renderização.

## Plataforma Atual

MiNiMail atualmente foca no aplicativo desktop para Windows.

A stack inclui:

- Electron
- TypeScript
- Cache de e-mail local-first
- Fluxos de conta IMAP / SMTP / OAuth

## Roteiro

MiNiMail está atualmente focado em melhorar a experiência desktop no Windows. Depois que a arquitetura estiver mais estável, o projeto planeja explorar:

- Suporte para macOS Desktop.
- Experiências móveis, incluindo iOS, Android e outras plataformas possíveis.
- Modos de privacidade local mais completos e recursos de conhecimento de e-mail AI.
- Um sistema de design mais completo, documentação de interação e documentos multilíngues.

Essas direções avançarão com base na estabilidade, custo de manutenção e feedback real dos usuários. Nenhuma data de lançamento é prometida.

## Antes do Lançamento

Antes de criar uma versão ou build de teste interno, execute:

```bash
npm run test:release
```

Se a verificação falhar, não pule os itens com falha. Primeiro determine se é uma regressão real ou uma asserção desatualizada, então aplique a menor correção segura.

## Design

O estudo de caso completo de UI/UX será adicionado em um repositório de design separado.

As informações sobre contribuidores de design serão adicionadas antes do lançamento público.

完整 UI/UX case study 将由设计贡献者后续通过独立 PR 补充。

## Licença

Este projeto é licenciado sob [Apache License 2.0](../LICENSE).

## Contribuição

Consulte [CONTRIBUTING.md](../CONTRIBUTING.md) para diretrizes de contribuição de engenharia e design.
