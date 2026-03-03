"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FunnelRecord } from "@/lib/types";

export function CopyInjectionProjectsList() {
  const [funnels, setFunnels] = useState<FunnelRecord[]>([]);
  const [status, setStatus] = useState("Loading projects...");

  useEffect(() => {
    fetch("/api/agents/copy-injection/funnels")
      .then((res) => res.json())
      .then((data) => {
        const loaded = (data.funnels ?? []) as FunnelRecord[];
        setFunnels(loaded);
        setStatus(
          loaded.length > 0
            ? `${loaded.length} project(s) loaded.`
            : "No projects yet.",
        );
      })
      .catch((error) => {
        setStatus(`Failed to load projects: ${String(error)}`);
      });
  }, []);

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">All Funnel Projects</h1>
        <Button asChild size="sm">
          <Link href="/agents/copy-injection/projects/new">New Project</Link>
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{status}</p>

      <div className="mt-4 space-y-3">
        {funnels.map((funnel) => (
          <div key={funnel.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{funnel.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {funnel.objective}
                </p>
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link href={`/agents/copy-injection/projects/${funnel.id}`}>
                  Open
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
