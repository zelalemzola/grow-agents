"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Download,
  Eye,
  ImageIcon,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  LayoutTemplate,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MessageSquareQuote,
  Minus,
  Pencil,
  Plus,
  Redo2,
  Sparkles,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  Film,
  HelpCircle,
  Megaphone,
  FileText,
  Layers,
  ChevronRight,
  ArrowLeft,
  Palette,
  X,
  Upload,
  FileSearch,
  Maximize2,
  Minimize2,
  Heading2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createPreviewSrcDoc,
  createSectionFocusedPreviewSrcDoc,
} from "@/lib/funnel-preview";
import { prepareSectionHtmlForEditor } from "@/lib/section-editor-html";
import { FunnelAuditModal } from "@/components/funnel-audit-modal";
import type { AuditChunkRow } from "@/components/funnel-audit-modal";
import type { FunnelFinalAudit } from "@/lib/funnel-audit-schema";
import {
  getSectionOuterHtml,
  getTopLevelSectionIds,
  insertSectionAfterHtml,
  replaceSectionOuterHtml,
  serializeDocumentPreservingDoctype,
} from "@/lib/funnel-html-manipulate";
import {
  buildUserComponentHtml,
  defaultUserComponentFields,
  ensureUserComponentCss,
  validateUserComponent,
  type UserComponentFields,
  type UserComponentKind,
  type RadiusToken,
  type ShadowToken,
  type SpacingToken,
} from "@/lib/funnel-user-components";
import { cn } from "@/lib/utils";

function stripScripts(html: string): string {
  return html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
}

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("data:video/")) return true;
  return url.includes(".mp4") || url.includes(".webm");
}

type OutputTab = "preview" | "media";

type InlineImagePosition = "full" | "left" | "right" | "center";

function inlineMediaWrapStyle(pos: InlineImagePosition): string {
  switch (pos) {
    case "full":
      return "width:100%;max-width:100%;margin:0.75rem 0;clear:both;";
    case "left":
      return "float:left;max-width:42%;margin:0 0.75rem 0.75rem 0;";
    case "right":
      return "float:right;max-width:42%;margin:0 0 0.75rem 0.75rem;";
    case "center":
      return "display:block;margin:0.75rem auto;max-width:min(92%,28rem);text-align:center;clear:both;";
    default:
      return "";
  }
}

/** Small wireframe preview for each insert-section preset (not real content). */
function SectionLayoutSkeleton({ presetId }: { presetId: string }) {
  const line = (cls?: string) => (
    <div
      className={cn(
        "h-1.5 rounded-full bg-muted-foreground/18 dark:bg-muted-foreground/25",
        cls,
      )}
    />
  );

  switch (presetId) {
    case "body":
      return (
        <div className="flex flex-col gap-2">
          {line("w-full")}
          {line("w-[94%]")}
          {line("w-[88%]")}
          {line("w-[72%]")}
          {line("w-[40%] mt-1")}
        </div>
      );
    case "testimonial":
      return (
        <div className="flex flex-col gap-2.5">
          <div className="space-y-2 rounded-lg border border-muted-foreground/20 bg-muted/35 p-2.5">
            {line("w-full")}
            {line("w-[90%]")}
            {line("w-[65%]")}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="size-7 shrink-0 rounded-full bg-muted-foreground/22" />
            <div className="min-w-0 flex-1 space-y-1.5">
              {line("w-20")}
              {line("w-14")}
            </div>
          </div>
        </div>
      );
    case "faq":
      return (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded bg-muted-foreground/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Q
            </span>
            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
              {line("w-full")}
              {line("w-[55%]")}
            </div>
          </div>
          <div className="flex items-start gap-2 border-t border-muted-foreground/15 pt-2">
            <span className="mt-0.5 shrink-0 rounded bg-muted-foreground/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              A
            </span>
            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
              {line("w-full")}
              {line("w-[80%]")}
            </div>
          </div>
        </div>
      );
    case "cta":
      return (
        <div className="flex flex-col items-center gap-3 py-0.5">
          {line("w-[85%]")}
          {line("w-[55%]")}
          <div className="mt-1 h-7 w-[42%] min-w-[4rem] rounded-full bg-muted-foreground/22 ring-1 ring-muted-foreground/20" />
          {line("w-[35%] mt-0.5")}
        </div>
      );
    case "proof":
      return (
        <div className="grid grid-cols-3 gap-2">
          {[
            ["w-[70%]", "w-[45%]"],
            ["w-[75%]", "w-[40%]"],
            ["w-[68%]", "w-[50%]"],
          ].map((widths, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 rounded-lg border border-muted-foreground/15 bg-muted/30 p-2"
            >
              <div className="h-2 w-8 rounded-full bg-muted-foreground/25" />
              <div className="w-full space-y-1.5">
                {line(widths[0])}
                {line(widths[1])}
              </div>
            </div>
          ))}
        </div>
      );
    case "custom":
      return (
        <div className="relative flex min-h-[4.5rem] flex-col justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 p-2.5">
          <div className="flex w-full gap-1.5">
            <div className="h-9 w-[32%] shrink-0 rounded-md bg-muted-foreground/15" />
            <div className="h-9 min-w-0 flex-1 rounded-md bg-muted-foreground/12" />
          </div>
          {line("w-[58%]")}
          <Sparkles className="pointer-events-none absolute bottom-2 right-2 size-4 text-muted-foreground/35" />
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-2 opacity-60">
          {line("w-full")}
          {line("w-[80%]")}
        </div>
      );
  }
}

const SECTION_PRESETS = [
  {
    id: "body",
    icon: FileText,
    title: "Story block",
    subtitle: "Narrative paragraphs",
    prompt:
      "Add a new body section with narrative paragraphs. Reuse the template's exact body block HTML pattern (same classes and wrapper structure); only the copy changes.",
    accent: "from-violet-500/20 to-fuchsia-500/10",
  },
  {
    id: "testimonial",
    icon: MessageSquareQuote,
    title: "Testimonial",
    subtitle: "Quote + attribution",
    prompt:
      "Add one testimonial section: a short customer quote with name and attribution. Match the template's testimonial block structure and classes exactly.",
    accent: "from-amber-500/20 to-orange-500/10",
  },
  {
    id: "faq",
    icon: HelpCircle,
    title: "FAQ",
    subtitle: "Question & answer",
    prompt:
      "Add an FAQ block with one question and answer pair. Use the template's FAQ section pattern (tags and classes) if present; otherwise mirror the closest Q&A style in the scaffold.",
    accent: "from-sky-500/20 to-cyan-500/10",
  },
  {
    id: "cta",
    icon: Megaphone,
    title: "Offer / CTA",
    subtitle: "Call to action band",
    prompt:
      "Add a CTA or offer section with a headline and button or link. Match the template's CTA/pricing block structure and classes exactly.",
    accent: "from-emerald-500/20 to-teal-500/10",
  },
  {
    id: "proof",
    icon: Layers,
    title: "Proof / stats",
    subtitle: "Credibility strip",
    prompt:
      "Add a proof or credibility section (stats, badges, or authority line). Follow the template's proof/body patterns and class names.",
    accent: "from-rose-500/20 to-pink-500/10",
  },
  {
    id: "custom",
    icon: Sparkles,
    title: "Custom",
    subtitle: "Your instructions",
    prompt: "",
    accent: "from-slate-500/20 to-zinc-500/10",
  },
] as const;

const COMPONENT_PRESETS: {
  kind: UserComponentKind;
  icon: typeof Type;
  title: string;
  subtitle: string;
  accent: string;
}[] = [
  {
    kind: "heading",
    icon: Heading2,
    title: "Heading",
    subtitle: "Section title (H2–H4)",
    accent: "from-violet-500/20 to-purple-500/10",
  },
  {
    kind: "paragraph",
    icon: Type,
    title: "Paragraph",
    subtitle: "Body text block",
    accent: "from-slate-500/20 to-zinc-500/10",
  },
  {
    kind: "link",
    icon: Link2,
    title: "Link",
    subtitle: "Text link with URL",
    accent: "from-sky-500/20 to-blue-500/10",
  },
  {
    kind: "image",
    icon: ImageIcon,
    title: "Image",
    subtitle: "Image from URL",
    accent: "from-emerald-500/20 to-teal-500/10",
  },
  {
    kind: "divider",
    icon: Minus,
    title: "Divider",
    subtitle: "Horizontal rule",
    accent: "from-neutral-500/15 to-stone-500/10",
  },
];

