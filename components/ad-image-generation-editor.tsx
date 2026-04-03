"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import {
  ImageIcon,
  ImagePlus,
  Loader2,
  X,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AD_IMAGE_ASPECT_RATIOS,
  listAdImageKeysSorted,
  parseAdImageKey,
  type AdImageAspectRatio,
} from "@/lib/ad-image-keys";
import type { AdImageObjective } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROMPT_PLACEHOLDERS = [
  "e.g. Woman in kitchen, morning light, holding supplement bottle",
  "e.g. Before/after split, authentic results, soft lighting",
  "e.g. Doctor in lab coat recommending product, clinical setting",
  "e.g. Happy customer selfie with product, natural smile",
  "e.g. Product on table, editorial flat lay, neutral background",
];

const DEFAULT_ASPECT: AdImageAspectRatio = "16:9";

type ProductRowTuple = [
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
];

const NULL_PRODUCTS: ProductRowTuple = [null, null, null, null, null];

function buildPromptSettings(
  counts: number[],
  aspects: AdImageAspectRatio[],
): AdImageObjective["promptSettings"] {
  return counts.map((count, i) => ({
    count,
    aspectRatio: aspects[i] ?? DEFAULT_ASPECT,
  })) as AdImageObjective["promptSettings"];
}

export function AdImageGenerationEditor() {
  const [name, setName] = useState("Ad Image Project");
  const [prompts, setPrompts] = useState<[string, string, string, string, string]>([
    "",
    "",
    "",
    "",
    "",
  ]);
  const [rowCounts, setRowCounts] = useState<[number, number, number, number, number]>([
    1, 1, 1, 1, 1,
  ]);
  const [rowAspects, setRowAspects] = useState<
    [AdImageAspectRatio, AdImageAspectRatio, AdImageAspectRatio, AdImageAspectRatio, AdImageAspectRatio]
  >([
    DEFAULT_ASPECT,
    DEFAULT_ASPECT,
    DEFAULT_ASPECT,
    DEFAULT_ASPECT,
    DEFAULT_ASPECT,
  ]);
  const [rowProductImages, setRowProductImages] =
    useState<ProductRowTuple>(NULL_PRODUCTS);
  const [status, setStatus] = useState(
    "Fill a prompt and use Generate on that row.",
  );
  const [generatingRow, setGeneratingRow] = useState<number | null>(null);
  const [streamedImages, setStreamedImages] = useState<Record<string, string>>({});
  const [createdId, setCreatedId] = useState<string | null>(null);

  const setPrompt = (index: number, value: string) => {
    const next = [...prompts] as [string, string, string, string, string];
    next[index] = value;
    setPrompts(next);
  };

  const setCount = (index: number, value: number) => {
    const next = [...rowCounts] as [number, number, number, number, number];
    next[index] = value;
    setRowCounts(next);
  };

  const setAspect = (index: number, value: AdImageAspectRatio) => {
    const next = [...rowAspects] as [
      AdImageAspectRatio,
      AdImageAspectRatio,
      AdImageAspectRatio,
      AdImageAspectRatio,
      AdImageAspectRatio,
    ];
    next[index] = value;
    setRowAspects(next);
  };

  const setRowProduct = (index: number, dataUrl: string | null) => {
    const next = [...rowProductImages] as ProductRowTuple;
    next[index] = dataUrl;
    setRowProductImages(next);
  };

  const handleGenerateRow = useCallback(
    async (rowIndex: number) => {
      if (
        prompts[rowIndex].trim().length < 3 ||
        name.trim().length < 1 ||
        generatingRow !== null
      )
        return;
      setGeneratingRow(rowIndex);
      setStatus(`Generating prompt ${rowIndex + 1}…`);

      const funnelId = createdId ?? undefined;
      const promptSettings = buildPromptSettings(
        [...rowCounts],
        [...rowAspects],
      );

      try {
        const res = await fetch("/api/agents/ad-image-generation/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            prompts: prompts.map((p) => p.trim()),
            productImages: rowProductImages,
            stream: true,
            slot: {
              promptIndex: rowIndex,
              count: rowCounts[rowIndex],
              aspectRatio: rowAspects[rowIndex],
            },
            funnelId,
            promptSettings,
          }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setStatus(data?.error ?? "Generation failed.");
          setGeneratingRow(null);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6)) as {
                  type: string;
                  key?: string;
                  dataUrl?: string;
                  funnel?: {
                    id: string;
                    latest_images?: Record<string, string>;
                    objective?: string;
                  };
                  error?: string;
                };
                if (data.type === "image" && data.key && data.dataUrl) {
                  const k = data.key;
                  setStreamedImages((prev) => ({
                    ...prev,
                    [k]: data.dataUrl!,
                  }));
                  const parsed = parseAdImageKey(k);
                  setStatus(
                    parsed
                      ? `Prompt ${parsed.prompt} · image ${parsed.variant} ready.`
                      : "Image ready.",
                  );
                } else if (data.type === "done" && data.funnel?.id) {
                  setCreatedId(data.funnel.id);
                  if (data.funnel.latest_images) {
                    setStreamedImages(data.funnel.latest_images);
                  }
                  const obj = data.funnel.objective;
                  if (typeof obj === "string") {
                    try {
                      const parsed = JSON.parse(obj) as AdImageObjective;
                      if (parsed.productImageUrls?.length === 5) {
                        setRowProductImages(
                          parsed.productImageUrls.map((x) => x ?? null) as ProductRowTuple,
                        );
                      }
                    } catch {
                      // ignore
                    }
                  }
                  setStatus(`Prompt ${rowIndex + 1} done.`);
                } else if (data.type === "error") {
                  setStatus(data.error ?? "Error.");
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      } catch (err) {
        setStatus(`Error: ${String(err)}`);
      } finally {
        setGeneratingRow(null);
      }
    },
    [
      createdId,
      generatingRow,
      name,
      prompts,
      rowAspects,
      rowCounts,
      rowProductImages,
    ],
  );

  const canGenerateRow = (rowIndex: number) =>
    prompts[rowIndex].trim().length >= 3 &&
    name.trim().length >= 1 &&
    generatingRow == null;

  const sortedKeys = listAdImageKeysSorted(streamedImages);

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] gap-6">
      <aside className="flex w-full max-w-[460px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lg">
        <div className="flex flex-1 flex-col overflow-y-auto p-5">
          <div className="mb-4 flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="-ml-1 gap-1.5">
              <Link href="/agents/ad-image-generation">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
          </div>

          <div className="mb-5 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-purple-500/10 text-fuchsia-600 dark:text-fuchsia-400">
              <ImageIcon className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Create project
              </h1>
              <p className="text-xs text-muted-foreground">
                Per-prompt controls · generate when ready
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Project name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring campaign"
                className="h-10 rounded-xl border-border/60 bg-muted/25 text-sm shadow-inner"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Prompts
              </label>
              <div className="space-y-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <div
                      className={cn(
                        "overflow-hidden rounded-2xl border border-border/50 shadow-sm transition-shadow",
                        "bg-gradient-to-br from-muted/40 via-card to-muted/20",
                        "dark:from-muted/25 dark:via-card dark:to-muted/15",
                        "ring-1 ring-black/[0.04] dark:ring-white/[0.06]",
                      )}
                    >
                      <div className="relative">
                        <span className="absolute left-3 top-3 z-[1] flex size-5 items-center justify-center rounded-md bg-fuchsia-500/15 text-[10px] font-bold text-fuchsia-700 dark:text-fuchsia-300">
                          {i + 1}
                        </span>
                        <textarea
                          value={prompts[i]}
                          onChange={(e) => setPrompt(i, e.target.value)}
                          placeholder={PROMPT_PLACEHOLDERS[i]}
                          className="min-h-[100px] w-full resize-none rounded-t-2xl border-0 border-b border-border/40 bg-transparent pb-11 pl-10 pr-3 pt-2.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/65 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/25"
                          rows={3}
                        />
                        <div className="flex items-center justify-end gap-2 border-t border-border/35 bg-muted/25 px-2.5 py-2 dark:bg-muted/15">
                          <div
                            className="inline-flex items-center rounded-xl border border-border/45 bg-background/90 p-0.5 shadow-inner dark:bg-background/60"
                            role="group"
                            aria-label={`Image count for prompt ${i + 1}`}
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                disabled={generatingRow !== null}
                                onClick={() => setCount(i, n)}
                                className={cn(
                                  "min-w-[30px] rounded-lg px-2 py-1.5 text-xs font-semibold tabular-nums transition-all",
                                  rowCounts[i] === n
                                    ? "bg-gradient-to-b from-fuchsia-500 to-purple-600 text-white shadow-md shadow-fuchsia-500/25"
                                    : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                                )}
                              >
                                {n}
                              </button>
                            ))}
                          </div>

                          <Select
                            value={rowAspects[i]}
                            onValueChange={(v) =>
                              setAspect(i, v as AdImageAspectRatio)
                            }
                            disabled={generatingRow !== null}
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-9 w-[100px] rounded-xl border-border/50 bg-background/90 text-xs font-semibold shadow-sm dark:bg-background/60"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent align="end" className="rounded-xl">
                              {AD_IMAGE_ASPECT_RATIOS.map((ar) => (
                                <SelectItem key={ar} value={ar} className="text-xs">
                                  {ar}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <div className="flex items-center gap-1.5">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id={`ad-img-product-${i}`}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file?.type.startsWith("image/")) return;
                                const dataUrl = await new Promise<string>(
                                  (resolve) => {
                                    const r = new FileReader();
                                    r.onload = () =>
                                      resolve(r.result as string);
                                    r.readAsDataURL(file);
                                  },
                                );
                                setRowProduct(i, dataUrl);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              title="Product reference for this prompt"
                              disabled={generatingRow !== null}
                              className="h-9 gap-1.5 rounded-xl border-dashed border-border/60 bg-background/80 px-2.5 text-[10px] font-medium shadow-sm"
                              onClick={() =>
                                document
                                  .getElementById(`ad-img-product-${i}`)
                                  ?.click()
                              }
                            >
                              <ImagePlus className="size-3.5 text-fuchsia-600 dark:text-fuchsia-400" />
                              Product
                            </Button>
                            {rowProductImages[i] && (
                              <div className="relative shrink-0">
                                <img
                                  src={rowProductImages[i]!}
                                  alt=""
                                  className="size-9 rounded-lg border border-border object-cover shadow-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => setRowProduct(i, null)}
                                  className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                                >
                                  <X className="size-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 px-5 text-xs font-semibold shadow-md shadow-fuchsia-500/20 hover:from-fuchsia-600 hover:to-purple-700"
                        disabled={!canGenerateRow(i)}
                        onClick={() => handleGenerateRow(i)}
                      >
                        {generatingRow === i ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="size-3.5" />
                        )}
                        Generate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-5">
            <p className="text-center text-xs text-muted-foreground">{status}</p>
          </div>
        </div>
      </aside>

      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Generated images
        </p>
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-auto sm:grid-cols-2">
          {sortedKeys.length === 0 ? (
            <div className="col-span-full flex min-h-[140px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 text-sm text-muted-foreground">
              {generatingRow != null
                ? "Generating…"
                : "Images appear here as each row finishes."}
            </div>
          ) : (
            sortedKeys.map((key) => {
              const src = streamedImages[key];
              const parsed = parseAdImageKey(key);
              const label = parsed
                ? `P${parsed.prompt} · ${parsed.variant}`
                : key;
              return (
                <div
                  key={key}
                  className="relative flex min-h-[140px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
                >
                  <div className="relative flex-1 bg-muted/40">
                    {src ? (
                      <img
                        src={src}
                        alt={label}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full min-h-[140px] items-center justify-center text-muted-foreground">
                        <Loader2 className="size-8 animate-spin" />
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
                      {label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {createdId && (
          <Button asChild className="mt-3 w-full" size="sm" variant="secondary">
            <Link href={`/agents/ad-image-generation/projects/${createdId}`}>
              Open project to edit images
            </Link>
          </Button>
        )}
      </section>
    </div>
  );
}
