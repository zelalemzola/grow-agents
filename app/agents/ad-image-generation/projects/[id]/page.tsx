import { AdImageProjectDetail } from "@/components/ad-image-project-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdImageProjectPage({ params }: PageProps) {
  const { id } = await params;
  return <AdImageProjectDetail projectId={id} />;
}
