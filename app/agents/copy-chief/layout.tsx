import { CopyChiefShell } from "@/components/copy-chief-shell";

export default function CopyChiefLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CopyChiefShell>{children}</CopyChiefShell>;
}
