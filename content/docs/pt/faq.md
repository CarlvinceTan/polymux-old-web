# FAQ

Perguntas comuns, agrupadas por tópico. Se sua pergunta não estiver aqui, o [fórum](/forum) é o lugar mais rápido para perguntar.

## Conta e cobrança

### Como altero meu endereço de e-mail?

No painel, abra **Configurações → Conta → E-mail**. Você precisará confirmar a alteração tanto a partir do endereço antigo quanto do novo antes que a troca tenha efeito.

### Posso mover workflows entre workspaces?

Não diretamente. O caminho recomendado é publicar o workflow como um [workflow empacotado](/documentation/plugin-overview) e instalá-lo no workspace de destino. Isso transfere o prompt, as ferramentas e as referências do cofre, mas reinicia o histórico de execuções.

### O que acontece com meus dados se eu cancelar?

Os dados do plano gratuito são retidos indefinidamente. Os planos pagos são rebaixados para o plano gratuito após o cancelamento, o que pode levar o uso a ultrapassar a cota gratuita. O Polymux notificará você no aplicativo por 30 dias antes de excluir qualquer coisa para colocá-lo de volta dentro da cota.

## Sessões e workflows

### Por que minha sessão desconectou?

As sessões são mantidas ativas no servidor. Se a aba do seu navegador local fechar ou perder a conexão, a sessão continua rodando e você pode reconectar pelo painel lateral. Se a própria sessão terminar, você verá um código de status no topo do chat — `idle_timeout`, `budget_exceeded` ou `error` são os mais comuns.

### Por quanto tempo uma sessão pode rodar?

Não há um limite rígido de tempo, mas toda sessão tem um orçamento de tokens definido em seu workflow. Quando o orçamento se esgota, a sessão pausa e pede aprovação antes de continuar. O orçamento padrão é generoso o suficiente para lidar com a maioria dos trabalhos de navegador de várias horas.

### Por que o viewport ao vivo está preto?

Três causas comuns:

- **WebRTC está bloqueado** na sua rede — o viewport recorre a um stream de polling mais lento após alguns segundos. Verifique o ícone de conexão no canto do viewport; se aparecer um ponto amarelo, você está no fallback.
- **O agente ainda não navegou.** O viewport permanece em branco até o navegador carregar sua primeira página.
- **Você está rodando em `?mode=extension`**, mas a extensão não está pareada. Abra o popup da extensão e verifique a badge de status.

### Erros de permissão

Se um workflow se recusar a executar com um erro de permissão, a causa mais comum é que sua função no workspace não permite executar workflows — visualizadores não podem iniciar execuções. Peça a um administrador para promovê-lo a **Membro**.

## Cofre e segredos

### Um modelo pode ver minhas senhas?

Não. Os valores do cofre são injetados diretamente em ações de página ou chamadas de ferramenta. O modelo é informado de que um segredo foi usado, mas nunca vê os caracteres reais. Veja [Noções básicas do cofre](/documentation/vault#how-agents-access-the-vault) para o quadro completo.

### Qual criptografia vocês usam?

As entradas do cofre são criptografadas em repouso com AES-256-GCM usando uma chave por workspace. A chave do workspace é, por sua vez, envolvida com uma chave raiz mantida em nosso KMS gerenciado. Nunca registramos ou armazenamos valores descriptografados.

### Posso exportar entradas do cofre?

Não há exportação em lote hoje. Cada entrada pode ser revelada e copiada individualmente pela página do cofre. A ferramenta de exportação está no roadmap; o issue de acompanhamento está no [fórum](/forum).

## Plugins e perguntas para desenvolvedores

### O que é um plugin?

Um _plugin_ é um workflow empacotado mais suas conexões — tudo o que alguém precisa para instalá-lo em seu próprio workspace com um único clique. Veja [Visão geral do plugin](/documentation/plugin-overview).

### Como publico um plugin?

Abra o workflow que deseja publicar, vá para a aba **Publicar**, preencha os campos da listagem e envie para revisão. As revisões geralmente são concluídas em até dois dias úteis. Veja [Publicando um plugin](/documentation/publishing) para o passo a passo completo.

### Os plugins podem ler os dados uns dos outros?

Não. Cada plugin é executado em sua própria sessão com seu próprio acesso restrito ao cofre. Dois plugins instalados no mesmo workspace não conseguem ver as leituras do cofre, arquivos ou histórico de sessões um do outro.

## Verificando downloads

Os instaladores de desktop e arquivos `.zip` da extensão são assinados. O SHA-256 de cada release é listado na [página de instalação](/install-apps) ao lado do download. Para verificar um `.dmg` de macOS, por exemplo:

```sh
shasum -a 256 Polymux-1.0.0-universal.dmg
```

Compare a saída com o valor na página de instalação. Se não corresponderem, não execute o instalador — entre em contato pela [página de contato](/contact).

## Ainda travado?

Se nada acima responde à sua pergunta:

1. Pesquise no [fórum](/forum) — problemas comuns geralmente são discutidos lá.
2. Dê uma olhada na [Visão geral da API](/documentation/api-overview) se você está integrando programaticamente.
3. Envie um e-mail para o suporte pela [página de contato](/contact). Inclua o ID do seu workspace e o ID da sessão (visíveis na URL) para que possamos encontrar sua execução em nossos logs.
