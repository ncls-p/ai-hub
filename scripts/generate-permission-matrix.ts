import fs from "node:fs";
import fr from "../messages/fr.json";
import path from "node:path";
import { PERMISSION_CATALOG } from "../src/modules/iam/permission-catalog.permission-catalog-group";
import { expandPermissionGrants } from "../src/modules/iam/permission-matching";
import { isPermissionCompatibleWithScope } from "../src/modules/iam/permission-catalog.known-permissions";
import { SYSTEM_ROLES } from "../src/server/domain/entities/iam";

const check = process.argv.includes("--check");
const walk = (directory: string): string[] =>
  fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(directory, entry.name))
        : [path.join(directory, entry.name)],
    );
const sources = walk("src").filter(
  (file) =>
    /\.tsx?$/.test(file) &&
    !file.includes("/migrations/") &&
    !file.includes("generated-route-manifest"),
);
const texts = new Map(
  sources.map((file) => [file, fs.readFileSync(file, "utf8")]),
);
const definitions = PERMISSION_CATALOG.flatMap((group) =>
  group.permissions.map((permission) => ({
    ...permission,
    group: (fr.access.permissionGroups as Record<string, { label: string }>)[
      group.id
    ].label,
  })),
);
const roles = SYSTEM_ROLES.map((role) => ({
  ...role,
  expanded: new Set(expandPermissionGrants(role.permissions)),
}));
const rows = definitions.map((permission) => {
  const occurrences = [...texts]
    .filter(
      ([file, text]) =>
        !file.includes("permission-catalog") &&
        !file.includes("permission-matching") &&
        text.includes(`"${permission.id}"`),
    )
    .map(([file]) => file);
  return [
    permission.group,
    permission.id,
    (fr.access.permissions as Record<string, { description: string }>)[
      permission.id.replaceAll(".", "_")
    ].description,
    isPermissionCompatibleWithScope(permission.id, "workspace")
      ? "Organisation → projet → ressource du domaine"
      : "Organisation",
    expandPermissionGrants([permission.id])
      .filter((id) => id !== permission.id)
      .join(", ") || "—",
    ...roles.map((role) => (role.expanded.has(permission.id) ? "Oui" : "—")),
    occurrences.map((file) => `[${file}](../${file})`).join("<br>") ||
      "Catalogue / délégation",
  ];
});
const headers = [
  "Domaine",
  "Permission",
  "Action",
  "Portée",
  "Inclut aussi",
  ...roles.map((role) => role.name),
  "Références du code",
];
const markdown = [
  "# Matrice des permissions",
  "",
  "Générée par `npm run permissions:generate`. Les références recensent les usages littéraux ; les appels dynamiques sont couverts par le catalogue commun. Les droits directs s’ajoutent aux droits hérités. Les contraintes de propriété, visibilité, quota et portée des clés API restent cumulatives.",
  "",
  `**${definitions.length} permissions, ${roles.length} rôles prédéfinis.** Les rôles personnalisés sont visibles dans la même matrice dans la console d’accès.`,
  "",
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map((row) => `| ${row.join(" | ")} |`),
  "",
].join("\n");
const csv =
  [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
    )
    .join("\n") + "\n";
// Include every API entry point, including route files that re-export handlers.
const routeRows = sources
  .filter((file) => /\/route\.ts$/.test(file))
  .sort()
  .map((file) => {
    const siblings = [...texts].filter(
      ([candidate]) =>
        candidate === file ||
        (path.dirname(candidate) === path.dirname(file) &&
          path.basename(candidate).startsWith("route.")),
    );
    const text = siblings.map(([, content]) => content).join("\n");
    const permissions = definitions
      .filter((permission) => text.includes(`"${permission.id}"`))
      .map((permission) => permission.id);
    const guards = [
      ...new Set(
        text.match(
          /\b(?:require\w*(?:Session|Permission\w*|Access\w*|Member\w*)|handleRoute|resolveAuth|check\w*Permission\w*|has\w*Permission\w*|isPlatformAdminSession)\b/g,
        ) ?? [],
      ),
    ];
    const imports = [
      ...new Set(
        siblings.flatMap(([, content]) =>
          [
            ...content.matchAll(/from ["'](@\/(?:modules|lib)\/[^"']+)["']/g),
          ].map((match) => match[1]),
        ),
      ),
    ];
    return [
      file.replace(/^src\/app/, "").replace(/\/route\.ts$/, ""),
      permissions.join(", ") ||
        "Contrôle délégué / session / propriété / accès public selon le gestionnaire",
      guards.join(", ") || "Voir gestionnaire et modules",
      `[Source](../${file})<br>${imports.join("<br>")}`,
    ];
  });
const routes = [
  "# Points d’entrée API",
  "",
  "Inventaire exhaustif des fichiers de routes. Cette table distingue les permissions nommées présentes dans la route et ses fichiers de gestionnaires voisins, des contrôles délégués à leurs modules. Elle ne remplace pas les conditions de propriété et de visibilité décrites dans le modèle d’accès.",
  "",
  `**${routeRows.length} routes.** Une route peut exposer plusieurs méthodes ; leur manifeste exact est vérifié par \`npm run openapi:check\`.`,
  "",
  "| Route | Permissions nommées | Contrôles / adaptateurs | Sources à examiner |",
  "| --- | --- | --- | --- |",
  ...routeRows.map((row) => `| ${row.join(" | ")} |`),
  "",
].join("\n");
for (const [file, content] of [
  ["docs/permissions-matrix.md", markdown],
  ["docs/permissions-matrix.csv", csv],
  ["docs/permissions-api-inventory.md", routes],
]) {
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content)
      throw new Error(`${file} is stale; run npm run permissions:generate`);
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}
console.log(
  `${definitions.length} permissions, ${roles.length} built-in roles, ${routeRows.length} API routes verified.`,
);
