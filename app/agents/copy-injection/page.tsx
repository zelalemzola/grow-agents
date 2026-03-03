import Link from "next/link";

import {
  Sparkles,
  FolderPlus,
  FolderOpen,
  BookOpen,
  FileText,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const cards = [
  {
    title: "Create New Project",
    description:
      "Start a new funnel from a prompt and selected template style.",
    href: "/agents/copy-injection/projects/new",
    icon: FolderPlus,
    variant: "default" as const,
    gradient: "from-violet-500/10 to-indigo-500/10",
    iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  {
    title: "View All Projects",
    description: "Open and continue previous work, revisions, and exports.",
    href: "/agents/copy-injection/projects",
    icon: FolderOpen,
    variant: "secondary" as const,
    gradient: "from-blue-500/10 to-cyan-500/10",
    iconBg: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  {
    title: "Train with Templates",
    description:
      "Upload and store template rules, HTML scaffolds, and CSS scaffolds.",
    href: "/agents/copy-injection/templates",
    icon: BookOpen,
    variant: "outline" as const,
    gradient: "from-amber-500/10 to-orange-500/10",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },

];

export default function CopyInjectionDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm">
            <Sparkles className="size-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Grow Agents
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Funnel builder — manage projects, train templates, and create high-conversion pages with AI
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
