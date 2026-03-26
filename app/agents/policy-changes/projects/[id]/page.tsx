import { PolicyChangesProjectEditor } from "@/components/policy-changes-project-editor";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function PolicyChangesProjectPage({ params }: Params) {
  const { id } = await params;
  return <PolicyChangesProjectEditor initialProjectId={id} />;
}
