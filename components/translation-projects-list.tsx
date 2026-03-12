"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  FolderPlus,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Globe,
  Search,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface TranslationProject {
  id: string;
  name: string;
  objective: string;
  agent_slug: string;
  created_at: string;
  updated_at: string;
}

const ACCENT_PALETTE = [
  {
    gradient: "from-blue-500/15 via-cyan-500/10 to-transparent",
    iconBg: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    border: "group-hover:border-blue-500/30",
  },
  {
    gradient: "from-cyan-500/15 via-teal-500/10 to-transparent",
    iconBg: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
    border: "group-hover:border-cyan-500/30",
  },
  {
    gradient: "from-indigo-500/15 via-violet-500/10 to-transparent",
    iconBg: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
    border: "group-hover:border-indigo-500/30",
  },
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

export function TranslationProjectsList() {
  const [projects, setProjects] = useState<TranslationProject[]>([]);
  const [status, setStatus] = useState("Loading projects...");
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (
    e: React.MouseEvent,
    project: TranslationProject,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete project "${project.name}"? This cannot be undone.`))
      return;
    setDeletingId(project.id);
    try {
      const res = await fetch(
        `/api/agents/translation/funnels/${project.id}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed.");
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setStatus("Project deleted.");
    } catch (err) {
      setStatus(`Delete failed: ${String(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const filteredProjects = searchQuery.trim()
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.objective.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : projects;

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/agents/translation/funnels?list=true")
      .then((res) => res.json())
      .then((data) => {
        const loaded = (data.funnels ?? []) as TranslationProject[];
        setProjects(loaded);
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
            <Globe className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              All Translation Projects
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
          <Link href="/agents/translation/projects/new">
            <FolderPlus className="size-4" />
            New Project
          </Link>
        </Button>
      </div>

      {projects.length > 0 && !isLoading && (
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search projects by name or language..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-10 pr-4"
              aria-label="Search projects"
            />
          </div>
        </div>
      )}

      {projects.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/60 bg-gradient-to-b from-muted/30 to-muted/10 py-20 text-center">
          <div className="flex size-20 items-center justify-center rounded-2xl bg-muted/50">
            <FolderOpen className="size-10 text-muted-foreground/60" />
          </div>
          <p className="mt-5 text-lg font-semibold text-foreground">
            No projects yet
          </p>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Create your first translation project and translate landing pages with
            human-like quality
          </p>
          <Button asChild size="lg" className="mt-6 gap-2">
            <Link href="/agents/translation/projects/new">
              <FolderPlus className="size-4" />
              Create Project
            </Link>
          </Button>
        </div>
      ) : filteredProjects.length === 0 ? (
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
          {filteredProjects.map((project, i) => {
            const accent = ACCENT_PALETTE[i % ACCENT_PALETTE.length];
            return (
              <Link
                key={project.id}
                href={`/agents/translation/projects/${project.id}`}
                className="group relative block overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/30"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                />
                <div
                  className={`absolute inset-0 rounded-2xl border-2 border-transparent ${accent.border} transition-colors duration-300`}
                />
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
                        handleDelete(e, project);
                      }}
                      disabled={deletingId === project.id}
                      title="Delete project"
                    >
                      {deletingId === project.id ? (
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
                    {project.name}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {project.objective}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground/80">
                    Updated {formatRelativeTime(project.updated_at)}
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
