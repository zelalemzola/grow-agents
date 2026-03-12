import { TranslationShell } from "@/components/translation-shell";

export default function TranslationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TranslationShell>{children}</TranslationShell>;
}
