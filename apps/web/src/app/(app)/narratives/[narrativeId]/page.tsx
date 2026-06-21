import { StoryWorkbenchRoute } from "@/features/narratives/story-workbench";

export default async function NarrativePage({ params }: { params: Promise<{ narrativeId: string }> }) {
  const { narrativeId } = await params;
  return <StoryWorkbenchRoute narrativeId={narrativeId} />;
}
