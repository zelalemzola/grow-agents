export type AgentSlug =
  | "copy-injection"
  | "translation"
  | "policy-changes"
  | "new-funnel"
  | "copy-chief"
  | "ad-image-generation";

export interface AgentCard {
  slug: AgentSlug;
  title: string;
  description: string;
  status: "live" | "coming-soon";
}

export interface TemplateRecord {
  id: string;
  name: string;
  description: string | null;
  instructions: string;
  html_scaffold: string | null;
  css_scaffold: string | null;
  created_at: string;
}

export interface FunnelRecord {
  id: string;
  agent_slug?: string;
  name: string;
  objective: string;
  template_id: string | null;
  latest_html: string;
  latest_css: string;
  latest_images: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/** Lightweight funnel for list views - excludes large fields (html, css, images) */
export interface FunnelListItem {
  id: string;
  name: string;
  objective: string;
  template_id: string | null;
  agent_slug: string;
  created_at: string;
  updated_at: string;
}

export interface FunnelVersionRecord {
  id: string;
  funnel_id: string;
  source: "generate" | "edit";
  user_instruction: string;
  html: string;
  css: string;
  images: Record<string, string>;
  section_plan: FunnelVersionSectionPlan | null;
  created_at: string;
}

export type KnowledgeDocScope =
  | "global"
  | "copy"
  | "image"
  | "headline-image"
  | "body-image"
  | "product-image"
  | "compliance";

export interface KnowledgeDocumentRecord {
  id: string;
  agent_slug: AgentSlug;
  name: string;
  description: string | null;
  scope: KnowledgeDocScope;
  content: string;
  source_hash: string | null;
  source_file_name: string | null;
  source_mime_type: string | null;
  source_version: number;
  source_group_id: string | null;
  chunk_index: number;
  chunk_count: number;
  supersedes_document_id: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface FunnelVersionSectionPlan {
  editSummary?: string;
  imageEdits?: Array<{ sectionId: string; prompt: string }>;
  knowledgeDocumentIds?: string[];
  [key: string]: unknown;
}
