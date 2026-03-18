import { NewFunnelShell } from "@/components/new-funnel-shell";

export default function NewFunnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <NewFunnelShell>{children}</NewFunnelShell>;
}
