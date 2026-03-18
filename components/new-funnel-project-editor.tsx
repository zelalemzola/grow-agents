"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Layers,
  Bot,
  Loader2,
  CheckCircle2,
  Zap,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Code2,
  Eye,
  PenLine,
  GitMerge,
  BarChart3,
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

type CroMode = "copy" | "bridge" | "optimize";

interface CroProject {
  id: string;
  name: string;
  objective: string;
  latest_html: string;
  latest_css: string;
  latest_images: Record<string, unknown> & {
    mode?: CroMode;
    explanation?: unknown;
    report?: { appliedChanges?: string[]; reasoning?: string };
  };
}

interface NewFunnelProjectEditorProps {
  initialProjectId?: string;
}

const consoleBase =
  "rounded-lg font-mono text-xs border shadow-inner overflow-hidden ring-1 ring-black/5 dark:ring-white/5";
const consoleHeader =
  "flex items-center gap-2 px-3 py-2 border-b bg-[#0d1117]/98 text-slate-300 backdrop-blur-sm";
const consoleBody =
  "min-h-[200px] max-h-[50vh] overflow-auto p-4 bg-[#0d1117] text-slate-300";

export function NewFunnelProjectEditor({
  initialProjectId,
}: NewFunnelProjectEditorProps) {
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; objective: string; updated_at: string }>
  >([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId ?? "",
  );
  const [fullProject, setFullProject] = useState<CroProject | null>(null);
  const [projectName, setProjectName] = useState("New CRO Project");
  const [mode, setMode] = useState<CroMode>("copy");

  // Copy mode
  const [existingCopy, setExistingCopy] = useState("");
  const [customerResearch, setCustomerResearch] = useState("");

  // Bridge mode
  const [funnelAHtml, setFunnelAHtml] = useState("");
  const [competitorHtml, setCompetitorHtml] = useState("");
  const [assetsCopy, setAssetsCopy] = useState("");
  const [assetsProduct, setAssetsProduct] = useState("");
  const [assetsTestimonials, setAssetsTestimonials] = useState("");
  const [assetsReviews, setAssetsReviews] = useState("");
  const [assetsTrust, setAssetsTrust] = useState("");

  // Optimize mode
  const [funnelHtml, setFunnelHtml] = useState("");

  // Output
  const [outputCopy, setOutputCopy] = useState("");
  const [outputHtml, setOutputHtml] = useState("");
  const [outputCss, setOutputCss] = useState("");
  const [explanation, setExplanation] = useState<unknown>(null);
  const [outputView, setOutputView] = useState<"code" | "preview">("code");

  const [status, setStatus] = useState("Ready.");
  const [isRunning, setIsRunning] = useState(false);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    fetch("/api/agents/new-funnel/funnels?list=true")
      .then((res) => res.json())
      .then((data) => {
        const loaded = data.funnels ?? [];
        setProjects(loaded);
        if (
          initialProjectId &&
          loaded.some((p: { id: string }) => p.id === initialProjectId)
        ) {
          setSelectedProjectId(initialProjectId);
        } else if (!selectedProjectId && loaded.length > 0) {
          setSelectedProjectId(loaded[0].id);
        }
      })
      .catch((err) => setStatus(`Failed to load projects: ${String(err)}`));
  }, [initialProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setFullProject(null);
      setOutputCopy("");
      setOutputHtml("");
      setOutputCss("");
      setExplanation(null);
      return;
    }

    setStatus("Loading project...");
    fetch(`/api/agents/new-funnel/funnels/${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        const funnel = data.funnel;
        if (funnel) {
          setFullProject(funnel);
          setProjectName(funnel.name);
          const meta = (funnel.latest_images ?? {}) as CroProject["latest_images"];
          if (meta.mode) setMode(meta.mode as CroMode);
          setOutputCopy("");
          setOutputHtml(funnel.latest_html ?? "");
          setOutputCss(funnel.latest_css ?? "");
          setExplanation(meta.explanation ?? meta.report ?? null);
          if (meta.mode === "copy") setOutputCopy(funnel.latest_html ?? "");
        }
      })
      .catch((err) => setStatus(`Failed to load: ${String(err)}`))
      .finally(() => setStatus("Ready."));
  }, [selectedProjectId]);

  const refreshProjects = async (keepId?: string) => {
    const res = await fetch("/api/agents/new-funnel/funnels?list=true");
    const data = await res.json();
    setProjects(data.funnels ?? []);
    if (keepId) setSelectedProjectId(keepId);
  };

  const handleRun = async () => {
    setIsRunning(true);
    setStatus("Running...");

    try {
      let body: Record<string, unknown> = {
        mode,
        projectName: projectName.trim() || undefined,
        projectId: selectedProjectId || undefined,
      };

      if (mode === "copy") {
        if (!existingCopy.trim() || !customerResearch.trim()) {
          setStatus("Enter existing copy and customer research.");
          return;
        }
        body.existingCopy = existingCopy;
        body.customerResearch = customerResearch;
      } else if (mode === "bridge") {
        if (!competitorHtml.trim()) {
          setStatus("Enter reference (competitor) funnel HTML.");
          return;
        }
        body.competitorHtml = competitorHtml;
        body.funnelAHtml = funnelAHtml.trim() || undefined;
        body.assets = {
          copy: assetsCopy.trim() || undefined,
          productDescription: assetsProduct.trim() || undefined,
          testimonials: assetsTestimonials.trim() || undefined,
          reviews: assetsReviews.trim() || undefined,
          trustElements: assetsTrust.trim() || undefined,
        };
      } else {
        if (!funnelHtml.trim()) {
          setStatus("Enter funnel HTML to optimize.");
          return;
        }
        body.funnelHtml = funnelHtml;
      }

      const res = await fetch("/api/agents/new-funnel/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");

      const funnel = data.funnel;
      const result = data.result;

      if (funnel?.id) {
        await refreshProjects(funnel.id);
        setSelectedProjectId(funnel.id);
      }

      if (mode === "copy" && result?.optimizedCopy != null) {
        setOutputCopy(result.optimizedCopy);
        setExplanation(result.explanation ?? null);
      }
      if ((mode === "bridge" || mode === "optimize") && result?.html != null) {
        setOutputHtml(result.html);
        setOutputCss(result.css ?? "");
        setExplanation(result.report ?? result.explanation ?? null);
      }

      setStatus("Done.");
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyOutput = async () => {
    const text = mode === "copy" ? outputCopy : outputHtml;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Copy failed.");
    }
  };

  const handleDownload = () => {
    const text = mode === "copy" ? outputCopy : outputHtml;
    const ext = mode === "copy" ? "txt" : "html";
    const blob = new Blob([text], {
      type: mode === "copy" ? "text/plain" : "text/html",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(projectName || "cro").replace(/\s+/g, "-").toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded.");
  };

  const canRun =
    mode === "copy"
      ? existingCopy.trim().length > 0 && customerResearch.trim().length > 0
      : mode === "bridge"
        ? competitorHtml.trim().length > 0
        : funnelHtml.trim().length > 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      {/* Left: Input */}
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Layers className="size-5" />
              </div>
              <div>
                <h1 className="font-semibold tracking-tight">
                  New Funnel Implementation (CRO Agent)
                </h1>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isRunning ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      {status}
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
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Project name"
                className="pl-9"
              />
            </div>
            <div className="relative sm:col-span-2">
              <FolderOpen className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <select
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">New project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Mode selector */}
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <BarChart3 className="size-4" />
            Mode
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant={mode === "copy" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("copy")}
              className="gap-1.5"
            >
              <PenLine className="size-4" />
              Copy optimization
            </Button>
            <Button
              variant={mode === "bridge" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("bridge")}
              className="gap-1.5"
            >
              <GitMerge className="size-4" />
              Funnel bridge
            </Button>
            <Button
              variant={mode === "optimize" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("optimize")}
              className="gap-1.5"
            >
              <BarChart3 className="size-4" />
              Funnel optimize
            </Button>
          </div>
        </div>

        {/* Mode-specific inputs */}
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
          {mode === "copy" && (
            <>
              <div className={consoleBase}>
                <div className={consoleHeader}>
                  <FileText className="size-4 text-amber-400" />
                  <span>Existing copy</span>
                </div>
                <textarea
                  className={`${consoleBody} w-full resize-none border-0 focus:ring-0`}
                  value={existingCopy}
                  onChange={(e) => setExistingCopy(e.target.value)}
                  placeholder="Paste current funnel copy..."
                  rows={6}
                />
              </div>
              <div className={consoleBase}>
                <div className={consoleHeader}>
                  <Bot className="size-4 text-amber-400" />
                  <span>Customer research</span>
                </div>
                <textarea
                  className={`${consoleBody} w-full resize-none border-0 focus:ring-0`}
                  value={customerResearch}
                  onChange={(e) => setCustomerResearch(e.target.value)}
                  placeholder="Reviews, testimonials, surveys, objections..."
                  rows={6}
                />
              </div>
            </>
          )}

          {mode === "bridge" && (
            <>
              <div className={consoleBase}>
                <div className={consoleHeader}>
                  <Code2 className="size-4 text-amber-400" />
                  <span>Your funnel HTML (optional)</span>
                </div>
                <textarea
                  className={`${consoleBody} w-full resize-none border-0 focus:ring-0`}
                  value={funnelAHtml}
                  onChange={(e) => setFunnelAHtml(e.target.value)}
                  placeholder="Paste your funnel HTML to extract content from..."
                  rows={4}
                />
              </div>
              <div className={consoleBase}>
                <div className={consoleHeader}>
                  <Code2 className="size-4 text-amber-400" />
                  <span>Reference funnel HTML (required)</span>
                </div>
                <textarea
                  className={`${consoleBody} w-full resize-none border-0 focus:ring-0`}
                  value={competitorHtml}
                  onChange={(e) => setCompetitorHtml(e.target.value)}
                  placeholder="Paste competitor/proven funnel HTML to replicate structure..."
                  rows={6}
                />
              </div>
              <div className="rounded-lg border border-border/60 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Assets (optional — inject into structure)</p>
                <Input
                  placeholder="Copy / headlines"
                  value={assetsCopy}
                  onChange={(e) => setAssetsCopy(e.target.value)}
                  className="font-mono text-sm"
                />
                <Input
                  placeholder="Product description"
                  value={assetsProduct}
                  onChange={(e) => setAssetsProduct(e.target.value)}
                  className="font-mono text-sm"
                />
                <Input
                  placeholder="Testimonials"
                  value={assetsTestimonials}
                  onChange={(e) => setAssetsTestimonials(e.target.value)}
                  className="font-mono text-sm"
                />
                <Input
                  placeholder="Reviews"
                  value={assetsReviews}
                  onChange={(e) => setAssetsReviews(e.target.value)}
                  className="font-mono text-sm"
                />
                <Input
                  placeholder="Trust elements"
                  value={assetsTrust}
                  onChange={(e) => setAssetsTrust(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </>
          )}

          {mode === "optimize" && (
            <div className={consoleBase}>
              <div className={consoleHeader}>
                <Code2 className="size-4 text-amber-400" />
                <span>Funnel HTML to optimize</span>
              </div>
              <textarea
                className={`${consoleBody} min-h-[320px] w-full flex-1 resize-none border-0 focus:ring-0`}
                value={funnelHtml}
                onChange={(e) => setFunnelHtml(e.target.value)}
                placeholder="Paste your funnel HTML..."
                spellCheck={false}
              />
            </div>
          )}

          <Button
            onClick={handleRun}
            disabled={!canRun || isRunning}
            className="w-fit gap-2"
          >
            {isRunning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Zap className="size-4" />
            )}
            Run CRO Agent
          </Button>
        </div>
      </section>

      {/* Right: Output */}
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Code2 className="size-4" />
            {mode === "copy" ? "Optimized copy" : "Output HTML"}
          </h2>
          <div className="flex gap-2">
            {mode !== "copy" && (
              <div className="flex rounded-lg border border-border/60 p-0.5">
                <Button
                  variant={outputView === "code" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setOutputView("code")}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Code2 className="size-3.5" />
                  Code
                </Button>
                <Button
                  variant={outputView === "preview" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setOutputView("preview")}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  <Eye className="size-3.5" />
                  Preview
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyOutput}
              disabled={mode === "copy" ? !outputCopy : !outputHtml}
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={mode === "copy" ? !outputCopy : !outputHtml}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden p-5">
          {mode === "copy" ? (
            <>
              <div
                className={`${consoleBase} flex-1 flex flex-col border-amber-500/30`}
              >
                <div className={consoleHeader}>
                  <PenLine className="size-4 text-amber-400" />
                  <span>Optimized copy</span>
                </div>
                <div className={`${consoleBody} flex-1 overflow-auto whitespace-pre-wrap`}>
                  {outputCopy || (
                    <span className="text-slate-500">
                      Run the agent to see optimized copy.
                    </span>
                  )}
                </div>
              </div>
              {explanation != null && (
                <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
                  <p className="font-medium text-foreground">Explanation</p>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted-foreground">
                    {JSON.stringify(explanation, null, 2)}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <>
              {outputView === "code" ? (
                <div
                  className={`${consoleBase} flex-1 flex flex-col border-amber-500/30`}
                >
                  <div className={consoleHeader}>
                    <Code2 className="size-4 text-amber-400" />
                    <span>Output</span>
                  </div>
                  <div className={`${consoleBody} flex-1 overflow-auto font-mono text-xs`}>
                    {outputHtml ? (
                      <div className="min-w-full space-y-0 py-4 pl-4">
                        {outputHtml.split("\n").map((line, i) => (
                          <div key={i} className="flex leading-[1.5]">
                            <span className="flex-shrink-0 w-9 pr-3 text-right text-slate-500 select-none">
                              {i + 1}
                            </span>
                            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-300">
                              {line === "" ? "\u00A0" : line}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="p-4 text-slate-500">
                        Run the agent to see output HTML.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className={`${consoleBase} flex-1 flex flex-col border-amber-500/30 overflow-hidden`}>
                  <div className={consoleHeader}>
                    <Eye className="size-4 text-amber-400" />
                    <span>Preview</span>
                  </div>
                  <div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 p-3">
                    <iframe
                      title="cro-preview"
                      className="h-full min-h-[400px] w-full rounded border border-border/60"
                      sandbox="allow-same-origin allow-scripts"
                      srcDoc={
                        outputHtml
                          ? outputHtml.startsWith("<!DOCTYPE") ||
                              outputHtml.trimStart().startsWith("<html")
                            ? outputHtml
                            : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${outputCss}</style></head><body>${outputHtml}</body></html>`
                          : ""
                      }
                    />
                  </div>
                </div>
              )}
              {explanation != null && (
                <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
                  <p className="font-medium text-foreground">Report</p>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted-foreground">
                    {JSON.stringify(explanation, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border/60 px-5 py-2">
          <Link
            href="/agents/new-funnel/projects"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all projects
          </Link>
        </div>
      </section>
    </div>
  );
}
