import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function CopyInjectionDashboardPage() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h1 className="text-2xl font-semibold">Copy + Image Injection Dashboard</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Manage projects, train templates, and build high-conversion funnel pages
        with AI-assisted generation and precise editing workflows.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border p-4">
          <h2 className="font-medium">Create New Project</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start a new funnel from a prompt and selected template style.
          </p>
          <Button asChild className="mt-4">
            <Link href="/agents/copy-injection/projects/new">Open</Link>
          </Button>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-medium">View All Projects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open and continue previous work, revisions, and exports.
          </p>
          <Button asChild variant="secondary" className="mt-4">
            <Link href="/agents/copy-injection/projects">Open</Link>
          </Button>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-medium">Train with Templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload and store template rules, HTML scaffolds, and CSS scaffolds.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/agents/copy-injection/templates">Open</Link>
          </Button>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="font-medium">Knowledge Base</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add reusable guideline documents for copy and image generation behavior.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/agents/copy-injection/knowledge">Open</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
