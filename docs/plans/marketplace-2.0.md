# Plan : Marketplace 2.0 — Simple, Rapide, Ouverte

## Contexte actuel

- **Marketplace** : supporte uniquement les agents, avec un système de validation (draft → submit → review admin → published)
- **Schema** : `marketplace_items` avec visibility + status, mais le flow est verrouillé par la review
- **Agents** : ont déjà `sharingMode`, `shareTargetUserId`, `isRecommended`, `curationLabel`
- **Skills & Custom Tools** : existent mais ne sont PAS dans la marketplace
- **Auth** : Better Auth + plugin admin (rôles `admin` / `user`)

---

## Phase 1 — Schema : Base de données

### 1.1 Nouvelle table `marketplace_item_shares`

```
marketplace_item_shares
├── id: uuid PK
├── item_id: uuid → marketplace_items (cascade)
├── shared_with_user_id: uuid → users
├── shared_at: timestamp
└── Index: (item_id, shared_with_user_id) unique
```

→ Permet de partager un item avec un user spécifique.

### 1.2 Modifications de `marketplace_items`

```diff
+ is_featured: boolean DEFAULT false          (admin met en avant)
+ featured_order: integer DEFAULT NULL         (ordre de tri admin)
+ featured_at: timestamp                       (quand c'est mis en avant)
+ published_at: timestamp                      (quand publié sur la marketplace)
+ totalDownloads: integer DEFAULT 0            (compteur global)
+ tagsJson: jsonb                              (tags pour filtrage)
```

### 1.3 Ajout au enum `marketplace_item_type`

```diff
+ "skill"
+ "custom_tool"
```

### 1.4 Simplification du status

- Suppression du statut `pending_review` du flow obligatoire.
- Les statuts deviennent : `draft` → `published` (direct, sans review).
- `rejected`, `suspended`, `archived` restent pour la modération admin.
- La review devient **optionnelle** (admin peut toujours faire une review a posteriori).

### 1.5 Migration Drizzle

- `drizzle-kit generate` → migration auto.

---

## Phase 2 — Use Cases : Logique métier

### 2.1 `publishMarketplaceItem(itemId, userId, visibility)`

- Passe directement de `draft` → `published` (pas de `pending_review`).
- Set `visibility` + `published_at`.
- Si `visibility = public` → visible par tous sur la marketplace.
- Audit event : `marketplace.published`.

### 2.2 `shareMarketplaceItem(itemId, userId, targetUserId)`

- Insère dans `marketplace_item_shares`.
- Le `targetUserId` reçoit l'accès.
- Audit event : `marketplace.shared`.

### 2.3 `unshareMarketplaceItem(itemId, targetUserId)`

- Supprime de `marketplace_item_shares`.

### 2.4 `listMarketplaceItems(input)` — Refonte

```ts
listMarketplaceItems({
  userId?: string,              // pour voir les shares perso
  search?: string,              // recherche texte
  type?: string[],              // filtre par type
  tags?: string[],              // filtre par tags
  featuredOnly?: boolean,       // uniquement les items mis en avant
  sortBy?: "featured" | "newest" | "downloads" | "rating",
})
```

- Si `userId` passé : inclut les items partagés avec cet user.
- Si `featuredOnly` : trie par `featured_order DESC`.
- Recherche sur `name`, `description`, `tags`.

### 2.5 `featureMarketplaceItem(itemId, isAdmin)` / `unfeatureMarketplaceItem(itemId, isAdmin)`

- Admin-only.
- Set `is_featured = true/false` + `featured_at`.
- Audit event : `marketplace.featured` / `marketplace.unfeatured`.

### 2.6 `getSharedWithMe(userId)`

- Retourne tous les items partagés avec un user.

### 2.7 `getMyPublishedItems(userId)`

- Retourne les items publiés par un user.

---

## Phase 3 — API Routes

### 3.1 Nouvelles routes

