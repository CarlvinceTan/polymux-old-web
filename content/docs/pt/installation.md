# Instalação

Você pode usar o Polymux inteiramente no navegador — não é necessário instalar nada. Aplicativos nativos e uma extensão de navegador adicionam capacidades extras, como operar seu próprio navegador local em vez de um hospedado.

## Aplicativo web

O aplicativo web em [polymux.com](https://polymux.com) é sempre a versão mais recente. Qualquer versão moderna de Chromium, Firefox ou Safari funciona. Não há nada para instalar; faça login e seu workspace, sessões e workflows ficam imediatamente disponíveis.

## Extensão de navegador

A extensão permite que uma sessão do Polymux opere uma aba no **seu navegador local** em vez do Chromium hospedado no servidor. Ela é útil quando você precisa de:

- Um site que utiliza seus cookies de login existentes.
- Acesso a uma rede privada que o navegador hospedado não consegue alcançar.
- Um perfil de navegador, lista de extensões ou impressão digital de dispositivo específicos.

Para instalar, abra a [página de instalação](/install-apps) e escolha seu navegador. Quando a extensão solicitar o pareamento, faça login no Polymux em qualquer aba — o pareamento ocorre automaticamente e o popup exibe _Conectado_.

A extensão é totalmente passiva enquanto está conectada: ela só age quando uma sessão do Polymux está em `?mode=extension`. Você pode revogá-la pelo popup a qualquer momento.

## Aplicativos desktop

Aplicativos nativos para macOS, Windows e Linux trazem a experiência completa do Polymux sem uma aba de navegador. Atualmente estão em beta privado. Inscreva-se na [página de instalação](/install-apps) para ser notificado quando houver builds disponíveis para sua plataforma.

Os aplicativos desktop não são obrigatórios — todas as funcionalidades desta documentação funcionam no aplicativo web.

## Aplicativos móveis

Aplicativos iOS e Android estão no roadmap. Por enquanto, o aplicativo web é responsivo e funciona em navegadores móveis, mas os viewports ao vivo transmitem melhor no desktop.

## Requisitos de sistema

| Superfície | Requisito |
| --- | --- |
| Aplicativo web | Qualquer navegador lançado nos últimos 24 meses |
| Extensão | Chrome, Edge, Brave ou qualquer Chromium 119+ |
| Desktop | macOS 13+, Windows 10+ ou qualquer distribuição Linux dos últimos 3 anos |
| Rede | Saída WebRTC e WebSocket nas portas 443 / 8080 |

Se sua rede bloquear WebRTC, o viewport ao vivo recorrerá a um stream de polling mais lento. Todo o resto continua funcionando.

## Próximos passos

- Novo no Polymux? Continue com o [Início rápido](/documentation/quickstart).
- Configurando uma equipe? Leia [Workspaces e membros](/documentation/workspaces).
- Precisa verificar um download? Veja [Atualizações e verificação](/documentation/faq#verifying-downloads) no FAQ.
