# Plan de refonte UI/UX

## Objectif

Refaire l’UI/UX pour rendre les workflows utilisateurs plus simples, plus logiques et plus élégants, sans modifier :

- la palette principale blanche / bleue ;
- la police actuelle ;
- l’identité visuelle existante.

La refonte doit surtout améliorer :

- la structure de navigation ;
- la hiérarchie visuelle ;
- les parcours utilisateurs ;
- les états vides ;
- les pages de configuration ;
- la lisibilité globale de l’application.

---

## 1. Audit UX rapide de l’existant

### Problèmes identifiés

- Trop d’entrées de navigation au même niveau : Chat, Assistants, Knowledge, Catalog, Providers, MCP, API keys, Usage, Audit, Team, Settings, etc.
- L’application donne une impression très orientée configuration/admin.
- L’utilisateur doit comprendre trop tôt des concepts techniques : provider, model, MCP, API key, approvals.
- Le setup actuel est fonctionnel mais encore trop technique.
- Les pages sont très centrées sur des listes, formulaires et tableaux.
- Les états vides ne guident pas assez vers la prochaine action.
- La configuration assistant semble dense et intimidante.

### Problème principal

Le produit semble fonctionner selon cette logique :

> Configure tout, puis utilise.

La nouvelle UX devrait plutôt suivre cette logique :

> Commence à utiliser, configure seulement ce qui est nécessaire.

---

## 2. Nouvelle logique produit

L’application doit être organisée autour de trois intentions simples.

### 1. Discuter

Objectif utilisateur : lancer ou continuer une conversation.

Pages concernées :

- Chat ;
- sélection d’assistant ;
- historique de conversations ;
- nouveau chat.

### 2. Créer ou améliorer un assistant

Objectif utilisateur : configurer un assistant utile.

Pages concernées :

- Assistants ;
- modèle ;
- instructions ;
- connaissances ;
- outils ;
- MCP.

### 3. Administrer l’espace

Objectif utilisateur : gérer les connexions, l’équipe, la sécurité et l’usage.

Pages concernées :

- AI Connections ;
- API Keys ;
- Team ;
- Usage ;
- Activity log ;
- Settings.

---

## 3. Nouvelle architecture de navigation

### Sidebar proposée

#### Principal

- Chat
- Assistants

#### Capacités

- Knowledge
- Tools & MCP
- Marketplace

#### Configuration

- AI Connections
- API Keys

#### Administration

- Team
- Usage
- Activity log
- Settings

### Cas spécial : Approvals

La page Approvals ne devrait pas être une entrée de navigation permanente.

Proposition :

- afficher Approvals uniquement lorsqu’il y a des validations en attente ;
- afficher un badge dans la sidebar ;
- ajouter un bloc “Action required” dans les zones importantes ;
- rendre la validation accessible depuis le chat ou le dashboard.

---

## 4. Créer une vraie page d’accueil workspace

Actuellement, la racine redirige directement vers le chat.

Proposition : ajouter une page d’accueil légère ou un état d’accueil enrichi dans le chat.

### Contenu recommandé

- Continue chatting
- Create an assistant
- Connect a provider
- Add knowledge
- Pending approvals, uniquement si nécessaire
- statut rapide du workspace :
  - provider connecté ;
  - assistant actif ;
  - modèle configuré ;
  - connaissances attachées.

### Objectif

Éviter que l’utilisateur arrive dans une interface vide ou trop technique.

---

## 5. Repenser le setup onboarding

### Workflow actuel

Le wizard actuel suit une logique technique :

1. Provider
2. Model
3. Assistant

### Workflow cible

#### Étape 1 — Connect AI

- choix du provider avec des cartes simples ;
- champs avancés repliés ;
- wording moins technique ;
- aide contextuelle courte ;
- CTA principal clair.

#### Étape 2 — Pick a recommended model

- découverte automatique mise en avant ;
- modèle recommandé affiché en premier ;
- ajout manuel disponible mais secondaire ;
- explication simple du choix du modèle.

#### Étape 3 — Start chatting

- assistant créé automatiquement avec un nom par défaut ;
- possibilité de personnaliser après ;
- redirection immédiate vers le chat.

### Résultat attendu

L’utilisateur ne doit pas penser :

> Je dois configurer un système IA.

Il doit plutôt penser :

> Je connecte mon IA et je peux discuter.

---

## 6. Repenser les pages principales

## Chat

### Objectif

Faire du chat l’expérience centrale de l’application.

### Améliorations proposées

- Rendre le sélecteur d’assistant plus visible.
- Ajouter un état vide utile avec :
  - exemples de prompts ;
  - assistant recommandé ;
  - alerte si aucun provider/model n’est configuré.
- Ajouter un panneau de contexte discret indiquant :
  - assistant actif ;
  - modèle utilisé ;
  - knowledge active ;
  - tools enabled.

---

## Assistants

### Objectif

Transformer la page en galerie claire et actionnable.

### Améliorations proposées

- Afficher les assistants sous forme de cartes.
- Montrer le statut de chaque assistant :
  - ready ;
  - missing model ;
  - no tools ;
  - knowledge attached.
