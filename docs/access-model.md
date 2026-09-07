# Accès, rôles et délégation

La plateforme utilise une politique additive : **organisation → projet → ressource**. Un rôle associe des permissions à une personne ou une équipe, à une portée précise. Il n’existe pas de classement numérique arbitraire des rôles personnalisés : une personne est subordonnée si ses droits effectifs à la portée concernée forment un sous-ensemble strict de ceux de l’auteur de la modification.

## Inventaire

- [Tableau complet : permissions, portées, rôles, implications et références du code](permissions-matrix.md).
- [Version CSV](permissions-matrix.csv).
- [Tous les points d’entrée API et leurs adaptateurs de contrôle](permissions-api-inventory.md).
- Dans l’application : **Accès → Rôles → Avancé : tableau complet des permissions**. La matrice compare les rôles prédéfinis et personnalisés, les droits effectifs et le plafond délégable.

Les tables sont générées par `npm run permissions:generate` et vérifiées en CI par `npm run permissions:check`. Les références littérales et les contrôles délégués sont distingués explicitement ; une absence de permission nommée dans un fichier de route ne signifie pas que la route est publique.

## Parcours courant

1. Ouvrir **Accès**, choisir le projet puis **Ajouter une personne**.
2. Saisir un compte existant ou créer un compte standard avec la permission `members.create` dans cette organisation. Le rôle de plateforme reste `user`.
3. Choisir **Lecteur**, **Éditeur**, **Administrateur**, un rôle spécialisé ou un rôle personnalisé. Lecteur est proposé par défaut s’il est délégable. Le choix « Aucun accès au projet » ajoute uniquement l’appartenance à l’organisation.
4. Pour une personne déjà présente, choisir **Modifier le rôle**. Le choix remplace ses rôles directs de projet dans une transaction, après vérification des droits retirés et accordés. Les accès hérités de l’organisation et des équipes restent applicables. Les attributions aux équipes et à l’organisation restent disponibles dans les options avancées.
5. Dans **Rôles**, modifier un rôle ou en créer un. Le propriétaire peut personnaliser les rôles prédéfinis directement, sans réaffectation manuelle des membres. Choisir **Aucun / Consulter / Gérer** par catégorie, puis ouvrir les cases détaillées si nécessaire. Une suppression n’est proposée que pour un rôle créé sur mesure sans attribution visible ; le serveur vérifie toutes ses attributions, y compris celles aux ressources.

La création de compte n’accorde aucun rôle d’administrateur de plateforme dans ce formulaire. La création du compte et son ajout au projet sont deux opérations : si la deuxième échoue, le formulaire conserve le compte créé et permet de réessayer l’attribution sans recréer de compte. L’appartenance à l’organisation et le rôle initial du projet sont enregistrés dans une seule transaction. Un compte déjà géré dans une autre organisation ne reçoit pas automatiquement des droits supplémentaires dans le projet par défaut lors de sa connexion.

## Permissions d’administration

| Besoin                                                         | Permission                                       |
| -------------------------------------------------------------- | ------------------------------------------------ |
| Lire les membres, équipes, rôles et politiques                 | `roles.get`                                      |
| Créer / modifier / supprimer un rôle personnalisé              | `roles.create` / `roles.update` / `roles.delete` |
| Attribuer / révoquer un rôle                                   | `roles.assign` / `roles.revoke`                  |
| Ajouter / retirer une personne de l’organisation               | `members.create` / `members.delete`              |
| Créer une équipe / modifier ses membres / supprimer une équipe | `teams.create` / `teams.update` / `teams.delete` |
| Administrer les ressources communes d’un projet                | `workspaces.curate`                              |
| Renommer une organisation / supprimer une organisation         | `organization.update` / `organization.delete`    |
| Renommer un projet / supprimer un projet                       | `workspaces.update` / `workspaces.delete`        |
| Déplacer ou cloner une organisation / des ressources de projet | `organization.transfer` / `workspaces.transfer`  |

Les anciens droits `roles.manage`, `members.manage` et `teams.manage` restent des agrégats des actions cataloguées de leur domaine. Ils sont affichés avec leurs implications. Le moteur, l’éditeur et les plafonds des clés API utilisent la même fonction de correspondance. Une permission inconnue ou malformée est refusée, même face à un joker. Créer un rôle ne confère pas le droit de l’attribuer ; renommer une organisation ne confère pas le droit de la supprimer.

