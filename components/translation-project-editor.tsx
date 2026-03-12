"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Globe,
  Bot,
  Loader2,
  CheckCircle2,
  Zap,
  Copy,
  Download,
  FileText,
  FolderOpen,
  MessageSquare,
  Code2,
  Eye,
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
import { readUiMessageSseStream, UiStreamChunk } from "@/lib/read-ui-stream";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "de", label: "German" },
] as const;

interface TranslationProject {
  id: string;
  name: string;
  objective: string;
  latest_html: string;
  latest_css: string;
  latest_images: Record<string, unknown> & {
    sourceHtml?: string;
    fromLang?: string;
    toLang?: string;
  };
}

interface TranslationProjectEditorProps {
  initialProjectId?: string;
}

interface TranslateStreamResult {
  funnel: { id: string; name: string };
  translatedHtml: string;
}

export function TranslationProjectEditor({
  initialProjectId,
}: TranslationProjectEditorProps) {
  const [projects, setProjects] = useState<
    Array<{ id: string; name: string; objective: string; updated_at: string }>
  >([]);
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId ?? "",
  );
  const [fullProject, setFullProject] = useState<TranslationProject | null>(
    null,
  );
  const [projectName, setProjectName] = useState("New Translation Project");
  const [fromLang, setFromLang] = useState<"en" | "de">("en");
  const [toLang, setToLang] = useState<"en" | "de">("de");
  const [sourceHtml, setSourceHtml] = useState("");
  const [translatedHtml, setTranslatedHtml] = useState("");
  const [editComments, setEditComments] = useState("");
  const [status, setStatus] = useState("Ready.");
  const [isTranslating, setIsTranslating] = useState(false);
  const [outputView, setOutputView] = useState<"code" | "preview">("code");

  const currentProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  useEffect(() => {
    fetch("/api/agents/translation/funnels?list=true")
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
      setSourceHtml("");
      setTranslatedHtml("");
      return;
    }

    setStatus("Loading project...");
    fetch(`/api/agents/translation/funnels/${selectedProjectId}`)
      .then((res) => res.json())
      .then((data) => {
        const funnel = data.funnel;
        if (funnel) {
          setFullProject(funnel);
          setProjectName(funnel.name);
          const meta = (funnel.latest_images ?? {}) as {
            sourceHtml?: string;
            fromLang?: string;
            toLang?: string;
          };
          setSourceHtml(meta.sourceHtml ?? funnel.latest_html ?? "");
          setTranslatedHtml(funnel.latest_html ?? "");
          setFromLang((meta.fromLang as "en" | "de") ?? "en");
          setToLang((meta.toLang as "en" | "de") ?? "de");
        }
      })
      .catch((err) => setStatus(`Failed to load: ${String(err)}`))
      .finally(() => setStatus("Ready."));
  }, [selectedProjectId]);

  const refreshProjects = async (keepId?: string) => {
    const res = await fetch("/api/agents/translation/funnels?list=true");
    const data = await res.json();
    setProjects(data.funnels ?? []);
    if (keepId) setSelectedProjectId(keepId);
  };

  const handleTranslate = async (isEdit = false) => {
    const htmlToUse = isEdit ? translatedHtml : sourceHtml;
    if (!htmlToUse.trim()) {
      setStatus("Paste or load HTML content first.");
      return;
    }

    setIsTranslating(true);
    setStatus(isEdit ? "Applying edits..." : "Translating...");

    if (!isEdit) {
      setTranslatedHtml("");
    }

    try {
      const response = await fetch("/api/agents/translation/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: htmlToUse,
          fromLang,
          toLang,
          projectName: projectName.trim() || undefined,
          projectId: selectedProjectId || undefined,
          editComments: isEdit ? editComments.trim() || undefined : undefined,
          stream: true,
        }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Translation failed");
        setTranslatedHtml(data.translatedHtml ?? "");
        if (data.funnel?.id) {
          await refreshProjects(data.funnel.id);
          setSelectedProjectId(data.funnel.id);
        }
        setStatus("Translation complete.");
        return;
      }

      let finalResult: TranslateStreamResult | null = null;

      await readUiMessageSseStream(response, (chunk: UiStreamChunk) => {
        if (chunk.type === "data-translate-event" && chunk.data) {
          const ev = chunk.data as {
            type?: string;
            message?: string;
            payload?: { value?: string };
          };
          if (ev.type === "html-stream" && ev.payload?.value != null) {
            setTranslatedHtml(ev.payload.value);
          }
          if (ev.message) setStatus(ev.message);
        }
        if (chunk.type === "data-translate-result" && chunk.data) {
          finalResult = chunk.data as TranslateStreamResult;
        }
      });

      const funnelId = (finalResult as TranslateStreamResult | null)?.funnel?.id;
      if (funnelId) {
        await refreshProjects(funnelId);
        setSelectedProjectId(funnelId);
      }
      setStatus("Translation complete.");
    } catch (error) {
      setStatus(`Translation failed: ${String(error)}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleCopyTranslated = async () => {
    try {
      await navigator.clipboard.writeText(translatedHtml);
      setStatus("Copied translated HTML to clipboard.");
    } catch {
      setStatus("Copy failed.");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([translatedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(projectName || "translation").replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Downloaded HTML file.");
  };

  const consoleBase =
    "rounded-lg font-mono text-xs border shadow-inner overflow-hidden ring-1 ring-black/5 dark:ring-white/5";
  const consoleHeader =
    "flex items-center gap-2 px-3 py-2 border-b bg-[#0d1117]/98 text-slate-300 backdrop-blur-sm";
  const consoleBody =
    "min-h-[320px] max-h-[60vh] overflow-auto p-4 bg-[#0d1117] text-slate-300 bg-[linear-gradient(180deg,#0d1117_0%,#0d1117_99%,rgba(16,185,129,0.03)_100%)]";

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      {/* Left: Input */}
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Globe className="size-5" />
              </div>
              <div>
                <h1 className="font-semibold tracking-tight">
                  Landing Page Translation
                </h1>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {isTranslating ? (
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
            <div className="relative">
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

        {/* GPT-style input: Language dropdowns + Translate */}
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MessageSquare className="size-4" />
            Translation Settings
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select
              value={fromLang}
              onValueChange={(v) => setFromLang(v as "en" | "de")}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">→</span>
            <Select
              value={toLang}
              onValueChange={(v) => setToLang(v as "en" | "de")}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="To" />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => handleTranslate(false)}
              disabled={
                isTranslating ||
                !sourceHtml.trim() ||
                fromLang === toLang
              }
              className="gap-2"
            >
              {isTranslating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Zap className="size-4" />
              )}
              Translate
            </Button>
          </div>
        </div>

        {/* Edit comments */}
        <div className="border-b border-border/60 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Bot className="size-4" />
            Edit Comments
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Reference lines with &quot;Line 15:&quot; or &quot;L42:&quot; to apply
            edits only to those parts.
          </p>
          <textarea
            className="mt-2 min-h-16 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={editComments}
            onChange={(e) => setEditComments(e.target.value)}
            placeholder="e.g. Line 12: Make it more casual. L42: Use a formal tone here."
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => handleTranslate(true)}
            disabled={
              isTranslating ||
              !translatedHtml.trim() ||
              !editComments.trim()
            }
          >
            {isTranslating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Bot className="size-3.5" />
            )}{" "}
            Apply Edits
          </Button>
        </div>

        {/* HTML input scaffold - console style */}
        <div className="flex flex-1 flex-col overflow-hidden p-5">
          <div className={`${consoleBase} flex flex-1 flex-col border-border/60`}>
            <div className={consoleHeader}>
              <Code2 className="size-4 text-emerald-400" />
              <span className="font-medium">Source HTML</span>
              <span className="ml-2 rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px]">
                INPUT
              </span>
            </div>
            <textarea
              className={`${consoleBody} w-full flex-1 resize-none border-0 focus:ring-0 focus:ring-offset-0`}
              value={sourceHtml}
              onChange={(e) => setSourceHtml(e.target.value)}
              placeholder="Paste your full HTML here..."
              spellCheck={false}
            />
          </div>
        </div>
      </section>

      {/* Right: Translated result - streamed */}
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Code2 className="size-4" />
              Translated HTML
            </h2>
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
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              {toLang === "en" ? "English" : "German"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyTranslated}
              disabled={!translatedHtml.trim()}
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!translatedHtml.trim()}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              Download
            </Button>
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden p-5">
          {outputView === "code" ? (
            <div
              className={`${consoleBase} flex flex-1 flex-col border-emerald-500/30 shadow-[0_0_20px_-5px_rgba(16,185,129,0.15)]`}
            >
              <div
                className={`${consoleHeader} border-emerald-500/20 bg-gradient-to-r from-emerald-950/40 to-transparent`}
              >
                <Code2 className="size-4 text-emerald-400" />
                <span className="font-medium">Output</span>
                <span className="ml-2 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                  STREAMED
                </span>
              </div>
              <div
                className={`${consoleBody} flex flex-1 overflow-auto font-mono text-xs`}
              >
                {translatedHtml ? (
                  <div className="min-w-full space-y-0 py-4 pl-4">
                    {translatedHtml.split("\n").map((line, i) => (
                      <div key={i} className="flex leading-[1.5]">
                        <span
                          className="flex-shrink-0 w-9 pr-3 text-right text-slate-500 select-none"
                          aria-hidden
                        >
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
                    Translation will appear here as it streams...
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              className={`${consoleBase} flex flex-1 flex-col border-emerald-500/30 overflow-hidden`}
            >
              <div
                className={`${consoleHeader} border-emerald-500/20 bg-gradient-to-r from-emerald-950/40 to-transparent`}
              >
                <Eye className="size-4 text-emerald-400" />
                <span className="font-medium">Live Preview</span>
              </div>
              <div className="flex-1 overflow-auto bg-white dark:bg-zinc-900 p-3">
                <iframe
                  title="translation-preview"
                  className="h-full min-h-[400px] w-full rounded border border-border/60"
                  sandbox="allow-same-origin allow-scripts"
                  srcDoc={
                    translatedHtml
                      ? translatedHtml.startsWith("<!DOCTYPE") ||
                          translatedHtml.trimStart().startsWith("<html")
                        ? translatedHtml
                        : `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${translatedHtml}</body></html>`
                      : ""
                  }
                />
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border/60 px-5 py-2">
          <Link
            href="/agents/translation/projects"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all projects
          </Link>
        </div>
      </section>
    </div>
  );
}
