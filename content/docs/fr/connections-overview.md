# Vue d'ensemble des connexions

Une _connexion_ est la façon dont un workflow atteint le monde extérieur : un compte autorisé via OAuth, une clé d'API stockée dans le coffre, une intégration propriétaire. Les plugins déclarent les connexions dont ils ont besoin dans leur manifeste ; les installateurs autorisent ces connexions au moment de l'installation.

Cette page se place du point de vue de l'installateur. Si vous construisez un plugin, lisez également [Construire une connexion](/documentation/connections-build).

## Quels types de connexions existent

Polymux prend en charge trois types de connexions :

### Connexions vault

Une connexion vault est un secret typé que vous collez dans Polymux. La boîte de dialogue d'installation vous indique quelle clé le plugin nécessite, quelle forme il attend (clé d'API, jeton bearer, paire basic auth) et vous indique où l'obtenir.

Les connexions vault ne quittent jamais votre espace de travail. L'auteur du plugin ne peut pas les lire ; les ingénieurs de Polymux ne peuvent pas les lire. La seule chose qui touche la valeur brute est l'action de l'agent qui l'utilise.

### Connexions OAuth

Les connexions OAuth délèguent l'autorisation à un tiers. Cliquez sur le bouton **Autoriser** dans la boîte de dialogue d'installation, vous êtes renvoyé vers l'écran de consentement du fournisseur, et au retour le jeton est stocké dans le coffre de votre espace de travail sous une clé limitée au fournisseur.

Les jetons sont rafraîchis automatiquement. Si un rafraîchissement échoue (vous avez révoqué l'autorisation, le fournisseur a fait une rotation, votre compte a été désactivé), la connexion est marquée comme _cassée_ et tout plugin qui en dépend se met en pause jusqu'à ce que vous l'autorisiez à nouveau.

### Connexions d'intégration

Les intégrations couvrent tout ce qui n'est pas un fournisseur OAuth intégré. La plupart vivent dans la marketplace en tant que connecteurs publiés par la communauté qui enveloppent une API tierce ; le manifeste de Polymux décrit les secrets dont le connecteur a besoin et les outils qu'il expose, et vous l'installez de la même façon que vous installez un plugin.

Chaque intégration a son propre flux de configuration avec des champs spécifiques au fournisseur. Une fois configurée, une intégration apparaît comme un outil que le workflow peut appeler. Plusieurs plugins peuvent partager la même intégration sans s'autoriser à nouveau.

## Fournisseurs pris en charge

Fournisseurs OAuth pris en charge en interne :

- Google Drive — alimente l'épine dorsale du stockage de l'espace de travail.

Tout autre fournisseur vit dans la marketplace en tant qu'**intégration** installable. Parcourez [Marketplace → Intégrations](/integrations/marketplace) pour voir ce qui est actuellement publié, ou créez la vôtre ([Construire une connexion](/documentation/connections-build)).

Si un plugin que vous voulez installer dépend d'une intégration qui n'est pas encore dans la marketplace, l'installation fera apparaître la dépendance manquante par son nom afin que vous puissiez l'obtenir (ou la publier) avant de réessayer.

## Installer un plugin avec des connexions

Quand vous cliquez sur **Installer** sur un listing de la marketplace, Polymux ouvre une boîte de dialogue d'installation qui vous guide à travers chaque connexion obligatoire dans l'ordre :

1. **Lisez la description.** Chaque connexion a un libellé, un texte d'aide et un indicateur obligatoire/facultatif.
2. **Autorisez.** Les connexions OAuth affichent un bouton _Autoriser_. Les connexions vault affichent un champ de collage. Les connexions d'intégration affichent le formulaire pertinent du fournisseur.
3. **Confirmez.** Un écran de récapitulatif liste tout ce à quoi le plugin aura accès. Appuyez sur _Installer_ pour valider.

Le plugin apparaît dans la liste des plugins de votre espace de travail. Sa première exécution se fait manuellement, sauf si le plugin a son propre planning, auquel cas Polymux l'exécute selon ce planning.

## Reconnecter une connexion cassée

Depuis les paramètres du plugin, cliquez sur **Reconnecter** à côté de toute connexion cassée. La boîte de dialogue vous guide à travers le même flux d'autorisation / collage / confirmation.

Pour les fournisseurs OAuth, la cause la plus courante d'une connexion cassée est la suppression du compte sous-jacent ou la révocation de l'autorisation OAuth côté fournisseur. La reconnexion récupère proprement la nouvelle autorisation.

## Supprimer une connexion

Supprimer une connexion alors qu'un plugin la référence encore met le plugin dans un état dégradé. Les connexions facultatives sont silencieusement supprimées ; les connexions obligatoires causent l'échec du plugin à sa prochaine exécution.

Vous pouvez supprimer une connexion depuis **Coffre → Connexions**. L'autorisation du fournisseur de son côté n'est pas automatiquement révoquée — pour cela, allez dans les paramètres du compte du fournisseur et révoquez depuis là.

## Étapes suivantes

- Créez votre propre connecteur : [Construire une connexion](/documentation/connections-build).
- Voir le schéma de connexion tel qu'il apparaît dans le manifeste de plugin : [Référence du manifeste de plugin](/documentation/plugin-manifest#connections).
- Vous rencontrez une erreur d'autorisation en cours d'installation ? Voir la [FAQ](/documentation/faq#permissions-errors).
