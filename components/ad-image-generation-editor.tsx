"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import {
  ImageIcon,
  ImagePlus,
  Loader2,
  Zap,
  X,
  ArrowLeft,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PROMPT_PLACEHOLDERS = [
  "e.g. Woman in kitchen, morning light, holding supplement bottle",
  "e.g. Before/after split, authentic results, soft lighting",
  "e.g. Doctor in lab coat recommending product, clinical setting",
  "e.g. Happy customer selfie with product, natural smile",
  "e.g. Product on table, editorial flat lay, neutral background",
];

export function AdImageGenerationEditor() {
  const router = useRouter();
  const [name, setName] = useState("Ad Image Project");
  const [prompts, setPrompts] = useState<[string, string, string, string, string]>([
    "",
    "",
    "",
    "",
    "",
  ]);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [status, setStatus] = useState("Enter 5 prompts, then Generate.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedImages, setStreamedImages] = useState<Record<string, string>>({});
  const [createdId, setCreatedId] = useState<string | null>(null);

  const setPrompt = (index: number, value: string) => {
    const next = [...prompts] as [string, string, string, string, string];
    next[index] = value;
    setPrompts(next);
  };

  const allFilled = prompts.every((p) => p.trim().length >= 3);
  const canGenerate = allFilled && name.trim().length >= 1 && !isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    setIsGenerating(true);
    setStatus("Starting…");
    setCreatedId(null);
    setStreamedImages({});

    try {
      const res = await fetch("/api/agents/ad-image-generation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          prompts: prompts.map((p) => p.trim()),
          productImage: productImage || undefined,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setStatus(data?.error ?? "Generation failed.");
        setIsGenerating(false);
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
                index?: number;
                dataUrl?: string;
                funnel?: { id: string; latest_images?: Record<string, string> };
                error?: string;
              };
              if (data.type === "image" && data.index != null && data.dataUrl) {
                const url = data.dataUrl;
                setStreamedImages((prev) => {
                  const next: Record<string, string> = { ...prev };
                  next[String(data.index)] = url;
                  return next;
                });
                setStatus(`Image ${data.index} of 5 ready.`);
              } else if (data.type === "done" && data.funnel?.id) {
                setCreatedId(data.funnel.id);
                if (data.funnel.latest_images) {
                  setStreamedImages(data.funnel.latest_images);
                }
                setStatus("All 5 images ready.");
                router.push(
                  `/agents/ad-image-generation/projects/${data.funnel.id}`,
                );
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
      setIsGenerating(false);
    }
  }, [canGenerate, name, prompts, productImage, router]);

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[600px] gap-6">
      {/* Left: form — sticky, scrollable, modern */}
      <aside className="flex w-full max-w-[420px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lg">
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
                5 prompts → 5 images
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
                className="h-9 rounded-lg border-border/80 bg-muted/30 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Prompts
              </label>
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="group relative">
                    <span className="absolute left-2.5 top-2 text-[10px] font-medium text-muted-foreground/80">
                      {i + 1}
                    </span>
                    <textarea
                      value={prompts[i]}
                      onChange={(e) => setPrompt(i, e.target.value)}
                      placeholder={PROMPT_PLACEHOLDERS[i]}
                      className="min-h-[72px] w-full resize-none rounded-lg border border-border/80 bg-muted/30 py-2 pl-6 pr-2.5 text-xs placeholder:text-muted-foreground/70 focus:border-fuchsia-500/50 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/30"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Product reference (optional)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="ad-image-product-upload"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file?.type.startsWith("image/")) return;
                    const dataUrl = await new Promise<string>((resolve) => {
                      const r = new FileReader();
                      r.onload = () => resolve(r.result as string);
                      r.readAsDataURL(file);
                    });
                    setProductImage(dataUrl);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 rounded-lg text-xs"
                  onClick={() =>
                    document.getElementById("ad-image-product-upload")?.click()
                  }
                >
                  <ImagePlus className="size-3.5" />
                  Add image
                </Button>
                {productImage && (
                  <div className="relative">
                    <img
                      src={productImage}
                      alt="Product"
                      className="h-12 w-12 rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setProductImage(null)}
                      className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                    >
                      <X className="size-2.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-5">
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 py-6 text-sm font-medium shadow-md hover:from-fuchsia-600 hover:to-purple-700"
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isGenerating ? "Generating…" : "Generate 5 images"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {status}
            </p>
          </div>
        </div>
      </aside>

      {/* Right: image slots — stream one by one */}
      <section className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/20 p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Generated images
        </p>
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-auto sm:grid-cols-2">
          {["1", "2", "3", "4", "5"].map((key) => {
            const src = streamedImages[key];
            return (
              <div
                key={key}
                className="relative flex min-h-[140px] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm"
              >
                <div className="relative flex-1 bg-muted/40">
                  {src ? (
                    <img
                      src={src}
                      alt={`Image ${key}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full min-h-[140px] items-center justify-center text-muted-foreground">
                      {isGenerating ? (
                        <Loader2 className="size-8 animate-spin" />
                      ) : (
                        <span className="text-xs">Image {key}</span>
                      )}
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
                    {key}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {createdId && (
          <Button asChild className="mt-3 w-full" size="sm">
            <Link href={`/agents/ad-image-generation/projects/${createdId}`}>
              Open project to edit images
            </Link>
          </Button>
        )}
      </section>
    </div>
  );
}
