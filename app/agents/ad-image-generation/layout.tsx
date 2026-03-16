import { AdImageGenerationShell } from "@/components/ad-image-generation-shell";

export default function AdImageGenerationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdImageGenerationShell>{children}</AdImageGenerationShell>;
}