## Rôles prédéfinis

| Rôle                          | Usage                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Propriétaire d’organisation   | Administration complète ; suppression et migration de l’organisation                                                                        |
| Administrateur d’organisation | Administration des membres, équipes, projets et de leurs ressources ; ne peut pas attribuer les droits de propriétaire qu’il ne détient pas |
| Membre d’organisation         | Appartenance à l’organisation, sans accès automatique à ses projets                                                                         |
| Administrateur de projet      | Administration complète dans un projet                                                                                                      |
| Éditeur de projet             | Créer et utiliser les ressources sans administrer les accès du projet                                                                       |
| Lecteur de projet             | Consultation des ressources et de l’activité                                                                                                |
| Éditeur de connaissances      | Éditer une collection de connaissances partagée                                                                                             |
| Utilisateur d’assistant       | Utiliser un assistant explicitement partagé                                                                                                 |

Le propriétaire peut modifier les rôles prédéfinis de son organisation ou du projet actif. La première sauvegarde crée une définition locale réservée (`custom.standard.<nom>`) et déplace atomiquement les attributions concernées vers elle, y compris celles aux ressources du projet. L’interface présente un seul rôle. Les nouveaux ajouts et les partages utilisent cette personnalisation ; les autres organisations et projets conservent leur définition. Une sauvegarde provenant de l’ancien rôle reçoit un conflit 409. Le rôle Propriétaire conserve sa définition complète et ses attributions directes : il est le point de récupération de l’organisation. Le moteur utilise la définition canonique seulement lorsque `isSystem` est vrai ; un rôle personnalisé portant le même nom ne reçoit aucun privilège implicite. Les droits sont hérités dans le sens descendant, jamais vers un autre projet ou une autre organisation.

## Protections serveur

- L’auteur doit détenir la permission de mutation et l’ensemble des droits qu’il accorde, à la portée concernée.
- Un délégataire ne peut pas modifier ses propres accès, y compris par une équipe ou en éditant un rôle qui lui est attribué. Les pairs et supérieurs sont protégés. Le propriétaire actif, identifié par une attribution directe non expirée dans cette organisation, peut gérer ses équipes, ses rôles et les autres membres, même s’il en est lui-même bénéficiaire. Les actions de création d’un nouveau projet ou de migration de structures complètes ont leur propre contrat administratif ; ce ne sont pas des modifications individuelles de rôle.
- L’édition vérifie l’ancien rôle, le nouveau rôle et tous les bénéficiaires. La révocation vérifie le rôle retiré et la hiérarchie du bénéficiaire. Supprimer un rôle encore utilisé est refusé.
- Ajouter ou retirer un membre d’une équipe vérifie toutes les attributions de cette équipe. Le retrait d’une personne vérifie aussi ses accès dans tous les projets et ressources de l’organisation. Les groupes implicites d’organisation et de projet suivent les mêmes contrôles. Les transferts de membres vérifient le rôle de destination et les bénéficiaires, et appliquent la même règle de propriété/délégation.
- Les migrations de structures exigent le plafond administratif complet aux portées source et destination, car elles transportent ressources et politiques.
- Les écritures IAM sont sérialisées dans PostgreSQL ; les droits sont relus sans cache après acquisition du verrou. Les modifications concurrentes d’un rôle depuis l’interface utilisent aussi sa date de version : un formulaire périmé reçoit un conflit 409.
- Le dernier propriétaire actif ne peut pas être supprimé ; un compte banni, une appartenance inactive ou une attribution expirée ne compte pas comme propriétaire de secours. Les rôles de propriétaire ne sont pas attribuables à une équipe.
- La publication d’une ressource auprès d’un projet, d’une organisation ou d’une équipe vérifie aussi que son auteur possède les droits d’utilisation qu’elle confère. Les partages directs valident les bénéficiaires, les permissions réellement applicables aux ressources et les dépendances avant une transaction unique. Leur révocation invalide l’accès du principal, y compris aux ressources descendantes.
- Les attributions expirées ne sont pas utilisables ; le cache ne dépasse pas la prochaine expiration.
- Réactiver une appartenance supprimée ou suspendue ne restaure pas silencieusement les anciennes attributions et équipes.

