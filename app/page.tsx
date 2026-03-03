import Link from "next/link";

import { Button } from "@/components/ui/button";
import { AGENTS } from "@/lib/agents";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-muted/40">
      <main className="mx-auto w-full max-w-7xl p-6">
        <section className="rounded-xl border bg-card p-6">
          <h1 className="text-3xl font-semibold tracking-tight">
            Multi-Agent Marketing Platform
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Select an agent workspace. The first agent is fully implemented for
            structured copy injection, image injection, iterative edits, and
            preview sandboxing.
          </p>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          {AGENTS.map((agent) => {
            const isLive = agent.status === "live";
            return (
              <article key={agent.slug} className="rounded-xl border bg-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-medium">{agent.title}</h2>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      isLive
                        ? "bg-emerald-500/10 text-emerald-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isLive ? "Live" : "Coming Soon"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {agent.description}
                </p>
                <div className="mt-4">
                  {isLive ? (
                    <Button asChild>
                      <Link href={`/agents/${agent.slug}`}>Open Agent</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" disabled>
                      Not Available Yet
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
