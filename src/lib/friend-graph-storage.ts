import type { FriendGraphSnapshot, GraphLinkRecord, GraphNodeRecord } from "@/types/friend-graph";

const STORAGE_KEY = "friend-graph:v1";

export const emptySnapshot = (): FriendGraphSnapshot => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  nodes: [],
  links: [],
});

function normalizeNode(n: GraphNodeRecord): GraphNodeRecord {
  return {
    ...n,
    kind: n.kind === "category" ? "category" : "friend",
    name: typeof n.name === "string" ? n.name : "",
  };
}

function normalizeLink(l: GraphLinkRecord): GraphLinkRecord {
  return {
    ...l,
    source: String(l.source),
    target: String(l.target),
  };
}

/** Validate/normalize Firestore or API payloads into a snapshot. */
export function normalizeSnapshot(raw: unknown): FriendGraphSnapshot {
  if (!raw || typeof raw !== "object") return emptySnapshot();
  const data = raw as Partial<FriendGraphSnapshot>;
  if (data.version !== 1 || !Array.isArray(data.nodes) || !Array.isArray(data.links)) {
    return emptySnapshot();
  }
  return {
    version: 1,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
    nodes: data.nodes.map(normalizeNode),
    links: data.links.map(normalizeLink),
  };
}

export function loadSnapshot(): FriendGraphSnapshot {
  if (typeof window === "undefined") return emptySnapshot();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySnapshot();
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return emptySnapshot();
  }
}

export function saveSnapshot(snapshot: FriendGraphSnapshot): void {
  if (typeof window === "undefined") return;
  const next: FriendGraphSnapshot = {
    ...snapshot,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** True when nodes and links carry the same data (ignores `updatedAt`). */
export function graphPayloadEqual(
  a: FriendGraphSnapshot,
  b: FriendGraphSnapshot,
): boolean {
  if (a.nodes.length !== b.nodes.length || a.links.length !== b.links.length) {
    return false;
  }
  const sortNodes = (n: GraphNodeRecord[]) =>
    [...n].sort((x, y) => x.id.localeCompare(y.id));
  const sortLinks = (l: GraphLinkRecord[]) =>
    [...l].sort((x, y) => x.id.localeCompare(y.id));
  return (
    JSON.stringify(sortNodes(a.nodes)) === JSON.stringify(sortNodes(b.nodes)) &&
    JSON.stringify(sortLinks(a.links)) === JSON.stringify(sortLinks(b.links))
  );
}