- Ajouter des actions rapides :
  - Chat ;
  - Configure ;
  - Duplicate.
- Simplifier la création d’assistant :
  - nom ;
  - modèle ;
  - option “advanced setup” secondaire.

---

## Configuration assistant

### Objectif

Réduire la densité et guider la configuration progressivement.

### Structure proposée

1. Overview
2. Model
3. Instructions
4. Knowledge
5. Tools
6. MCP
7. Advanced

### Résumé en haut de page

- statut de l’assistant ;
- modèle actuel ;
- nombre de knowledge bases ;
- nombre d’outils actifs ;
- CTA principal : Test in chat.

---

## Providers / AI Connections

### Objectif

Rendre les connexions IA plus compréhensibles.

### Améliorations proposées

- Remplacer les formulaires visibles par défaut par des cartes de connexion.
- Chaque carte affiche :
  - status ;
  - nombre de modèles ;
  - dernier test ;
  - actions : Test, Manage models, Edit.
- Mettre les champs avancés dans un drawer ou dialog.

---

## Knowledge

### Objectif

Clarifier à quoi servent les connaissances et comment les utiliser.

### Améliorations proposées

- État vide plus guidé :
  - Add your first knowledge base ;
  - Upload documents ;
  - Attach to assistant.
- Afficher quelles connaissances sont utilisées par quels assistants.
- Ajouter des badges de statut : indexed, processing, failed.

---

## Tools & MCP

### Objectif

Réduire la confusion entre tools, MCP et approvals.

### Améliorations proposées

- Fusionner visuellement la logique Tools / MCP / Approvals.
- Expliquer simplement :
  - Tools = capacités internes ;
  - MCP = connexions externes ;
  - Approvals = validations de sécurité.
- Ajouter des statuts :
  - enabled ;
  - needs approval ;
  - failed ;
  - unavailable.

---

## 7. Amélioration visuelle sans changer couleurs ni police

La refonte garde la base actuelle : blanc, bleu, police existante.

Les améliorations visuelles doivent venir de :

- meilleure hiérarchie typographique ;
- espacements plus généreux ;
- cartes plus lisibles ;
- surfaces avec bordures légères ;
- états hover plus soignés ;
- badges de statut cohérents ;
- stepper plus élégant ;
- empty states plus explicatifs ;
- CTA principal plus évident sur chaque page ;
- réduction du bruit visuel.

---

## 8. Design system à consolider

Créer ou renforcer des composants réutilisables.

### Composants proposés

- `WorkspacePage`
- `PageHero`
- `StatusCard`
- `SetupChecklist`
- `ActionInbox`
- `EmptyState`
- `ResourceCard`
- `ConfigurationSection`
- `AssistantCard`
- `ProviderCard`

### Objectif

Éviter que chaque page invente son propre layout et assurer une expérience cohérente.

---

## 9. Ordre d’implémentation recommandé

## Phase 1 — Structure globale

Fichiers prioritaires :

- `src/lib/workspace-nav.ts`
- `src/components/workspace-sidebar.tsx`
- `src/components/workspace-page.tsx`
- `src/components/app-shell.tsx`

Travail prévu :

- simplifier la navigation ;
- améliorer le shell global ;
- clarifier les groupes de menu ;
- améliorer le header ;
- mieux faire ressortir les actions importantes.

---

## Phase 2 — Onboarding

Fichiers prioritaires :

- `src/components/setup/setup-wizard.tsx`
- `src/app/(workspace)/setup/page.tsx`

Travail prévu :

- refaire le parcours setup ;
- masquer les options avancées ;
- rendre le choix de modèle plus simple ;
- accélérer l’accès au chat.

---

## Phase 3 — Pages cœur

Pages prioritaires :

- Chat ;
- Assistants ;
- Configuration assistant.

Travail prévu :

- améliorer les états vides ;
- ajouter des cartes plus lisibles ;
- simplifier la création d’assistant ;
- clarifier les sections de configuration.

---

## Phase 4 — Pages configuration

Pages concernées :

- Providers ;
- Knowledge ;
- MCP ;
- Tools ;
- API keys.

Travail prévu :

- rendre les pages moins techniques ;
- mieux expliquer les concepts ;
- transformer les listes/formulaires en parcours guidés.

---

## Phase 5 — Polish final

Travail prévu :

- harmoniser les espacements ;
- améliorer les badges/status ;
- vérifier le responsive mobile ;
- vérifier l’accessibilité clavier ;
- vérifier les labels et descriptions ;
- nettoyer les incohérences visuelles.

---

## 10. Première étape concrète

Commencer par la Phase 1, car elle a le plus gros impact immédiat sur la perception globale de l’application.

### Fichiers à modifier en premier

1. `src/lib/workspace-nav.ts`
2. `src/components/workspace-sidebar.tsx`
3. `src/components/workspace-page.tsx`
4. `src/components/app-shell.tsx`

### Résultat attendu de la Phase 1

- navigation plus logique ;
- sidebar moins intimidante ;
- header plus clair ;
- pages mieux structurées ;
- première impression plus professionnelle ;
- workflow utilisateur plus naturel.
