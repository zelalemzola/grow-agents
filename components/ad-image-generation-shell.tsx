"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderPlus,
  FolderOpen,
  HomeIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ModeToggle } from "./ModeToggle";

const navItems = [
  {
    label: "Home",
    href: "/",
    icon: HomeIcon,
  },
  {
    label: "Dashboard",
    href: "/agents/ad-image-generation",
    icon: LayoutDashboard,
  },
  {
    label: "Create New Project",
    href: "/agents/ad-image-generation/projects/new",
    icon: FolderPlus,
  },
  {
    label: "View All Projects",
    href: "/agents/ad-image-generation/projects",
    icon: FolderOpen,
  },
];

export function AdImageGenerationShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar collapsible="icon" className="border-r">
        <SidebarHeader className="border-b border-sidebar-border">
          <div className="flex flex-1 items-center gap-2 px-2 py-2">
            <SidebarTrigger className="-ml-1" />
            <SidebarGroupLabel className="text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
              Grow Agents
            </SidebarGroupLabel>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
              Ad Image Generation
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const active =
                    item.href === "/agents/ad-image-generation"
                      ? pathname === item.href
                      : item.href === "/agents/ad-image-generation/projects"
                        ? pathname === item.href
                        : pathname.startsWith(item.href);
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <Icon className="size-4 shrink-0" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border group-data-[collapsible=icon]:hidden">
          <div className="px-2 py-2 text-xs text-sidebar-foreground/70">
            <ModeToggle />
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4 md:hidden">
          <SidebarTrigger />
          <span className="font-medium">Ad Image Generation</span>
        </header>
        <div className="flex-1 overflow-auto p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
