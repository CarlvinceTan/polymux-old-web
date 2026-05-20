# Checklist de publication

Vous avez construit un plugin, rempli le listing et le panneau _Examen_ de l'onglet Publier a l'air correct. Avant d'appuyer sur **Soumettre pour examen**, parcourez cette checklist. La plupart des rejets sont causés par quelque chose figurant sur cette page.

## Le workflow

- [ ] **S'exécute depuis un démarrage à froid.** Déclenchez une nouvelle exécution avec le chat vide. Le workflow doit atteindre un état terminal au premier tour sans que vous n'interveniez.
- [ ] **Aucun secret codé en dur.** Cherchez dans le prompt tout ce qui ressemble à une clé, un jeton, un mot de passe ou un e-mail. Déplacez chaque correspondance dans le coffre et référencez-la par clé.
- [ ] **Aucune donnée spécifique à l'espace de travail.** Noms d'hôtes internes, e-mails de membres, ID de feuilles, canaux Slack — tout ce qu'un installateur pourrait vouloir changer doit être une entrée du workflow.
- [ ] **Tous les outils sont propriétaires ou publiés sur la marketplace.** Un plugin qui importe un outil depuis votre propre espace de travail privé s'installera mais ne s'exécutera jamais pour quelqu'un d'autre.
- [ ] **S'arrête proprement en cas d'échec.** Déclenchez un chemin d'échec connu (mauvaise entrée du coffre, fournisseur hors ligne) et confirmez que le workflow renvoie une erreur utile plutôt que de tourner indéfiniment.

## Le listing

- [ ] **Nom** de 1 à 40 caractères, sans numéro de version.
- [ ] **Description courte** : une phrase, moins de 120 caractères, qui dit ce que le plugin _fait_ — pas avec quoi _il est construit_.
- [ ] **Description longue** explique ce dont le plugin a besoin en entrée, ce qu'il produit et quelles données il touche. Les examinateurs la lisent attentivement.
- [ ] **Icône** est carrée et s'affiche proprement en 64×64.
- [ ] **Captures d'écran** montrent le plugin en utilisation, pas le site marketing. Deux à quatre est le bon équilibre.
- [ ] **Catégorie** est la correspondance la plus proche. _Autre_ est réservé aux plugins qui ne rentrent réellement nulle part.
- [ ] **Tags** sont précis. N'en ajoutez pas pour rembourrer avec des termes non liés — la recherche classe le bourrage de tags vers le bas.

## Les connexions

- [ ] **Chaque connexion obligatoire a un `label` qu'un inconnu peut comprendre.** _"Clé d'API OpenAI"_ est bien ; _"oai_k"_ ne l'est pas.
- [ ] **Chaque connexion obligatoire a un `help`** sauf si le libellé se suffit à lui-même (les fournisseurs OAuth le sont généralement).
- [ ] **Les connexions facultatives se dégradent élégamment.** Déclenchez une exécution avec chaque connexion facultative manquante et confirmez que le workflow saute cette étape ou renvoie une erreur sensée.
- [ ] **Les scopes sont minimaux.** Demandez le scope OAuth le plus étroit qui permet au workflow de fonctionner. Les examinateurs repousseront les permissions trop larges.

## Tarification (plugins payants uniquement)

- [ ] **Stripe Connect est configuré.** `Paramètres → Versements` doit afficher un compte vérifié.
- [ ] **La devise et le montant sont corrects.** Les listings ne peuvent pas avoir leur devise modifiée après publication sans contacter le support.
- [ ] **La politique de remboursement** est mentionnée dans la description longue. Il n'y a pas de politique à l'échelle de la plateforme ; vous la définissez.

## Après la soumission

- Les examens sont traités sous deux jours ouvrables. Vous recevrez un e-mail avec le résultat.
- En cas de rejet, l'e-mail liste les champs précis à modifier. Corrigez et soumettez à nouveau — pas de pénalité pour plusieurs soumissions.
- En cas d'approbation, le listing est mis en ligne immédiatement. L'onglet _Nouveau_ de la marketplace le met en avant pendant les 7 premiers jours.

## Versionnement après le lancement

Incrémentez la version pour chaque changement que vous poussez au workflow :

- **Patch** (`1.0.0 → 1.0.1`) — correction de bug, pas de changement de comportement, pas de nouvelles connexions.
- **Mineur** (`1.0.0 → 1.1.0`) — nouveau comportement facultatif, connexions facultatives, entrées supplémentaires avec valeurs par défaut.
- **Majeur** (`1.0.0 → 2.0.0`) — nouvelle connexion obligatoire, entrée supprimée, comportement matériellement différent.

Les installateurs peuvent épingler une plage de versions. Les bumps majeurs les incitent à se ré-authentifier avant la mise à jour.

## Dépublication

Vous pouvez retirer un plugin de la marketplace à tout moment depuis l'onglet Publier. Les installateurs existants continuent d'exécuter le plugin jusqu'à ce qu'ils le désinstallent ; les nouveaux installateurs ne peuvent pas le trouver.

Si vous devez **tuer en urgence** un plugin — par exemple, vous découvrez qu'il fuit des données — contactez le support. Nous pouvons désactiver le plugin côté serveur pour tous les installateurs en une seule fois.

## Étapes suivantes

- Flux de mise à jour des plugins : [Construisez votre premier plugin](/documentation/plugin-build#7-publishing-updates).
- Créer un connecteur personnalisé : [Construire une connexion](/documentation/connections-build).
- Publication programmatique : [Vue d'ensemble de l'API](/documentation/api-overview).
