# Construisez votre premier plugin

Ce guide pas-à-pas prend un workflow existant et le packagae en un plugin installable. Il suppose que vous avez lu la [Vue d'ensemble des plugins](/documentation/plugin-overview) et que vous avez un workflow dans votre espace de travail qui s'exécute proprement de bout en bout.

## 1. Choisir un workflow candidat

Ouvrez le workflow que vous voulez publier. Avant toute chose, faites un contrôle de bon sens :

- **S'exécute-t-il depuis un démarrage à froid ?** Déclenchez une nouvelle exécution avec le chat vide. Tout ce qui dépend d'un contexte préalable — fichiers téléchargés plus tôt, entrées du coffre créées en cours de session — échouera pour un installateur qui démarre de zéro.
- **Tous les secrets sont-ils dans le coffre ?** Si un secret est collé tel quel dans un prompt, quiconque installe le plugin l'obtient aussi. Déplacez-le dans le coffre et référencez-le par clé.
- **Les URL et les ID sont-ils configurables ?** Remplacez les noms d'organisations, les ID de feuilles ou les noms d'hôtes codés en dur par des entrées de workflow que l'installateur peut remplir.

Un workflow qui passe cette checklist est en bonne forme pour être packagé.

## 2. Ouvrir l'onglet Publier

Sur la page du workflow, passez à l'onglet **Publier**. Si vous ne le voyez pas, votre rôle dans l'espace de travail n'inclut pas les droits de publication — demandez à un administrateur de vous promouvoir à **Membre** ou supérieur.

L'onglet Publier comporte quatre sous-panneaux : **Listing**, **Connexions**, **Tarification** et **Examen**. Nous les remplirons dans l'ordre.

## 3. Listing

Le listing est ce que les acheteurs voient sur la carte de la marketplace et sur la page de détail.

- **Nom.** 1 à 40 caractères. Évitez les numéros de version en suffixe — les versions sont suivies séparément.
- **Description courte.** Une phrase, moins de 120 caractères. Cela apparaît sur la carte.
- **Description longue.** Markdown pris en charge. Expliquez ce que fait le workflow, ce dont il a besoin et ce qu'il produit. Les captures d'écran aident.
- **Icône.** PNG carré, 256×256 minimum. SVG accepté.
- **Catégorie.** Choisissez la correspondance la plus proche. Les catégories pilotent le filtrage de la marketplace.
- **Tags.** Jusqu'à cinq tags en forme libre. Utilisés pour la recherche.

## 4. Connexions

Polymux analyse le graphe du workflow et présente chaque dépendance externe qu'il trouve : clés du coffre, fournisseurs OAuth, ID d'intégration. Pour chacune, déclarez :

- **Si elle est obligatoire ou facultative.** Les connexions facultatives permettent au workflow de s'exécuter en mode dégradé si elles ne sont pas fournies.
- **Libellé d'affichage.** Ce que l'installateur voit dans la boîte de dialogue d'installation. _"Clé d'API OpenAI"_ est meilleur que le nom brut de la clé du coffre.
- **Texte d'aide.** Un court indice expliquant où l'installateur doit obtenir la valeur. Liez la documentation du fournisseur si pertinent.

Si la connexion est le fournisseur OAuth Google Drive intégré, l'installateur l'autorise en un clic pendant l'installation. Pour tout autre fournisseur, le workflow dépend d'une intégration de la marketplace (ou d'une clé du coffre que l'installateur colle) ; les deux sont gérées via la même boîte de dialogue d'installation.

Voir [Référence du manifeste de plugin](/documentation/plugin-manifest) pour le schéma complet de ce qui est capturé ici.

## 5. Tarification

Trois options :

- **Gratuit.** Pas de paiement, pas de configuration Stripe requise.
- **Paiement unique.** L'installateur paie une fois, possède le plugin dans son espace de travail indéfiniment.
- **Abonnement.** Récurrence mensuelle. L'installateur peut annuler à tout moment, le plugin se désinstalle à la fin de la période.

Pour les plugins payants, vous devez connecter un compte Stripe depuis **Paramètres → Versements**. Polymux retient les 15 % de commission de plateforme et reverse le reste mensuellement. Il y a un seuil minimum de versement de 50 $.

## 6. Examen et soumission

Le sous-panneau **Examen** prévisualise le listing tel que les installateurs le verront. Regardez les captures d'écran, parcourez les invites de connexion et relisez la description longue à la recherche de fautes de frappe.

Appuyez sur **Soumettre pour examen**. Le plugin entre dans la file d'attente et vous recevrez un e-mail dans les deux jours ouvrables avec le résultat. Les raisons courantes de rejet sont :

- La description du listing omet ce que le plugin fait réellement ou quelles données il touche.
- Les connexions obligatoires ne sont pas étiquetées assez clairement pour qu'un inconnu comprenne.
- Le workflow incorpore des secrets qui devraient être dans le coffre.

Vous pouvez modifier le listing et le soumettre à nouveau autant de fois que vous le souhaitez.

## 7. Publier des mises à jour

Une fois qu'un plugin est en ligne, toute modification du workflow sous-jacent devient une _nouvelle version_. Les versions ne sont pas publiées automatiquement ; depuis l'onglet Publier, choisissez **Promouvoir en public** pour rendre une version disponible aux installateurs existants. Ils peuvent choisir de mettre à jour ou de rester sur l'ancienne version.

Les changements de rupture — par exemple, exiger une nouvelle connexion — doivent incrémenter la version majeure. Polymux avertit les installateurs qu'ils seront sollicités pour de nouvelles autorisations avant d'appliquer la mise à jour.

## Étapes suivantes

- Voir le schéma champ par champ : [Référence du manifeste de plugin](/documentation/plugin-manifest).
- Ajouter une intégration adossée à OAuth à votre plugin : [Vue d'ensemble des connexions](/documentation/connections-overview).
- Publier votre premier plugin payant : [Checklist de publication](/documentation/publishing).
