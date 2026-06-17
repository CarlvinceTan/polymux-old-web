_Last updated: June 14, 2026_

Cette Politique de confidentialité décrit comment **Polymux** (« nous », « notre » ou « nos ») collecte, utilise et partage des informations lorsque vous utilisez nos sites web, applications et services connexes (collectivement, les **Services**). En utilisant les Services, vous acceptez cette politique.

L'utilisation et le transfert par Polymux des informations reçues des API Google vers toute autre application se conformeront à la [Politique relative aux données des utilisateurs des services de l'API Google](https://developers.google.com/terms/api-services-user-data-policy), y compris les exigences d'utilisation limitée.

## Informations que nous collectons

### Informations que vous fournissez

Nous collectons les informations que vous soumettez directement — par exemple lorsque vous créez un compte, contactez le support, vous abonnez à des mises à jour ou remplissez des formulaires. Cela peut inclure votre nom, adresse e-mail, organisation et le contenu de vos messages.

### Informations collectées automatiquement

Lorsque vous utilisez les Services, nous pouvons collecter automatiquement certaines données techniques et d'utilisation, telles que l'adresse IP, le type d'appareil, le type de navigateur, le système d'exploitation, les pages consultées, les URL de référence et la localisation approximative dérivée de l'IP. Nous pouvons utiliser des cookies et technologies similaires tels que décrits dans notre Politique de cookies.

### Informations provenant des intégrations

Si vous connectez des comptes tiers ou activez des intégrations, nous pouvons recevoir des informations selon vos paramètres et les autorisations que vous accordez à ces fournisseurs. Consultez la section **Données utilisateur Google** ci-dessous pour les divulgations supplémentaires spécifiques aux API Google.

## Données utilisateur Google

Cette section décrit comment Polymux accède, utilise, stocke, partage et conserve les données obtenues via les API Google. Elle s'applique chaque fois que vous connectez un compte Google à Polymux (par exemple, l'intégration Gmail ou Google Drive).

### Données auxquelles nous accédons

Lorsque vous connectez un compte Google, Polymux demande uniquement les scopes OAuth nécessaires au fonctionnement de l'intégration que vous activez :

- **Profil de base** — `userinfo.email` et `userinfo.profile`. Nous recevons l'adresse e-mail, le nom et la photo de profil de votre compte Google afin de pouvoir afficher le compte connecté et l'associer à votre espace de travail Polymux.
- **Gmail** (`https://www.googleapis.com/auth/gmail.modify`) — lorsque vous connectez Gmail, nous pouvons lire vos messages et métadonnées, envoyer des messages en votre nom, créer des brouillons et ajouter ou supprimer des étiquettes. Nous ne demandons **pas** `gmail.full` et nous n'accédons pas aux API d'administration de compte ou de paramètres.
- **Google Drive** (`https://www.googleapis.com/auth/drive.file`) — lorsque vous connectez Google Drive, nous pouvons uniquement accéder aux fichiers et dossiers que Polymux lui-même crée ou que vous ouvrez ou téléchargez explicitement via Polymux. Nous **ne pouvons pas** lire, lister ou modifier d'autres fichiers dans votre Drive.

Nous ne demandons pas, et Google n'accorde pas, l'accès à d'autres services Google (par exemple, Calendar, Contacts, Photos ou les API d'administration Workspace) à moins que nous ne les ajoutions et les divulguions dans une future mise à jour de cette politique.

### Comment nous utilisons les données utilisateur Google

Polymux utilise les données utilisateur Google **uniquement** pour fournir et améliorer les fonctionnalités destinées aux utilisateurs que vous avez explicitement demandées. Concrètement :

