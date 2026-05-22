# Espaces de travail et membres

Un espace de travail est le conteneur partagé pour tout ce qu'une équipe construit dans Polymux : workflows, entrées du coffre, fichiers, facturation et membres. Vous appartenez à au moins un espace de travail — un espace personnel — et vous pouvez être membre d'autant d'espaces de travail partagés que nécessaire.

## Créer un espace de travail

Depuis le panneau latéral, ouvrez le sélecteur d'espace de travail et choisissez **+ Nouvel espace de travail**. Donnez-lui un nom et un avatar optionnel. Le nouvel espace de travail est vide : aucun workflow, aucune entrée du coffre, aucun fichier partagé. L'utilisateur qui crée un espace de travail en est le premier **propriétaire**.

## Rôles

Polymux propose quatre rôles, par ordre croissant de capacités :

| Rôle | Peut exécuter les workflows | Peut éditer les workflows | Peut gérer les membres | Peut gérer la facturation |
| --- | --- | --- | --- | --- |
| Lecteur | oui | non | non | non |
| Membre | oui | oui | non | non |
| Administrateur | oui | oui | oui | non |
| Propriétaire | oui | oui | oui | oui |

Vous pouvez modifier le rôle d'un membre à tout moment depuis les paramètres de l'espace de travail. Il doit toujours y avoir au moins un propriétaire ; le sélecteur de rôle refusera de rétrograder le dernier propriétaire.

## Inviter des personnes

Depuis les paramètres de l'espace de travail, collez une liste d'adresses e-mail dans le champ d'invitation, choisissez un rôle et appuyez sur **Envoyer les invitations**. Chaque invité reçoit un e-mail avec un lien qui expire dans sept jours. Les invitations en attente apparaissent sur la même page de paramètres ; vous pouvez les renvoyer ou les révoquer.

Si l'invité possède déjà un compte Polymux avec la même adresse e-mail, accepter l'invitation l'ajoute immédiatement à l'espace de travail. S'il n'a pas de compte, le lien d'invitation l'emmène d'abord vers l'inscription.

## Changer d'espace de travail

Le sélecteur d'espace de travail dans le panneau latéral affiche tous les espaces de travail auxquels vous appartenez. Changer modifie l'intégralité du contexte : le panneau latéral se recharge avec les workflows de cet espace, les onglets du coffre et du stockage se limitent à celui-ci, et tout nouveau workflow que vous créez lui appartient. Rien ne fuit entre les espaces de travail.

## Partage au sein d'un espace de travail

Par défaut, chaque membre voit chaque workflow, entrée du coffre et fichier dans l'espace de travail. Il n'y a pas d'ACL par ressource — si vous avez besoin d'un rayon d'impact plus restreint, utilisez un espace de travail plus petit.

Il y a une exception : les fichiers dans le **Stockage personnel** sont privés à l'uploader. Pour partager un fichier ou un dossier avec un coéquipier, ouvrez-le dans le stockage et choisissez **Partager avec**. Les partages sont révocables et apparaissent dans l'onglet _Partagé avec moi_ du destinataire.

## Retirer des membres

Les administrateurs et les propriétaires peuvent retirer des membres depuis les paramètres de l'espace de travail. Les membres retirés perdent immédiatement l'accès ; les sessions qu'ils exécutaient ne sont pas interrompues, mais ils ne peuvent plus s'y rattacher.

Si un membre retiré est la seule personne à avoir appairé l'[extension de navigateur](/documentation/installation#browser-extension) pour un workflow, le workflow continue de s'exécuter sur les navigateurs hébergés — les appairages d'extension sont par utilisateur, pas par espace de travail.

## Étapes suivantes

- Stocker des identifiants ou des clés d'API pour que l'espace de travail les utilise ? Voir [Bases du coffre](/documentation/vault).
- Vous voulez un workflow que tout votre espace de travail puisse utiliser sans le réécrire ? Voir [Vue d'ensemble des plugins](/documentation/plugin-overview) pour le packaging.
- Vous rencontrez une erreur d'autorisation ? Consultez la [FAQ](/documentation/faq#permissions-errors).
