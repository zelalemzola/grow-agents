"use client";

import JSZip from "jszip";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  MessageSquare,
  Bot,
  Download,
  Save,
  RotateCcw,
  Code2,
  Palette,
  Eye,
  History,
  FileText,
  FolderOpen,
  BookOpen,
  Loader2,
  CheckCircle2,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPreviewSrcDoc, injectImagesIntoHtml } from "@/lib/funnel-preview";
import { readUiMessageSseStream, UiStreamChunk } from "@/lib/read-ui-stream";
import {
  FunnelRecord,
  FunnelVersionRecord,
  TemplateRecord,
} from "@/lib/types";

type CodeTab = "html" | "css";
type GenerationStreamEvent = {
  type:
    | "status"
    | "reasoning"
    | "step"
    | "warning"
    | "error"
    | "done"
    | "html-stream"
    | "css-stream";
  message?: string;
  payload?: Record<string, unknown>;
};

export function CopyInjectionProjectEditor({
  initialProjectId,
}: {
  initialProjectId?: string;
}) {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [projects, setProjects] = useState<FunnelRecord[]>([]);
  const [versions, setVersions] = useState<FunnelVersionRecord[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? "");

  const [funnelName, setFunnelName] = useState("New Conversion Funnel");
  const [objective, setObjective] = useState("");
  const [campaignContext, setCampaignContext] = useState("");
  const [editComment, setEditComment] = useState("");
  const [manualSaveNote, setManualSaveNote] = useState("");

  const [activeCodeTab, setActiveCodeTab] = useState<CodeTab>("html");
  const [htmlDraft, setHtmlDraft] = useState("");
  const [cssDraft, setCssDraft] = useState("");
  const [imagesDraft, setImagesDraft] = useState<Record<string, string>>({});

  const [status, setStatus] = useState("Ready.");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [generationTrace, setGenerationTrace] = useState<string[]>([]);

  const htmlTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cssTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingHighlightRef = useRef<{
    type: "html" | "css";
    startIndex: number;
    endIndex: number;
  } | null>(null);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    void Promise.all([
      fetch("/api/agents/copy-injection/templates")
        .then((res) => res.json())
        .then((data) => setTemplates((data.templates ?? []) as TemplateRecord[])),
      fetch("/api/agents/copy-injection/funnels")
        .then((res) => res.json())
        .then((data) => {
          const loaded = (data.funnels ?? []) as FunnelRecord[];
          setProjects(loaded);

          if (!selectedProjectId && loaded.length > 0) {
            const nextId = initialProjectId && loaded.some((p) => p.id === initialProjectId)
              ? initialProjectId
              : loaded[0].id;
            setSelectedProjectId(nextId);
          }
        }),
    ]).catch((error) => {
      setStatus(`Failed to load workspace: ${String(error)}`);
    });
  }, [initialProjectId, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setVersions([]);
      return;
    }

    fetch(`/api/agents/copy-injection/funnels/${selectedProjectId}/versions`)
      .then((res) => res.json())
      .then((data) => {
        setVersions((data.versions ?? []) as FunnelVersionRecord[]);
      })
      .catch((error) => {
        setStatus(`Failed to load versions: ${String(error)}`);
      });
  }, [selectedProjectId]);

  useEffect(() => {
    if (!currentProject) {
      return;
    }

    setHtmlDraft(currentProject.latest_html);
    setCssDraft(currentProject.latest_css);
    setImagesDraft((currentProject.latest_images ?? {}) as Record<string, string>);
  }, [currentProject]);

  useEffect(() => {
    const pending = pendingHighlightRef.current;
    if (!pending) return;

    const apply = () => {
      const el =
        pending.type === "html"
          ? htmlTextareaRef.current
          : cssTextareaRef.current;
      if (!el) return;

      const { startIndex, endIndex } = pending;
      const len = el.value.length;
      const safeStart = Math.max(0, Math.min(startIndex, len));
      const safeEnd = Math.max(safeStart, Math.min(endIndex, len));

      el.focus();
      el.setSelectionRange(safeStart, safeEnd);
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });

      pendingHighlightRef.current = null;
      setTimeout(() => el.setSelectionRange(safeStart, safeEnd), 100);
    };

    const t = requestAnimationFrame(() => {
      requestAnimationFrame(apply);
    });
    return () => cancelAnimationFrame(t);
  }, [activeCodeTab, htmlDraft, cssDraft]);

  const refreshProjects = async (keepProjectId?: string) => {
    const response = await fetch("/api/agents/copy-injection/funnels");
    const data = await response.json();
    const loaded = (data.funnels ?? []) as FunnelRecord[];
    setProjects(loaded);

    if (keepProjectId && loaded.some((project) => project.id === keepProjectId)) {
      setSelectedProjectId(keepProjectId);
    }
  };

  const refreshVersions = async (projectId: string) => {
    const response = await fetch(`/api/agents/copy-injection/funnels/${projectId}/versions`);
    const data = await response.json();
    setVersions((data.versions ?? []) as FunnelVersionRecord[]);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStatus("Generating new project...");
    setGenerationTrace([]);
    setHtmlDraft("");
    setCssDraft("");
    setImagesDraft({});

    try {
      const response = await fetch("/api/agents/copy-injection/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          funnelName,
          objective,
          campaignContext,
          templateId: selectedTemplateId || undefined,
          stream: true,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Generation failed.");
        }

        const project = data.funnel as FunnelRecord;
        await refreshProjects(project.id);
        await refreshVersions(project.id);
        setSelectedProjectId(project.id);
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === project.id);
          if (exists) return prev.map((p) => (p.id === project.id ? project : p));
          return [project, ...prev];
        });
        setHtmlDraft(project.latest_html ?? "");
        setCssDraft(project.latest_css ?? "");
        setImagesDraft((project.latest_images ?? {}) as Record<string, string>);
        setEditComment("");
        setStatus("Project generated successfully.");
        return;
      }

      type GenerationResult = { funnel: FunnelRecord };
      let finalData: GenerationResult | null = null;
      let streamError: string | null = null;

      await readUiMessageSseStream(response, (chunk: UiStreamChunk) => {
        if (chunk.type === "data-generation-event") {
          const event = chunk.data as GenerationStreamEvent;
          if (event.type === "error") {
            streamError = event.message ?? "Unknown error";
            setStatus(`Generation failed: ${streamError}`);
            return;
          }

          if (event.type === "html-stream" && event.payload?.value != null) {
            setHtmlDraft(String(event.payload.value));
            return;
          }
          if (event.type === "css-stream" && event.payload?.value != null) {
            setCssDraft(String(event.payload.value));
            return;
          }

          if (event.type !== "done" && event.message) {
            setGenerationTrace((previous) => [
              ...previous,
              `${event.type.toUpperCase()}: ${event.message}`,
            ]);
            setStatus(event.message);
          }
          return;
        }

        if (chunk.type === "data-generation-result" && chunk.data) {
          finalData = chunk.data as GenerationResult;
          setStatus("Project generated successfully.");
        }
      });

      if (streamError) {
        throw new Error(streamError);
      }

      const result = finalData as GenerationResult | null;
      const project: FunnelRecord | undefined = result?.funnel;
      if (!project) {
        throw new Error("Generation stream ended without final payload.");
      }

      await refreshProjects(project.id);
      await refreshVersions(project.id);
      setSelectedProjectId(project.id);
      setProjects((prev) => {
        const exists = prev.some((p) => p.id === project.id);
        if (exists) return prev.map((p) => (p.id === project.id ? project : p));
        return [project, ...prev];
      });
      setHtmlDraft(project.latest_html ?? "");
      setCssDraft(project.latest_css ?? "");
      setImagesDraft((project.latest_images ?? {}) as Record<string, string>);
      setEditComment("");
    } catch (error) {
      setStatus(`Generation failed: ${String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAiEdit = async () => {
    if (!selectedProjectId) {
      setStatus("Select a project first.");
      return;
    }

    setIsAiEditing(true);
    setStatus("Applying targeted AI edit...");

    try {
      const response = await fetch("/api/agents/copy-injection/edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          funnelId: selectedProjectId,
          editComment,
          currentHtml: htmlDraft || undefined,
          currentCss: cssDraft || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "AI edit failed.");
      }

      const updated = data.funnel as FunnelRecord;
      const editedRegions = data.editedRegions as
        | Array<{ type: "html" | "css"; startIndex: number; endIndex: number }>
        | undefined;

      setHtmlDraft(updated.latest_html ?? "");
      setCssDraft(updated.latest_css ?? "");
      setImagesDraft((updated.latest_images ?? {}) as Record<string, string>);

      if (editedRegions?.length) {
        const first = editedRegions[0];
        setActiveCodeTab(first.type);
        pendingHighlightRef.current = first;
      }

      await refreshProjects(updated.id);
      await refreshVersions(updated.id);
      setStatus("AI edit applied.");
    } catch (error) {
      setStatus(`AI edit failed: ${String(error)}`);
    } finally {
      setIsAiEditing(false);
    }
  };

  const handleSaveManual = async () => {
    if (!selectedProjectId) {
      setStatus("Select a project first.");
      return;
    }

    setIsSavingManual(true);
    setStatus("Saving manual code edits...");

    try {
      const response = await fetch(
        `/api/agents/copy-injection/funnels/${selectedProjectId}/manual-save`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            html: htmlDraft,
            css: cssDraft,
            note: manualSaveNote || undefined,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Manual save failed.");
      }

      await refreshProjects(selectedProjectId);
      await refreshVersions(selectedProjectId);
      setStatus("Manual code edit saved as a new version.");
    } catch (error) {
      setStatus(`Manual save failed: ${String(error)}`);
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    if (!selectedProjectId) {
      return;
    }

    setIsRestoring(true);
    setStatus("Restoring selected version...");

    try {
      const response = await fetch(
        `/api/agents/copy-injection/funnels/${selectedProjectId}/restore`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ versionId }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Restore failed.");
      }

      await refreshProjects(selectedProjectId);
      await refreshVersions(selectedProjectId);
      setStatus("Version restored. You can continue editing from this point.");
    } catch (error) {
      setStatus(`Restore failed: ${String(error)}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!selectedProjectId) {
      setStatus("Select a project first.");
      return;
    }

    const zip = new JSZip();
    const htmlWithImages = injectImagesIntoHtml(htmlDraft, imagesDraft);
    const standaloneHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
${htmlWithImages}
  </body>
</html>`;

    zip.file("index.html", standaloneHtml);
    zip.file("styles.css", cssDraft);

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(currentProject?.name ?? "funnel-project").replace(/\s+/g, "-").toLowerCase()}.zip`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus("Downloaded ZIP with index.html and styles.css.");
  };

  const preview = createPreviewSrcDoc(htmlDraft, cssDraft, imagesDraft);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        {/* Header */}
        <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h1 className="font-semibold tracking-tight">Project Builder</h1>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isGenerating ? (
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
                value={funnelName}
                onChange={(event) => setFunnelName(event.target.value)}
                placeholder="Project name"
                className="pl-9"
              />
            </div>
            <div className="relative">
              <FolderOpen className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <select
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedProjectId}
                onChange={(event) => setSelectedProjectId(event.target.value)}
              >
                <option value="">No project selected</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Prompting Panel */}
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageSquare className="size-4" />
            Prompting Panel
          </h2>
          <textarea
            className="mt-3 min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="Describe the funnel objective and offer..."
          />
          <textarea
            className="mt-3 min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={campaignContext}
            onChange={(event) => setCampaignContext(event.target.value)}
            placeholder="Audience, angle, objections, policy constraints..."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className="h-9 flex-1 min-w-[140px] rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">No template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || objective.trim().length < 12}
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              {isGenerating ? "Generating..." : "Generate"}
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/agents/copy-injection/templates">
                <BookOpen className="size-4" />
                Train Templates
              </Link>
            </Button>
          </div>
          {generationTrace.length > 0 ? (
            <div className="mt-3 max-h-36 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              <p className="mb-1.5 font-medium text-foreground/80">Generation trace</p>
              {generationTrace.map((line, index) => (
                <p key={`${line}-${index}`} className="flex items-center gap-2 py-0.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-primary/50" />
                  {line}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        {/* AI Edit */}
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Bot className="size-4" />
            AI Edit + Version Control
          </h2>
          <textarea
            className="mt-3 min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={editComment}
            onChange={(event) => setEditComment(event.target.value)}
            placeholder="Tell AI exactly what to edit. Example: only rewrite hero headline and subheadline."
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={handleAiEdit}
              disabled={isAiEditing || !selectedProjectId || editComment.trim().length < 4}
              className="gap-2"
            >
              {isAiEditing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isAiEditing ? "Applying..." : "Apply AI Edit"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadZip}
              disabled={!selectedProjectId}
              className="gap-2"
            >
              <Download className="size-4" />
              Download ZIP
            </Button>
          </div>
        </div>

        {/* Code Editor */}
        <div className="flex flex-1 flex-col overflow-hidden p-5">
          <div className="flex h-full flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-border/60 p-0.5">
                <Button
                  variant={activeCodeTab === "html" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveCodeTab("html")}
                  className="gap-1.5"
                >
                  <Code2 className="size-4" />
                  HTML
                </Button>
                <Button
                  variant={activeCodeTab === "css" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveCodeTab("css")}
                  className="gap-1.5"
                >
                  <Palette className="size-4" />
                  CSS
                </Button>
              </div>
              <Input
                value={manualSaveNote}
                onChange={(event) => setManualSaveNote(event.target.value)}
                placeholder="Save note (optional)"
                className="h-8 max-w-[180px] text-xs"
              />
              <Button
                onClick={handleSaveManual}
                disabled={isSavingManual || !selectedProjectId}
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                {isSavingManual ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {isSavingManual ? "Saving..." : "Save Version"}
              </Button>
            </div>

            {activeCodeTab === "html" ? (
              <textarea
                ref={htmlTextareaRef}
                className="h-full min-h-[320px] w-full flex-1 rounded-lg border border-input bg-[#0d1117] p-4 font-mono text-xs text-slate-300 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={htmlDraft}
                onChange={(event) => setHtmlDraft(event.target.value)}
                spellCheck={false}
              />
            ) : (
              <textarea
                ref={cssTextareaRef}
                className="h-full min-h-[320px] w-full flex-1 rounded-lg border border-input bg-[#0d1117] p-4 font-mono text-xs text-slate-300 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                value={cssDraft}
                onChange={(event) => setCssDraft(event.target.value)}
                spellCheck={false}
              />
            )}

            <div className="max-h-40 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <History className="size-4" />
                Version History
              </p>
              <div className="space-y-2">
                {versions.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No versions yet
                  </p>
                ) : (
                  versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-background/60 p-2.5 transition-colors hover:bg-muted/40"
                    >
                      <p className="line-clamp-2 flex-1 text-xs text-muted-foreground">
                        {version.user_instruction}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isRestoring || !selectedProjectId}
                        onClick={() => handleRestoreVersion(version.id)}
                        className="h-7 gap-1 shrink-0"
                      >
                        <RotateCcw className="size-3.5" />
                        Restore
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Preview */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Eye className="size-4" />
            Live Preview
          </h2>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            Live
          </span>
        </div>
        <div className="p-3">
          <iframe
            title="live-funnel-preview"
            className="h-[82vh] w-full rounded-lg border border-border/60 bg-white shadow-inner dark:bg-zinc-900"
            sandbox="allow-same-origin"
            srcDoc={preview}
          />
        </div>
      </section>
    </div>
  );
}
