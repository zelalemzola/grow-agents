import { CopyInjectionProjectEditor } from "@/components/copy-injection-project-editor";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function CopyInjectionProjectPage({ params }: Params) {
  const { id } = await params;
  return <CopyInjectionProjectEditor initialProjectId={id} />;
}
