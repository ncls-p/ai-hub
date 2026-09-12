import { describe, expect, it } from "vitest";
import {
  organizationLabels,
  organizationProjectLabels,
} from "@/components/iam/organization-labels";

describe("organization labels", () => {
  const rows = [
    {
      id: "aaaaaaaa-1",
      name: "Helpline",
      projects: [{ id: "demo", name: "Demo Veolia" }],
    },
    {
      id: "bbbbbbbb-2",
      name: "Helpline",
      projects: [{ id: "live", name: "Veolia" }],
    },
  ];
  it("distinguishes homonyms by their projects without merging organizations", () => {
    expect(organizationLabels(rows)).toEqual([
      { id: rows[0].id, name: "Helpline · Demo Veolia" },
      { id: rows[1].id, name: "Helpline · Veolia" },
    ]);
    expect(organizationLabels([rows[0]])[0].name).toBe("Helpline");
  });
  it("disambiguates empty organizations and identically named source projects", () => {
    expect(
      organizationLabels(rows.map((row) => ({ ...row, projects: [] }))),
    ).toEqual([
      { id: rows[0].id, name: "Helpline · aaaaaaaa" },
      { id: rows[1].id, name: "Helpline · bbbbbbbb" },
    ]);
    expect(
      organizationProjectLabels(
        rows.map((row) => ({
          ...row,
          projects: [{ id: row.id, name: "Veolia" }],
        })),
      ),
    ).toEqual([
      { id: rows[0].id, name: "Helpline · Veolia · aaaaaaaa" },
      { id: rows[1].id, name: "Helpline · Veolia · bbbbbbbb" },
    ]);
  });
  it("keeps labels unique when identifier prefixes collide", () => {
    expect(
      organizationLabels(
        rows.map((row, i) => ({ ...row, id: `aaaaaaaa-${i}`, projects: [] })),
      ),
    ).toEqual([
      { id: "aaaaaaaa-0", name: "Helpline · aaaaaaaa-0" },
      { id: "aaaaaaaa-1", name: "Helpline · aaaaaaaa-1" },
    ]);
  });
  it("distinguishes identically named projects inside the same organization", () => {
    expect(
      organizationProjectLabels([
        {
          id: "org",
          name: "Helpline",
          projects: [
            { id: "aaaaaaaa-one", name: "Veolia" },
            { id: "bbbbbbbb-two", name: "Veolia" },
          ],
        },
      ]),
    ).toEqual([
      { id: "aaaaaaaa-one", name: "Helpline · Veolia · aaaaaaaa" },
      { id: "bbbbbbbb-two", name: "Helpline · Veolia · bbbbbbbb" },
    ]);
  });
});