- Les **données Gmail** sont utilisées pour afficher vos messages dans Polymux, pour résumer, classer, rédiger, envoyer ou étiqueter des messages en votre nom lorsque vous déclenchez ces actions, et pour alimenter les flux de travail et agents que vous configurez.
- Les **données Google Drive** sont utilisées pour lister, ouvrir, créer, mettre à jour et organiser les fichiers que Polymux gère en votre nom, et pour les afficher dans le navigateur de fichiers, les flux de travail et les artefacts Polymux.
- Les **données de profil** sont utilisées pour identifier le compte connecté dans l'interface et dans les journaux d'audit.

Nous n'utilisons **pas** les données utilisateur Google pour diffuser de la publicité, créer des profils publicitaires, ou à toute fin non liée aux fonctionnalités destinées aux utilisateurs de Polymux.

### Utilisation de l'IA / LLM et révision humaine

Certaines fonctionnalités de Polymux traitent les données utilisateur Google à l'aide de grands modèles de langage (LLM) et d'autres systèmes automatisés pour générer des résumés, des brouillons, des réponses, des classifications et des sorties similaires à votre demande. Nous n'autorisons pas les fournisseurs tiers de LLM à utiliser vos données utilisateur Google pour entraîner ou améliorer leurs modèles généralisés. Le personnel de Polymux ne lit pas vos données utilisateur Google sauf (a) avec votre permission explicite, (b) à des fins de sécurité (par exemple, pour enquêter sur des abus), (c) pour se conformer à la loi applicable, ou (d) lorsque les données ont été agrégées et anonymisées de sorte qu'elles ne peuvent pas être associées à vous ou à votre compte Google.

### Partage des données

Nous ne vendons **pas**, ne louons pas et ne transférons pas les données utilisateur Google à des courtiers en données, des réseaux publicitaires ou toute partie à des fins publicitaires ou commerciales indépendantes. Nous partageons les données utilisateur Google uniquement dans les cas limités ci-dessous, et uniquement dans la mesure nécessaire :

- **Avec des sous-traitants d'infrastructure** qui hébergent ou exploitent les Services en notre nom (par exemple, nos fournisseurs d'hébergement cloud, de bases de données et de stockage d'objets), dans le cadre de contrats qui limitent leur utilisation des données à la fourniture de services à Polymux.
- **Avec des fournisseurs d'IA / LLM** que nous utilisons pour générer des résumés, des brouillons et d'autres sorties à votre demande, dans le cadre de conditions qui leur interdisent d'utiliser vos données pour entraîner leurs modèles généralisés. Nous minimisons ce qui est envoyé et ne transmettons que les données nécessaires pour produire le résultat demandé.
- **Avec d'autres services Google** lorsque vous nous le demandez (par exemple, envoyer un e-mail via Gmail ou enregistrer un fichier sur Drive).
- **Pour des raisons légales**, lorsque nous avons une conviction de bonne foi que la divulgation est requise par la loi applicable, la réglementation, une procédure judiciaire ou une demande gouvernementale exécutoire.
- **Dans le cadre d'une transaction commerciale**, telle qu'une fusion, acquisition ou vente d'actifs, où les informations peuvent être transférées sous réserve que la partie receveuse respecte cette politique.
- **Avec votre autorisation ou consentement**.

### Stockage et protection des données

Les données utilisateur Google sont stockées sur une infrastructure exploitée par nos fournisseurs d'hébergement et de bases de données aux États-Unis et/ou dans l'Union européenne. Nous protégeons ces données en utilisant :

- **Le chiffrement en transit** (TLS 1.2+) pour toutes les communications entre Polymux, Google et votre navigateur.
- **Le chiffrement au repos** pour nos bases de données et notre stockage d'objets.
- **Le chiffrement au niveau applicatif** des jetons d'accès et de rafraîchissement OAuth avant qu'ils soient écrits dans notre base de données, à l'aide de clés détenues dans notre gestionnaire de secrets et renouvelées périodiquement.
- **Des contrôles d'accès** qui limitent l'accès aux données de production à un petit nombre d'ingénieurs autorisés utilisant l'authentification unique, l'authentification multifacteur et la journalisation des accès.
- **L'isolation des locataires** afin qu'un espace de travail ne puisse pas accéder aux données utilisateur Google d'un autre espace de travail.
- **Des examens de sécurité et une surveillance**, comprenant l'analyse des dépendances, la gestion des vulnérabilités et la journalisation des accès aux systèmes sensibles.

