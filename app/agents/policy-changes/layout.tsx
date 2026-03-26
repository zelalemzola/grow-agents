import { PolicyChangesShell } from "@/components/policy-changes-shell";

export default function PolicyChangesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PolicyChangesShell>{children}</PolicyChangesShell>;
}
