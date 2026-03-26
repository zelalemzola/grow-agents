import Link from "next/link";
import { Shield, FolderPlus, FolderOpen, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const cards = [
  {
    title: "Create New Project",
    description:
      "Scan full HTML and apply targeted policy-compliant edits while preserving structure, intent, and conversion flow.",
    href: "/agents/policy-changes/projects/new",
    icon: FolderPlus,
    variant: "default" as const,
    gradient: "from-emerald-500/10 to-teal-500/10",
    iconBg: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  {
    title: "View All Projects",
    description:
      "Continue previous policy adaptation projects, review change logs, and export compliant HTML.",
    href: "/agents/policy-changes/projects",
    icon: FolderOpen,
    variant: "secondary" as const,
    gradient: "from-teal-500/10 to-emerald-500/10",
    iconBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
];

export default function PolicyChangesDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm">
            <Shield className="size-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Grow Agents</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Policy Changes Agent — surgical compliance editing for full HTML
              landing pages and advertorials.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.href}
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:border-emerald-500/20 hover:shadow-md"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 transition-opacity group-hover:opacity-100`}
              />
              <div className="relative flex flex-col">
                <div
                  className={`mb-4 flex size-11 items-center justify-center rounded-lg ${card.iconBg}`}
                >
                  <Icon className="size-5" />
                </div>
                <h2 className="font-semibold tracking-tight">{card.title}</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {card.description}
                </p>
                <Button
                  variant={card.variant}
                  size="sm"
                  className="mt-4 w-fit gap-1.5 transition-all group-hover:gap-2"
                  asChild
                >
                  <Link href={card.href} className="inline-flex items-center">
                    Open
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
