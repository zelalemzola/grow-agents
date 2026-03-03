"use client";

import { ChangeEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemplateRecord } from "@/lib/types";

export function CopyInjectionTemplateTrainer() {
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [htmlScaffold, setHtmlScaffold] = useState("");
  const [cssScaffold, setCssScaffold] = useState("");
  const [status, setStatus] = useState("Load templates and create training rules.");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/agents/copy-injection/templates")
      .then((res) => res.json())
      .then((data) => {
        setTemplates((data.templates ?? []) as TemplateRecord[]);
      })
      .catch((error) => {
        setStatus(`Failed to load templates: ${String(error)}`);
      });
  }, []);

  const handleUploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    for (const file of Array.from(files)) {
      const text = await file.text();
      const lower = file.name.toLowerCase();

      if (lower.endsWith(".html") || lower.endsWith(".htm")) {
        setHtmlScaffold(text);
      } else if (lower.endsWith(".css")) {
        setCssScaffold(text);
      } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
        setInstructions((previous) =>
          previous ? `${previous}\n\n${text}` : text,
        );
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus("Saving training template...");
    try {
      const response = await fetch("/api/agents/copy-injection/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: description || undefined,
          instructions,
          htmlScaffold: htmlScaffold || undefined,
          cssScaffold: cssScaffold || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Template save failed.");
      }

      const nextTemplate = data.template as TemplateRecord;
      setTemplates((previous) => [nextTemplate, ...previous]);
      setName("");
      setDescription("");
      setInstructions("");
      setHtmlScaffold("");
      setCssScaffold("");
      setStatus("Template saved successfully.");
    } catch (error) {
      setStatus(`Template save failed: ${String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="rounded-xl border bg-card p-5">
        <h1 className="text-xl font-semibold">Train AI with Templates</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload existing HTML/CSS assets and instruction files so the agent
          learns your recurring structure and copy style.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>

        <div className="mt-4 space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Template name"
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
          />
          <textarea
            className="min-h-40 w-full rounded-md border bg-background p-3 text-sm"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Rules, tone, section order, banned claims..."
          />
          <input
            type="file"
            multiple
            accept=".html,.htm,.css,.txt,.md"
            onChange={handleUploadFiles}
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
          <textarea
            className="min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs"
            value={htmlScaffold}
            onChange={(event) => setHtmlScaffold(event.target.value)}
            placeholder="HTML scaffold"
          />
          <textarea
            className="min-h-40 w-full rounded-md border bg-background p-3 font-mono text-xs"
            value={cssScaffold}
            onChange={(event) => setCssScaffold(event.target.value)}
            placeholder="CSS scaffold"
          />
          <Button
            onClick={handleSave}
            disabled={isSaving || name.trim().length < 3 || instructions.trim().length < 10}
          >
            {isSaving ? "Saving..." : "Save Template"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-medium">Saved Templates</h2>
        <div className="mt-3 space-y-2">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="rounded-md border p-3">
                <p className="text-sm font-medium">{template.name}</p>
                {template.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.description}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
