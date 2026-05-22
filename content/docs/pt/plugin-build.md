# Construa seu primeiro plugin

Este passo a passo pega um workflow existente e o empacota em um plugin instalável. Assume-se que você leu a [Visão geral do plugin](/documentation/plugin-overview) e tem um workflow em seu workspace que executa de ponta a ponta sem problemas.

## 1. Escolha um workflow candidato

Abra o workflow que deseja publicar. Antes de qualquer outra coisa, faça uma verificação de sanidade:

- **Ele roda a partir de um início frio?** Dispare uma nova execução com o chat vazio. Qualquer coisa que dependa de contexto anterior — arquivos enviados antes, entradas do cofre criadas no meio da sessão — falhará para um instalador que está começando do zero.
- **Todos os segredos estão no cofre?** Se um segredo está colado literalmente em um prompt, qualquer um que instalar o plugin também o terá. Mova-o para o cofre e referencie-o por chave.
- **URLs e IDs são configuráveis?** Substitua nomes de organização, IDs de planilha ou nomes de host fixos por entradas de workflow que o instalador possa preencher.

Um workflow que passa nesta lista de verificação está em boa forma para ser empacotado.

## 2. Abra a aba Publicar

Na página do workflow, alterne para a aba **Publicar**. Se não a vir, sua função no workspace não inclui direitos de publicação — peça a um administrador para promovê-lo a **Membro** ou superior.

A aba Publicar tem quatro subpainéis: **Listagem**, **Conexões**, **Preço** e **Revisão**. Vamos preenchê-los em ordem.

## 3. Listagem

A listagem é o que os compradores veem no card do marketplace e na página de detalhes.

- **Nome.** 1–40 caracteres. Evite números de versão no final — as versões são rastreadas separadamente.
- **Descrição curta.** Uma frase, com menos de 120 caracteres. Aparece no card.
- **Descrição longa.** Markdown suportado. Explique o que o workflow faz, do que ele precisa e o que ele produz. Capturas de tela ajudam.
- **Ícone.** PNG quadrado, mínimo 256×256. SVG aceito.
- **Categoria.** Escolha a correspondência mais próxima. As categorias orientam a filtragem no marketplace.
- **Tags.** Até cinco tags livres. Usadas para busca.

## 4. Conexões

O Polymux varre o grafo do workflow e apresenta cada dependência externa que encontra: chaves do cofre, provedores OAuth, IDs de integração. Para cada uma, declare:

- **Se é obrigatória ou opcional.** Conexões opcionais permitem que o workflow rode em modo degradado se não forem fornecidas.
- **Rótulo de exibição.** O que o instalador vê no diálogo de instalação. _"Chave da API do OpenAI"_ é melhor do que o nome bruto da chave do cofre.
- **Texto de ajuda.** Uma dica curta explicando onde o instalador deve obter o valor. Use um link para a documentação do provedor se for relevante.

Se a conexão é o provedor OAuth integrado do Google Drive, o instalador a autoriza em um clique durante a instalação. Para qualquer outro provedor, o workflow depende de uma integração do marketplace (ou de uma chave do cofre que o instalador cola); ambos são tratados pelo mesmo diálogo de instalação.

Veja [Referência do manifesto do plugin](/documentation/plugin-manifest) para o esquema completo do que é capturado aqui.

## 5. Preço

Três opções:

- **Gratuito.** Sem pagamento, sem configuração do Stripe necessária.
- **Único.** O instalador paga uma vez e fica com o plugin em seu workspace indefinidamente.
- **Assinatura.** Recorrente mensal. O instalador pode cancelar a qualquer momento; o plugin é desinstalado ao fim do período.

Para plugins pagos, você deve conectar uma conta Stripe em **Configurações → Pagamentos**. O Polymux retém a taxa de plataforma de 15% e repassa o restante mensalmente. Há um limite mínimo de pagamento de US$ 50.

## 6. Revise e envie

O subpainel **Revisão** pré-visualiza a listagem como os instaladores a verão. Olhe as capturas de tela, clique nos prompts de conexão e leia a descrição longa em busca de erros de digitação.

Pressione **Enviar para revisão**. O plugin entra na fila e você receberá um e-mail em até dois dias úteis com o resultado. Razões comuns para rejeição são:

- A descrição da listagem omite o que o plugin realmente faz ou quais dados ele toca.
- As conexões obrigatórias não estão rotuladas com clareza suficiente para que um estranho entenda.
- O workflow incorpora segredos que deveriam estar no cofre.

Você pode editar a listagem e reenviar quantas vezes quiser.

## 7. Publicando atualizações

Uma vez que um plugin está no ar, qualquer alteração no workflow subjacente torna-se uma _nova versão_. As versões não são publicadas automaticamente; na aba Publicar, escolha **Promover para público** para disponibilizar uma versão aos instaladores existentes. Eles podem optar por atualizar ou ficar na versão antiga.

Mudanças que quebram compatibilidade — por exemplo, exigir uma nova conexão — devem incrementar a versão maior. O Polymux avisa aos instaladores que eles serão solicitados a fornecer novas permissões antes de aplicar a atualização.

## Próximos passos

- Veja o esquema campo a campo: [Referência do manifesto do plugin](/documentation/plugin-manifest).
- Adicione uma integração baseada em OAuth ao seu plugin: [Visão geral das conexões](/documentation/connections-overview).
- Publique seu primeiro plugin pago: [Lista de verificação para publicação](/documentation/publishing).
