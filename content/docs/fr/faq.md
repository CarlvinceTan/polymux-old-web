# FAQ

Questions courantes, regroupées par sujet. Si votre question n'y figure pas, le [forum](/forum) est l'endroit le plus rapide où la poser.

## Compte et facturation

### Comment changer mon adresse e-mail ?

Depuis le tableau de bord, ouvrez **Paramètres → Compte → E-mail**. Vous devrez confirmer le changement depuis l'ancienne et la nouvelle adresse avant que le basculement ne prenne effet.

### Puis-je déplacer des workflows entre espaces de travail ?

Pas directement. La voie recommandée est de publier le workflow en tant que [workflow packagé](/documentation/plugin-overview) et de l'installer dans l'espace de travail de destination. Cela reporte le prompt, les outils et les références au coffre, mais réinitialise l'historique des exécutions.

### Qu'advient-il de mes données si j'annule ?

Les données de l'offre gratuite sont conservées indéfiniment. Les offres payantes sont rétrogradées à l'offre gratuite à l'annulation, ce qui peut faire dépasser le quota gratuit. Polymux vous notifiera dans l'application pendant 30 jours avant de supprimer quoi que ce soit pour vous ramener sous le quota.

## Sessions et workflows

### Pourquoi ma session s'est-elle déconnectée ?

Les sessions sont maintenues en vie sur le serveur. Si votre onglet de navigateur local se ferme ou perd le réseau, la session continue de tourner et vous pouvez vous y rattacher depuis le panneau latéral. Si la session elle-même se termine, vous verrez un code de statut en haut du chat — `idle_timeout`, `budget_exceeded` ou `error` sont les plus courants.

### Combien de temps une session peut-elle durer ?

Il n'y a pas de limite stricte d'horloge murale, mais chaque session a un budget de jetons défini sur son workflow. Quand le budget est épuisé, la session se met en pause et demande une approbation avant de continuer. Le budget par défaut est assez généreux pour gérer la plupart des tâches de navigateur de plusieurs heures.

### Pourquoi la vue en direct est-elle noire ?

Trois causes habituelles :

- **WebRTC est bloqué** sur votre réseau — la vue bascule vers un flux de polling plus lent après quelques secondes. Vérifiez l'icône de connexion dans le coin de la vue ; si elle affiche un point jaune, vous êtes sur le fallback.
- **L'agent n'a pas encore navigué.** La vue reste vide jusqu'à ce que le navigateur charge sa première page.
- **Vous êtes en `?mode=extension`** mais l'extension n'est pas appairée. Ouvrez la fenêtre contextuelle de l'extension et vérifiez le badge de statut.

### Erreurs d'autorisation

Si un workflow refuse de s'exécuter avec une erreur d'autorisation, la cause la plus courante est que votre rôle dans l'espace de travail ne permet pas d'exécuter des workflows — les lecteurs ne peuvent pas démarrer d'exécutions. Demandez à un administrateur de vous promouvoir au rôle **Membre**.

## Coffre et secrets

### Un modèle peut-il voir mes mots de passe ?

Non. Les valeurs du coffre sont injectées directement dans les actions de page ou les appels d'outils. On indique au modèle qu'un secret a été utilisé mais il ne voit jamais les caractères réels. Voir [Bases du coffre](/documentation/vault#how-agents-access-the-vault) pour la vue complète.

### Quel chiffrement utilisez-vous ?

Les entrées du coffre sont chiffrées au repos avec AES-256-GCM en utilisant une clé par espace de travail. La clé de l'espace de travail est elle-même enveloppée avec une clé racine détenue dans notre KMS géré. Nous ne journalisons ni ne stockons jamais de valeurs déchiffrées.

### Puis-je exporter les entrées du coffre ?

Il n'y a pas d'export en bloc aujourd'hui. Chaque entrée peut être révélée et copiée individuellement depuis la page du coffre. Les outils d'export sont sur la feuille de route ; le ticket de suivi se trouve dans le [forum](/forum).

## Plugins et questions développeur

### Qu'est-ce qu'un plugin ?

Un _plugin_ est un workflow packagé plus ses connexions — tout ce dont quelqu'un d'autre a besoin pour l'installer dans son propre espace de travail en un seul clic. Voir [Vue d'ensemble des plugins](/documentation/plugin-overview).

### Comment publier un plugin ?

Ouvrez le workflow que vous voulez publier, allez dans l'onglet **Publier**, remplissez les champs du listing et soumettez pour examen. Les examens sont généralement traités sous deux jours ouvrables. Voir [Publier un plugin](/documentation/publishing) pour la procédure complète.

### Les plugins peuvent-ils lire les données les uns des autres ?

Non. Chaque plugin s'exécute dans sa propre session avec son propre accès limité au coffre. Deux plugins installés dans le même espace de travail ne peuvent pas voir les lectures du coffre, les fichiers ou l'historique de session de l'autre.

## Vérification des téléchargements

Les installeurs de bureau et les archives `.zip` d'extension sont signés. Le SHA-256 de chaque version est listé sur la [page d'installation](/install-apps) à côté du téléchargement. Pour vérifier un `.dmg` macOS, par exemple :

```sh
shasum -a 256 Polymux-1.0.0-universal.dmg
```

Comparez la sortie avec la valeur sur la page d'installation. Si elles ne correspondent pas, n'exécutez pas l'installeur — contactez-nous via la page [contact](/contact).

## Toujours bloqué ?

Si rien de ce qui précède ne répond à votre question :

1. Cherchez dans le [forum](/forum) — les problèmes courants y sont habituellement discutés.
2. Survolez la [vue d'ensemble de l'API](/documentation/api-overview) si vous intégrez de manière programmatique.
3. Envoyez un e-mail au support depuis la [page de contact](/contact). Incluez l'ID de votre espace de travail et l'ID de la session (visibles dans l'URL) afin que nous puissions retrouver votre exécution dans nos journaux.
