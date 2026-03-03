"use client";

import JSZip from "jszip";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  type: "status" | "reasoning" | "step" | "warning" | "error" | "done";
  message: string;
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
            streamError = event.message;
            setStatus(`Generation failed: ${event.message}`);
            return;
          }

          if (event.type !== "done") {
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
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "AI edit failed.");
      }

      const updated = data.funnel as FunnelRecord;
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
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <section className="flex min-h-[80vh] flex-col rounded-xl border bg-card">
        <div className="border-b p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">Project Builder</h1>
            <span className="text-xs text-muted-foreground">{status}</span>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input
              value={funnelName}
              onChange={(event) => setFunnelName(event.target.value)}
              placeholder="Project name"
            />
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
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

        <div className="border-b p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            Prompting Panel (V0-style flow)
          </h2>
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border bg-background p-3 text-sm"
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder="Describe the funnel objective and offer..."
          />
          <textarea
            className="mt-2 min-h-20 w-full rounded-md border bg-background p-3 text-sm"
            value={campaignContext}
            onChange={(event) => setCampaignContext(event.target.value)}
            placeholder="Audience, angle, objections, policy constraints..."
          />
          <div className="mt-2 flex gap-2">
            <select
              className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
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
            >
              {isGenerating ? "Generating..." : "Generate"}
            </Button>
            <Button asChild variant="outline">
              <Link href="/agents/copy-injection/templates">Train Templates</Link>
            </Button>
          </div>
          {generationTrace.length > 0 ? (
            <div className="mt-3 max-h-36 overflow-auto rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              {generationTrace.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="border-b p-4">
          <h2 className="text-sm font-medium text-muted-foreground">
            AI Edit + Version Control
          </h2>
          <textarea
            className="mt-2 min-h-20 w-full rounded-md border bg-background p-3 text-sm"
            value={editComment}
            onChange={(event) => setEditComment(event.target.value)}
            placeholder="Tell AI exactly what to edit. Example: only rewrite hero headline and subheadline."
          />
          <div className="mt-2 flex gap-2">
            <Button
              onClick={handleAiEdit}
              disabled={isAiEditing || !selectedProjectId || editComment.trim().length < 4}
            >
              {isAiEditing ? "Applying..." : "Apply AI Edit"}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadZip}
              disabled={!selectedProjectId}
            >
              Download HTML + CSS ZIP
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-4">
          <div className="flex h-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant={activeCodeTab === "html" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCodeTab("html")}
              >
                HTML
              </Button>
              <Button
                variant={activeCodeTab === "css" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveCodeTab("css")}
              >
                CSS
              </Button>
              <Input
                value={manualSaveNote}
                onChange={(event) => setManualSaveNote(event.target.value)}
                placeholder="Manual save note (optional)"
              />
              <Button
                onClick={handleSaveManual}
                disabled={isSavingManual || !selectedProjectId}
              >
                {isSavingManual ? "Saving..." : "Save Code Version"}
              </Button>
            </div>

            {activeCodeTab === "html" ? (
              <textarea
                className="h-full min-h-[360px] w-full flex-1 rounded-md border bg-background p-3 font-mono text-xs"
                value={htmlDraft}
                onChange={(event) => setHtmlDraft(event.target.value)}
              />
            ) : (
              <textarea
                className="h-full min-h-[360px] w-full flex-1 rounded-md border bg-background p-3 font-mono text-xs"
                value={cssDraft}
                onChange={(event) => setCssDraft(event.target.value)}
              />
            )}

            <div className="max-h-48 overflow-auto rounded-md border p-2">
              <p className="text-xs font-medium text-muted-foreground">
                Version History (restore any checkpoint)
              </p>
              <div className="mt-2 space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="rounded-md border p-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {version.user_instruction}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isRestoring || !selectedProjectId}
                        onClick={() => handleRestoreVersion(version.id)}
                      >
                        Restore
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-3">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Live Preview
        </h2>
        <iframe
          title="live-funnel-preview"
          className="h-[82vh] w-full rounded-md border bg-white"
          sandbox="allow-same-origin"
          srcDoc={preview}
        />
      </section>
    </div>
  );
}