## Autres frontières d’accès de la plateforme

| Surface                                                              | Contrôle supplémentaire                                                                                                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration globale, promotion des comptes et bootstrap            | Session administrateur de plateforme ; cette autorité globale n’est pas délégable par un rôle de projet                                                                                |
| Authentification, inscription, récupération de compte                | Better Auth, session, politiques de connexion et limites de requêtes                                                                                                                   |
| Conversations, fichiers, historiques et automatisations personnelles | Propriété, appartenance et visibilité, en complément des permissions de ressource                                                                                                      |
| Ressources privées et partages                                       | Visibilité, propriétaire, sélection d’équipe ou attribution directe ; un droit d’administration ne transforme pas automatiquement toutes les ressources privées en ressources visibles |
| API compatible OpenAI / Anthropic et autres clés API                 | Intersection entre droits actuels du titulaire, projet de la clé et scopes autorisés ; les endpoints IAM refusent les clés API                                                         |
| Outils et exécutions                                                 | Permissions, politiques d’outils, confirmations requises, quotas et limites d’exécution                                                                                                |
| Partages publics, callbacks et webhooks                              | Jeton de partage / signature / secret / contrat public propre à la route, recensé dans l’inventaire API                                                                                |

## Ergonomie et vérification

- **Personnes** : tableau sur ordinateur et fiches quand la largeur disponible diminue ; noms, e-mails et badges peuvent revenir à la ligne.
- **Créer un compte** : nom, e-mail, mot de passe visible à la demande et rôle expliqué ; Lecteur par défaut. Une création réussie suivie d’un échec d’affectation reste récupérable dans le formulaire.
- **Équipes** : modification du nom et de la description avec contrôle de version, sans perdre les membres ni les attributions.
- **Rôles** : catégories à trois niveaux, détails recherchables, explication de l’impact de la sauvegarde et de la protection du propriétaire.
- Les réglages et la création de projets/organisations sont repliés pour laisser la place aux personnes.
- Tests navigateur aux largeurs 320, 390, 768 et 1440 pixels : absence de débordement et de badges coupés, formulaire mobile, création/affectation et édition d’équipe. Tests PostgreSQL : propriétaire inclus dans ses équipes, personnalisation isolée par projet, affectations existantes/futures, création sans administrateur de plateforme, conflits et dernier propriétaire actif.

## Migration et exploitation

`0058_permission_delegation.sql` aligne les rôles prédéfinis et matérialise les permissions connues des agrégats historiques dans les rôles personnalisés, sans changer les identifiants ni les attributions. Les nouveaux droits de suppression et de transfert sont distincts des anciens droits de renommage. La gestion des catalogues communs utilise désormais `workspaces.curate`, et la suppression administrative de ressources depuis la console exige `workspaces.delete`. Revoir les rôles personnalisés qui utilisaient `organization.update`, `workspaces.update` ou `roles.manage` pour ces opérations et attribuer explicitement les nouvelles permissions après revue. Les anciens identifiants inconnus n’autorisent aucune opération.

Les caches de lecture ordinaires gardent une durée maximale de 60 secondes et les invalidations restent celles de l’infrastructure de cache ; les mutations IAM n’utilisent jamais ces résultats pour autoriser une délégation. Le verrou global privilégie la cohérence de ces opérations administratives peu fréquentes. Les écritures SQL manuelles doivent respecter les mêmes invariants et invalider les caches ; elles ne passent pas par le verrou applicatif.

## Références de parcours

Le parcours personne → portée → rôle reprend les conventions de [Google Cloud IAM](https://cloud.google.com/iam/docs/granting-changing-revoking-access) et de la [gestion des membres GitHub](https://docs.github.com/en/organizations/managing-membership-in-your-organization/inviting-users-to-join-your-organization). Les rôles standards sont proposés avant la personnalisation, comme dans la [création de rôles Google Cloud](https://docs.cloud.google.com/iam/docs/creating-custom-roles). Le modèle applique ici une restriction supplémentaire de délégation aux personnes moins privilégiées.

La présentation privilégie également les parcours de [gestion des membres et groupes Notion](https://www.notion.com/help/add-members-admins-guests-and-groups) : personne, rôle expliqué et équipe, avant les détails de permissions.
