import { CopyChiefProjectEditor } from "@/components/copy-chief-project-editor";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function CopyChiefProjectPage({ params }: Params) {
  const { id } = await params;
  return <CopyChiefProjectEditor initialProjectId={id} />;
}
