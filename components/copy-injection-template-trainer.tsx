"use client";

import { ChangeEvent, useEffect, useState } from "react";
import {
  BookOpen,
  Save,
  Upload,
  FileCode,
  Palette,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
} from "lucide-react";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

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

  const loadTemplateIntoForm = (template: TemplateRecord) => {
    setEditingId(template.id);
    setName(template.name);
    setDescription(template.description ?? "");
    setInstructions(template.instructions);
    setHtmlScaffold(template.html_scaffold ?? "");
    setCssScaffold(template.css_scaffold ?? "");
    setStatus(`Editing "${template.name}". Make changes and click Update.`);
  };

  const clearForm = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setInstructions("");
    setHtmlScaffold("");
    setCssScaffold("");
    setStatus("Load templates and create training rules.");
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(editingId ? "Updating template..." : "Saving training template...");
    try {
      const url = editingId
        ? `/api/agents/copy-injection/templates/${editingId}`
        : "/api/agents/copy-injection/templates";
      const method = editingId ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        name,
        description: description || undefined,
        instructions,
        htmlScaffold: htmlScaffold || undefined,
        cssScaffold: cssScaffold || undefined,
      };

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Template save failed.");
      }

      const nextTemplate = data.template as TemplateRecord;
      if (editingId) {
        setTemplates((previous) =>
          previous.map((t) => (t.id === nextTemplate.id ? nextTemplate : t)),
        );
        setStatus("Template updated successfully.");
      } else {
        setTemplates((previous) => [nextTemplate, ...previous]);
        setStatus("Template saved successfully.");
      }
      clearForm();
    } catch (error) {
      setStatus(`Template save failed: ${String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (template: TemplateRecord) => {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    setIsDeleting(template.id);
    setStatus(`Deleting "${template.name}"...`);
    try {
      const response = await fetch(
        `/api/agents/copy-injection/templates/${template.id}`,
        { method: "DELETE" },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Delete failed.");
      }
      setTemplates((previous) => previous.filter((t) => t.id !== template.id));
      if (editingId === template.id) clearForm();
      setStatus("Template deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${String(error)}`);
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Train AI with Templates
              </h1>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                {status}
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Template name
            </label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Health Funnel v1"
              className="rounded-lg"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Description
            </label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Brief description (optional)"
              className="rounded-lg"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Instructions
            </label>
            <textarea
              className="min-h-36 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Rules, tone, section order, banned claims..."
            />
          </div>
          {/* <div>
            <label className="mb-1.5 block text-sm font-medium">
              Upload files
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/60 bg-muted/20 py-8 transition-colors hover:bg-muted/40">
              <Upload className="size-8 text-muted-foreground" />
              <span className="mt-2 text-sm text-muted-foreground">
                Drop .html, .css, .txt, .md files
              </span>
              <input
                type="file"
                multiple
                accept=".html,.htm,.css,.txt,.md"
                onChange={handleUploadFiles}
                className="hidden"
              />
            </label>
          </div> */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                <FileCode className="size-4" />
                HTML scaffold
              </label>
              <textarea
                className="min-h-32 w-full rounded-lg border border-input bg-[#0d1117] p-3 font-mono text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-ring"
                value={htmlScaffold}
                onChange={(event) => setHtmlScaffold(event.target.value)}
                placeholder="Optional HTML structure..."
              />
            </div>
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                <Palette className="size-4" />
                CSS scaffold
              </label>
              <textarea
                className="min-h-32 w-full rounded-lg border border-input bg-[#0d1117] p-3 font-mono text-xs text-slate-300 focus:outline-none focus:ring-2 focus:ring-ring"
                value={cssScaffold}
                onChange={(event) => setCssScaffold(event.target.value)}
                placeholder="Optional CSS..."
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={
                isSaving ||
                name.trim().length < 3 ||
                instructions.trim().length < 10
              }
              className="gap-2"
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {isSaving
                ? editingId
                  ? "Updating..."
                  : "Saving..."
                : editingId
                  ? "Update Template"
                  : "Save Template"}
            </Button>
            {editingId ? (
              <Button
                variant="outline"
                onClick={clearForm}
                disabled={isSaving}
                className="gap-1.5"
              >
                <X className="size-4" />
                Cancel Edit
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-muted/30 px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">
            Saved Templates
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {templates.length} template{templates.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="max-h-[calc(100vh-280px)] overflow-auto p-4">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <BookOpen className="size-12 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No templates yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create one to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    editingId === template.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border/60 hover:bg-muted/30"
                  }`}
                >
                  <p className="font-medium">{template.name}</p>
                  {template.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {template.description}
                    </p>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadTemplateIntoForm(template)}
                      disabled={!!editingId && editingId !== template.id}
                      className="gap-1.5"
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(template)}
                      disabled={isDeleting === template.id}
                      className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {isDeleting === template.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      {isDeleting === template.id ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