### Conservation et suppression des données

Nous conservons les données utilisateur Google uniquement aussi longtemps que vous maintenez l'intégration Google correspondante connectée et votre compte Polymux actif, plus une courte période nécessaire à l'exploitation des Services (par exemple, les sauvegardes et les journaux d'audit).

Vous pouvez supprimer les données utilisateur Google de Polymux à tout moment :

- **Déconnecter l'intégration** depuis la page **Intégrations → Installées** de Polymux. Cela révoque nos jetons OAuth stockés et déclenche la suppression des messages Gmail mis en cache, des métadonnées de fichiers Drive et d'autres contenus récupérés via cette intégration, généralement dans un délai de 30 jours.
- **Révoquer l'accès depuis Google** sur [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Une fois révoqué, Polymux ne peut plus appeler Google en votre nom, et nous supprimerons les données mises en cache comme indiqué ci-dessus.
- **Supprimer votre compte Polymux** en nous contactant via la page Contact ou en suivant le flux de suppression de compte intégré au produit. Nous supprimerons toutes les données utilisateur Google associées, sauf lorsque nous sommes tenus de conserver des enregistrements spécifiques pour nous conformer à des obligations légales ou pour résoudre des litiges.
- **Demander la suppression de données spécifiques** en nous contactant via la page Contact. Nous répondrons dans un délai raisonnable et confirmerons une fois la suppression effectuée.

Les copies résiduelles dans les sauvegardes chiffrées sont purgées selon notre calendrier standard de rotation des sauvegardes (au plus tard sous 90 jours).

## Extension de navigateur

Cette section décrit les pratiques en matière de données de **l'extension de navigateur Polymux** — une extension Chrome optionnelle qui permet à Polymux d'exécuter des tâches de navigation dans votre propre navigateur plutôt que dans un navigateur hébergé sur un serveur. Elle s'applique uniquement si vous installez l'extension et l'associez à votre serveur Polymux.

### Ce à quoi l'extension accède

Lorsque vous démarrez une tâche de navigation avec l'extension activée, celle-ci ouvre un onglet dédié et, **uniquement sur cet onglet**, effectue les étapes requises par la tâche — navigation, lecture de la page, clics, saisie et capture d'écrans. Pour ce faire, elle traite :

- **Le contenu de la page de l'onglet qu'elle contrôle pour la tâche** — le texte de la page, la structure d'accessibilité, les captures d'écran, ainsi que l'URL et le titre de l'onglet.
- **Un jeton d'appairage**, stocké localement dans votre navigateur, utilisé pour reconnecter l'extension à votre serveur Polymux sans réappairage.

L'extension agit **uniquement sur les onglets qu'elle ouvre pour une tâche Polymux**. Elle ne lit pas votre historique de navigation, vos autres onglets, vos favoris, ni aucune page sur laquelle vous n'avez pas dirigé une tâche Polymux.

### Comment l'extension utilise et partage ces données

Le contenu des pages et les résultats des tâches sont transmis via une connexion chiffrée au **serveur Polymux avec lequel vous êtes appairé** — votre propre backend — afin que la tâche puisse s'exécuter et que sa progression soit affichée dans votre session Polymux. Ces données ne sont envoyées qu'à ce serveur appairé ; l'extension ne les envoie **pas** à des tiers et ne les **vend ni ne les transfère** à des fins publicitaires ou à toute fin non liée à l'exécution des tâches que vous demandez.

Le jeton d'appairage est stocké uniquement dans le stockage local de l'extension dans votre navigateur et sert uniquement à authentifier la connexion à votre serveur. Vous pouvez vous déconnecter à tout moment depuis la fenêtre contextuelle de l'extension — ce qui efface le jeton stocké — ou en supprimant l'extension.

## Comment nous utilisons les informations

Nous utilisons les informations que nous collectons pour :

- Fournir, exploiter et améliorer les Services
- Communiquer avec vous au sujet de votre compte, de vos demandes d'assistance et des mises à jour du produit
- Surveiller et analyser l'utilisation, les performances et la sécurité
- Respecter les obligations légales et faire respecter nos conditions
- Atteindre les objectifs décrits au moment de la collecte ou avec votre consentement

## Comment nous partageons les informations

Nous pouvons partager des informations :

- **Avec des prestataires de services** qui nous assistent (par exemple, hébergement, analyse, envoi d'e-mails), sous réserve de garanties appropriées
- **Pour des raisons légales** lorsque nous estimons que la divulgation est requise par la loi, la réglementation, une procédure judiciaire ou une demande gouvernementale
- **Dans le cadre d'une transaction commerciale** telle qu'une fusion, acquisition ou vente d'actifs, où les informations peuvent être transférées dans le cadre de cette transaction
- **Avec votre autorisation ou consentement**

Nous ne vendons pas vos informations personnelles au sens communément admis de ce terme.

## Conservation et suppression des données

Nous conservons les informations aussi longtemps que nécessaire pour fournir les Services, respecter les obligations légales, résoudre les litiges et faire respecter nos accords. Les durées de conservation peuvent varier selon la nature des données et leur utilisation.

Vous pouvez demander la suppression de vos informations personnelles à tout moment en déconnectant l'intégration concernée, en supprimant votre compte depuis les paramètres du produit, ou en nous contactant via la page Contact. Les informations supplémentaires spécifiques aux données utilisateur Google — notamment comment révoquer l'accès et déclencher la suppression — sont fournies dans la section **Données utilisateur Google** ci-dessus.

## Sécurité

Nous protégeons les informations personnelles à l'aide de mesures techniques et organisationnelles conformes aux standards du secteur, notamment le chiffrement en transit (TLS) et au repos, le chiffrement au niveau applicatif des identifiants sensibles tels que les jetons OAuth, des contrôles d'accès basés sur les rôles avec authentification multifacteur pour les systèmes de production, la journalisation des accès, l'isolation des locataires et la gestion routinière des vulnérabilités. Aucune méthode de transmission ou de stockage n'est totalement sécurisée ; nous ne pouvons pas garantir une sécurité absolue.

## Transferts internationaux

Si vous accédez aux Services depuis l'extérieur du pays où nous opérons, vos informations peuvent être traitées dans des pays qui peuvent avoir des lois de protection des données différentes de celles de votre juridiction.

## Vos droits et choix

Selon votre lieu de résidence, vous pouvez avoir le droit d'accéder, de corriger, de supprimer ou de limiter le traitement de vos informations personnelles, ou de vous opposer à certains traitements. Vous pouvez également avoir le droit à la portabilité des données ou de déposer une plainte auprès d'une autorité de contrôle. Pour exercer ces droits le cas échéant, contactez-nous en utilisant les coordonnées figurant sur notre page Contact.

Vous pouvez contrôler les cookies via les paramètres de votre navigateur comme décrit dans notre Politique de cookies.

## Confidentialité des enfants

Les Services ne sont pas destinés aux enfants de moins de 16 ans (ou l'âge minimum requis dans votre juridiction), et nous ne collectons pas sciemment d'informations personnelles auprès d'enfants.

## Modifications de cette politique

Nous pouvons mettre à jour cette Politique de confidentialité de temps à autre. Nous publierons la politique révisée sur cette page et mettrons à jour la date « Last updated ». La poursuite de l'utilisation des Services après l'entrée en vigueur des modifications constitue une acceptation de la politique révisée, dans la mesure permise par la loi.

## Nous contacter

Les questions relatives à cette Politique de confidentialité peuvent être envoyées via la page Contact de notre site web.
