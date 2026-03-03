import { CopyInjectionShell } from "@/components/copy-injection-shell";

export default function CopyInjectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CopyInjectionShell>{children}</CopyInjectionShell>;
}
