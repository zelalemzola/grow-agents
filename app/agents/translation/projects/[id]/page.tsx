import { TranslationProjectEditor } from "@/components/translation-project-editor";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function TranslationProjectPage({ params }: Params) {
  const { id } = await params;
  return <TranslationProjectEditor initialProjectId={id} />;
}
