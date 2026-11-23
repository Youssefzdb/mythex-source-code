import { useEffect, useState } from "react";
import { getPublishSnapshot, subscribePublishSnapshot, type PublishSnapshot } from "./publishSnapshotStore";

const isLive = (snap: PublishSnapshot | null) => snap?.live?.status === "LIVE";

/**
 * Whether this project's app is live now, kept in step with the shared publish
 * snapshot — which the Publish popover, the publish poller and an agent's
 * PublishApp all refresh.
 */
export function usePublishLive(projectId: string | null | undefined): boolean {
  const [live, setLive] = useState(() => (projectId ? isLive(getPublishSnapshot(projectId)) : false));
  useEffect(() => {
    if (!projectId) {
      setLive(false);
      return;
    }
    setLive(isLive(getPublishSnapshot(projectId)));
    return subscribePublishSnapshot(projectId, (snap) => setLive(isLive(snap)));
  }, [projectId]);
  return live;
}
