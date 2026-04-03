"use client";

import Link from "next/link";
import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  ImageIcon,
  Undo2,
  Redo2,
  ChevronDown,
  Download,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AD_IMAGE_ASPECT_RATIOS,
  listAdImageKeysSorted,
  parseAdImageKey,
  type AdImageAspectRatio,
} from "@/lib/ad-image-keys";
import type { AdImageObjective } from "@/lib/types";

type FunnelRecord = {
  id: string;
  name: string;
  objective: string;
  latest_images: Record<string, string>;
  updated_at: string;
};

const DEFAULT_ASPECT: AdImageAspectRatio = "16:9";

export function AdImageProjectDetail({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<FunnelRecord | null>(null);
  const [status, setStatus] = useState("Loading...");
  const [error, setError] = useState<string | null>(null);

  const [selectedImageKey, setSelectedImageKey] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [regenerateAspect, setRegenerateAspect] =
    useState<AdImageAspectRatio>(DEFAULT_ASPECT);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [previousImageByKey, setPreviousImageByKey] = useState<
    Record<string, string>
  >({});
  const [redoImageByKey, setRedoImageByKey] = useState<Record<string, string>>(
    {},
  );
  const [lightbox, setLightbox] = useState<{
    src: string;
    key: string;
  } | null>(null);

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

  const imageKeys = useMemo(
    () => listAdImageKeysSorted(project?.latest_images),
    [project?.latest_images],
  );

  const promptsFromObjective = useMemo((): string[] => {
    if (!project?.objective) return [];
    try {
      const o = JSON.parse(project.objective) as AdImageObjective;
      return o.prompts ?? [];
    } catch {
      return [];
    }
  }, [project?.objective]);

  const keysByPrompt = useMemo(() => {
    const m: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const k of imageKeys) {
      const p = parseAdImageKey(k);
      if (p && m[p.prompt]) m[p.prompt].push(k);
    }
    return m;
  }, [imageKeys]);

  useEffect(() => {
    if (!project || !selectedImageKey) return;
    const parsed = parseAdImageKey(selectedImageKey);
    if (!parsed) return;
    try {
      const o = JSON.parse(project.objective) as AdImageObjective;
      const ps = o.promptSettings?.[parsed.prompt - 1];
      if (ps?.aspectRatio) setRegenerateAspect(ps.aspectRatio);
    } catch {
      // ignore
    }
  }, [project, selectedImageKey]);

  const handleRegenerate = async () => {
    if (!project || !selectedImageKey || !comment.trim()) return;
    const prevUrl = project.latest_images?.[selectedImageKey];
    if (prevUrl) {
      setPreviousImageByKey((p) => ({ ...p, [selectedImageKey]: prevUrl }));
      setRedoImageByKey((p) => {
        const next = { ...p };
        delete next[selectedImageKey];
        return next;
      });
    }
    setRegeneratingKey(selectedImageKey);
    const label = parseAdImageKey(selectedImageKey);
    setStatus(
      label
        ? `Regenerating prompt ${label.prompt} · ${label.variant}…`
        : "Regenerating…",
    );

    try {
      const res = await fetch("/api/agents/ad-image-generation/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funnelId: project.id,
          imageKey: selectedImageKey,
          comment: comment.trim(),
          aspectRatio: regenerateAspect,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data?.error ?? "Regeneration failed.");
        setRegeneratingKey(null);
        return;
      }

      if (data.funnel?.latest_images) {
        setProject((prev) =>
          prev ? { ...prev, latest_images: data.funnel.latest_images } : null,
        );
      }
      setStatus("Image updated.");
      setComment("");
      setSelectedImageKey(null);
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setRegeneratingKey(null);
    }
  };

  const handleDownload = async (imageKey: string, url: string) => {
    const parsed = parseAdImageKey(imageKey);
    const suffix = parsed
      ? `p${parsed.prompt}-${parsed.variant}`
      : imageKey.replace(/[^a-zA-Z0-9_-]/g, "");
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${project?.name?.replace(/\s+/g, "-") ?? "image"}-${suffix}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name?.replace(/\s+/g, "-") ?? "image"}-${suffix}.png`;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
  };

  const handleUndo = async (imageKey: string) => {
    const prevUrl = previousImageByKey[imageKey];
    if (!prevUrl || !project) return;
    const currentUrl = project.latest_images?.[imageKey];
    if (!currentUrl) return;
    setProject((p) =>
      p
        ? {
            ...p,
            latest_images: { ...p.latest_images, [imageKey]: prevUrl },
          }
        : null,
    );
    setPreviousImageByKey((p) => {
      const next = { ...p };
      delete next[imageKey];
      return next;
    });
    setRedoImageByKey((p) => ({ ...p, [imageKey]: currentUrl }));
    setStatus("Restored previous version.");
    try {
      const res = await fetch(
        `/api/agents/ad-image-generation/funnels/${project.id}/image`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageKey, imageUrl: prevUrl }),
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

  const handleRedo = async (imageKey: string) => {
    const redoUrl = redoImageByKey[imageKey];
    if (!redoUrl || !project) return;
    const currentUrl = project.latest_images?.[imageKey];
    if (!currentUrl) return;

    setProject((p) =>
      p
        ? {
            ...p,
            latest_images: { ...p.latest_images, [imageKey]: redoUrl },
          }
        : null,
    );
    setRedoImageByKey((p) => {
      const next = { ...p };
      delete next[imageKey];
      return next;
    });
    setPreviousImageByKey((p) => ({ ...p, [imageKey]: currentUrl }));
    setStatus("Reapplied newer version.");

    try {
      const res = await fetch(
        `/api/agents/ad-image-generation/funnels/${project.id}/image`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageKey, imageUrl: redoUrl }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(data?.error ?? "Redo save failed.");
      }
    } catch {
      setStatus("Redo saved locally.");
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

  const prompts = promptsFromObjective;

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] gap-6">
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
                Regenerate with aspect ratio and comments
              </p>
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-border/60 bg-muted/20 p-4">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <RefreshCw className="size-3.5" />
              Regenerate an image
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Choose which image, optional output aspect ratio, describe the
              change, then Regenerate.
            </p>
            <div className="space-y-3">
              <div className="relative">
                <select
                  className="h-9 w-full appearance-none rounded-lg border border-border/80 bg-background pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30"
                  value={selectedImageKey ?? ""}
                  onChange={(e) =>
                    setSelectedImageKey(e.target.value || null)
                  }
                >
                  <option value="">Select image…</option>
                  {imageKeys.map((k) => {
                    const p = parseAdImageKey(k);
                    const label = p
                      ? `Prompt ${p.prompt} · Image ${p.variant}`
                      : k;
                    return (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Output aspect ratio
                </label>
                <select
                  className="h-9 w-full rounded-lg border border-border/80 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500/30"
                  value={regenerateAspect}
                  onChange={(e) =>
                    setRegenerateAspect(e.target.value as AdImageAspectRatio)
                  }
                >
                  {AD_IMAGE_ASPECT_RATIOS.map((ar) => (
                    <option key={ar} value={ar}>
                      {ar}
                    </option>
                  ))}
                </select>
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
                  !selectedImageKey ||
                  !comment.trim() ||
                  regeneratingKey != null
                }
                className="w-full gap-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700"
              >
                {regeneratingKey != null ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {regeneratingKey != null ? "Regenerating…" : "Regenerate"}
              </Button>
            </div>
          </div>

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
            {regeneratingKey != null ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {status}
          </p>
        </div>
      </aside>

      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Images
        </p>
        <div className="flex-1 space-y-6 overflow-auto pr-1">
          {[1, 2, 3, 4, 5].map((promptNum) => {
            const keys = keysByPrompt[promptNum] ?? [];
            const promptText = prompts[promptNum - 1] ?? "";
            return (
              <div key={promptNum}>
                <p className="mb-2 text-[11px] font-medium text-foreground/90">
                  Prompt {promptNum}
                  {promptText ? (
                    <span className="ml-2 font-normal text-muted-foreground">
                      — {promptText.length > 80 ? `${promptText.slice(0, 80)}…` : promptText}
                    </span>
                  ) : null}
                </p>
                {keys.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                    No images for this prompt yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {keys.map((key) => {
                      const src = project.latest_images?.[key];
                      const parsed = parseAdImageKey(key);
                      const isRegenerating = regeneratingKey === key;
                      const hasUndo = Boolean(previousImageByKey[key]);
                      const hasRedo = Boolean(redoImageByKey[key]);
                      const label = parsed
                        ? `#${parsed.variant}`
                        : key;

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
                              <button
                                type="button"
                                onClick={() =>
                                  setLightbox({ src, key })
                                }
                                className="h-full min-h-[160px] w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
                              >
                                <img
                                  src={src}
                                  alt={label}
                                  className="h-full w-full object-cover"
                                />
                              </button>
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
                              {label}
                            </span>
                            {!isRegenerating && (
                              <div className="absolute right-2 top-2 flex gap-2">
                                {hasRedo && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="gap-1.5 rounded-lg bg-white/90 text-xs shadow-md hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700"
                                    onClick={() => handleRedo(key)}
                                  >
                                    <Redo2 className="size-3.5" />
                                    Redo
                                  </Button>
                                )}
                                {hasUndo && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="gap-1.5 rounded-lg bg-white/90 text-xs shadow-md hover:bg-white dark:bg-zinc-800 dark:hover:bg-zinc-700"
                                    onClick={() => handleUndo(key)}
                                  >
                                    <Undo2 className="size-3.5" />
                                    Undo
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <div className="absolute right-4 top-4 flex gap-2">
            <Button
              size="lg"
              className="gap-2 bg-white text-black hover:bg-white/90"
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(lightbox.key, lightbox.src);
              }}
            >
              <Download className="size-5" />
              Download
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-12 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox(null);
              }}
            >
              <X className="size-6" />
            </Button>
          </div>
          <div
            className="flex flex-1 items-center justify-center p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightbox.src}
              alt={lightbox.key}
              className="max-h-[90vh] max-w-[90vw] object-contain"
            />
          </div>
          <p className="pb-4 text-center text-sm text-white/60">
            {(() => {
              const lb = parseAdImageKey(lightbox.key);
              return lb
                ? `Prompt ${lb.prompt} · ${lb.variant}`
                : lightbox.key;
            })()}{" "}
            · Click outside to close
          </p>
        </div>
      )}
    </div>
  );
}
