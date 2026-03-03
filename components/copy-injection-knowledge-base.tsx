"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KnowledgeDocScope, KnowledgeDocumentRecord } from "@/lib/types";

const scopeOptions: KnowledgeDocScope[] = [
  "global",
  "copy",
  "image",
  "headline-image",
  "body-image",
  "product-image",
  "compliance",
];

export function CopyInjectionKnowledgeBase() {
  const [documents, setDocuments] = useState<KnowledgeDocumentRecord[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<KnowledgeDocScope>("global");
  const [priority, setPriority] = useState("100");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("Load and manage reusable knowledge documents.");
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const parseApiResponse = async (response: Response): Promise<unknown> => {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return response.json();
    }

    const raw = await response.text();
    throw new Error(
      `Unexpected non-JSON response from server: ${raw.slice(0, 180)}`,
    );
  };

  const loadDocuments = useCallback(async () => {
    const response = await fetch("/api/agents/copy-injection/knowledge");
    const data = (await parseApiResponse(response)) as {
      documents?: KnowledgeDocumentRecord[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error ?? "Knowledge fetch failed.");
    }
    setDocuments((data.documents ?? []) as KnowledgeDocumentRecord[]);
  }, []);

  useEffect(() => {
    loadDocuments().catch((error) => {
      setStatus(`Failed to load knowledge documents: ${String(error)}`);
    });
  }, [loadDocuments]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setScope("global");
    setPriority("100");
    setContent("");
    setEditingId(null);
  };

  const handleUploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    setIsImporting(true);
    setStatus("Importing files and extracting text...");
    try {
      let imported = 0;
      let duplicates = 0;
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", file.name.replace(/\.(pdf|txt|md)$/i, ""));
        formData.append("description", description || `Imported from ${file.name}`);
        formData.append("scope", scope);
        formData.append("priority", priority || "100");
        formData.append("isActive", "true");

        const response = await fetch("/api/agents/copy-injection/knowledge/import", {
          method: "POST",
          body: formData,
        });
        const data = (await parseApiResponse(response)) as {
          duplicate?: boolean;
          error?: string;
          chunkCount?: number;
        };
        if (!response.ok) {
          throw new Error(data.error ?? `Import failed for ${file.name}`);
        }

        if (data.duplicate) {
          duplicates += 1;
        } else {
          imported += Number(data.chunkCount ?? 1);
        }
      }

      await loadDocuments();
      setStatus(
        `Import complete. Added ${imported} document chunk(s), skipped ${duplicates} duplicate file(s). Active docs are used in generation.`,
      );
    } catch (error) {
      setStatus(`File import failed: ${String(error)}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus(editingId ? "Updating knowledge document..." : "Saving knowledge document...");
    try {
      const response = await fetch("/api/agents/copy-injection/knowledge", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          name,
          description: description || undefined,
          scope,
          priority: Number(priority),
          content,
        }),
      });

      const data = (await parseApiResponse(response)) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Knowledge save failed.");
      }

      await loadDocuments();
      resetForm();
      setStatus(editingId ? "Knowledge document updated." : "Knowledge document created.");
    } catch (error) {
      setStatus(`Knowledge save failed: ${String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (document: KnowledgeDocumentRecord) => {
    setStatus(`${document.is_active ? "Disabling" : "Enabling"} knowledge document...`);
    try {
      const response = await fetch("/api/agents/copy-injection/knowledge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: document.id,
          isActive: !document.is_active,
        }),
      });
      const data = (await parseApiResponse(response)) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Status update failed.");
      }
      await loadDocuments();
      setStatus("Knowledge document status updated.");
    } catch (error) {
      setStatus(`Status update failed: ${String(error)}`);
    }
  };

  const handleDelete = async (id: string) => {
    setStatus("Deleting knowledge document...");
    try {
      const response = await fetch("/api/agents/copy-injection/knowledge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await parseApiResponse(response)) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Delete failed.");
      }
      await loadDocuments();
      if (editingId === id) {
        resetForm();
      }
      setStatus("Knowledge document deleted.");
    } catch (error) {
      setStatus(`Delete failed: ${String(error)}`);
    }
  };

  const handleStartEdit = (document: KnowledgeDocumentRecord) => {
    setEditingId(document.id);
    setName(document.name);
    setDescription(document.description ?? "");
    setScope(document.scope);
    setPriority(String(document.priority));
    setContent(document.content);
    setStatus(`Editing "${document.name}".`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <section className="rounded-xl border bg-card p-5">
        <h1 className="text-xl font-semibold">Knowledge Base Manager</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add reusable rules from documents so generation and image prompts follow your guidance.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>

        <div className="mt-4 space-y-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Document name"
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
          />
          <div className="grid gap-2 md:grid-cols-2">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={scope}
              onChange={(event) => setScope(event.target.value as KnowledgeDocScope)}
            >
              {scopeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <Input
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
              placeholder="Priority (lower = higher precedence)"
            />
          </div>
          <textarea
            className="min-h-64 w-full rounded-md border bg-background p-3 text-sm"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste rules/guidelines here..."
          />
          <input
            type="file"
            multiple
            accept=".pdf,.txt,.md"
            onChange={handleUploadFiles}
            className="w-full rounded-md border bg-background p-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Upload PDF/TXT/MD to auto-create active knowledge documents. These rules are injected into funnel generation and image prompts.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSave}
              disabled={
                isSaving ||
                isImporting ||
                name.trim().length < 3 ||
                content.trim().length < 20 ||
                Number.isNaN(Number(priority))
              }
            >
              {isSaving ? "Saving..." : editingId ? "Update Document" : "Save Document"}
            </Button>
            {editingId ? (
              <Button variant="outline" onClick={resetForm}>
                Cancel Edit
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-lg font-medium">Saved Documents</h2>
        <div className="mt-3 space-y-2">
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No knowledge documents yet.</p>
          ) : (
            documents.map((document) => (
              <div key={document.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{document.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      scope: {document.scope} | priority: {document.priority}
                    </p>
                    {document.source_file_name ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        source: {document.source_file_name} | v{document.source_version} | part{" "}
                        {document.chunk_index}/{document.chunk_count}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      document.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {document.is_active ? "active" : "inactive"}
                  </span>
                </div>
                {document.description ? (
                  <p className="mt-2 text-xs text-muted-foreground">{document.description}</p>
                ) : null}
                <p className="mt-2 line-clamp-4 text-xs text-muted-foreground">{document.content}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleStartEdit(document)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleToggleActive(document)}>
                    {document.is_active ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(document.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
