# Início rápido

Este guia apresenta passo a passo a criação de uma conta no Polymux, a abertura da sua primeira sessão e a execução de um agente em um site real em cerca de cinco minutos.

## 1. Crie uma conta

Cadastre-se em [polymux.com](/sign-up) usando um endereço de e-mail ou Google. Você será direcionado para um workspace gratuito chamado _Pessoal_ — pode convidar colegas de equipe mais tarde, mas, por enquanto, tudo acontece aqui.

O plano gratuito inclui três agentes, duas sessões de navegador simultâneas e 100 MB de armazenamento de workspace. É o suficiente para seguir este guia e bem mais do que isso.

## 2. Inicie seu primeiro workflow

No painel, pressione **+ Novo workflow** no painel lateral esquerdo. Um workflow em rascunho é aberto com uma caixa de chat e um viewport de navegador ao vivo encaixado ao lado dela.

Digite uma solicitação como:

> Abra o Hacker News e leia para mim os títulos das três primeiras histórias.

Pressione **Enviar**. O agente abrirá uma aba do navegador, navegará e transmitirá a página de volta para o viewport. Tudo o que ele lê é mostrado no chat junto com as ações que tomou.

## 3. Acompanhe o agente trabalhando

O viewport à direita mostra exatamente o que o agente vê. Você pode:

- **Passar o mouse** para destacar os elementos com os quais o agente está prestes a interagir.
- **Assumir o controle** clicando em _Pausar_ — o agente para, você dirige manualmente e clicar em _Retomar_ devolve o controle.
- **Alternar visualizações** entre o navegador ao vivo, o grafo do workflow e a galeria de artefatos (capturas de tela, arquivos, downloads) pelo seletor acima do viewport.

As sessões permanecem ao vivo até você fechá-las ou elas terminarem. Fechar a aba não encerra a sessão — ela continua rodando no servidor e você pode reconectar a partir do painel lateral.

## 4. Salve como um workflow

Um chat livre é uma sessão. Para torná-lo reutilizável, pressione **Salvar como workflow** no topo do chat. O Polymux captura o prompt do agente, as ferramentas usadas e quaisquer entradas do cofre referenciadas, e armazena tudo como um workflow versionado que sua equipe pode reexecutar.

Os workflows também podem ser agendados. Na página do workflow, alterne para a aba **Agenda** para executá-los com uma expressão cron — diariamente, semanalmente ou em um intervalo personalizado.

## 5. Para onde ir em seguida

Agora você tem o básico. Escolha um caminho:

- **Quer compartilhar um workflow com sua equipe?** Leia [Workspaces e membros](/documentation/workspaces).
- **Armazenando logins ou chaves de API?** Leia [Noções básicas do cofre](/documentation/vault).
- **Travou em algum ponto?** O [FAQ](/documentation/faq) cobre os obstáculos mais comuns.
- **Construindo algo em cima do Polymux?** Vá direto para a [Visão geral do plugin](/documentation/plugin-overview).
