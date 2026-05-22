# Bases du coffre

Le coffre est l'endroit où vous stockez les identifiants, les clés d'API et les autres secrets dont les agents ont besoin pour agir en votre nom. Tout ce qu'un agent lit depuis le coffre est journalisé, limité à la session et n'est jamais renvoyé au modèle tel quel — il est injecté directement dans la page ou dans l'appel d'outil.

## Ce qui va dans le coffre

Il existe deux types d'entrées dans le coffre :

- **Mots de passe** — des paires nom d'utilisateur / mot de passe associées à un domaine. L'agent les remplit dans les formulaires de connexion quand il atterrit sur une URL correspondante.
- **Entrées du wallet** — clés d'API, jetons bearer, secrets clients OAuth et autres secrets arbitraires. Ils sont injectés dans les appels d'outils (en-têtes de requêtes HTTP, arguments CLI) plutôt que tapés dans un formulaire.

Le coffre ne stocke pas de fichiers, de certificats ni de clés SSH. Utilisez le [stockage de l'espace de travail](/documentation/installation) pour ceux-là.

## Ajouter une entrée

Depuis le panneau latéral, ouvrez **Coffre → Mots de passe** ou **Coffre → Wallet** et appuyez sur **+ Nouveau**. Donnez un nom à l'entrée, l'hôte (pour les mots de passe) ou une forme de clé (pour les entrées du wallet), et la valeur. La valeur est chiffrée au repos avec la clé de l'espace de travail ; personne — y compris les ingénieurs de Polymux — ne peut la relire sans votre authentification.

## Comment les agents accèdent au coffre

Les agents ne voient pas les secrets. Quand un workflow en a besoin, il émet une requête typée comme _"le mot de passe pour github.com"_ vers le coffre et Polymux injecte la valeur dans l'action suivante sans jamais la placer dans la fenêtre de contexte de l'agent. Le modèle sait que le secret existe et à quoi il sert ; il n'en connaît pas les caractères réels.

Si vous voyez une session se mettre en pause puis reprendre autour d'un formulaire de connexion, cette pause est le coffre qui remplit les identifiants.

## Portée

Par défaut, chaque membre de l'espace de travail avec le rôle **Membre** ou supérieur peut utiliser n'importe quelle entrée du coffre dans les workflows. Pour restreindre une entrée, éditez-la et définissez sa portée :

- **Espace de travail** — toute personne avec le rôle d'espace de travail peut l'utiliser. Par défaut.
- **Workflow** — seuls les workflows dont les ID sont listés peuvent la demander. Utile pour les clés à fort impact.
- **Propriétaire uniquement** — seul le créateur de l'entrée peut l'utiliser, y compris dans les exécutions planifiées.

Il n'y a pas encore d'interface de journal d'audit, mais chaque lecture du coffre est capturée côté serveur. Si vous avez besoin de récupérer le journal pour une entrée spécifique, [contactez le support](/contact).

## Faire tourner un secret

Ouvrez l'entrée, cliquez sur **Faire tourner** et collez la nouvelle valeur. La valeur précédente est effacée — il n'y a pas d'historique de versions dans le coffre. Les workflows qui référençaient l'ancienne valeur continueront de fonctionner à leur prochaine exécution ; les sessions en cours conservent l'ancienne valeur en mémoire jusqu'à leur fin.

## Que se passe-t-il si je supprime une entrée

La suppression est immédiate et irrécupérable. Toute session qui se met en pause sur une lecture du coffre pour l'entrée supprimée échouera avec `vault_missing` et nécessitera une nouvelle entrée. Les exécutions planifiées échoueront de la même manière. Vous verrez une notification dans le tableau de bord pour chaque exécution ayant échoué.

## Étapes suivantes

- Besoin d'utiliser un fournisseur OAuth comme Google Drive ? Lisez [Connexions](/documentation/connections-overview).
- Vous construisez un workflow qui utilise des entrées du coffre ? Lisez [Vue d'ensemble des plugins](/documentation/plugin-overview) — les workflows packagés déclarent quelles clés du coffre ils nécessitent pour que les installateurs sachent ce qu'ils doivent fournir.
