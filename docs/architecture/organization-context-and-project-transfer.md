# Organisation active, personnalisation et transfert de projet

## Parcours utilisateur

Le pied de la barre latérale des conversations propose un sélecteur de projets,
regroupés par organisation et filtrables par nom. Il fonctionne au clavier et dans
le tiroir mobile. Le changement est enregistré côté serveur avant son affichage ;
un échec conserve le contexte courant et permet de réessayer. Les conversations
restent attachées à leur utilisateur lors d'un changement de contexte.

Dans les réglages, une organisation peut être sélectionnée indépendamment du
projet actif, y compris si elle ne contient aucun projet. Son logo, ses couleurs
et ses textes d'accueil restent stockés sur `organizations`. Les réglages de
génération des titres et suggestions et ceux de la navigation utilisent maintenant
les clés `chatAutomation:organization:<id>` et `sidebarNavigation:organization:<id>`.
Les écritures nécessitent `organization.update` sur l'organisation sélectionnée.
La navigation utilisée par les membres se lit via `/api/workspace/navigation`.

La migration 0062 reprend la navigation existante dans chaque organisation. Elle
ne reprend une automatisation activée que dans l'organisation propriétaire du
fournisseur afin de ne pas créer un partage implicite de modèle. Le catalogue et
l'exécution autorisent les modèles de l'organisation et les modèles explicitement
partagés avec elle. La disponibilité est vérifiée à nouveau avant de déchiffrer les
secrets, notamment après révocation d'un partage. Le partage d'un seul modèle ne
donne pas accès aux autres modèles du même fournisseur.

## Transfert complet

L'action « Changer d'organisation » se trouve dans les réglages du projet de la
page Accès. Elle utilise `/api/workspace/iam/projects/transfer` et se distingue du
transfert historique de contenu vers un autre projet, qui reste disponible.
L'organisation cible n'a pas besoin de contenir un projet.

Le serveur exige l'administration complète du projet et des deux organisations.
L'aperçu calcule les ressources, membres actifs, équipes liées, rôles locaux à
copier et conflits de noms. Son empreinte inclut le projet, les attributions,
les membres et les résolutions de conflits. Une modification exige un nouvel
aperçu. L'exécution est sérialisée avec les mutations IAM, recontrôle les droits
et applique les changements dans une transaction PostgreSQL.

Le projet conserve son identifiant et toutes ses références : assistants,
fournisseurs et secrets, connaissances et documents, conversations, fichiers,
préférences, tâches et historique d'exécution restent rattachés au même projet.
Les équipes liées sont copiées dans la destination avec leurs membres actifs et
les attributions du projet sont redirigées vers ces copies. Les équipes sources
et leurs autres projets restent intacts. Les rôles personnalisés de l'organisation
source utilisés directement dans le projet sont copiés comme rôles du projet.
Les membres suspendus ou retirés dans la destination bloquent le transfert ;
leur situation doit être examinée avant de relancer l'opération.

Les droits hérités, les personnalisations et les limites de l'organisation cible
s'appliquent après le transfert. Les ressources appartenant à d'autres projets
restent à leur emplacement : elles nécessitent un partage explicite vers la
nouvelle organisation. Les partages existants restent en place. Tous les caches
de permissions sont invalidés après la mutation et un événement
`workspace.organization.transferred` est enregistré.

## Impersonation

Les administrateurs de plateforme disposent d'une action sur les utilisateurs
non administrateurs. Le plugin admin de Better Auth crée une session temporaire
avec `impersonatedBy` et conserve la session administrateur de retour. Le bandeau
persistant indique l'utilisateur actif et permet d'arrêter l'impersonation.
L'échec du retour conserve le bandeau et propose de réessayer. Les autres onglets
sont rechargés au changement de session. Les droits sont ceux de l'utilisateur
cible ; le rendu ne conserve pas les données du compte administrateur.

Les événements de début et de fin sont audités. Les événements émis dans le
contexte d'une requête impersonnée conservent l'utilisateur agissant et ajoutent
`impersonatedBy` aux métadonnées. Les sessions indépendantes de l'utilisateur
cible restent valides.

## Vérification

Les tests navigateur couvrent le transfert vers une organisation vide, le rejet
d'un aperçu périmé et d'un utilisateur non autorisé, la conservation des secrets
et conversations, les accès des équipes, les personnalisations indépendantes,
le sélecteur mobile et sa persistance, ainsi que l'impersonation et le retour
à la session administrateur. Les tests PostgreSQL vérifient le catalogue de
modèles partagé et la révocation ; les tests unitaires vérifient aussi l'audit.

## Access navigation and transfer entry point

Access uses compact section tabs to keep room for member lists. Project and
organization lifecycle actions are grouped under the collapsed “Project and
organization settings” button. This disclosure supports Enter/Space and leaves
people filters and membership actions immediately available. “Transfer project”
is distinct from switching the active context; its dialog names the source
organization and project before choosing the destination.

| Journey | Verification |
| --- | --- |
| Open settings, cancel transfer, return to the list | Keyboard disclosure and dialog browser regression |
| Transfer an existing project to an empty organization | Existing database and browser preservation tests |
| Create, rename and delete a project | Lifecycle browser regression through the disclosure |
| Switch sections and use back/reload | Preserved drafts and URL browser regression |
| Mobile and read-only access | Overflow, visible controls and permission browser regressions |
