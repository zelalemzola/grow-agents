"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    label: "Dashboard",
    href: "/agents/copy-injection",
  },
  {
    label: "Create New Project",
    href: "/agents/copy-injection/projects/new",
  },
  {
    label: "View All Projects",
    href: "/agents/copy-injection/projects",
  },
  {
    label: "Train with Templates",
    href: "/agents/copy-injection/templates",
  },
  {
    label: "Knowledge Base",
    href: "/agents/copy-injection/knowledge",
  },
  {
    label: "Soon",
    href: "/agents/copy-injection/soon",
  },
];

export function CopyInjectionShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto grid w-full max-w-[1600px] gap-4 p-4 md:grid-cols-[260px_1fr]">
        <aside className="rounded-xl border bg-card p-4">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Funnel Generator Agent
          </h1>
          <nav className="mt-4 space-y-1">
            {navItems.map((item) => {
              const active =
                item.href === "/agents/copy-injection"
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
