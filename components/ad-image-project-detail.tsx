"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  ImageIcon,
  Undo2,
  ChevronDown,
  Download,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdImageObjective } from "@/lib/types";

type FunnelRecord = {
  id: string;
  name: string;
  objective: string;
  latest_images: Record<string, string>;
  updated_at: string;
};

const IMAGE_KEYS = ["1", "2", "3", "4", "5"] as const;

export function AdImageProjectDetail({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<FunnelRecord | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [previousImageByIndex, setPreviousImageByIndex] = useState<
    Record<number, string>
  >({});

  const loadProject = useCallback(async () => {
    const res = await fetch(
      `/api/agents/ad-image-generation/funnels/${projectId}`,
    );
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setProject(null);
      return;
    }
    setProject(data.funnel as FunnelRecord);
    setStatus("Ready.");
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setStatus("Loading...");
    setError(null);
    loadProject().catch((err) => {
      if (!cancelled) setError(String(err));
    });
    return () => {
      cancelled = true;
    };
  }, [loadProject]);

  const handleRegenerate = async () => {
    if (!project || selectedIndex == null || !comment.trim()) return;
    const prevUrl = project.latest_images?.[String(selectedIndex)];
    if (prevUrl) {
      setPreviousImageByIndex((p) => ({ ...p, [selectedIndex]: prevUrl }));
    }
    setRegeneratingIndex(selectedIndex);
    setStatus(`Regenerating image ${selectedIndex}…`);

    try {
      const res = await fetch("/api/agents/ad-image-generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funnelId: project.id,
          imageIndex: selectedIndex,
          comment: comment.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data?.error ?? "Regeneration failed.");
        setRegeneratingIndex(null);
        return;
      }

      if (data.funnel?.latest_images) {
        setProject((prev) =>
          prev ? { ...prev, latest_images: data.funnel.latest_images } : null,
        );
      }
      setStatus(`Image ${selectedIndex} updated.`);
      setComment("");
      setSelectedIndex(null);
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setRegeneratingIndex(null);
    }
  };

  const handleDownload = async (index: number, url: string) => {
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project?.name?.replace(/\s+/g, "-") ?? "image"}-${index}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name?.replace(/\s+/g, "-") ?? "image"}-${index}.png`;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
  };

  const handleUndo = async (index: number) => {
    const prevUrl = previousImageByIndex[index];
    if (!prevUrl || !project) return;
    setProject((p) =>
      p
        ? {
            ...p,
            latest_images: { ...p.latest_images, [String(index)]: prevUrl },
          }
        : null,
    );
    setPreviousImageByIndex((p) => {
      const next = { ...p };
      delete next[index];
      return next;
    });
    setStatus(`Restored image ${index}.`);
    try {
      const res = await fetch(
        `/api/agents/ad-image-generation/funnels/${project.id}/image`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageIndex: index, imageUrl: prevUrl }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(data?.error ?? "Undo save failed.");
      }
    } catch {
      setStatus("Undo saved locally.");
    }
  };

  if (error || (!project && status !== "Loading...")) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
          <p className="text-destructive">{error ?? "Project not found."}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/agents/ad-image-generation/projects">
              Back to projects
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  let objective: AdImageObjective | null = null;
  try {
    objective = JSON.parse(project.objective) as AdImageObjective;
  } catch {
    objective = null;
  }
  const prompts = objective?.prompts ?? [];

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] gap-6">
      {/* Left: project info + regenerate — sticky, scrollable */}
      <aside className="flex w-full max-w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lg">
        <div className="flex flex-1 flex-col overflow-y-auto p-5">
          <div className="mb-4 flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-1 gap-1.5">
              <Link href="/agents/ad-image-generation/projects">
                <ArrowLeft className="size-4" />
                Projects
              </Link>
            </Button>
          </div>

          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-purple-500/10 text-fuchsia-600 dark:text-fuchsia-400">
              <ImageIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">
                {project.name}
              </h1>
              <p className="text-xs text-muted-foreground">
                Edit one image at a time
              </p>
            </div>
          </div>

          {/* Regenerate one image */}
          <div className="mb-4 rounded-xl border border-border/60 bg-muted/20 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <RefreshCw className="size-3.5" />
              Regenerate one image
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Pick an image, describe the change, then Regenerate. Only that
              image updates.
            </p>
            <div className="space-y-3">
              <div className="relative">
                <select
                  className="h-9 w-full appearance-none rounded-lg border border-border/80 bg-background pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30"
                  value={selectedIndex ?? ""}
                  onChange={(e) =>
                    setSelectedIndex(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                >
                  <option value="">Select image…</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      Image {n}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="e.g. Darker background, show a woman..."
                className="h-9 rounded-lg border-border/80 text-sm"
              />
              <Button
                onClick={handleRegenerate}
                disabled={
                  selectedIndex == null ||
                  !comment.trim() ||
                  regeneratingIndex != null
                }
                className="w-full gap-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700"
              >
                {regeneratingIndex != null ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {regeneratingIndex != null ? "Regenerating…" : "Regenerate"}
              </Button>
            </div>
          </div>

          {/* Prompt preview (compact) */}
          <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Prompts
            </p>
            <div className="space-y-1.5">
              {prompts.slice(0, 5).map((p, i) => (
                <p
                  key={i}
                  className="line-clamp-2 text-xs text-muted-foreground"
                  title={p}
                >
                  <span className="font-medium text-foreground/80">{i + 1}.</span>{" "}
                  {p || "—"}
                </p>
              ))}
            </div>
          </div>

          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            {regeneratingIndex != null ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {status}
          </p>
        </div>
      </aside>

      {/* Right: image grid with blur + undo */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Images
        </p>
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto sm:grid-cols-2">
          {IMAGE_KEYS.map((key, i) => {
            const num = i + 1;
            const src = project.latest_images?.[key];
            const isRegenerating = regeneratingIndex === num;
            const hasUndo = Boolean(previousImageByIndex[num]);

            return (
              <div
                key={key}
                className="relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
              >
                <div
                  className={`relative flex-1 bg-muted/40 transition-all duration-300 ${
                    isRegenerating ? "blur-md" : ""
                  }`}
                >
                  {src ? (
                    <img
                      src={src}
                      alt={`Image ${num}`}
                      className="h-full min-h-[160px] w-full object-cover"
                    />
                  ) : (
                    <div className="flex min-h-[160px] items-center justify-center text-muted-foreground">
                      No image
                    </div>
                  )}
                  {isRegenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="size-10 animate-spin text-white" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
                    Image {num}
                  </span>
                  {hasUndo && !isRegenerating && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute right-2 top-2 gap-1.5 rounded-lg bg-white/90 text-xs shadow-md hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      onClick={() => handleUndo(num)}
                    >
                      <Undo2 className="size-3.5" />
                      Undo
                    </Button>
                  )}
                  {src && !isRegenerating && (
                    <button
                      type="button"
                      onClick={() => handleDownload(num, src)}
                      className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-md bg-black/40 text-white/80 opacity-70 transition-opacity hover:opacity-100 hover:bg-black/50"
                      title="Download image"
                    >
                      <Download className="size-3.5" />
                    </button>
                  )}
                </div>
                {prompts[num - 1] && (
                  <p className="line-clamp-2 border-t border-border/60 p-2 text-[11px] text-muted-foreground">
                    {prompts[num - 1]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
