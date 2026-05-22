# Vue d'ensemble des plugins

Un plugin Polymux est un workflow packagé que quelqu'un d'autre peut installer dans son espace de travail en un clic. Les plugins regroupent le graphe du workflow, les connexions dont il a besoin (clés du coffre, fournisseurs OAuth, intégrations) et un petit manifeste qui décrit le listing.

Cette page est le point de départ du guide développeur. Si vous n'avez pas encore construit de workflow, suivez d'abord le [Démarrage rapide](/documentation/quickstart).

## Quand packager un workflow en tant que plugin

Packagez un workflow lorsque :

- Vous voulez que **des coéquipiers dans d'autres espaces de travail** l'utilisent sans le réécrire.
- Le workflow est **suffisamment stable pour que vous ne le modifiez pas** entre chaque exécution.
- Il utilise des **connexions portables** — fournisseurs OAuth, API publiques ou clés de coffre qu'un installateur peut fournir.

Ne packagez _pas_ un workflow lorsqu'il incorpore des données spécifiques à un espace de travail (e-mails de membres codés en dur dans les prompts, noms d'hôtes internes, secrets mono-locataires). Quiconque installe le plugin obtient une copie de ces données.

## Anatomie d'un plugin

Chaque plugin est composé de quatre éléments :

1. **Le graphe du workflow.** Les nœuds, les arêtes, les prompts et les sélections d'outils que vous avez créés dans l'éditeur de workflows. Versionné selon l'historique de versions propre au workflow.
2. **Un manifeste.** Nom, description, icône, catégorie, captures d'écran et tarification. Métadonnées de surface utilisées par la marketplace et la boîte de dialogue d'installation.
3. **Un schéma de connexion.** Les clés du coffre, les fournisseurs OAuth et les ID d'intégration dont le workflow a besoin pour s'exécuter. Polymux utilise cela pour demander à l'installateur les bons secrets au moment de l'installation.
4. **Un changelog.** Notes de version en forme libre pour chaque version publiée. Affichées sur la page du listing.

Les pages suivantes parcourent chacun de ces éléments à tour de rôle.

## Deux variantes de travail packagé

Polymux prend en charge deux artefacts liés dans la marketplace :

- **Plugins** — workflows packagés. Importés dans un espace de travail, exécutés par l'installateur.
- **Connexions** — intégrations packagées. Importées une fois par espace de travail, puis disponibles pour tout workflow en tant qu'outil.

Ce guide se concentre sur les plugins parce que c'est ce par quoi la plupart des auteurs commencent. Les connexions sont documentées dans [Construire une connexion](/documentation/connections-build).

## Distribution

Les plugins peuvent être publiés de trois manières :

- **Marketplace publique** — listés sur [polymux.com/integrations/marketplace](/integrations/marketplace). Toute personne disposant d'un compte Polymux peut les installer. Gratuit ou payant.
- **Espace de travail uniquement** — visible uniquement par les membres d'un seul espace de travail. Utile pour l'outillage interne que vous ne voulez pas rendre public.
- **Lien non répertorié** — accessible via une URL directe mais non indexé. Utile pour la bêta fermée ou la distribution payante en dehors de Polymux.

Vous choisissez la distribution au moment de la soumission ; vous pouvez la modifier plus tard sans soumettre à nouveau pour examen.

## Tarification et partage des revenus

Vous pouvez facturer des frais uniques ou mensuels pour un plugin. Polymux traite les paiements via Stripe et prélève une commission de plateforme de 15 %. Le reste est reversé sur votre compte Stripe Connect mensuellement.

Les plugins gratuits n'ont pas de frais de listing ni d'intégration de paiement à configurer. Nous recommandons de commencer par une version gratuite et d'ajouter la tarification plus tard une fois que vous avez des chiffres d'installation.

## Étapes suivantes

- Pratique : [Construisez votre premier plugin](/documentation/plugin-build).
- Consultez le format du manifeste : [Référence du manifeste de plugin](/documentation/plugin-manifest).
- Apprenez comment les installateurs autorisent l'accès au coffre et à OAuth : [Connexions](/documentation/connections-overview).
