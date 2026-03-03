"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renderPreviewDocument } from "@/lib/copy-injection";
import { readUiMessageSseStream, UiStreamChunk } from "@/lib/read-ui-stream";
import {
  FunnelRecord,
  FunnelVersionRecord,
  TemplateRecord,
} from "@/lib/types";
type GenerationStreamEvent = {
  type: "status" | "reasoning" | "step" | "warning" | "error" | "done";
  message: string;
  payload?: Record<string, unknown>;
};

function injectImages(
  html: string,
  images: Record<string, string> | null | undefined,
): string {
  if (!images) {
    return html;
  }

  return html.replace(/\{\{image:([^}]+)\}\}/g, (_full, rawSectionId) => {
    const sectionId = String(rawSectionId).trim();
    return images[sectionId] ?? "";
  });
}

function previewSrcDoc(
  html: string,
  css: string,
  images: Record<string, string> | null | undefined,
): string {
  return renderPreviewDocument(injectImages(html, images), css);
}

export function CopyInjectionWorkspace() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [funnels, setFunnels] = useState<FunnelRecord[]>([]);
  const [versions, setVersions] = useState<FunnelVersionRecord[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [funnelName, setFunnelName] = useState("New Conversion Funnel");
  const [objective, setObjective] = useState("");
  const [campaignContext, setCampaignContext] = useState("");

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateInstructions, setTemplateInstructions] = useState("");
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateCss, setTemplateCss] = useState("");

  const [editComment, setEditComment] = useState("");
  const [status, setStatus] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [generationTrace, setGenerationTrace] = useState<string[]>([]);

  const currentFunnel = useMemo(
    () => funnels.find((funnel) => funnel.id === selectedFunnelId) ?? null,
    [funnels, selectedFunnelId],
  );

  useEffect(() => {
    void Promise.all([
      fetch("/api/agents/copy-injection/templates")
        .then((res) => res.json())
        .then((data) => setTemplates(data.templates ?? [])),
      fetch("/api/agents/copy-injection/funnels")
        .then((res) => res.json())
        .then((data) => {
          const loadedFunnels: FunnelRecord[] = data.funnels ?? [];
          setFunnels(loadedFunnels);
          if (loadedFunnels.length > 0) {
            setSelectedFunnelId(loadedFunnels[0].id);
          }
        }),
    ]).catch((error) => {
      setStatus(`Failed to load initial data: ${String(error)}`);
    });
  }, []);

  useEffect(() => {
    if (!selectedFunnelId) {
      setVersions([]);
      return;
    }

    fetch(`/api/agents/copy-injection/funnels/${selectedFunnelId}/versions`)
      .then((res) => res.json())
      .then((data) => setVersions(data.versions ?? []))
      .catch((error) =>
        setStatus(`Failed to load funnel versions: ${String(error)}`),
      );
  }, [selectedFunnelId]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStatus("Starting streamed funnel generation...");
    setGenerationTrace([]);
    try {
      const response = await fetch("/api/agents/copy-injection/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

        const createdFunnel: FunnelRecord = data.funnel;
        setFunnels((previous) => [createdFunnel, ...previous]);
        setSelectedFunnelId(createdFunnel.id);
        setEditComment("");
        setStatus("Funnel generated successfully.");
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
          setStatus("Funnel generated successfully.");
        }
      });

      if (streamError) {
        throw new Error(streamError);
      }

      if (!finalData) {
        throw new Error("Generation stream ended without final payload.");
      }

      const createdFunnel: FunnelRecord = (finalData as GenerationResult).funnel;
      setFunnels((previous) => [createdFunnel, ...previous]);
      setSelectedFunnelId(createdFunnel.id);
      setEditComment("");
    } catch (error) {
      setStatus(`Generation failed: ${String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedFunnelId) {
      setStatus("Select or generate a funnel first.");
      return;
    }
    if (!currentFunnel) {
      setStatus("Funnel not loaded. Please try again.");
      return;
    }

    setIsEditing(true);
    setStatus("Applying targeted edit to HTML/CSS and related images...");
    try {
      const response = await fetch("/api/agents/copy-injection/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funnelId: selectedFunnelId,
          editComment,
          currentHtml: currentFunnel.latest_html ?? undefined,
          currentCss: currentFunnel.latest_css ?? undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Edit failed.");
      }

      const updatedFunnel: FunnelRecord = data.funnel;
      setFunnels((previous) =>
        previous.map((funnel) =>
          funnel.id === updatedFunnel.id ? updatedFunnel : funnel,
        ),
      );

      const versionResponse = await fetch(
        `/api/agents/copy-injection/funnels/${selectedFunnelId}/versions`,
      );
      const versionData = await versionResponse.json();
      setVersions(versionData.versions ?? []);

      setStatus(`Edit applied. ${data.editPlan?.summary ?? ""}`);
    } catch (error) {
      setStatus(`Edit failed: ${String(error)}`);
    } finally {
      setIsEditing(false);
    }
  };

  const handleTrainTemplate = async () => {
    setIsTraining(true);
    setStatus("Saving template for future funnel generations...");
    try {
      const response = await fetch("/api/agents/copy-injection/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          description: templateDescription || undefined,
          instructions: templateInstructions,
          htmlScaffold: templateHtml || undefined,
          cssScaffold: templateCss || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Template save failed.");
      }

      const nextTemplate: TemplateRecord = data.template;
      setTemplates((previous) => [nextTemplate, ...previous]);
      setSelectedTemplateId(nextTemplate.id);

      setTemplateName("");
      setTemplateDescription("");
      setTemplateInstructions("");
      setTemplateHtml("");
      setTemplateCss("");
      setStatus("Template saved and selected for training-guided generation.");
    } catch (error) {
      setStatus(`Template save failed: ${String(error)}`);
    } finally {
      setIsTraining(false);
    }
  };

  const handleCopyBundle = async () => {
    if (!currentFunnel) {
      return;
    }

    const document = previewSrcDoc(
      currentFunnel.latest_html,
      currentFunnel.latest_css,
      currentFunnel.latest_images,
    );

    await navigator.clipboard.writeText(document);
    setStatus("Full HTML document copied to clipboard.");
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
      <section className="rounded-xl border bg-card p-5">
        <h1 className="text-2xl font-semibold">Copy + Image Injection Agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate and iteratively edit full funnel HTML/CSS with mapped copy
          sections and generated section images.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-medium">Generate New Funnel</h2>
          <div className="mt-4 space-y-3">
            <Input
              value={funnelName}
              onChange={(event) => setFunnelName(event.target.value)}
              placeholder="Funnel name"
            />
            <textarea
              className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Objective and offer details"
            />
            <textarea
              className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
              value={campaignContext}
              onChange={(event) => setCampaignContext(event.target.value)}
              placeholder="Extra context (audience, angle, objections, policies)"
            />
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              <option value="">No template (free generation)</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || objective.trim().length < 12}
              className="w-full"
            >
              {isGenerating ? "Generating..." : "Generate Funnel + Images"}
            </Button>
            {generationTrace.length > 0 ? (
              <div className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                {generationTrace.map((line, index) => (
                  <p key={`${line}-${index}`}>{line}</p>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-medium">Train Agent with Templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Save reusable structure rules and scaffolds for future generations.
          </p>
          <div className="mt-4 space-y-3">
            <Input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Template name"
            />
            <Input
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
              placeholder="Template description (optional)"
            />
            <textarea
              className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
              value={templateInstructions}
              onChange={(event) => setTemplateInstructions(event.target.value)}
              placeholder="Rules: tone, section order, CTA style, prohibited phrases, etc."
            />
            <textarea
              className="min-h-20 w-full rounded-md border bg-background p-3 font-mono text-xs"
              value={templateHtml}
              onChange={(event) => setTemplateHtml(event.target.value)}
              placeholder="Optional HTML scaffold"
            />
            <textarea
              className="min-h-20 w-full rounded-md border bg-background p-3 font-mono text-xs"
              value={templateCss}
              onChange={(event) => setTemplateCss(event.target.value)}
              placeholder="Optional CSS scaffold"
            />
            <Button
              onClick={handleTrainTemplate}
              disabled={isTraining || templateInstructions.trim().length < 10}
              variant="secondary"
              className="w-full"
            >
              {isTraining ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-lg font-medium">Saved Funnels</h2>
          <div className="mt-3 space-y-2">
            {funnels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No funnels generated yet.
              </p>
            ) : (
              funnels.map((funnel) => (
                <button
                  key={funnel.id}
                  type="button"
                  onClick={() => setSelectedFunnelId(funnel.id)}
                  className={`w-full rounded-md border p-3 text-left text-sm ${
                    selectedFunnelId === funnel.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <p className="font-medium">{funnel.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {funnel.objective}
                  </p>
                </button>
              ))
            )}
          </div>

          <h3 className="mt-6 text-sm font-medium">Prompt-Based Edit</h3>
          <textarea
            className="mt-2 min-h-28 w-full rounded-md border bg-background p-3 text-sm"
            value={editComment}
            onChange={(event) => setEditComment(event.target.value)}
            placeholder="Example: make hero headline punchier, move testimonial above CTA, update hero image to modern office setting."
          />
          <Button
            onClick={handleEdit}
            disabled={isEditing || !selectedFunnelId || editComment.trim().length < 4}
            className="mt-2 w-full"
          >
            {isEditing ? "Applying..." : "Apply Edit to Current Funnel"}
          </Button>
          <Button
            onClick={handleCopyBundle}
            disabled={!currentFunnel}
            variant="outline"
            className="mt-2 w-full"
          >
            Copy Final HTML Document
          </Button>

          <h3 className="mt-6 text-sm font-medium">Revision Memory</h3>
          <div className="mt-2 max-h-48 space-y-2 overflow-auto pr-1">
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No revisions yet.</p>
            ) : (
              versions.map((version) => (
                <div key={version.id} className="rounded-md border p-2 text-xs">
                  <p className="font-medium uppercase tracking-wide">
                    {version.source}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {version.user_instruction}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-lg font-medium">Preview Sandbox</h2>
          {currentFunnel ? (
            <iframe
              title="funnel-preview"
              className="h-[900px] w-full rounded-md border bg-white"
              sandbox="allow-same-origin"
              srcDoc={previewSrcDoc(
                currentFunnel.latest_html,
                currentFunnel.latest_css,
                currentFunnel.latest_images,
              )}
            />
          ) : (
            <div className="flex h-[500px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              Generate a funnel to preview it here.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
