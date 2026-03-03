create extension if not exists "pgcrypto";

create table if not exists public.agent_templates (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  name text not null,
  description text,
  instructions text not null,
  html_scaffold text,
  css_scaffold text,
  created_at timestamptz not null default now()
);

create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  name text not null,
  objective text not null,
  template_id uuid references public.agent_templates(id) on delete set null,
  latest_html text not null,
  latest_css text not null,
  latest_images jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.funnel_versions (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  source text not null check (source in ('generate', 'edit')),
  user_instruction text not null,
  html text not null,
  css text not null,
  images jsonb not null default '{}'::jsonb,
  section_plan jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  agent_slug text not null,
  name text not null,
  description text,
  scope text not null check (
    scope in (
      'global',
      'copy',
      'image',
      'headline-image',
      'body-image',
      'product-image',
      'compliance'
    )
  ),
  content text not null,
  source_hash text,
  source_file_name text,
  source_mime_type text,
  source_version integer not null default 1,
  source_group_id uuid,
  chunk_index integer not null default 1,
  chunk_count integer not null default 1,
  supersedes_document_id uuid references public.agent_knowledge_documents(id) on delete set null,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_templates_slug_created
  on public.agent_templates (agent_slug, created_at desc);

create index if not exists idx_funnels_slug_updated
  on public.funnels (agent_slug, updated_at desc);

create index if not exists idx_funnel_versions_funnel_created
  on public.funnel_versions (funnel_id, created_at desc);

create index if not exists idx_agent_knowledge_documents_agent_active_priority
  on public.agent_knowledge_documents (agent_slug, is_active, priority, created_at desc);

create index if not exists idx_agent_knowledge_documents_source_file_version
  on public.agent_knowledge_documents (agent_slug, source_file_name, source_version desc);

create index if not exists idx_agent_knowledge_documents_source_hash
  on public.agent_knowledge_documents (agent_slug, source_hash);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_funnels_updated_at on public.funnels;
create trigger trg_funnels_updated_at
before update on public.funnels
for each row
execute function public.set_updated_at();

drop trigger if exists trg_agent_knowledge_documents_updated_at on public.agent_knowledge_documents;
create trigger trg_agent_knowledge_documents_updated_at
before update on public.agent_knowledge_documents
for each row
execute function public.set_updated_at();

alter table public.agent_templates disable row level security;
alter table public.funnels disable row level security;
alter table public.funnel_versions disable row level security;
alter table public.agent_knowledge_documents disable row level security;
