type Organization = {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
};

function distinguish(
  rows: { id: string; name: string; discriminator: string }[],
) {
  return rows.map((row) => {
    const homonyms = rows.filter((other) => other.name === row.name);
    const shortId = row.discriminator.slice(0, 8);
    const suffix = homonyms.some(
      (other) => other.id !== row.id && other.discriminator.startsWith(shortId),
    )
      ? row.discriminator
      : shortId;
    return {
      id: row.id,
      name: homonyms.length > 1 ? `${row.name} · ${suffix}` : row.name,
    };
  });
}

/** Keep homonymous organizations separate and identifiable without changing their names. */
export function organizationLabels(organizations: Organization[]) {
  return distinguish(
    organizations.map((organization) => {
      const homonyms = organizations.filter(
        (other) => other.name === organization.name,
      );
      const projects = organization.projects
        .map((project) => project.name)
        .sort()
        .join(", ");
      return {
        id: organization.id,
        discriminator: organization.id,
        name:
          homonyms.length > 1 && projects
            ? `${organization.name} · ${projects}`
            : organization.name,
      };
    }),
  );
}

export function organizationProjectLabels(
  organizations: (Organization & {
    projects: { id: string; name: string }[];
  })[],
) {
  return distinguish(
    organizations.flatMap((organization) =>
      organization.projects.map((project) => ({
        id: project.id,
        discriminator: organization.id,
        name: `${organization.name} · ${project.name}`,
      })),
    ),
  );
}
