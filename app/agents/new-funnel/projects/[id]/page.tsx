import { NewFunnelProjectEditor } from "@/components/new-funnel-project-editor";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function NewFunnelProjectPage({ params }: Params) {
  const { id } = await params;
  return <NewFunnelProjectEditor initialProjectId={id} />;
}
