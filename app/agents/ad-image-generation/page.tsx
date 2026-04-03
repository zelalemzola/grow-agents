import Link from "next/link";

import {
  ImageIcon,
  FolderPlus,
  FolderOpen,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const cards = [
  {
    title: "Create New Project",
    description:
      "Up to five prompts with per-prompt generate, image count (1–5), and aspect ratio. Optional product reference.",
    href: "/agents/ad-image-generation/projects/new",
    icon: FolderPlus,
    variant: "default" as const,
    gradient: "from-fuchsia-500/10 to-purple-500/10",
    iconBg: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
  },
  {
    title: "View All Projects",
    description:
      "Open previous projects, view generated images, and apply comments to regenerate specific images.",
    href: "/agents/ad-image-generation/projects",
    icon: FolderOpen,
    variant: "secondary" as const,
    gradient: "from-purple-500/10 to-violet-500/10",
    iconBg: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
];

export default function AdImageGenerationDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm">
            <ImageIcon className="size-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Ad Image Generation
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate per prompt with your chosen count and aspect ratio. Add a product reference or open a project to regenerate individual images with comments.
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