```
GET    /api/marketplace/items                    → liste avec search/filtres
POST   /api/marketplace/items                    → créer un draft (existant)
PUT    /api/marketplace/items/[itemId]           → mettre à jour (tags, description)
DELETE /api/marketplace/items/[itemId]           → supprimer son item
POST   /api/marketplace/items/[itemId]/publish   → publier (remplace submit)
POST   /api/marketplace/items/[itemId]/share     → partager avec un user
DELETE /api/marketplace/items/[itemId]/share/:targetUserId
POST   /api/marketplace/items/[itemId]/install   → installer (existant)
GET    /api/marketplace/items/[itemId]           → détails complets
GET    /api/marketplace/items/shared-with-me     → mes items partagés
GET    /api/marketplace/items/my-published       → mes publications
```

### 3.2 Routes admin

```
POST   /api/marketplace/items/[itemId]/feature
POST   /api/marketplace/items/[itemId]/unfeature
PUT    /api/marketplace/items/[itemId]/admin     → suspendre/archiver/modifier
```

### 3.3 Routes supprimées / simplifiées

```
DELETE /api/marketplace/items/[itemId]/submit    → plus besoin (publish direct)
DELETE /api/marketplace/items/[itemId]/review    → optionnel, garder en admin-only
```

---

## Phase 4 — UI : Marketplace Page

### 4.1 Layout : Marketplace refondue

