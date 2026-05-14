/**
 * Serializable graph snapshot — designed to map cleanly to a managed DB later
 * (nodes/links tables with the same fields).
 */
export type GraphNodeKind = "friend" | "category";

export type GraphNodeRecord = {
  id: string;
  kind: GraphNodeKind;
  /** Shown on the node and used for search; may be empty */
  name: string;
  description?: string;
  /** Data URL or https URL — optional for friends */
  imageUrl?: string;
  createdAt: string;
};

export type GraphLinkRecord = {
  id: string;
  source: string;
  target: string;
  createdAt: string;
};

export type FriendGraphSnapshot = {
  version: 1;
  updatedAt: string;
  nodes: GraphNodeRecord[];
  links: GraphLinkRecord[];
};

/** Runtime node shape for react-force-graph (mutated by the simulation) */
export type ForceNode = GraphNodeRecord & {
  fx?: number;
  fy?: number;
  fz?: number;
};

export type ForceLink = {
  source: string | ForceNode;
  target: string | ForceNode;
};
