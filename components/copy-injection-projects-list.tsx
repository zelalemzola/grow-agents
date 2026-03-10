"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  FolderPlus,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Layers,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FunnelListItem } from "@/lib/types";

const ACCENT_PALETTE = [
  { gradient: "from-violet-500/15 via-indigo-500/10 to-transparent", iconBg: "bg-violet-500/20 text-violet-600 dark:text-violet-400", border: "group-hover:border-violet-500/30" },
  { gradient: "from-blue-500/15 via-cyan-500/10 to-transparent", iconBg: "bg-blue-500/20 text-blue-600 dark:text-blue-400", border: "group-hover:border-blue-500/30" },
  { gradient: "from-emerald-500/15 via-teal-500/10 to-transparent", iconBg: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400", border: "group-hover:border-emerald-500/30" },
  { gradient: "from-amber-500/15 via-orange-500/10 to-transparent", iconBg: "bg-amber-500/20 text-amber-600 dark:text-amber-400", border: "group-hover:border-amber-500/30" },
  { gradient: "from-rose-500/15 via-pink-500/10 to-transparent", iconBg: "bg-rose-500/20 text-rose-600 dark:text-rose-400", border: "group-hover:border-rose-500/30" },
] as const;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function CopyInjectionProjectsList() {
  const [funnels, setFunnels] = useState<FunnelListItem[]>([]);
  const [status, setStatus] = useState("Loading projects...");
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (
    e: React.MouseEvent,
    funnel: FunnelListItem,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete project "${funnel.name}"? This cannot be undone.`))
      return;
    setDeletingId(funnel.id);
    try {
      const res = await fetch(
        `/api/agents/copy-injection/funnels/${funnel.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed.");
      setFunnels((prev) => prev.filter((f) => f.id !== funnel.id));
      setStatus("Project deleted.");
    } catch (err) {
      setStatus(`Delete failed: ${String(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredFunnels = searchQuery.trim()
    ? funnels.filter(
        (f) =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.objective.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : funnels;

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/agents/copy-injection/funnels?list=true")
      .then((res) => res.json())
      .then((data) => {
        const loaded = (data.funnels ?? []) as FunnelListItem[];
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
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm">
            <Layers className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              All Funnel Projects
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
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
        <Button asChild size="default" className="gap-2 shadow-sm">
          <Link href="/agents/copy-injection/projects/new">
            <FolderPlus className="size-4" />
            New Project
          </Link>
        </Button>
      </div>

      {funnels.length > 0 && !isLoading && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search projects by name or objective..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-10 pr-4"
              aria-label="Search projects"
            />
          </div>
        </div>
      )}

      {funnels.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-gradient-to-b from-muted/30 to-muted/10 py-20 text-center">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-muted/50">
            <FolderOpen className="size-10 text-muted-foreground/60" />
          </div>
          <p className="mt-5 text-lg font-semibold text-foreground">
            No projects yet
          </p>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Create your first funnel and start building high-conversion pages with AI
          </p>
          <Button asChild size="lg" className="mt-6 gap-2">
            <Link href="/agents/copy-injection/projects/new">
              <FolderPlus className="size-4" />
              Create Project
            </Link>
          </Button>
        </div>
      ) : filteredFunnels.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 py-16 text-center">
          <Search className="size-12 text-muted-foreground/50" />
          <p className="mt-4 font-medium text-muted-foreground">
            No projects match your search
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a different search term or clear the search
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setSearchQuery("")}
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFunnels.map((funnel, i) => {
            const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
            return (
              <Link
                key={funnel.id}
                href={`/agents/copy-injection/projects/${funnel.id}`}
                className="group relative block overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                />
                <div className={`absolute inset-0 rounded-2xl border-2 border-transparent ${accent.border} transition-colors duration-300`} />
                <div className="relative flex flex-col">
                  <div className="absolute right-0 top-0 z-10">
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      className="size-8 text-muted-foreground opacity-60 hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(e, funnel);
                      }}
                      disabled={deletingId === funnel.id}
                      title="Delete project"
                    >
                      {deletingId === funnel.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                  <div
                    className={`mb-4 flex size-12 items-center justify-center rounded-xl ${accent.iconBg} transition-transform duration-300 group-hover:scale-105`}
                  >
                    <FolderOpen className="size-6" />
                  </div>
                  <h3 className="font-semibold tracking-tight text-foreground line-clamp-1">
                    {funnel.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {funnel.objective}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground/80">
                    Updated {formatRelativeTime(funnel.updated_at)}
                  </p>
                  <span className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:gap-2">
                    Open project
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