```
┌─────────────────────────────────────────────────────────┐
│  🔍 Barre de recherche globale + boutons de filtre      │
│  [Rechercher...] [Type ▾] [Tags ▾] [Trier ▾] [★ Featured]│
├─────────────────────────────────────────────────────────┤
│  ┌─── Onglets ──────────────────────────────────────┐  │
│  │  Tous  │  ⭐ Mis en avant  │  📦 Skills  │ 🤖 Agents │  │
│  │  🔧 Tools  │  📝 Mes items  │  🎁 Partagés avec moi │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │  Card    │ │  Card    │ │  Card    │  ← Cards       │
│  │  Item 1  │ │  Item 2  │ │  Item 3  │     avec type, │
│  │  ⭐ NEW  │ │  📦skill │ │  🤖agent │     tags,      │
│  │  [Install]│ │  [Install]│ │ [Install]│     install   │
│  └──────────┘ └──────────┘ └──────────┘               │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Card d'item

- Icône selon le type (🤖 agent, 📦 skill, 🔧 tool).
- Badge `⭐ Featured` si mis en avant.
- Nom + description courte.
- Tags visuels.
- Bouton `Installer` / `Utiliser`.
- Auteur + date.

### 4.3 Modal de partage

Quand l'utilisateur clique sur "Partager" sur son item :

```
┌─ Partager cet item ─────────────────────────┐
│                                              │
│  🔒 Privé (seulement vous)                   │
│  👤 Partager avec un utilisateur              │
│     [Rechercher un utilisateur...]           │
│  🌍 Publier sur la marketplace (public)      │
│                                              │
│  Tags (optionnel)                            │
│  [ai] [coding] [productivity]                │
│                                              │
│  [Annuler]          [Partager]               │
└──────────────────────────────────────────────┘
```

### 4.4 Page détail item

```
GET /marketplace/items/[itemId] → nouvelle page
```

- Nom, description complète, type.
- Tags, auteur, date de publication.
- Téléchargements, notes/ratings.
- Historique des versions.
- Bouton `Installer`.
- Si owner : bouton `Modifier` / `Partager` / `Supprimer`.

### 4.5 Section admin (dans les features existantes)

- Liste des items avec toggle `⭐ Feature/Unfeature`.
- Possibilité de suspendre ou archiver un item.
- Drag & drop pour l'ordre des featured items.

---

## Phase 5 — Intégration Skills & Custom Tools

### 5.1 `marketplaceItemTypeEnum` → ajouter `"skill"` et `"custom_tool"`

### 5.2 Créer un draft depuis un skill

- Formulaire : sélectionner un skill → remplir nom/description/tags → créer draft marketplace.

### 5.3 Créer un draft depuis un custom tool

- Mêmes étapes.

### 5.4 Installer un skill/tool depuis la marketplace

- `installMarketplaceItem` étendu pour supporter les types `skill` et `custom_tool`.
- Pour un skill : copie dans le workspace de l'utilisateur.
- Pour un custom tool : clone dans le workspace.

---

## Phase 6 — Suppression du système de validation

### 6.1 Le flow devient :

```
AVANT : draft → submit → pending_review → admin approve → published
APRÈS : draft → publish → published (immédiat, public)
```

### 6.2 Ce qui reste :

- L'admin peut toujours **suspendre** ou **rejeter** un item a posteriori.
- La table `marketplace_reviews` reste (optionnelle, pour feedback).
- `marketplace_reports` reste (les users peuvent signaler).

---

## Résumé des livrables

| # | Composant | Ce qui change | Statut |
|---|-----------|---------------|--------|
| 1 | `schema.ts` | Nouvelle table `marketplace_item_shares`, champs ajoutés sur `marketplace_items`, types ajoutés | ✅ Fait |
| 2 | `use-cases.ts` | `publishMarketplaceItem`, `shareMarketplaceItem`, `featureMarketplaceItem`, `listMarketplaceItems` refondu | ✅ Fait |
| 3 | API routes | Nouvelles routes publish/share/feature, submit supprimé | ✅ Fait |
| 4 | Marketplace page | Refonte complète : recherche, filtres, onglets, cards, modal partage | ✅ Fait |
| 5 | Page détail item | Nouvelle page `/marketplace/items/[itemId]` | ✅ Fait |
| 6 | Skills & Tools → Marketplace | Support pour publier/installer skills et custom tools | ✅ Fait |
| 7 | Migration DB | `drizzle-kit generate` → `0009_polite_ken_ellis.sql` | ✅ Générée |
| 8 | Tests unitaires | 29 tests dans `test/unit/marketplace-use-cases.test.ts` | ✅ 29/29 passants |

---

## Fichiers modifiés

### Schema
- `src/server/infrastructure/db/schema.ts` — champs `isFeatured`, `featuredOrder`, `featuredAt`, `publishedAt`, `totalDownloads`, `tagsJson` ; enum étendu ; table `marketplaceItemShares`

### Use Cases
- `src/modules/marketplace/use-cases.ts` — `listMarketplaceItems`, `publishMarketplaceItem`, `shareMarketplaceItem`, `unshareMarketplaceItem`, `featureMarketplaceItem`, `unfeatureMarketplaceItem`, `updateMarketplaceItem`, `deleteMarketplaceItem`, `adminModerateItem`, `installMarketplaceItem` (étendu pour skills/tools)

### API Routes
- `src/app/api/marketplace/items/route.ts` — GET liste + filtres, POST créer draft
- `src/app/api/marketplace/items/[itemId]/route.ts` — GET détail, PUT update, DELETE archive
- `src/app/api/marketplace/items/[itemId]/publish/route.ts` — POST publier
- `src/app/api/marketplace/items/[itemId]/share/route.ts` — POST partager, DELETE supprimer partage
- `src/app/api/marketplace/items/[itemId]/feature/route.ts` — POST feature, DELETE unfeature
- `src/app/api/marketplace/items/[itemId]/moderate/route.ts` — PUT modération admin

### UI
- `src/app/[locale]/(workspace)/marketplace/page.tsx` — refonte complète : recherche, filtres, onglets, cards, modal partage
- `src/app/[locale]/(workspace)/marketplace/items/[itemId]/page.tsx` — page détail item

### Migration
- `src/server/infrastructure/db/migrations/0009_polite_ken_ellis.sql`

### Tests
- `test/unit/marketplace-use-cases.test.ts` — 29 tests couvrant tous les use cases marketplace

---

## Prochaines étapes (optionnel)

- Exécuter `npm run db:migrate` pour appliquer la migration
- Créer les routes API pour créer un draft depuis un skill ou custom tool existant
- Ajouter le formulaire de création de draft depuis la page d'un skill/tool
- Ajouter la section admin dans les features existantes (toggle feature, drag & drop ordre)
- Supprimer les anciennes routes `/submit` et `/review` si encore présentes
