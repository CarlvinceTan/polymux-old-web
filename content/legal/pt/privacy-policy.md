_Last updated: June 14, 2026_

Esta Política de Privacidade descreve como o **Polymux** ("nós", "nos" ou "nosso") coleta, usa e compartilha informações quando você utiliza nossos sites, aplicativos e serviços relacionados (coletivamente, os **Serviços**). Ao usar os Serviços, você concorda com esta política.

O uso e a transferência de informações recebidas das APIs do Google pelo Polymux para qualquer outro aplicativo estão em conformidade com a [Política de Dados do Usuário dos Serviços de API do Google](https://developers.google.com/terms/api-services-user-data-policy), incluindo os requisitos de Uso Limitado.

## Informações que coletamos

### Informações que você fornece

Coletamos informações que você envia diretamente — por exemplo, ao criar uma conta, entrar em contato com o suporte, assinar atualizações ou preencher formulários. Isso pode incluir seu nome, endereço de e-mail, organização e o conteúdo de suas mensagens.

### Informações coletadas automaticamente

Quando você usa os Serviços, podemos coletar automaticamente determinados dados técnicos e de uso, como endereço IP, tipo de dispositivo, tipo de navegador, sistema operacional, páginas visualizadas, URLs de referência e localização aproximada derivada do IP. Podemos usar cookies e tecnologias similares conforme descrito em nossa Política de Cookies.

### Informações de integrações

Se você conectar contas de terceiros ou habilitar integrações, poderemos receber informações de acordo com suas configurações e as permissões que você conceder a esses provedores. Consulte a seção **Dados do usuário do Google** abaixo para divulgações adicionais específicas às APIs do Google.

## Dados do usuário do Google

Esta seção descreve como o Polymux acessa, usa, armazena, compartilha e retém dados obtidos por meio das APIs do Google. Ela se aplica sempre que você conectar uma Conta Google ao Polymux (por exemplo, a integração com Gmail ou Google Drive).

### Dados acessados

Quando você conecta uma Conta Google, o Polymux solicita apenas os escopos OAuth necessários para operar a integração que você habilita:

- **Perfil básico** — `userinfo.email` e `userinfo.profile`. Recebemos o endereço de e-mail, nome e foto de perfil da sua conta Google para exibir a conta conectada e associá-la ao seu espaço de trabalho no Polymux.
- **Gmail** (`https://www.googleapis.com/auth/gmail.modify`) — quando você conecta o Gmail, podemos ler suas mensagens e metadados, enviar mensagens em seu nome, criar rascunhos e adicionar ou remover marcadores. **Não** solicitamos `gmail.full` e não acessamos APIs de administração de conta ou configurações.
- **Google Drive** (`https://www.googleapis.com/auth/drive.file`) — quando você conecta o Google Drive, podemos acessar apenas os arquivos e pastas que o próprio Polymux cria ou que você explicitamente abre ou faz upload pelo Polymux. **Não podemos** ler, listar ou modificar nenhum outro arquivo no seu Drive.

Não solicitamos, e o Google não concede, acesso a outros serviços do Google (por exemplo, Calendar, Contacts, Photos ou APIs de administração do Workspace), a menos que os adicionemos e divulguemos em uma atualização futura desta política.

### Como usamos os dados do usuário do Google

O Polymux usa os dados do usuário do Google **exclusivamente** para fornecer e aprimorar os recursos voltados ao usuário que você solicitou explicitamente. De forma concreta:

- **Dados do Gmail** são usados para exibir suas mensagens dentro do Polymux, para resumir, classificar, redigir, enviar ou rotular mensagens em seu nome quando você aciona essas ações, e para alimentar fluxos de trabalho e agentes que você configura.
- **Dados do Google Drive** são usados para listar, abrir, criar, atualizar e organizar os arquivos que o Polymux gerencia em seu nome, e para exibir esses arquivos no navegador de arquivos, fluxos de trabalho e artefatos do Polymux.
- **Dados de perfil** são usados para identificar a conta conectada na interface e nos logs de auditoria.

**Não** usamos dados do usuário do Google para veicular publicidade, criar perfis publicitários ou para qualquer finalidade não relacionada aos recursos voltados ao usuário do Polymux.

### Uso de IA / LLMs e revisão humana

Alguns recursos do Polymux processam dados do usuário do Google usando modelos de linguagem de grande escala (LLMs) e outros sistemas automatizados para gerar resumos, rascunhos, respostas, classificações e saídas similares a seu pedido. Não permitimos que provedores terceiros de LLM usem seus dados do usuário do Google para treinar ou aprimorar seus modelos generalizados. Os funcionários do Polymux não leem seus dados do usuário do Google, exceto (a) com sua permissão explícita, (b) para fins de segurança (por exemplo, investigação de abusos), (c) para cumprir a legislação aplicável, ou (d) quando os dados foram agregados e anonimizados de modo que não possam ser vinculados a você ou à sua conta Google.

### Compartilhamento de dados

**Não** vendemos, alugamos nem transferimos dados do usuário do Google a corretores de dados, redes de publicidade ou qualquer parte para fins publicitários ou comerciais independentes. Compartilhamos dados do usuário do Google apenas nos casos limitados abaixo, e somente quando necessário:

- **Com subprocessadores de infraestrutura** que hospedam ou operam os Serviços em nosso nome (por exemplo, nossos provedores de hospedagem em nuvem, banco de dados e armazenamento de objetos), sob contratos que restringem o uso dos dados à prestação de serviços ao Polymux.
- **Com provedores de IA / LLM** que usamos para gerar resumos, rascunhos e outras saídas a seu pedido, sob termos que proíbem o uso de seus dados para treinar seus modelos generalizados. Minimizamos o que é enviado e transmitimos apenas os dados necessários para produzir o resultado solicitado.
- **Com outros serviços do Google** quando você nos instrui a fazê-lo (por exemplo, enviar um e-mail pelo Gmail ou salvar um arquivo no Drive).
- **Por razões legais**, quando temos convicção de boa-fé de que a divulgação é exigida por lei, regulamento, processo legal ou solicitação governamental executória.
- **Em uma transação comercial**, como fusão, aquisição ou venda de ativos, onde as informações podem ser transferidas sujeitas à parte receptora honrar esta política.
- **Com sua direção ou consentimento**.

### Armazenamento e proteção de dados

Os dados do usuário do Google são armazenados em infraestrutura operada por nossos provedores de hospedagem e banco de dados nos Estados Unidos e/ou na União Europeia. Protegemos esses dados usando:

- **Criptografia em trânsito** (TLS 1.2+) para toda a comunicação entre o Polymux, o Google e seu navegador.
- **Criptografia em repouso** para nossos bancos de dados e armazenamento de objetos.
- **Criptografia em nível de aplicação** de tokens OAuth de acesso e atualização antes de serem gravados em nosso banco de dados, usando chaves mantidas em nosso gerenciador de segredos e rotacionadas periodicamente.
- **Controles de acesso** que limitam o acesso aos dados de produção a um pequeno número de engenheiros autorizados usando login único, autenticação multifator e registro de auditoria.
- **Isolamento de inquilinos** para que um espaço de trabalho não possa acessar os dados do usuário do Google de outro espaço de trabalho.
- **Revisões e monitoramento de segurança**, incluindo verificação de dependências, gerenciamento de vulnerabilidades e registro de acesso a sistemas sensíveis.

### Retenção e exclusão de dados

Retemos os dados do usuário do Google apenas pelo tempo em que você mantiver a integração Google correspondente conectada e sua conta Polymux ativa, mais um curto período necessário para operar os Serviços (por exemplo, backups e logs de auditoria).

Você pode remover os dados do usuário do Google do Polymux a qualquer momento:

- **Desconectar a integração** na página **Integrações → Instaladas** do Polymux. Isso revoga nossos tokens OAuth armazenados e aciona a exclusão de mensagens do Gmail em cache, metadados de arquivos do Drive e outros conteúdos obtidos por meio dessa integração, geralmente em até 30 dias.
- **Revogar o acesso pelo Google** em [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Uma vez revogado, o Polymux não poderá mais acessar o Google em seu nome, e excluiremos os dados em cache conforme descrito acima.
- **Excluir sua conta Polymux** entrando em contato conosco pela página de Contato ou seguindo o fluxo de exclusão de conta no produto. Excluiremos todos os dados do usuário do Google associados, exceto onde somos obrigados a reter registros específicos para cumprir obrigações legais ou resolver disputas.
- **Solicitar a exclusão de dados específicos** entrando em contato conosco pela página de Contato. Responderemos em um prazo razoável e confirmaremos quando a exclusão estiver concluída.

Cópias residuais em backups criptografados são eliminadas em nosso cronograma padrão de rotação de backups (no máximo 90 dias).

## Extensão do navegador

Esta seção descreve as práticas de dados da **extensão de navegador Polymux** — uma extensão opcional do Chrome que permite ao Polymux executar tarefas de navegador no seu próprio navegador em vez de um hospedado em servidor. Aplica-se apenas se você instalar a extensão e pareá-la com o seu servidor Polymux.

### O que a extensão acessa

Quando você inicia uma tarefa de navegador com a extensão ativada, a extensão abre uma aba dedicada e, **somente nessa aba**, executa as etapas exigidas pela tarefa — navegar, ler a página, clicar, digitar e capturar capturas de tela. Para isso, ela processa:

- **O conteúdo da página da aba que controla para a tarefa** — o texto da página, a estrutura de acessibilidade, capturas de tela, e a URL e o título da aba.
- **Um token de pareamento**, armazenado localmente no seu navegador, usado para reconectar a extensão ao seu servidor Polymux sem novo pareamento.

A extensão atua **somente nas abas que abre para uma tarefa Polymux**. Ela não lê seu histórico de navegação, suas outras abas, seus favoritos nem qualquer página em que você não tenha direcionado uma tarefa Polymux.

### Como a extensão usa e compartilha esses dados

O conteúdo da página e os resultados da tarefa são transmitidos por uma conexão criptografada ao **servidor Polymux com o qual você pareou** — seu próprio backend — para que a tarefa possa ser executada e seu progresso exibido na sua sessão Polymux. Esses dados são enviados apenas a esse servidor pareado; a extensão **não** os envia a terceiros e **não** os vende nem transfere para publicidade ou qualquer finalidade não relacionada à execução das tarefas que você solicita.

O token de pareamento é armazenado apenas no armazenamento local da extensão no seu navegador e é usado exclusivamente para autenticar a conexão com o seu servidor. Você pode desconectar a qualquer momento pelo popup da extensão — o que limpa o token armazenado — ou removendo a extensão.

## Como usamos as informações

Usamos as informações que coletamos para:

- Fornecer, operar e aprimorar os Serviços
- Comunicar com você sobre sua conta, solicitações de suporte e atualizações do produto
- Monitorar e analisar uso, desempenho e segurança
- Cumprir obrigações legais e fazer cumprir nossos termos
- Cumprir as finalidades descritas no momento da coleta ou com o seu consentimento

## Como compartilhamos informações

Podemos compartilhar informações:

- **Com prestadores de serviços** que nos auxiliam (por exemplo, hospedagem, análises, entrega de e-mail), sujeitos a salvaguardas adequadas
- **Por razões legais**, quando acreditamos que a divulgação é exigida por lei, regulamento, processo legal ou solicitação governamental
- **Em conexão com uma transação comercial** como fusão, aquisição ou venda de ativos, onde as informações podem ser transferidas como parte dessa transação
- **Com sua direção ou consentimento**

Não vendemos suas informações pessoais conforme esse termo é comumente compreendido.

## Retenção e exclusão de dados

Retemos as informações pelo tempo necessário para fornecer os Serviços, cumprir obrigações legais, resolver disputas e fazer cumprir nossos acordos. Os períodos de retenção podem variar dependendo da natureza dos dados e de como são usados.

Você pode solicitar a exclusão de suas informações pessoais a qualquer momento desconectando a integração relevante, excluindo sua conta nas configurações do produto ou entrando em contato conosco pela página de Contato. Divulgações adicionais específicas aos dados do usuário do Google — incluindo como revogar o acesso e acionar a exclusão — são fornecidas na seção **Dados do usuário do Google** acima.

## Segurança

Protegemos as informações pessoais usando medidas técnicas e organizacionais padrão do setor, incluindo criptografia em trânsito (TLS) e em repouso, criptografia em nível de aplicação de credenciais sensíveis como tokens OAuth, controles de acesso baseados em função com autenticação multifator para sistemas de produção, registro de auditoria, isolamento de inquilinos e gerenciamento rotineiro de vulnerabilidades. Nenhum método de transmissão ou armazenamento é completamente seguro; não podemos garantir segurança absoluta.

## Transferências internacionais

Se você acessar os Serviços de fora do país onde operamos, suas informações poderão ser processadas em países que podem ter leis de proteção de dados diferentes das do seu território.

## Seus direitos e escolhas

Dependendo de onde você mora, você pode ter direitos de acessar, corrigir, excluir ou restringir o processamento de suas informações pessoais, ou de se opor a determinados processamentos. Você também pode ter o direito à portabilidade de dados ou de registrar uma reclamação junto a uma autoridade supervisora. Para exercer esses direitos quando aplicável, entre em contato conosco usando os detalhes na nossa página de Contato.

Você pode controlar os cookies por meio das configurações do seu navegador, conforme descrito em nossa Política de Cookies.

## Privacidade de crianças

Os Serviços não são direcionados a crianças menores de 16 anos (ou a idade mínima exigida em seu território), e não coletamos intencionalmente informações pessoais de crianças.

## Alterações a esta política

Podemos atualizar esta Política de Privacidade periodicamente. Publicaremos a política revisada nesta página e atualizaremos a data de "Last updated". O uso continuado dos Serviços após as alterações entrarem em vigor constitui aceitação da política revisada, na medida permitida por lei.

## Fale conosco

Dúvidas sobre esta Política de Privacidade podem ser enviadas pela página de Contato em nosso site.
