# Workspaces e membros

Um workspace é o contêiner compartilhado para tudo o que uma equipe constrói no Polymux: workflows, entradas do cofre, arquivos, cobrança e membros. Você pertence a pelo menos um workspace — um pessoal — e pode ser membro de quantos workspaces compartilhados precisar.

## Criando um workspace

No painel lateral, abra o seletor de workspace e escolha **+ Novo workspace**. Dê a ele um nome e um avatar opcional. O novo workspace está vazio: sem workflows, sem entradas no cofre, sem arquivos compartilhados. O usuário que cria um workspace é seu primeiro **proprietário**.

## Funções

O Polymux tem quatro funções, em ordem crescente de capacidade:

| Função | Pode executar workflows | Pode editar workflows | Pode gerenciar membros | Pode gerenciar cobrança |
| --- | --- | --- | --- | --- |
| Visualizador | sim | não | não | não |
| Membro | sim | sim | não | não |
| Administrador | sim | sim | sim | não |
| Proprietário | sim | sim | sim | sim |

Você pode alterar a função de um membro a qualquer momento nas configurações do workspace. Deve sempre haver pelo menos um proprietário; o seletor de função se recusa a rebaixar o último proprietário.

## Convidando pessoas

Nas configurações do workspace, cole uma lista de endereços de e-mail no campo de convite, escolha uma função e pressione **Enviar convites**. Cada convidado recebe um e-mail com um link que expira em sete dias. Os convites pendentes aparecem na mesma página de configurações; você pode reenviar ou revogar qualquer um deles.

Se o convidado já tiver uma conta Polymux com o mesmo e-mail, aceitar o convite o adiciona imediatamente ao workspace. Se ele não tiver uma conta, o link do convite o levará primeiro pelo cadastro.

## Alternando workspaces

O seletor de workspace no painel lateral mostra todos os workspaces aos quais você pertence. Alternar muda todo o contexto: o painel lateral recarrega com os workflows daquele workspace, as abas do cofre e armazenamento passam a se referir a ele e qualquer novo workflow criado fica sob sua propriedade. Nada vaza entre workspaces.

## Compartilhamento dentro de um workspace

Por padrão, todos os membros veem todos os workflows, entradas do cofre e arquivos do workspace. Não há ACL por recurso — se você precisa de um raio de impacto mais restrito, use um workspace menor.

Há uma exceção: arquivos em **Armazenamento pessoal** são privados para quem fez o upload. Para compartilhar um arquivo ou pasta com um colega, abra-o no armazenamento e escolha **Compartilhar com**. Os compartilhamentos podem ser revogados e aparecem na aba _Compartilhado comigo_ do destinatário.

## Removendo membros

Administradores e proprietários podem remover membros pelas configurações do workspace. Membros removidos perdem acesso imediatamente; quaisquer sessões que eles estivessem executando não são interrompidas, mas eles não conseguem mais se conectar.

Se um membro removido for a única pessoa que pareou a [extensão de navegador](/documentation/installation#browser-extension) para um workflow, o workflow continua rodando em navegadores hospedados — os pareamentos de extensão são por usuário, não por workspace.

## Próximos passos

- Armazenando logins ou chaves de API para o workspace usar? Veja [Noções básicas do cofre](/documentation/vault).
- Quer um workflow que todo o seu workspace possa usar sem precisar refazê-lo? Veja [Visão geral do plugin](/documentation/plugin-overview) para empacotamento.
- Recebeu um erro de permissão? Confira o [FAQ](/documentation/faq#permissions-errors).
