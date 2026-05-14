import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import type { FriendGraphSnapshot } from "@/types/friend-graph";
import {
  emptySnapshot,
  loadSnapshot,
  normalizeSnapshot,
} from "@/lib/friend-graph-storage";
import { getFirebaseAuth, getFirestoreDb } from "@/lib/firebase-client";

const GRAPH_DOC_ID = "friend";

function friendGraphRef(uid: string) {
  return doc(getFirestoreDb(), "users", uid, "graphs", GRAPH_DOC_ID);
}

export async function ensureAnonUser(): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth.currentUser) {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  }
  return auth.currentUser.uid;
}

export async function pushFriendGraph(
  snapshot: FriendGraphSnapshot,
): Promise<void> {
  const uid = await ensureAnonUser();
  const next: FriendGraphSnapshot = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(friendGraphRef(uid), {
    version: next.version,
    updatedAt: next.updatedAt,
    nodes: next.nodes,
    links: next.links,
  });
}

type SubscribeOpts = {
  onRemote: (snapshot: FriendGraphSnapshot) => void;
};

/**
 * Subscribes to the signed-in user's graph document.
 * Migrates localStorage into Firestore when the remote doc is missing but local has data.
 */
export async function subscribeFriendGraph(
  opts: SubscribeOpts,
): Promise<Unsubscribe> {
  await ensureAnonUser();
  const auth = getFirebaseAuth();
  const uid = auth.currentUser!.uid;

  return onSnapshot(
    friendGraphRef(uid),
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