function ToolbarIcon({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function CopyInjectionOutputSide({
  htmlDraft,
  cssDraft,
  onCssDraftChange,
  imagesDraft,
  previewKey,
  selectedProjectId,
  onHtmlDraftChange,
  onImagesDraftChange,
  onPreviewBump,
  onPersistProject,
  onStatus,
  funnelName = "",
  funnelObjective = "",
  funnelCampaignContext = "",
  auditLocale = "",
  auditMarket = "",
}: {
  htmlDraft: string;
  cssDraft: string;
  onCssDraftChange: (next: string) => void;
  imagesDraft: Record<string, string>;
  previewKey: number;
  selectedProjectId: string;
  onHtmlDraftChange: (next: string) => void;
  onImagesDraftChange: (next: Record<string, string>) => void;
  onPreviewBump: () => void;
  /** Persists HTML/CSS to the server so preview edits survive reload. */
  onPersistProject?: (opts?: {
    html?: string;
    css?: string;
    note?: string;
  }) => Promise<void>;
  onStatus: (message: string) => void;
  /** Passed into the audit API only; does not affect generation. */
  funnelName?: string;
  funnelObjective?: string;
  funnelCampaignContext?: string;
  auditLocale?: string;
  auditMarket?: string;
}) {
  const [outputTab, setOutputTab] = useState<OutputTab>("preview");
  const [editorMode, setEditorMode] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);

  const [mediaModalId, setMediaModalId] = useState<string | null>(null);
  const [mediaComment, setMediaComment] = useState("");
  const [mediaProductDataUrl, setMediaProductDataUrl] = useState<string | null>(
    null,
  );
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [previousImageByKey, setPreviousImageByKey] = useState<
    Record<string, string>
  >({});
  const [redoImageByKey, setRedoImageByKey] = useState<Record<string, string>>(
    {},
  );

  const [sectionModalId, setSectionModalId] = useState<string | null>(null);
  const [sectionModalTab, setSectionModalTab] = useState<"manual" | "ai">(
    "manual",
  );
  const [sectionAiPrompt, setSectionAiPrompt] = useState("");
  const [sectionAiLoading, setSectionAiLoading] = useState(false);
  const sectionEditorRef = useRef<HTMLDivElement | null>(null);
  const htmlDraftRef = useRef(htmlDraft);
  const editorCleanupRef = useRef<(() => void) | null>(null);

  const [inlineImagePosition, setInlineImagePosition] =
    useState<InlineImagePosition>("full");
  const [inlineImagePrompt, setInlineImagePrompt] = useState("");
  const [pendingInlineImageId, setPendingInlineImageId] = useState<
    string | null
  >(null);

  const [insertSheetOpen, setInsertSheetOpen] = useState(false);
  const [insertSheetTab, setInsertSheetTab] = useState<"sections" | "components">(
    "sections",
  );
  const [insertMode, setInsertMode] = useState<"section" | "component">("section");
  const [selectedComponentKind, setSelectedComponentKind] =
    useState<UserComponentKind | null>(null);
  const [componentFields, setComponentFields] = useState<UserComponentFields>(() =>
    defaultUserComponentFields(),
  );
  const [insertStep, setInsertStep] = useState<"pick" | "confirm">("pick");
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const [insertPrompt, setInsertPrompt] = useState("");
  const [insertProduct, setInsertProduct] = useState<string | null>(null);
  const [insertLoading, setInsertLoading] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [sectionForeColor, setSectionForeColor] = useState("#171717");
  const insertProductFileRef = useRef<HTMLInputElement>(null);
  const componentImageFileRef = useRef<HTMLInputElement>(null);

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditFinal, setAuditFinal] = useState<FunnelFinalAudit | null>(null);
  const [auditChunkMeta, setAuditChunkMeta] = useState<
    | {
        sectionId: string;
        findingsCount: number;
        sectionSummary: string;
      }[]
    | null
  >(null);
  const [auditSectionCount, setAuditSectionCount] = useState(0);
  const [auditGeneratedAt, setAuditGeneratedAt] = useState<Date | null>(null);
  const [auditChunkAudits, setAuditChunkAudits] = useState<
    AuditChunkRow[] | null
  >(null);
  const [auditUndoStack, setAuditUndoStack] = useState<string[]>([]);
  const [auditRedoStack, setAuditRedoStack] = useState<string[]>([]);

  const commitAuditHtml = useCallback(
    (next: string) => {
      setAuditUndoStack((u) => [...u, htmlDraftRef.current]);
      setAuditRedoStack([]);
      onHtmlDraftChange(next);
      onPreviewBump();
      void onPersistProject?.({
        html: next,
        note: "Audit fixes applied",
      });
    },
    [onHtmlDraftChange, onPreviewBump, onPersistProject],
  );

  const undoAuditHtml = useCallback(() => {
    setAuditUndoStack((undo) => {
      if (undo.length === 0) return undo;
      const prev = undo[undo.length - 1]!;
      setAuditRedoStack((r) => [...r, htmlDraftRef.current]);
      onHtmlDraftChange(prev);
      onPreviewBump();
      void onPersistProject?.({ html: prev, note: "Undo audit change" });
      return undo.slice(0, -1);
    });
  }, [onHtmlDraftChange, onPreviewBump, onPersistProject]);

  const redoAuditHtml = useCallback(() => {
    setAuditRedoStack((redo) => {
      if (redo.length === 0) return redo;
      const next = redo[redo.length - 1]!;
      setAuditUndoStack((u) => [...u, htmlDraftRef.current]);
      onHtmlDraftChange(next);
      onPreviewBump();
      void onPersistProject?.({ html: next, note: "Redo audit change" });
      return redo.slice(0, -1);
    });
  }, [onHtmlDraftChange, onPreviewBump, onPersistProject]);

  const runFunnelAudit = useCallback(async () => {
    if (!htmlDraft.trim()) return;
    setAuditLoading(true);
    setAuditError(null);
    onStatus("Running funnel audit…");
    try {
      const res = await fetch("/api/agents/copy-injection/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: htmlDraft,
          css: cssDraft,
          objective: funnelObjective,
          campaignContext: funnelCampaignContext,
          funnelName,
          locale: auditLocale,
          market: auditMarket,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuditError(data?.error ?? "Audit failed.");
        onStatus("Audit failed.");
        return;
      }
      setAuditFinal(data.final as FunnelFinalAudit);
      setAuditChunkMeta(data.chunks ?? null);
      setAuditChunkAudits((data.chunkAudits as AuditChunkRow[] | undefined) ?? null);
      setAuditSectionCount(data.meta?.sectionCount ?? 0);
      setAuditGeneratedAt(new Date());
      onStatus("Funnel audit complete.");
    } catch (e) {
      setAuditError(String(e));
      onStatus("Audit failed.");
    } finally {
      setAuditLoading(false);
    }
  }, [
    htmlDraft,
    cssDraft,
    funnelObjective,
    funnelCampaignContext,
    funnelName,
    auditLocale,
    auditMarket,
    onStatus,
  ]);

  useEffect(() => {
    htmlDraftRef.current = htmlDraft;
  }, [htmlDraft]);

  useEffect(() => {
    const onFs = () => {
      setIsPreviewFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePreviewFullscreen = useCallback(() => {
    const el = previewContainerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.().catch(() => {
        onStatus("Fullscreen is not available in this browser.");
      });
    } else {
      void document.exitFullscreen?.().catch(() => {});
    }
  }, [onStatus]);

  useEffect(() => {
    if (!sectionModalId) {
      setPendingInlineImageId(null);
      setInlineImagePrompt("");
      return;
    }
    setSectionModalTab("manual");
    setSectionAiPrompt("");
    setSectionAiLoading(false);
    const html = getSectionOuterHtml(htmlDraftRef.current, sectionModalId);
    const id = window.setTimeout(() => {
      if (sectionEditorRef.current && html) {
        sectionEditorRef.current.innerHTML = prepareSectionHtmlForEditor(html);
      }
    }, 0);
    return () => clearTimeout(id);
  }, [sectionModalId]);

  const preview = createPreviewSrcDoc(htmlDraft, cssDraft, imagesDraft);
  const imageEntries = Object.entries(imagesDraft).filter(
    ([, url]) => url && url.length > 0,
  );

  const sectionIdsForInsert = getTopLevelSectionIds(htmlDraft);

  const execOnEditor = (fn: () => void) => {
    sectionEditorRef.current?.focus();
    fn();
  };

  const patchImageOnServer = useCallback(
    async (sectionId: string, imageUrl: string) => {
      if (!selectedProjectId) return;
      await fetch(`/api/agents/copy-injection/funnels/${selectedProjectId}/image`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, imageUrl }),
      });
    },
    [selectedProjectId],
  );

  const handleDownloadAsset = async (sectionId: string, url: string) => {
    const base = sectionId.replace(/[^a-zA-Z0-9_-]/g, "");
    try {
      const res = await fetch(url, { mode: "cors" });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `funnel-${base}${isVideoUrl(url) ? ".mp4" : ".png"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      const a = document.createElement("a");
      a.href = url;
      a.download = `funnel-${base}`;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
    }
  };

  const handleRegenerateMedia = async () => {
    if (!selectedProjectId || !mediaModalId || !mediaComment.trim()) return;
    const sid = mediaModalId;
    const prevUrl = imagesDraft[sid];
    if (prevUrl) {
      setPreviousImageByKey((p) => ({ ...p, [sid]: prevUrl }));
      setRedoImageByKey((p) => {
        const n = { ...p };
        delete n[sid];
        return n;
      });
    }
    setRegeneratingId(sid);
    onStatus("Regenerating media...");
    try {
      const res = await fetch(
        `/api/agents/copy-injection/funnels/${selectedProjectId}/regenerate-media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionId: sid,
            comment: mediaComment.trim(),
            productImage: mediaProductDataUrl ?? undefined,
            currentHtml: htmlDraft,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        onStatus(data?.error ?? "Regeneration failed.");
        return;
      }
      if (data.latest_images) {
        onImagesDraftChange(data.latest_images as Record<string, string>);
      }
      onPreviewBump();
      setMediaComment("");
      setMediaProductDataUrl(null);
      onStatus("Media updated.");
    } catch (e) {
      onStatus(`Regeneration failed: ${String(e)}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  const handleUndoMedia = async (sectionId: string) => {
    const prev = previousImageByKey[sectionId];
    const cur = imagesDraft[sectionId];
    if (!prev || !cur) return;
    const next = { ...imagesDraft, [sectionId]: prev };
    onImagesDraftChange(next);
    setPreviousImageByKey((p) => {
      const n = { ...p };
      delete n[sectionId];
      return n;
    });
    setRedoImageByKey((p) => ({ ...p, [sectionId]: cur }));
    onPreviewBump();
    await patchImageOnServer(sectionId, prev);
    onStatus("Undo applied.");
  };

  const handleRedoMedia = async (sectionId: string) => {
    const redo = redoImageByKey[sectionId];
    const cur = imagesDraft[sectionId];
    if (!redo || !cur) return;
    const next = { ...imagesDraft, [sectionId]: redo };
    onImagesDraftChange(next);
    setRedoImageByKey((p) => {
      const n = { ...p };
      delete n[sectionId];
      return n;
    });
    setPreviousImageByKey((p) => ({ ...p, [sectionId]: cur }));
    onPreviewBump();
    await patchImageOnServer(sectionId, redo);
    onStatus("Redo applied.");
  };

  const insertInlineImagePlaceholder = () => {
    if (!sectionModalId) return;
    const newId = `${sectionModalId}-inline-${Date.now().toString(36)}`;
    const style = inlineMediaWrapStyle(inlineImagePosition);
    const html = `<div class="funnel-inline-media" style="${style}" data-inline-pos="${inlineImagePosition}"><img src="{{image:${newId}}}" alt="" class="funnel-media" style="width:100%;max-width:100%;height:auto;display:block;border-radius:10px;" /></div><p><br></p>`;
    execOnEditor(() => {
      document.execCommand("insertHTML", false, html);
    });
    setPendingInlineImageId(newId);
    setInlineImagePrompt("");
    onStatus(
      "Image placeholder added — describe it below, then generate. Save section when done.",
    );
  };

  const handleGenerateInlineImage = async () => {
    if (!selectedProjectId || !pendingInlineImageId || !inlineImagePrompt.trim()) {
      onStatus("Add a placeholder and enter an image description first.");
      return;
    }
    if (!sectionModalId) {
      onStatus("Section editor is not open.");
      return;
    }
    const raw = sectionEditorRef.current?.innerHTML ?? "";
    const clean = stripScripts(raw);
    const mergedHtml = replaceSectionOuterHtml(
      htmlDraftRef.current,
      sectionModalId,
      clean,
    );
    const sid = pendingInlineImageId;
    const prevUrl = imagesDraft[sid];
    if (prevUrl) {
      setPreviousImageByKey((p) => ({ ...p, [sid]: prevUrl }));
    }
    setRegeneratingId(sid);
    onStatus("Generating inline image...");
    try {
      const res = await fetch(
        `/api/agents/copy-injection/funnels/${selectedProjectId}/regenerate-media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionId: sid,
            comment: inlineImagePrompt.trim(),
            currentHtml: mergedHtml,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        onStatus(data?.error ?? "Image generation failed.");
        return;
      }
      if (data.latest_images) {
        onImagesDraftChange(data.latest_images as Record<string, string>);
      }
      onHtmlDraftChange(mergedHtml);
      void onPersistProject?.({
        html: mergedHtml,
        note: "Inline image generated",
      });
      onPreviewBump();
      onStatus(
        "Image generated. The section HTML now includes this placeholder; you can keep editing or close.",
      );
    } catch (e) {
      onStatus(`Failed: ${String(e)}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  const getSectionAiPreviewSrcDoc = () => {
    if (!sectionModalId) return "";
    const raw = sectionEditorRef.current?.innerHTML ?? "";
    const clean = stripScripts(raw);
    const merged =
      clean.trim().length > 0
        ? replaceSectionOuterHtml(
            htmlDraftRef.current,
            sectionModalId,
            clean,
          )
        : htmlDraftRef.current;
    return createSectionFocusedPreviewSrcDoc(
      merged,
      cssDraft,
      imagesDraft,
      sectionModalId,
    );
  };

  const handleSectionAiEdit = async () => {
    if (!selectedProjectId || !sectionModalId) {
      onStatus("Select a project and section first.");
      return;
    }
    const prompt = sectionAiPrompt.trim();
    if (prompt.length < 4) {
      onStatus("Describe the change in at least a few words.");
      return;
    }
    setSectionAiLoading(true);
    onStatus("Applying AI edit to this section...");
    try {
      const raw = sectionEditorRef.current?.innerHTML ?? "";
      const clean = stripScripts(raw);
      const mergedHtml =
        clean.trim().length > 0
          ? replaceSectionOuterHtml(
              htmlDraftRef.current,
              sectionModalId,
              clean,
            )
          : htmlDraftRef.current;
      const res = await fetch("/api/agents/copy-injection/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          funnelId: selectedProjectId,
          editComment: prompt,
          currentHtml: mergedHtml,
          currentCss: cssDraft,
          focusSectionId: sectionModalId,
        }),
      });
      const data = (await res.json()) as {
        error?: unknown;
        latest_html?: string;
        latest_css?: string;
        latest_images?: Record<string, string>;
      };
      if (!res.ok) {
        const err =
          typeof data?.error === "string"
            ? data.error
            : typeof data?.error === "object" && data.error !== null
              ? JSON.stringify(data.error)
              : "AI edit failed.";
        onStatus(err);
        return;
      }
      if (data.latest_html !== undefined) {
        onHtmlDraftChange(data.latest_html);
        htmlDraftRef.current = data.latest_html;
      }
      if (data.latest_css !== undefined) {
        onCssDraftChange(data.latest_css);
      }
      if (data.latest_images) {
        onImagesDraftChange(data.latest_images);
      }
      const updated = data.latest_html ?? mergedHtml;
      const newSection = getSectionOuterHtml(updated, sectionModalId);
      if (newSection && sectionEditorRef.current) {
        sectionEditorRef.current.innerHTML =
          prepareSectionHtmlForEditor(newSection);
      }
      void onPersistProject?.({
        html: data.latest_html ?? mergedHtml,
        css: data.latest_css ?? cssDraft,
        note: "AI section edit",
      });
      onPreviewBump();
      setSectionAiPrompt("");
      onStatus(
        "AI changes applied to this section. Check the preview or switch to Manual edit.",
      );
    } catch (e) {
      onStatus(`AI edit failed: ${String(e)}`);
    } finally {
      setSectionAiLoading(false);
    }
  };

  const attachEditorListeners = useCallback(() => {
    editorCleanupRef.current?.();
    editorCleanupRef.current = null;

    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !editorMode) return;
    const doc = iframe.contentDocument;

    const sections = doc.body.querySelectorAll("section[id]");

    const onSectionClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.currentTarget as HTMLElement;
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      queueMicrotask(() => setSectionModalId(t.id));
    };

    const onDocClickCapture = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const a = target?.closest?.("a");
      if (a) {
        e.preventDefault();
        e.stopPropagation();
        const href = window.prompt(
          "Link URL",
          a.getAttribute("href") || "https://",
        );
        if (href?.trim()) {
          a.setAttribute("href", href.trim());
          const next = serializeDocumentPreservingDoctype(
            htmlDraftRef.current,
            doc,
          );
          onHtmlDraftChange(next);
          onPreviewBump();
          void onPersistProject?.({ html: next, note: "Link updated in preview" });
          onStatus("Link updated and saved.");
        }
      }
    };
    doc.addEventListener("click", onDocClickCapture, true);

    const cleanups: Array<() => void> = [];
    cleanups.push(() =>
      doc.removeEventListener("click", onDocClickCapture, true),
    );

    sections.forEach((sec) => {
      const el = sec as HTMLElement;
      el.style.outline = "1px dashed rgba(59,130,246,0.45)";
      el.style.cursor = "pointer";
      el.addEventListener("click", onSectionClick);
      cleanups.push(() => {
        el.removeEventListener("click", onSectionClick);
        el.style.outline = "";
        el.style.cursor = "";
      });
    });

    const cleanup = () => cleanups.forEach((fn) => fn());
    editorCleanupRef.current = cleanup;
    return cleanup;
  }, [editorMode, onHtmlDraftChange, onPreviewBump, onPersistProject, onStatus]);

  useEffect(() => {
    return () => {
      editorCleanupRef.current?.();
      editorCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editorMode || outputTab !== "preview") {
      editorCleanupRef.current?.();
      editorCleanupRef.current = null;
      return;
    }
    const id = window.setTimeout(() => attachEditorListeners(), 80);
    return () => clearTimeout(id);
  }, [editorMode, outputTab, previewKey, attachEditorListeners]);

  const openInsertSheet = () => {
    const ids = getTopLevelSectionIds(htmlDraft);
    setInsertAfterId(
      ids.length ? ids[ids.length - 1]! : null,
    );
    setInsertPrompt("");
    setInsertProduct(null);
    setInsertStep("pick");
    setSelectedPresetId(null);
    setInsertSheetTab("sections");
    setInsertMode("section");
    setSelectedComponentKind(null);
    setComponentFields(defaultUserComponentFields());
    if (insertProductFileRef.current) insertProductFileRef.current.value = "";
    if (componentImageFileRef.current) componentImageFileRef.current.value = "";
    queueMicrotask(() => setInsertSheetOpen(true));
  };

  const pickPreset = (preset: (typeof SECTION_PRESETS)[number]) => {
    setInsertMode("section");
    setSelectedPresetId(preset.id);
    if (preset.id === "custom") {
      setInsertPrompt("");
    } else {
      setInsertPrompt(preset.prompt);
    }
    setInsertStep("confirm");
  };

  const pickComponentKind = (kind: UserComponentKind) => {
    setInsertMode("component");
    setSelectedComponentKind(kind);
    setComponentFields(defaultUserComponentFields());
    if (componentImageFileRef.current) componentImageFileRef.current.value = "";
    setInsertStep("confirm");
  };

  const handleInsertComponent = () => {
    if (!insertAfterId || !selectedComponentKind || !selectedProjectId) {
      onStatus("Select where to insert and a project.");
      return;
    }
    const err = validateUserComponent(selectedComponentKind, componentFields);
    if (err) {
      onStatus(err);
      return;
    }
    const domId = `funnel-comp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const fragment = buildUserComponentHtml(
      selectedComponentKind,
      componentFields,
      domId,
    );
    const merged = insertSectionAfterHtml(htmlDraft, insertAfterId, fragment);
    const nextCss = ensureUserComponentCss(cssDraft);
    onHtmlDraftChange(merged);
    if (nextCss !== cssDraft) {
      onCssDraftChange(nextCss);
    }
    onPreviewBump();
    void onPersistProject?.({
      html: merged,
      css: nextCss,
      note: "Inline component",
    });
    setInsertSheetOpen(false);
    setInsertStep("pick");
    setSelectedComponentKind(null);
    setInsertMode("section");
    if (componentImageFileRef.current) componentImageFileRef.current.value = "";
    onStatus("Component added and saved.");
  };

  const handleInsertSection = async () => {
    if (!selectedProjectId || !insertAfterId || insertPrompt.trim().length < 8) {
      return;
    }
    setInsertLoading(true);
    onStatus("Generating new section...");
    try {
      const res = await fetch(
        `/api/agents/copy-injection/funnels/${selectedProjectId}/insert-section`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            afterSectionId: insertAfterId,
            prompt: insertPrompt.trim(),
            productImage: insertProduct ?? undefined,
            currentHtml: htmlDraft,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        onStatus(data?.error ?? "Insert failed.");
        return;
      }
      const merged = insertSectionAfterHtml(
        htmlDraft,
        insertAfterId,
        data.html as string,
      );
      onHtmlDraftChange(merged);
      onPreviewBump();
      void onPersistProject?.({ html: merged, note: "Section inserted" });
      setInsertSheetOpen(false);
      setInsertStep("pick");
      onStatus("Section inserted and saved.");
    } catch (e) {
      onStatus(`Insert failed: ${String(e)}`);
    } finally {
      setInsertLoading(false);
    }
  };

  const saveSectionFromModal = () => {
    if (!sectionModalId) return;
    const raw = sectionEditorRef.current?.innerHTML ?? "";
    const clean = stripScripts(raw);
    const next = replaceSectionOuterHtml(htmlDraftRef.current, sectionModalId, clean);
    onHtmlDraftChange(next);
    htmlDraftRef.current = next;
    setSectionModalId(null);
    onPreviewBump();
    void onPersistProject?.({
      html: next,
      css: cssDraft,
      note: "Section editor",
    });
    onStatus("Section updated and saved.");
  };

  const applyLinkToSelection = () => {
    const url = window.prompt("Link URL (https://...)");
    if (!url?.trim()) return;
    execOnEditor(() => {
      document.execCommand("createLink", false, url.trim());
    });
  };

  const openMediaModal = (sectionId: string) => {
    queueMicrotask(() => setMediaModalId(sectionId));
  };

  const applyFontSize = (step: "2" | "3" | "4" | "5") => {
    execOnEditor(() => {
      try {
        document.execCommand("styleWithCSS", false, "true");
      } catch {
        /* older browsers */
      }
      document.execCommand("fontSize", false, step);
    });
  };

  const applyForeColor = (hex: string) => {
    const normalized = hex.startsWith("#") ? hex : `#${hex}`;
    setSectionForeColor(normalized);
    execOnEditor(() => {
      document.execCommand("foreColor", false, normalized);
    });
  };

  const SECTION_TEXT_COLOR_PRESETS = [
    "#171717",
    "#3f3f46",
    "#dc2626",
    "#2563eb",
    "#7c3aed",
    "#ea580c",
    "#15803d",
  ] as const;

  return (
    <TooltipProvider delayDuration={200}>
      <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 sm:px-5 sm:py-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant={outputTab === "preview" ? "default" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setOutputTab("preview")}
            >
              <Eye className="size-4" />
              Live preview
            </Button>
            <Button
              type="button"
              variant={outputTab === "media" ? "default" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setOutputTab("media")}
            >
              <ImageIcon className="size-4" />
              Media
            </Button>
          </div>
          {outputTab === "preview" ? (
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Editor
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={editorMode}
                aria-label={editorMode ? "Turn off section editor" : "Turn on section editor"}
                disabled={!htmlDraft.trim()}
                onClick={() => setEditorMode((v) => !v)}
                className={cn(
                  "relative inline-flex h-7 w-[2.7rem] shrink-0 cursor-pointer items-center rounded-full border border-border/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
                  editorMode
                    ? "border-sky-300/50 bg-sky-300/85 shadow-inner shadow-sky-500/10 dark:border-sky-500/35 dark:bg-sky-500/45 dark:shadow-sky-950/20"
                    : "bg-muted/90",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute left-0.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-black/[0.06] transition-transform duration-200 ease-out dark:ring-white/12",
                    editorMode ? "translate-x-[0.94rem]" : "translate-x-0",
                  )}
                >
                  <Pencil
                    className={cn(
                      "size-3 transition-colors",
                      editorMode
                        ? "text-sky-700 dark:text-sky-100"
                        : "text-muted-foreground",
                    )}
                  />
                </span>
              </button>
              {editorMode && selectedProjectId && htmlDraft.trim() ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="size-8 shrink-0 rounded-full border border-sky-300/45 bg-gradient-to-br from-sky-300/25 to-sky-400/10 text-sky-800 shadow-sm transition hover:scale-105 hover:shadow-md dark:border-sky-500/30 dark:from-sky-500/25 dark:to-sky-600/10 dark:text-sky-100"
                      onClick={openInsertSheet}
                      aria-label="Add section"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[14rem] text-xs">
                    Add a section — pick a layout preset (template-aligned)
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-8 shrink-0 rounded-full border border-sky-300/45 bg-gradient-to-br from-sky-300/25 to-sky-400/10 text-sky-800 shadow-sm transition hover:scale-105 hover:shadow-md dark:border-sky-500/30 dark:from-sky-500/25 dark:to-sky-600/10 dark:text-sky-100"
                    disabled={!htmlDraft.trim() || auditLoading}
                    aria-label="Audit funnel"
                    onClick={() => setAuditOpen(true)}
                  >
                    {auditLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FileSearch className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[14rem] text-xs">
                  Audit funnel — full-page review (does not change your HTML)
                </TooltipContent>
              </Tooltip>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                Live
              </span>
            </div>
          ) : null}
        </div>

        {outputTab === "preview" ? (
          <div className="flex flex-1 flex-col p-3">
            {editorMode && htmlDraft.trim() ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Click any section to edit. Use the + button next to the editor
                switch to add a template-matched block. Template structure is
                preserved by the generator.
              </p>
            ) : null}
            <div
              ref={previewContainerRef}
              className={cn(
                "relative min-h-0 flex-1 rounded-lg bg-muted/20",
                isPreviewFullscreen &&
                  "flex h-screen min-h-0 w-full max-w-none flex-col rounded-none border-0 bg-zinc-950 p-0 [&:fullscreen]:h-full [&:fullscreen]:min-h-full",
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute right-3 top-3 z-20 h-10 w-10 rounded-full border border-border/60 shadow-md"
                    onClick={togglePreviewFullscreen}
                    aria-label={
                      isPreviewFullscreen ? "Exit fullscreen" : "Fullscreen preview"
                    }
                  >
                    {isPreviewFullscreen ? (
                      <Minimize2 className="size-4" />
                    ) : (
                      <Maximize2 className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {isPreviewFullscreen
                    ? "Exit fullscreen (or press Esc)"
                    : "View funnel fullscreen"}
                </TooltipContent>
              </Tooltip>
              <iframe
                ref={iframeRef}
                key={previewKey}
                title="live-funnel-preview"
                className={cn(
                  "w-full border border-border/60 bg-white shadow-inner dark:bg-zinc-900",
                  isPreviewFullscreen
                    ? "min-h-0 flex-1 basis-0 rounded-none border-0 shadow-none"
                    : "h-[82vh] rounded-lg",
                )}
                sandbox="allow-same-origin allow-scripts"
                allow="autoplay; fullscreen"
                srcDoc={preview}
                onLoad={() => {
                  if (editorMode) {
                    attachEditorListeners();
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <div className="max-h-[82vh] overflow-auto p-4">
            {imageEntries.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No generated images yet. Generate a funnel first.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {imageEntries.map(([sectionId, url]) => (
                  <li
                    key={sectionId}
                    className="overflow-hidden rounded-lg border border-border/60 bg-muted/20"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      className="relative block w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => openMediaModal(sectionId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openMediaModal(sectionId);
                        }
                      }}
                    >
                      <div className="pointer-events-none aspect-video w-full bg-muted">
                        {isVideoUrl(url) ? (
                          <video
                            src={url}
                            className="size-full object-cover"
                            muted
                            playsInline
                            loop
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt=""
                            className="size-full object-cover"
                          />
                        )}
                      </div>
                      <p className="truncate px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                        {sectionId}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 border-t border-border/40 p-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleDownloadAsset(sectionId, url)}
                      >
                        <Download className="size-3.5" />
                        Download
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!previousImageByKey[sectionId]}
                        onClick={() => void handleUndoMedia(sectionId)}
                      >
                        <Undo2 className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!redoImageByKey[sectionId]}
                        onClick={() => void handleRedoMedia(sectionId)}
                      >
                        <Redo2 className="size-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Dialog
          open={Boolean(mediaModalId)}
          onOpenChange={(open) => {
            if (!open) setMediaModalId(null);
          }}
        >
          <DialogContent
            className="max-w-4xl sm:max-w-4xl"
            showCloseButton
          >
            <DialogHeader className="sr-only">
              <DialogTitle>Media: {mediaModalId ?? ""}</DialogTitle>
            </DialogHeader>
            {mediaModalId ? (
              <div className="relative pt-1">
                <div className="absolute right-12 top-0 z-10">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() =>
                      imagesDraft[mediaModalId] &&
                      handleDownloadAsset(mediaModalId, imagesDraft[mediaModalId])
                    }
                  >
                    <Download className="size-4" />
                    Download
                  </Button>
                </div>
                <div className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/30">
                  {imagesDraft[mediaModalId] &&
                  isVideoUrl(imagesDraft[mediaModalId]) ? (
                    <video
                      src={imagesDraft[mediaModalId]}
                      className="mx-auto max-h-[55vh] w-auto max-w-full"
                      controls
                      playsInline
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imagesDraft[mediaModalId]}
                      alt=""
                      className="mx-auto max-h-[55vh] w-auto max-w-full object-contain"
                    />
                  )}
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  {mediaModalId}
                </p>
                <div className="space-y-2">
                  <label className="text-xs font-medium">
                    Refinement (required to regenerate)
                  </label>
                  <textarea
                    className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Describe how to change this image or GIF..."
                    value={mediaComment}
                    onChange={(e) => setMediaComment(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="text-xs"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) {
                          setMediaProductDataUrl(null);
                          return;
                        }
                        const r = new FileReader();
                        r.onload = () =>
                          setMediaProductDataUrl(r.result as string);
                        r.readAsDataURL(f);
                      }}
                    />
                    {mediaProductDataUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setMediaProductDataUrl(null)}
                      >
                        Clear ref
                      </Button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={
                        (regeneratingId != null &&
                          regeneratingId === mediaModalId) ||
                        !mediaComment.trim() ||
                        !selectedProjectId
                      }
                      onClick={() => void handleRegenerateMedia()}
                    >
                      {regeneratingId != null &&
                      regeneratingId === mediaModalId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Film className="size-4" />
                      )}
                      Regenerate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!previousImageByKey[mediaModalId]}
                      onClick={() => void handleUndoMedia(mediaModalId)}
                    >
                      <Undo2 className="size-4" />
                      Undo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!redoImageByKey[mediaModalId]}
                      onClick={() => void handleRedoMedia(mediaModalId)}
                    >
                      <Redo2 className="size-4" />
                      Redo
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(sectionModalId)}
          onOpenChange={(o) => {
            if (!o) {
              setSectionModalId(null);
              setSectionModalTab("manual");
              setSectionAiPrompt("");
              setSectionAiLoading(false);
            }
          }}
        >
          <DialogContent className="max-h-[min(90vh,880px)] max-w-4xl overflow-y-auto border-border/80 bg-gradient-to-b from-card to-muted/20 shadow-2xl sm:max-w-4xl">
            <DialogHeader className="space-y-1 border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <LayoutTemplate className="size-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg">Edit section</DialogTitle>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {sectionModalId}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="mb-4 flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
              <Button
                type="button"
                variant={sectionModalTab === "manual" ? "default" : "ghost"}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setSectionModalTab("manual")}
              >
                <Pencil className="size-3.5" />
                Manual edit
              </Button>
              <Button
                type="button"
                variant={sectionModalTab === "ai" ? "default" : "ghost"}
                size="sm"
                className="flex-1 gap-1.5"
                onClick={() => setSectionModalTab("ai")}
              >
                <Sparkles className="size-3.5" />
                Edit with AI
              </Button>
            </div>

            <div
              className={cn(
                sectionModalTab !== "manual" && "hidden",
              )}
              aria-hidden={sectionModalTab !== "manual"}
            >
            <div className="rounded-xl border border-border/60 bg-muted/30 p-1.5 shadow-inner">
              <div className="flex flex-wrap items-center gap-0.5">
                <ToolbarIcon
                  label="Bold"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("bold"))
                  }
                >
                  <span className="text-sm font-bold">B</span>
                </ToolbarIcon>
                <ToolbarIcon
                  label="Italic"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("italic"))
                  }
                >
                  <Italic className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Underline"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("underline"))
                  }
                >
                  <Underline className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Strikethrough"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("strikeThrough"))
                  }
                >
                  <Strikethrough className="size-4" />
                </ToolbarIcon>
                <Separator orientation="vertical" className="mx-0.5 h-7" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Text color"
                    >
                      <Palette className="size-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-3" align="start">
                    <p className="mb-2 text-xs font-medium text-foreground">
                      Text color
                    </p>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {SECTION_TEXT_COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          title={c}
                          className="size-8 rounded-full border border-border shadow-sm ring-offset-2 ring-offset-background transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ backgroundColor: c }}
                          onClick={() => applyForeColor(c)}
                        />
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="shrink-0">Custom</span>
                      <input
                        type="color"
                        value={sectionForeColor}
                        onChange={(e) => applyForeColor(e.target.value)}
                        className="h-9 w-full min-w-0 cursor-pointer rounded border border-input bg-background"
                      />
                    </label>
                  </PopoverContent>
                </Popover>
                <Separator orientation="vertical" className="mx-0.5 h-7" />
                <ToolbarIcon
                  label="Link"
                  onClick={applyLinkToSelection}
                >
                  <Link2 className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Bullet list"
                  onClick={() =>
                    execOnEditor(() =>
                      document.execCommand("insertUnorderedList", false),
                    )
                  }
                >
                  <List className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Numbered list"
                  onClick={() =>
                    execOnEditor(() =>
                      document.execCommand("insertOrderedList", false),
                    )
                  }
                >
                  <ListOrdered className="size-4" />
                </ToolbarIcon>
                <Separator orientation="vertical" className="mx-0.5 h-7" />
                <ToolbarIcon
                  label="Align left"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("justifyLeft"))
                  }
                >
                  <AlignLeft className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Align center"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("justifyCenter"))
                  }
                >
                  <AlignCenter className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Align right"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("justifyRight"))
                  }
                >
                  <AlignRight className="size-4" />
                </ToolbarIcon>
                <Separator orientation="vertical" className="mx-0.5 h-7" />
                <ToolbarIcon
                  label="Decrease indent"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("outdent"))
                  }
                >
                  <IndentDecrease className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Increase indent"
                  onClick={() =>
                    execOnEditor(() => document.execCommand("indent"))
                  }
                >
                  <IndentIncrease className="size-4" />
                </ToolbarIcon>
                <Separator orientation="vertical" className="mx-0.5 h-7" />
                <ToolbarIcon
                  label="Smaller text"
                  onClick={() => applyFontSize("2")}
                >
                  <Minus className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon label="Body size" onClick={() => applyFontSize("3")}>
                  <Type className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Larger text"
                  onClick={() => applyFontSize("4")}
                >
                  <Plus className="size-4" />
                </ToolbarIcon>
                <ToolbarIcon
                  label="Largest"
                  onClick={() => applyFontSize("5")}
                >
                  <span className="text-xs font-semibold">A</span>
                </ToolbarIcon>
              </div>
            </div>

            <div
              ref={sectionEditorRef}
              className="section-rich-editor min-h-[220px] max-h-[min(50vh,420px)] overflow-auto rounded-xl border border-zinc-200/90 bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-900 shadow-inner dark:border-zinc-300/90 dark:bg-zinc-50 dark:text-zinc-900"
              contentEditable
              suppressContentEditableWarning
            />

            <div className="rounded-xl border border-dashed border-primary/25 bg-primary/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <ImagePlus className="size-4 text-primary" />
                Inline image for this section
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Choose layout, insert a placeholder, describe the scene, then
                generate. Matches template fidelity when you save.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    { id: "full" as const, icon: LayoutTemplate, label: "Full width" },
                    { id: "left" as const, icon: AlignLeft, label: "Float left" },
                    { id: "right" as const, icon: AlignRight, label: "Float right" },
                    { id: "center" as const, icon: AlignCenter, label: "Centered" },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.id}
                    type="button"
                    variant={inlineImagePosition === opt.id ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setInlineImagePosition(opt.id)}
                  >
                    <opt.icon className="size-3.5" />
                    {opt.label}
                  </Button>
                ))}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mb-3 gap-2"
                onClick={insertInlineImagePlaceholder}
              >
                <Plus className="size-3.5" />
                Insert image placeholder
              </Button>
              {pendingInlineImageId ? (
                <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                  Active slot: {pendingInlineImageId}
                </p>
              ) : null}
              <textarea
                className="mb-2 min-h-[72px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="Describe the image (subject, mood, setting—no text in image)…"
                value={inlineImagePrompt}
                onChange={(e) => setInlineImagePrompt(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                className="gap-2"
                disabled={
                  !pendingInlineImageId ||
                  !inlineImagePrompt.trim() ||
                  !selectedProjectId ||
                  (regeneratingId != null &&
                    regeneratingId === pendingInlineImageId)
                }
                onClick={() => void handleGenerateInlineImage()}
              >
                {regeneratingId != null &&
                regeneratingId === pendingInlineImageId ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Generate image
              </Button>
            </div>
            </div>

            <div
              className={cn(
                "space-y-4",
                sectionModalTab !== "ai" && "hidden",
              )}
              aria-hidden={sectionModalTab !== "ai"}
            >
              <p className="text-xs leading-relaxed text-muted-foreground">
                Preview uses the same styles as the live funnel but only this section
                stays visible (other blocks are hidden) so alignment matches the real
                page. Describe changes for this block — copy, layout, styling, or
                sub-parts (headline, body, CTA, images).
              </p>
              <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20 shadow-inner">
                <iframe
                  key={`ai-section-preview-${sectionModalId}-${previewKey}`}
                  title="Section preview for AI edit"
                  className="h-[min(42vh,380px)] w-full border-0 bg-white dark:bg-zinc-950"
                  sandbox="allow-same-origin allow-scripts"
                  srcDoc={getSectionAiPreviewSrcDoc()}
                />
              </div>
              <textarea
                className="min-h-[100px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="e.g. Shorten the headline; add two bullet benefits under the first paragraph; make the CTA button text more urgent…"
                value={sectionAiPrompt}
                onChange={(e) => setSectionAiPrompt(e.target.value)}
                disabled={sectionAiLoading}
              />
              <Button
                type="button"
                className="gap-2"
                disabled={
                  sectionAiLoading ||
                  !selectedProjectId ||
                  sectionAiPrompt.trim().length < 4
                }
                onClick={() => void handleSectionAiEdit()}
              >
                {sectionAiLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Apply with AI
              </Button>
            </div>

            <DialogFooter className="gap-2 border-t border-border/60 pt-4 sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setSectionModalId(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={saveSectionFromModal}>
                Save section
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet
          open={insertSheetOpen}
          onOpenChange={(o) => {
            setInsertSheetOpen(o);
            if (!o) {
              setInsertStep("pick");
              setSelectedPresetId(null);
              setInsertMode("section");
              setInsertSheetTab("sections");
              setSelectedComponentKind(null);
              setComponentFields(defaultUserComponentFields());
              if (insertProductFileRef.current) {
                insertProductFileRef.current.value = "";
              }
            }
          }}
        >
          <SheetContent
            side="left"
            className="flex w-full flex-col gap-0 border-r border-border/80 p-0 sm:max-w-md"
            showCloseButton
          >
            {insertStep === "pick" ? (
              <>
                <SheetHeader className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-transparent p-5 text-left">
                  <SheetTitle className="flex items-center gap-2 text-lg">
                    <Layers className="size-5 text-primary" />
                    Add to funnel
                  </SheetTitle>
                  <SheetDescription className="text-left text-xs">
                    Full sections use AI to match your template. Components insert
                    simple blocks you customize—HTML is updated immediately; base
                    styles append to your CSS once.
                  </SheetDescription>
                  <div className="mt-4 flex gap-2 rounded-lg border border-border/60 bg-muted/30 p-1">
                    <button
                      type="button"
                      className={cn(
                        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
                        insertSheetTab === "sections"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setInsertSheetTab("sections")}
                    >
                      Sections
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
                        insertSheetTab === "components"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => setInsertSheetTab("components")}
                    >
                      Components
                    </button>
                  </div>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto p-4">
                  {insertSheetTab === "sections" ? (
                    <div className="grid gap-3">
                      {SECTION_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          className={cn(
                            "group flex w-full flex-col gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left transition sm:p-4",
                            "hover:border-sky-400/45 hover:shadow-md dark:hover:border-sky-500/35",
                          )}
                          onClick={() => pickPreset(preset)}
                        >
                          <div
                            className={cn(
                              "relative overflow-hidden rounded-xl border border-border/50 bg-muted/25 px-3 py-3 ring-1 ring-black/[0.03] dark:ring-white/8",
                              "min-h-[7.25rem]",
                            )}
                            aria-hidden
                          >
                            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Layout preview
                            </p>
                            <SectionLayoutSkeleton presetId={preset.id} />
                          </div>
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-inner sm:size-12",
                                preset.accent,
                              )}
                            >
                              <preset.icon className="size-5 text-foreground/90 sm:size-6" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold leading-tight">
                                {preset.title}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {preset.subtitle}
                              </p>
                            </div>
                            <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground opacity-60 transition group-hover:opacity-100" />
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {COMPONENT_PRESETS.map((c) => (
                        <button
                          key={c.kind}
                          type="button"
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left transition sm:p-4",
                            "hover:border-emerald-400/45 hover:shadow-md dark:hover:border-emerald-500/35",
                          )}
                          onClick={() => pickComponentKind(c.kind)}
                        >
                          <div
                            className={cn(
                              "flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-inner sm:size-12",
                              c.accent,
                            )}
                          >
                            <c.icon className="size-5 text-foreground/90 sm:size-6" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold leading-tight">{c.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {c.subtitle}
                            </p>
                          </div>
                          <ChevronRight className="size-5 shrink-0 text-muted-foreground opacity-60 transition group-hover:opacity-100" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-border/60 p-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mb-3 gap-1.5 -ml-2 text-muted-foreground"
                    onClick={() => {
                      setInsertStep("pick");
                      if (insertMode === "component") {
                        setInsertSheetTab("components");
                      } else {
                        setInsertSheetTab("sections");
                      }
                    }}
                  >
                    <ArrowLeft className="size-4" />
                    {insertMode === "component" ? "Back to components" : "Back to layouts"}
                  </Button>
                  <SheetTitle className="text-left text-base">
                    {insertMode === "component"
                      ? `Add ${COMPONENT_PRESETS.find((c) => c.kind === selectedComponentKind)?.title ?? "component"}`
                      : `${SECTION_PRESETS.find((p) => p.id === selectedPresetId)?.title ?? "Custom"} section`}
                  </SheetTitle>
                  <SheetDescription className="text-left text-xs">
                    {insertMode === "component"
                      ? "Customize the fields below. The block is inserted into your HTML; shared component styles are appended to your CSS once (you can edit both in the code tabs)."
                      : "Insert after the section you choose. The AI matches your template scaffold."}
                  </SheetDescription>
                  {insertMode === "section" && selectedPresetId ? (
                    <div className="mt-3 rounded-xl border border-border/50 bg-muted/20 p-3">
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Layout you selected
                      </p>
                      <div className="min-h-[5rem] rounded-lg border border-dashed border-border/60 bg-background/80 px-2 py-2">
                        <SectionLayoutSkeleton presetId={selectedPresetId} />
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Insert after
                    </label>
                    <select
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                      value={insertAfterId ?? ""}
                      onChange={(e) =>
                        setInsertAfterId(e.target.value || null)
                      }
                    >
                      {sectionIdsForInsert.length === 0 ? (
                        <option value="">No sections in page</option>
                      ) : (
                        sectionIdsForInsert.map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  {insertMode === "section" ? (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Instruction for AI (min 8 chars)
                    </label>
                    <textarea
                      className="min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                      placeholder="What should this block say or do?"
                      value={insertPrompt}
                      onChange={(e) => setInsertPrompt(e.target.value)}
                    />
                  </div>
                  ) : (
                  <div className="space-y-4">
                    {selectedComponentKind === "heading" ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Heading level
                          </label>
                          <select
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            value={componentFields.headingLevel}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                headingLevel: e.target.value as UserComponentFields["headingLevel"],
                              }))
                            }
                          >
                            <option value="h2">Heading 2</option>
                            <option value="h3">Heading 3</option>
                            <option value="h4">Heading 4</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Text
                          </label>
                          <input
                            type="text"
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            value={componentFields.headingText}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                headingText: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">
                              Size
                            </label>
                            <select
                              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                              value={componentFields.headingFontSize}
                              onChange={(e) =>
                                setComponentFields((f) => ({
                                  ...f,
                                  headingFontSize: e.target
                                    .value as UserComponentFields["headingFontSize"],
                                }))
                              }
                            >
                              <option value="sm">Small</option>
                              <option value="md">Medium</option>
                              <option value="lg">Large</option>
                              <option value="xl">XL</option>
                              <option value="2xl">2XL</option>
                              <option value="3xl">3XL</option>
                            </select>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">
                              Weight
                            </label>
                            <select
                              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                              value={componentFields.headingFontWeight}
                              onChange={(e) =>
                                setComponentFields((f) => ({
                                  ...f,
                                  headingFontWeight: e.target
                                    .value as UserComponentFields["headingFontWeight"],
                                }))
                              }
                            >
                              <option value="normal">Normal</option>
                              <option value="medium">Medium</option>
                              <option value="semibold">Semibold</option>
                              <option value="bold">Bold</option>
                            </select>
                          </div>
                        </div>
                      </>
                    ) : null}
                    {selectedComponentKind === "paragraph" ? (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Paragraph
                          </label>
                          <textarea
                            className="min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm"
                            placeholder="Your paragraph…"
                            value={componentFields.paragraphText}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                paragraphText: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Text size
                          </label>
                          <select
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            value={componentFields.paragraphFontSize}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                paragraphFontSize: e.target
                                  .value as UserComponentFields["paragraphFontSize"],
                              }))
                            }
                          >
                            <option value="sm">Small</option>
                            <option value="base">Body</option>
                            <option value="md">Medium</option>
                            <option value="lg">Large</option>
                          </select>
                        </div>
                      </div>
                    ) : null}
                    {selectedComponentKind === "link" ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Link text
                          </label>
                          <input
                            type="text"
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            value={componentFields.linkText}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                linkText: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            URL
                          </label>
                          <input
                            type="url"
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            placeholder="https://"
                            value={componentFields.linkHref}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                linkHref: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input"
                            checked={componentFields.linkNewTab}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                linkNewTab: e.target.checked,
                              }))
                            }
                          />
                          Open in new tab
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input"
                            checked={componentFields.linkUnderline}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                linkUnderline: e.target.checked,
                              }))
                            }
                          />
                          Underline link
                        </label>
                      </>
                    ) : null}
                    {selectedComponentKind === "image" ? (
                      <>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Image
                          </label>
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            Paste a public image URL, or upload a file from your
                            device. Uploads are embedded in the HTML (best for
                            smaller images; use a URL for very large files).
                          </p>
                          <input
                            type="url"
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            placeholder="https://…"
                            value={
                              componentFields.imageSrc.startsWith("data:")
                                ? ""
                                : componentFields.imageSrc
                            }
                            onChange={(e) => {
                              if (componentImageFileRef.current) {
                                componentImageFileRef.current.value = "";
                              }
                              setComponentFields((f) => ({
                                ...f,
                                imageSrc: e.target.value,
                              }));
                            }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            ref={componentImageFileRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            aria-label="Upload image file"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const maxBytes = 5 * 1024 * 1024;
                              if (file.size > maxBytes) {
                                onStatus(
                                  "Image is too large. Use a file under 5 MB or paste a URL.",
                                );
                                e.target.value = "";
                                return;
                              }
                              const r = new FileReader();
                              r.onload = () => {
                                const dataUrl = r.result as string;
                                setComponentFields((f) => ({
                                  ...f,
                                  imageSrc: dataUrl,
                                  imageAlt: f.imageAlt.trim()
                                    ? f.imageAlt
                                    : file.name
                                        .replace(/\.[^.]+$/, "")
                                        .replace(/[-_]+/g, " ")
                                        .trim(),
                                }));
                              };
                              r.readAsDataURL(file);
                            }}
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              componentImageFileRef.current?.click()
                            }
                          >
                            <Upload className="size-3.5" />
                            Upload image
                          </Button>
                          {componentFields.imageSrc.startsWith("data:") ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-xs"
                              onClick={() => {
                                setComponentFields((f) => ({
                                  ...f,
                                  imageSrc: "",
                                }));
                                if (componentImageFileRef.current) {
                                  componentImageFileRef.current.value = "";
                                }
                              }}
                            >
                              Clear upload
                            </Button>
                          ) : null}
                        </div>
                        {componentFields.imageSrc.trim() ? (
                          <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20 p-2">
                            <div className="flex gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={componentFields.imageSrc}
                                alt=""
                                className="h-24 max-w-[45%] shrink-0 rounded-lg object-contain"
                              />
                              <p className="flex min-w-0 flex-1 items-center text-[11px] leading-snug text-muted-foreground">
                                {componentFields.imageSrc.startsWith("data:")
                                  ? "Uploaded image will be embedded in your funnel HTML."
                                  : "Preview from URL."}
                              </p>
                            </div>
                          </div>
                        ) : null}
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">
                            Alt text
                          </label>
                          <input
                            type="text"
                            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                            value={componentFields.imageAlt}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                imageAlt: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </>
                    ) : null}
                    {selectedComponentKind === "divider" ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          Line color
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="color"
                            className="h-10 w-14 cursor-pointer rounded border border-input bg-background p-1"
                            value={
                              componentFields.style.dividerColor || "#cccccc"
                            }
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                style: {
                                  ...f.style,
                                  dividerColor: e.target.value,
                                },
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() =>
                              setComponentFields((f) => ({
                                ...f,
                                style: { ...f.style, dividerColor: "" },
                              }))
                            }
                          >
                            Default line
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-3 rounded-xl border border-dashed border-primary/25 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-foreground">
                        Block appearance
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Padding
                          </label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                            value={componentFields.style.padding}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                style: {
                                  ...f.style,
                                  padding: e.target.value as SpacingToken,
                                },
                              }))
                            }
                          >
                            <option value="none">None</option>
                            <option value="xs">XS</option>
                            <option value="sm">S</option>
                            <option value="md">M</option>
                            <option value="lg">L</option>
                            <option value="xl">XL</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Vertical margin
                          </label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                            value={componentFields.style.marginY}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                style: {
                                  ...f.style,
                                  marginY: e.target.value as SpacingToken,
                                },
                              }))
                            }
                          >
                            <option value="none">None</option>
                            <option value="xs">XS</option>
                            <option value="sm">S</option>
                            <option value="md">M</option>
                            <option value="lg">L</option>
                            <option value="xl">XL</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Rounded corners
                          </label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                            value={componentFields.style.borderRadius}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                style: {
                                  ...f.style,
                                  borderRadius: e.target.value as RadiusToken,
                                },
                              }))
                            }
                          >
                            <option value="none">None</option>
                            <option value="sm">S</option>
                            <option value="md">M</option>
                            <option value="lg">L</option>
                            <option value="full">Pill</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Shadow
                          </label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                            value={componentFields.style.shadow}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                style: {
                                  ...f.style,
                                  shadow: e.target.value as ShadowToken,
                                },
                              }))
                            }
                          >
                            <option value="none">None</option>
                            <option value="sm">Soft</option>
                            <option value="md">Medium</option>
                            <option value="lg">Strong</option>
                            <option value="xl">Dramatic</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Text color
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                              value={
                                componentFields.style.textColor || "#171717"
                              }
                              onChange={(e) =>
                                setComponentFields((f) => ({
                                  ...f,
                                  style: {
                                    ...f.style,
                                    textColor: e.target.value,
                                  },
                                }))
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() =>
                                setComponentFields((f) => ({
                                  ...f,
                                  style: { ...f.style, textColor: "" },
                                }))
                              }
                            >
                              Inherit
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Background
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                              value={
                                componentFields.style.backgroundColor ||
                                "#ffffff"
                              }
                              onChange={(e) =>
                                setComponentFields((f) => ({
                                  ...f,
                                  style: {
                                    ...f.style,
                                    backgroundColor: e.target.value,
                                  },
                                }))
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() =>
                                setComponentFields((f) => ({
                                  ...f,
                                  style: {
                                    ...f.style,
                                    backgroundColor: "",
                                  },
                                }))
                              }
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Border
                          </label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                            value={componentFields.style.borderWidth}
                            onChange={(e) =>
                              setComponentFields((f) => ({
                                ...f,
                                style: {
                                  ...f.style,
                                  borderWidth: e.target.value as
                                    | "none"
                                    | "thin"
                                    | "medium",
                                },
                              }))
                            }
                          >
                            <option value="none">None</option>
                            <option value="thin">Thin</option>
                            <option value="medium">Medium</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] text-muted-foreground">
                            Border color
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              className="h-9 w-12 cursor-pointer rounded border border-input p-0.5"
                              value={
                                componentFields.style.borderColor || "#e5e5e5"
                              }
                              onChange={(e) =>
                                setComponentFields((f) => ({
                                  ...f,
                                  style: {
                                    ...f.style,
                                    borderColor: e.target.value,
                                  },
                                }))
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 px-1.5 text-xs"
                              onClick={() =>
                                setComponentFields((f) => ({
                                  ...f,
                                  style: { ...f.style, borderColor: "" },
                                }))
                              }
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        Styles are saved as inline CSS on this block so they work
                        in preview and exports. Edit the HTML/CSS tabs anytime.
                      </p>
                    </div>
                  </div>
                  )}
                  {insertMode === "section" ? (
                    <>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Product reference (optional)
                    </label>
                    <input
                      ref={insertProductFileRef}
                      id="copy-injection-insert-product-file"
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) {
                          setInsertProduct(null);
                          return;
                        }
                        const r = new FileReader();
                        r.onload = () => setInsertProduct(r.result as string);
                        r.readAsDataURL(f);
                      }}
                    />
                    {insertProduct ? (
                      <div className="flex items-stretch gap-3 rounded-xl border border-sky-300/45 bg-gradient-to-br from-sky-50/90 to-transparent p-3 shadow-sm dark:border-sky-500/35 dark:from-sky-950/40 dark:to-transparent">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={insertProduct}
                          alt=""
                          className="size-16 shrink-0 rounded-lg object-cover ring-1 ring-black/5 dark:ring-white/10"
                        />
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                          <p className="text-sm font-medium leading-tight text-foreground">
                            Reference attached
                          </p>
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            Shown to the model when generating this section
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-8 gap-1.5 px-2.5 text-xs"
                              onClick={() => insertProductFileRef.current?.click()}
                            >
                              <Upload className="size-3.5" />
                              Replace
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 px-2.5 text-xs text-muted-foreground"
                              onClick={() => {
                                setInsertProduct(null);
                                if (insertProductFileRef.current) {
                                  insertProductFileRef.current.value = "";
                                }
                              }}
                            >
                              <X className="size-3.5" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label="Upload optional product reference image"
                        onClick={() => insertProductFileRef.current?.click()}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl border border-dashed border-sky-300/55 bg-gradient-to-br from-sky-50/70 via-transparent to-transparent p-3.5 text-left transition",
                          "hover:border-sky-400/70 hover:from-sky-100/80 hover:shadow-sm",
                          "dark:border-sky-500/40 dark:from-sky-950/50 dark:hover:border-sky-400/55 dark:hover:from-sky-900/40",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 focus-visible:ring-offset-2",
                        )}
                      >
                        <div
                          className={cn(
                            "flex size-12 shrink-0 items-center justify-center rounded-xl",
                            "bg-sky-200/70 text-sky-900 shadow-inner",
                            "dark:bg-sky-500/25 dark:text-sky-50",
                            "transition group-hover:scale-[1.02]",
                          )}
                        >
                          <ImagePlus className="size-6" strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">
                            Add product image
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            Optional — packaging, label, or product shot so the new
                            section can align with your visuals
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center pr-0.5">
                          <span className="rounded-full border border-sky-300/50 bg-background/80 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-sky-800 dark:border-sky-500/40 dark:text-sky-100">
                            Upload
                          </span>
                        </div>
                      </button>
                    )}
                  </div>
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={
                      insertLoading ||
                      !insertPrompt.trim() ||
                      insertPrompt.trim().length < 8 ||
                      !insertAfterId ||
                      !selectedProjectId
                    }
                    onClick={() => void handleInsertSection()}
                  >
                    {insertLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Generate & insert
                  </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      className="gap-2"
                      disabled={
                        !insertAfterId ||
                        !selectedProjectId ||
                        !selectedComponentKind
                      }
                      onClick={() => handleInsertComponent()}
                    >
                      <Plus className="size-4" />
                      Add to page
                    </Button>
                  )}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        <FunnelAuditModal
          open={auditOpen}
          onOpenChange={setAuditOpen}
          loading={auditLoading}
          error={auditError}
          final={auditFinal}
          chunkMeta={auditChunkMeta}
          chunkAudits={auditChunkAudits}
          sectionCount={auditSectionCount}
          funnelName={funnelName}
          locale={auditLocale}
          market={auditMarket}
          generatedAt={auditGeneratedAt}
          onRunAudit={() => void runFunnelAudit()}
          htmlDraft={htmlDraft}
          previewCss={cssDraft}
          previewImages={imagesDraft}
          funnelObjective={funnelObjective}
          onApplyHtml={commitAuditHtml}
          onAuditUndo={undoAuditHtml}
          onAuditRedo={redoAuditHtml}
          canAuditUndo={auditUndoStack.length > 0}
          canAuditRedo={auditRedoStack.length > 0}
        />
      </section>
    </TooltipProvider>
  );
}
