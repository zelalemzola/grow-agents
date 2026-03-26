"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  Loader2,
  CheckCircle2,
  Zap,
  Copy,
  Download,
  FileText,
  FolderOpen,
  ScrollText,
  ListChecks,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ChangeLogItem = {
  section: string;
  before: string;
  after: string;
  reason: string;
  policyInstruction: string;
};

interface PolicyProject {
  id: string;
  name: string;
  objective: string;
  latest_html: string;
  latest_images: {
    policyInstructions?: string;
    strictMode?: boolean;
    changeLog?: ChangeLogItem[];
    chunkCount?: number;
    skippedChunks?: number[];
    retriedChunks?: number[];
  };
}

interface PolicyChangesProjectEditorProps {
  initialProjectId?: string;
}

const consoleBase =
  "rounded-lg font-mono text-xs border shadow-inner overflow-hidden ring-1 ring-black/5 dark:ring-white/5";
const consoleHeader =
  "flex items-center gap-2 px-3 py-2 border-b bg-[#0d1117]/98 text-slate-300 backdrop-blur-sm";
const consoleBody =
  "min-h-[200px] max-h-[50vh] overflow-auto p-4 bg-[#0d1117] text-slate-300";

export function PolicyChangesProjectEditor({
  initialProjectId,
}: PolicyChangesProjectEditorProps) {
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; objective: string; updated_at: string }>
  >([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId ?? "",
  );
  const [projectName, setProjectName] = useState("Policy Compliance Project");
  const [htmlInput, setHtmlInput] = useState("");
  const [policyInstructions, setPolicyInstructions] = useState("");
  const [strictMode, setStrictMode] = useState(true);
  const [outputHtml, setOutputHtml] = useState("");
  const [changeLog, setChangeLog] = useState<ChangeLogItem[]>([]);
  const [chunkCount, setChunkCount] = useState<number | null>(null);
  const [skippedChunks, setSkippedChunks] = useState<number[]>([]);
  const [retriedChunks, setRetriedChunks] = useState<number[]>([]);
  const [status, setStatus] = useState("Ready.");
  const [isRunning, setIsRunning] = useState(false);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    fetch("/api/agents/policy-changes/funnels?list=true")
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
  }, [initialProjectId, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setOutputHtml("");
      setChangeLog([]);
      setChunkCount(null);
      setSkippedChunks([]);
      setRetriedChunks([]);
      return;
    }

    setStatus("Loading project...");
    fetch(`/api/agents/policy-changes/funnels/${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        const funnel = data.funnel as PolicyProject | undefined;
        if (!funnel) return;
        setProjectName(funnel.name);
        setHtmlInput(funnel.latest_html ?? "");
        setOutputHtml(funnel.latest_html ?? "");
        const meta = funnel.latest_images ?? {};
        setPolicyInstructions(meta.policyInstructions ?? "");
        setStrictMode(meta.strictMode ?? true);
        setChangeLog(meta.changeLog ?? []);
        setChunkCount(meta.chunkCount ?? null);
        setSkippedChunks(meta.skippedChunks ?? []);
        setRetriedChunks(meta.retriedChunks ?? []);
      })
      .catch((err) => setStatus(`Failed to load: ${String(err)}`))
      .finally(() => setStatus("Ready."));
  }, [selectedProjectId]);

  const refreshProjects = async (keepId?: string) => {
    const res = await fetch("/api/agents/policy-changes/funnels?list=true");
    const data = await res.json();
    setProjects(data.funnels ?? []);
    if (keepId) setSelectedProjectId(keepId);
  };

  const handleRun = async () => {
    if (!htmlInput.trim() || !policyInstructions.trim()) {
      setStatus("Enter full HTML and policy instructions.");
      return;
    }
    setIsRunning(true);
    setStatus("Scanning and applying compliance edits...");

    try {
      const res = await fetch("/api/agents/policy-changes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: htmlInput,
          policyInstructions,
          strictMode,
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
      }

      setOutputHtml(result.html ?? "");
      setHtmlInput(result.html ?? "");
      setChangeLog(result.changeLog ?? []);
      setChunkCount(result.chunkCount ?? null);
      setSkippedChunks(result.skippedChunks ?? []);
      setRetriedChunks(result.retriedChunks ?? []);
      setStatus("Done.");
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyOutput = async () => {
    try {
      await navigator.clipboard.writeText(outputHtml);
      setStatus("Copied HTML to clipboard.");
    } catch {
      setStatus("Copy failed.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([outputHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(projectName || "policy-changes").replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded.");
  };

  const canRun = htmlInput.trim().length > 0 && policyInstructions.trim().length > 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Shield className="size-5" />
              </div>
              <div>
                <h1 className="font-semibold tracking-tight">
                  Policy Changes Agent
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
            <label className="sm:col-span-2 flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2 text-sm">
              <span className="font-medium text-foreground">Strict mode</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={strictMode}
                  onChange={(e) => setStrictMode(e.target.checked)}
                  className="h-4 w-4 accent-emerald-600"
                />
                Minimal wording drift
              </span>
            </label>
          </div>
          {currentProject && (
            <p className="mt-3 text-xs text-muted-foreground">
              Loaded project: <span className="font-medium">{currentProject.name}</span>
            </p>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
          <div className={consoleBase}>
            <div className={consoleHeader}>
              <ScrollText className="size-4 text-emerald-400" />
              <span>Policy instructions</span>
            </div>
            <textarea
              className={`${consoleBody} w-full resize-none border-0 focus:ring-0`}
              value={policyInstructions}
              onChange={(e) => setPolicyInstructions(e.target.value)}
              placeholder="Paste ad platform policy change instructions..."
              rows={6}
            />
          </div>
          <div className={consoleBase}>
            <div className={consoleHeader}>
              <FileText className="size-4 text-emerald-400" />
              <span>Full HTML input</span>
            </div>
            <textarea
              className={`${consoleBody} w-full resize-none border-0 focus:ring-0`}
              value={htmlInput}
              onChange={(e) => setHtmlInput(e.target.value)}
              placeholder="Paste full landing page or advertorial HTML..."
              rows={12}
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
            Apply Policy Changes
          </Button>
        </div>
      </section>

      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Shield className="size-4" />
            Compliant HTML output
          </h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyOutput}
              disabled={!outputHtml}
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!outputHtml}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden p-5">
          <div className={`${consoleBase} flex flex-1 flex-col border-emerald-500/30`}>
            <div className={consoleHeader}>
              <FileText className="size-4 text-emerald-400" />
              <span>Edited HTML</span>
            </div>
            <div className={`${consoleBody} flex-1 overflow-auto whitespace-pre-wrap`}>
              {outputHtml || (
                <span className="text-slate-500">
                  Run the agent to generate compliant HTML.
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
            <p className="font-medium text-foreground">Run diagnostics</p>
            <p className="mt-1 text-muted-foreground">
              Chunks processed: {chunkCount ?? 0}
              {skippedChunks.length > 0
                ? ` — skipped due to structure mismatch: ${skippedChunks.join(", ")}`
                : " — no structure mismatches"}
            </p>
            <p className="mt-1 text-muted-foreground">
              Retries used: {retriedChunks.length}
              {retriedChunks.length > 0
                ? ` (chunks: ${retriedChunks.join(", ")})`
                : ""}
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <ListChecks className="size-4" />
              Change log ({changeLog.length})
            </p>
            {changeLog.length === 0 ? (
              <p className="mt-2 text-muted-foreground">
                No policy edits logged for this run.
              </p>
            ) : (
              <div className="mt-3 max-h-64 space-y-3 overflow-auto">
                {changeLog.map((item, i) => (
                  <div key={`${item.section}-${i}`} className="rounded-md border border-border/60 bg-background/60 p-3">
                    <p className="text-xs font-medium text-foreground">{item.section}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">Policy:</span> {item.policyInstruction}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">Reason:</span> {item.reason}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium">Before:</span> {item.before}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">After:</span> {item.after}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border/60 px-5 py-2">
          <Link
            href="/agents/policy-changes/projects"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all projects
          </Link>
        </div>
      </section>
    </div>
  );
}
