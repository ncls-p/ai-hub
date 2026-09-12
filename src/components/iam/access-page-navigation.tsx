"use client";

import { Building2Icon, GaugeIcon, Share2Icon, UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrganizationDirectory } from "./organization-directory";
import { ResourceDistributionPanel } from "./resource-distribution-panel";
import { UsageLimitsPanel } from "./usage-limits-panel";

export function AccessPageNavigation({
  children,
  isPlatformAdmin,
}: {
  children: ReactNode;
  isPlatformAdmin: boolean;
}) {
  const t = useTranslations("access.navigation");
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const sections = [
    { value: "access", icon: UsersIcon },
    { value: "organizations", icon: Building2Icon },
    ...(isPlatformAdmin
      ? [
          { value: "sharing", icon: Share2Icon },
          { value: "limits", icon: GaugeIcon },
        ]
      : []),
  ];
  const requested = searchParams.get("section");
  const active =
    sections.find(({ value }) => value === requested)?.value ?? "access";
  const [visited, setVisited] = useState<string[]>([active]);
  function select(value: string) {
    setVisited((current) =>
      current.includes(value) ? current : [...current, value],
    );
    const params = new URLSearchParams(searchParams.toString());
    if (value === "access") params.delete("section");
    else params.set("section", value);
    window.history.pushState(
      null,
      "",
      params.size ? `${pathname}?${params}` : pathname,
    );
  }
  const panels: Record<string, ReactNode> = {
    access: children,
    organizations: <OrganizationDirectory />,
    sharing: <ResourceDistributionPanel />,
    limits: <UsageLimitsPanel />,
  };
  return (
    <Tabs value={active} onValueChange={select} className="min-w-0 gap-5">
      <div className="min-w-0">
        <TabsList
          aria-label={t("label")}
          className="grid w-full grid-cols-2 gap-1 p-1 sm:flex sm:w-fit"
        >
          {sections.map(({ value, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-10 gap-2 px-3 py-2 whitespace-normal"
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{t(`${value}.title`)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="min-w-0">
        {sections.map(({ value }) => (
          <TabsContent
            key={value}
            value={value}
            forceMount
            hidden={active !== value}
            className="min-w-0 data-[state=inactive]:hidden"
          >
            {active === value || visited.includes(value) ? panels[value] : null}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}
