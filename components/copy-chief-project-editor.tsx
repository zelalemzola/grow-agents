"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  PenLine,
  Bot,
  Loader2,
  CheckCircle2,
  Zap,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Package,
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

type CopyType =
  | "advertorial"
  | "offer"
  | "upsell"
  | "listicle"
  | "thankYou";

interface CopyChiefProject {
  id: string;
  name: string;
  objective: string;
  latest_html: string;
  latest_images: Record<string, unknown> & {
    copyType?: CopyType;
    customerResearch?: string;
    productInformation?: string;
    researchReport?: {
      insightsApplied: string[];
      objectionsAddressed: string[];
      reasoning: string;
    };
    structuredCopy?: unknown;
  };
}

interface CopyChiefProjectEditorProps {
  initialProjectId?: string;
}

const consoleBase =
  "rounded-lg font-mono text-xs border shadow-inner overflow-hidden ring-1 ring-black/5 dark:ring-white/5";
const consoleHeader =
  "flex items-center gap-2 px-3 py-2 border-b bg-[#0d1117]/98 text-slate-300 backdrop-blur-sm";
const consoleBody =
  "min-h-[200px] max-h-[50vh] overflow-auto p-4 bg-[#0d1117] text-slate-300";

const COPY_TYPES: { value: CopyType; label: string }[] = [
  { value: "advertorial", label: "Advertorial" },
  { value: "offer", label: "Offer Page" },
  { value: "upsell", label: "Upsell Page" },
  { value: "listicle", label: "Listicle" },
  { value: "thankYou", label: "Thank You Page" },
];

export function CopyChiefProjectEditor({
  initialProjectId,
}: CopyChiefProjectEditorProps) {
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; objective: string; updated_at: string }>
  >([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId ?? "",
  );
  const [fullProject, setFullProject] = useState<CopyChiefProject | null>(null);
  const [projectName, setProjectName] = useState("New Copy Project");
  const [customerResearch, setCustomerResearch] = useState("");
  const [productInformation, setProductInformation] = useState("");
  const [copyType, setCopyType] = useState<CopyType>("offer");
  const [outputCopy, setOutputCopy] = useState("");
  const [researchReport, setResearchReport] = useState<{
    insightsApplied: string[];
    objectionsAddressed: string[];
    reasoning: string;
  } | null>(null);
  const [status, setStatus] = useState("Ready.");
  const [isRunning, setIsRunning] = useState(false);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    fetch("/api/agents/copy-chief/funnels?list=true")
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
      setResearchReport(null);
      return;
    }

    setStatus("Loading project...");
    fetch(`/api/agents/copy-chief/funnels/${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        const funnel = data.funnel;
        if (funnel) {
          setFullProject(funnel);
          setProjectName(funnel.name);
          setOutputCopy(funnel.latest_html ?? "");
          const meta = (funnel.latest_images ?? {}) as CopyChiefProject["latest_images"];
          setResearchReport(meta.researchReport ?? null);
          if (meta.copyType) setCopyType(meta.copyType);
          if (meta.customerResearch) setCustomerResearch(meta.customerResearch);
          if (meta.productInformation) setProductInformation(meta.productInformation);
        }
      })
      .catch((err) => setStatus(`Failed to load: ${String(err)}`))
      .finally(() => setStatus("Ready."));
  }, [selectedProjectId]);

  const refreshProjects = async (keepId?: string) => {
    const res = await fetch("/api/agents/copy-chief/funnels?list=true");
    const data = await res.json();
    setProjects(data.funnels ?? []);
    if (keepId) setSelectedProjectId(keepId);
  };

  const handleRun = async () => {
    if (!customerResearch.trim() || !productInformation.trim()) {
      setStatus("Enter customer research and product information.");
      return;
    }
    setIsRunning(true);
    setStatus("Generating copy...");

    try {
      const res = await fetch("/api/agents/copy-chief/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerResearch,
          productInformation,
          copyType,
          projectName: projectName.trim() || undefined,
          projectId: selectedProjectId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");

      const funnel = data.funnel;
      const result = data.result;

      if (funnel?.id) {
        await refreshProjects(funnel.id);
        setSelectedProjectId(funnel.id);
      }

      setOutputCopy(result.fullCopyText ?? "");
      setResearchReport(result.researchReport ?? null);
      setStatus("Done.");
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyOutput = async () => {
    try {
      await navigator.clipboard.writeText(outputCopy);
      setStatus("Copied to clipboard.");
    } catch {
      setStatus("Copy failed.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([outputCopy], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(projectName || "copy-chief").replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded.");
  };

  const canRun =
    customerResearch.trim().length > 0 && productInformation.trim().length > 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      {/* Left: Input */}
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-400">
                <PenLine className="size-5" />
              </div>
              <div>
                <h1 className="font-semibold tracking-tight">
                  Copy Chief — Direct Response Copy
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
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Copy type
              </label>
              <Select
                value={copyType}
                onValueChange={(v) => setCopyType(v as CopyType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COPY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
          <div className={consoleBase}>
            <div className={consoleHeader}>
              <Bot className="size-4 text-rose-400" />
              <span>Customer research</span>
            </div>
            <textarea
              className={`${consoleBody} w-full resize-none border-0 focus:ring-0`}
              value={customerResearch}
              onChange={(e) => setCustomerResearch(e.target.value)}
              placeholder="Reviews, testimonials, surveys, objections, forum posts, interviews..."
              rows={6}
            />
          </div>
          <div className={consoleBase}>
            <div className={consoleHeader}>
              <Package className="size-4 text-rose-400" />
              <span>Product information</span>
            </div>
            <textarea
              className={`${consoleBody} w-full resize-none border-0 focus:ring-0`}
              value={productInformation}
              onChange={(e) => setProductInformation(e.target.value)}
              placeholder="Product description, ingredients, mechanism, benefits, proof, testimonials..."
              rows={6}
            />
          </div>

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
            Generate Copy
          </Button>
        </div>
      </section>

      {/* Right: Output */}
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <PenLine className="size-4" />
            Generated copy
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyOutput}
              disabled={!outputCopy}
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!outputCopy}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden p-5">
          <div
            className={`${consoleBase} flex flex-1 flex-col border-rose-500/30`}
          >
            <div className={consoleHeader}>
              <PenLine className="size-4 text-rose-400" />
              <span>Copy</span>
            </div>
            <div
              className={`${consoleBody} flex-1 overflow-auto whitespace-pre-wrap`}
            >
              {outputCopy || (
                <span className="text-slate-500">
                  Run the agent to see generated copy.
                </span>
              )}
            </div>
          </div>
          {researchReport != null && (
            <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
              <p className="font-medium text-foreground">
                Research integration report
              </p>
              <div className="mt-2 space-y-2">
                {researchReport.insightsApplied?.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Insights applied:</span>
                    <ul className="mt-1 list-inside list-disc text-muted-foreground">
                      {researchReport.insightsApplied.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {researchReport.objectionsAddressed?.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Objections addressed:</span>
                    <ul className="mt-1 list-inside list-disc text-muted-foreground">
                      {researchReport.objectionsAddressed.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {researchReport.reasoning && (
                  <p className="text-muted-foreground">
                    <span className="font-medium">Reasoning:</span>{" "}
                    {researchReport.reasoning}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/60 px-5 py-2">
          <Link
            href="/agents/copy-chief/projects"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all projects
          </Link>
        </div>
      </section>
    </div>
  );
}
