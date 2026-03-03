import Link from "next/link";

import {
  Sparkles,
  Globe,
  Shield,
  Layers,
  PenLine,
  Image,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents";

const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  "copy-injection": Sparkles,
  translation: Globe,
  "policy-changes": Shield,
  "new-funnel": Layers,
  "copy-chief": PenLine,
  "ad-image-generation": Image,
};

const agentGradients: Record<string, string> = {
  "copy-injection": "from-violet-500/10 to-indigo-500/10",
  translation: "from-blue-500/10 to-cyan-500/10",
  "policy-changes": "from-emerald-500/10 to-teal-500/10",
  "new-funnel": "from-amber-500/10 to-orange-500/10",
  "copy-chief": "from-rose-500/10 to-pink-500/10",
  "ad-image-generation": "from-fuchsia-500/10 to-purple-500/10",
};

const agentIconBg: Record<string, string> = {
  "copy-injection": "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  translation: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "policy-changes": "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "new-funnel": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "copy-chief": "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "ad-image-generation":
    "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
};

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-6xl px-6 py-12 md:py-16">
        <section className="mb-12">
          <div className="flex items-center gap-4">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm">
              <Sparkles className="size-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
                Grow Agents
              </h1>
              <p className="mt-2 max-w-2xl text-lg text-muted-foreground">
                AI-powered marketing agents for funnels, copy, translation, and
                compliance. Choose an agent to get started.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((agent) => {
            const isLive = agent.status === "live";
            const Icon = agentIcons[agent.slug] ?? Sparkles;
            const gradient = agentGradients[agent.slug] ?? "from-primary/10 to-primary/5";
            const iconBg = agentIconBg[agent.slug] ?? "bg-primary/15 text-primary";

            return (
              <article
                key={agent.slug}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/20"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative flex flex-col">
                  <div className="mb-4 flex items-center justify-between">
                    <div
                      className={`flex size-12 items-center justify-center rounded-xl ${iconBg}`}
                    >
                      <Icon className="size-6" />
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        isLive
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isLive ? "Live" : "Soon"}
                    </span>
                  </div>
                  <h2 className="font-semibold tracking-tight">{agent.title}</h2>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {agent.description}
                  </p>
                  <div className="mt-5">
                    {isLive ? (
                      <Button asChild size="sm" className="gap-1.5">
                        <Link href={`/agents/${agent.slug}`}>
                          Open Agent
                          <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled
                        className="gap-1.5"
                      >
                        Coming Soon
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
