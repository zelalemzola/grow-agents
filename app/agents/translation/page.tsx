import Link from "next/link";

import {
  Globe,
  FolderPlus,
  FolderOpen,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const cards = [
  {
    title: "Create New Project",
    description:
      "Paste HTML and translate content to your target language while preserving layout.",
    href: "/agents/translation/projects/new",
    icon: FolderPlus,
    variant: "default" as const,
    gradient: "from-blue-500/10 to-cyan-500/10",
    iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  {
    title: "View All Projects",
    description:
      "Open and continue previous translations, apply edits, and export results.",
    href: "/agents/translation/projects",
    icon: FolderOpen,
    variant: "secondary" as const,
    gradient: "from-cyan-500/10 to-teal-500/10",
    iconBg: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  },
];

export default function TranslationDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm">
            <Globe className="size-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Landing Page Translation
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Translate landing pages to target languages with human-like quality.
              Preserves layout, adapts names and nationalities.
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
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/20"
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
