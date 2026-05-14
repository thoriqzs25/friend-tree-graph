import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import type { FriendGraphSnapshot } from "@/types/friend-graph";
import {
  emptySnapshot,
  loadSnapshot,
  normalizeSnapshot,
} from "@/lib/friend-graph-storage";
import { getFirestoreDb } from "@/lib/firebase-client";
import { getGraphOwnerId } from "@/lib/firebase-config";

function friendGraphRef() {
  return doc(getFirestoreDb(), "owners", getGraphOwnerId(), "graphs", "main");
}

export async function pushFriendGraph(
  snapshot: FriendGraphSnapshot,
): Promise<void> {
  const next: FriendGraphSnapshot = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(friendGraphRef(), {
    version: next.version,
    updatedAt: next.updatedAt,
    nodes: next.nodes,
    links: next.links,
  });
}

type SubscribeOpts = {
  onRemote: (snapshot: FriendGraphSnapshot) => void;
};

export async function subscribeFriendGraph(
  opts: SubscribeOpts,
): Promise<Unsubscribe> {
  return onSnapshot(
    friendGraphRef(),
    (snap) => {
      if (!snap.exists()) {
        const local = loadSnapshot();
        if (local.nodes.length > 0 || local.links.length > 0) {
          opts.onRemote(local);
          void pushFriendGraph(local);
          return;
        }
        opts.onRemote(emptySnapshot());
        return;
      }
      opts.onRemote(normalizeSnapshot(snap.data()));
    },
    (err) => {
      console.error("Friend graph subscription error:", err);
      opts.onRemote(loadSnapshot());
    },
  );
}
