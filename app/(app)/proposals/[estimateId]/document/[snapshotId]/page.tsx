import { ProposalDocument } from "@/components/proposals/ProposalDocument";

export default async function ProposalDocumentPage({
  params,
}: {
  params: Promise<{ estimateId: string; snapshotId: string }>;
}) {
  const { estimateId, snapshotId } = await params;
  return <ProposalDocument estimateId={estimateId} snapshotId={snapshotId} />;
}
