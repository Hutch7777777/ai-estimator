import { ProposalEditor } from "@/components/proposals/ProposalEditor";

export default async function ProposalEditorPage({
  params,
}: {
  params: Promise<{ estimateId: string }>;
}) {
  const { estimateId } = await params;
  return <ProposalEditor estimateId={estimateId} />;
}
