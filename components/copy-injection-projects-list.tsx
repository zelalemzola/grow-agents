"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  FolderPlus,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FunnelRecord } from "@/lib/types";

export function CopyInjectionProjectsList() {
  const [funnels, setFunnels] = useState<FunnelRecord[]>([]);
  const [status, setStatus] = useState("Loading projects...");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
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
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FolderOpen className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              All Funnel Projects
            </h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {isLoading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                  {status}
                </>
              )}
            </p>
          </div>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/agents/copy-injection/projects/new">
            <FolderPlus className="size-4" />
            New Project
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        {funnels.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 py-16 text-center">
            <FolderOpen className="size-12 text-muted-foreground/50" />
            <p className="mt-3 font-medium text-muted-foreground">
              No projects yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first funnel to get started
            </p>
            <Button asChild className="mt-4 gap-1.5">
              <Link href="/agents/copy-injection/projects/new">
                <FolderPlus className="size-4" />
                Create Project
              </Link>
            </Button>
          </div>
        ) : (
          funnels.map((funnel) => (
            <div
              key={funnel.id}
              className="group flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-primary/20"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium tracking-tight">{funnel.name}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {funnel.objective}
                </p>
              </div>
              <Button asChild size="sm" variant="secondary" className="gap-1.5">
                <Link href={`/agents/copy-injection/projects/${funnel.id}`}>
                  Open
                  <ExternalLink className="size-3.5" />
                </Link>
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
