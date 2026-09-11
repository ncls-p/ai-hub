# Affectations aux équipes et aux projets

La console Accès expose les appartenances depuis les personnes et les équipes. Un utilisateur peut appartenir à plusieurs équipes et recevoir des rôles dans plusieurs projets. Une équipe peut recevoir des rôles dans plusieurs projets ; ses membres héritent de ces accès.

## Parcours

- Depuis une personne active, « Équipes et projets » affiche les équipes de l’organisation et permet les ajouts ou retraits individuels.
- Depuis une personne ou une équipe, le sélecteur « Projet à gérer » charge les rôles et droits du projet choisi sans changer le projet actif de la console.
- Ajouter un rôle conserve les autres rôles et appartenances. Retirer un rôle concerne uniquement cette attribution ; les accès hérités restent applicables.
- Les paramètres de projet et d’organisation sont visibles au-dessus des onglets. Le sélecteur principal conserve tous les projets accessibles, y compris ceux d’autres organisations. Les commandes existantes permettent de créer, renommer et supprimer le projet actif.

## Autorisation et persistance

Les écritures réutilisent les cas d’usage IAM existants : `addTeamMember`, `removeTeamMember`, `assignRole`, `removeAssignment` et les opérations de cycle de vie des projets. Elles conservent leurs contrôles de délégation, protections contre l’auto-attribution, invalidations du cache et événements d’audit. Aucun nouveau droit ni schéma de base n’est ajouté.

La fenêtre charge un instantané autorisé pour chaque projet. Les choix de rôle proviennent de ses rôles attribuables. Les actions sont masquées sans les droits nécessaires. Le serveur reste l’autorité pour la validation des équipes et des droits hérités sur leurs autres ressources.

## États vérifiés

| État                              | Comportement                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Plusieurs appartenances           | Chaque ajout conserve les équipes et projets précédents.                                  |
| Chargement / changement de projet | Les écritures sont désactivées ; une réponse obsolète ne remplace pas le projet choisi.   |
| Échec de lecture                  | Erreur persistante, bouton de nouvelle tentative, écritures désactivées.                  |
| Échec d’écriture                  | Le choix est conservé et l’erreur affichée dans la fenêtre.                               |
| Double soumission                 | Verrou synchrone et contrôles désactivés pendant la mutation.                             |
| Retrait d’accès                   | Confirmation nominative avant suppression d’une attribution.                              |
| Suppression de projet             | Saisie obligatoire du nom exact et description des conséquences.                          |
| Lecture seule                     | Aucun bouton d’attribution ou de retrait ; les API refusent les écritures non autorisées. |
| Mobile / clavier                  | Fenêtre défilante sans débordement horizontal ; contrôles nommés, fermeture avec Échap.   |

Les scénarios navigateur sont dans `test/e2e/access-memberships.spec.ts`. Les cas d’usage et invariants de délégation restent couverts par les suites d’intégration IAM existantes.
