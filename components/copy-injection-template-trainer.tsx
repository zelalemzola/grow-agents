"use client";

import { ChangeEvent, useEffect, useState } from "react";
import {
  BookOpen,
  Save,
  FileCode,
  Palette,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  Eye,
  LayoutTemplate,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { renderPreviewDocument } from "@/lib/copy-injection";
import { TemplateRecord } from "@/lib/types";

const TEMPLATE_ACCENTS = [
  { gradient: "from-violet-500/20 via-fuchsia-500/10 to-transparent", border: "border-violet-500/20" },
  { gradient: "from-cyan-500/20 via-blue-500/10 to-transparent", border: "border-cyan-500/20" },
  { gradient: "from-amber-500/20 via-orange-500/10 to-transparent", border: "border-amber-500/20" },
  { gradient: "from-emerald-500/20 via-teal-500/10 to-transparent", border: "border-emerald-500/20" },
  { gradient: "from-rose-500/20 via-pink-500/10 to-transparent", border: "border-rose-500/20" },
] as const;

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
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    setDrawerOpen(false);
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

  const previewSrcDoc = renderPreviewDocument(
    htmlScaffold.trim() || "<div class='placeholder'><p>Add HTML scaffold to see preview</p></div>",
    cssScaffold.trim() ||
      ".placeholder { padding: 2rem; text-align: center; color: #666; font-family: system-ui; }",
  );

  return (
    <div className="relative">
      {/* Floating Templates Button */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button
            variant="default"
            size="lg"
            className="fixed right-8
             top-8 z-40 gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/25"
          >
            <LayoutTemplate className="size-5" />
            Templates
            {templates.length > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
                {templates.length}
              </span>
            )}
          </Button>

        </SheetTrigger>
        <SheetContent
          side="right"
          className="w-full border-l-0 bg-gradient-to-b from-background to-muted/30 sm:max-w-lg"
          showCloseButton={true}
        >
          <SheetHeader className="border-b border-border/60 pb-4">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5">
                <Sparkles className="size-5 text-primary" />
              </div>
              Saved Templates
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {templates.length} template{templates.length !== 1 ? "s" : ""} ready to use
            </p>
          </SheetHeader>
          <div className="flex-1 overflow-auto py-6">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="rounded-2xl bg-muted/50 p-6">
                  <BookOpen className="size-14 text-muted-foreground/50" />
                </div>
                <p className="mt-4 font-medium text-foreground">No templates yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Create a template using the form to get started
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-6"
                  onClick={() => setDrawerOpen(false)}
                >
                  Close
                </Button>
              </div>
            ) : (
              <div className="space-y-4 pr-2">
                {templates.map((template, i) => {
                  const accent = TEMPLATE_ACCENTS[i % TEMPLATE_ACCENTS.length];
                  return (
                    <div
                      key={template.id}
                      className={`group relative overflow-hidden rounded-2xl border ${accent.border} bg-card p-4 transition-all duration-300 hover:shadow-lg ${
                        editingId === template.id
                          ? "ring-2 ring-primary/50"
                          : "hover:-translate-y-0.5"
                      }`}
                    >
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${accent.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                      />
                      <div className="relative">
                        <h4 className="font-semibold tracking-tight text-foreground">
                          {template.name}
                        </h4>
                        {template.description ? (
                          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                            {template.description}
                          </p>
                        ) : null}
                        <div className="mt-4 flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => loadTemplateIntoForm(template)}
                            className="gap-1.5"
                          >
                            <Pencil className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
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
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="grid gap-6 lg:grid-cols-2">
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

      {/* Live Preview */}
      <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Eye className="size-5" />
            Live Preview
          </h2>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            Live
          </span>
        </div>
        <div className="p-3">
          <iframe
            title="template-preview"
            className="h-[min(70vh,600px)] w-full rounded-lg border border-border/60 bg-white shadow-inner dark:bg-zinc-900"
            sandbox="allow-same-origin allow-scripts"
            srcDoc={previewSrcDoc}
          />
        </div>
      </section>
      </div>
    </div>
  );
}
