"use client";

import * as THREE from "three";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ForceGraphMethods, NodeObject } from "react-force-graph-3d";
import type { GraphLinkRecord, GraphNodeRecord } from "@/types/friend-graph";
import {
  emptySnapshot,
  graphPayloadEqual,
  loadSnapshot,
  saveSnapshot,
} from "@/lib/friend-graph-storage";
import type { FriendGraphSnapshot } from "@/types/friend-graph";
import { isFirebaseConfigured } from "@/lib/firebase-config";

const ForceGraph3D = dynamic(() => import("@/components/ForceGraph3DCanvas"), {
  ssr: false,
});

type FGNode = GraphNodeRecord & {
  id: string;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};

type FGLink = { id: string; source: string; target: string };

function displayName(n: GraphNodeRecord): string {
  const t = n.name.trim();
  if (t) return t;
  return n.kind === "category" ? "Category" : "Friend";
}

function newId(): string {
  return crypto.randomUUID();
}

export default function FriendGraphApp() {
  const [syncMode, setSyncMode] = useState<"loading" | "local" | "firebase">(
    "loading",
  );
  const [syncBanner, setSyncBanner] = useState<string | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const [snapshot, setSnapshot] = useState<FriendGraphSnapshot>(() =>
    emptySnapshot(),
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fgRef = useRef<ForceGraphMethods<NodeObject, object> | undefined>(
    undefined,
  );

  const SIDEBAR_W = 380;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pushTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    queueMicrotask(() => {
      void (async () => {
        if (!isFirebaseConfigured()) {
          setSnapshot(loadSnapshot());
          if (!cancelled) {
            setSyncMode("local");
            setHydrated(true);
          }
          return;
        }
        try {
          const { subscribeFriendGraph } = await import(
            "@/lib/friend-graph-firestore"
          );
          let firstRemote = true;
          unsub = await subscribeFriendGraph({
            onRemote: (remote) => {
              if (cancelled) return;
              setSnapshot((prev) =>
                graphPayloadEqual(prev, remote) ? prev : remote,
              );
              if (firstRemote) {
                firstRemote = false;
                setSyncMode("firebase");
                setHydrated(true);
              }
            },
          });
        } catch (e) {
          console.error(e);
          if (!cancelled) {
            setSnapshot(loadSnapshot());
            setSyncMode("local");
            setSyncBanner(
              "Firebase unavailable — using local storage only. Check env vars and Auth (Anonymous sign-in).",
            );
            setHydrated(true);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (!hydrated || syncMode === "loading") return;
    saveSnapshot(snapshot);
    if (syncMode === "firebase") {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(() => {
        void import("@/lib/friend-graph-firestore").then(
          ({ pushFriendGraph }) =>
            pushFriendGraph(snapshot).catch((err) => console.error(err)),
        );
      }, 550);
    }
    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
  }, [snapshot, hydrated, syncMode]);

  useEffect(() => {
    const update = () =>
      setDims({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const graphData = useMemo(() => {
    const nodes: FGNode[] = snapshot.nodes.map((n) => {
      const node: FGNode = { ...n };
      if (focusedId === n.id) {
        node.fx = 0;
        node.fy = 0;
        node.fz = 0;
      } else {
        delete node.fx;
        delete node.fy;
        delete node.fz;
      }
      return node;
    });
    const links: FGLink[] = snapshot.links.map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
    }));
    return { nodes, links };
  }, [snapshot.nodes, snapshot.links, focusedId]);

  const applyCamera = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3ReheatSimulation();
    const t = window.setTimeout(() => {
      if (focusedId) {
        fg.cameraPosition({ x: 0, y: 0, z: 260 }, { x: 0, y: 0, z: 0 }, 1000);
      } else {
        fg.zoomToFit(900, 56);
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusedId]);

  useEffect(() => {
    if (!hydrated) return;
    const cleanup = applyCamera();
    return cleanup;
  }, [hydrated, focusedId, applyCamera]);

  const filteredForSearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return snapshot.nodes;
    return snapshot.nodes.filter((n) =>
      displayName(n).toLowerCase().includes(q),
    );
  }, [snapshot.nodes, search]);

  const focusNode = useCallback((id: string) => {
    setFocusedId(id);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedId(null);
  }, []);

  const updateNode = useCallback(
    (id: string, patch: Partial<Pick<GraphNodeRecord, "name" | "description" | "imageUrl">>) => {
      setSnapshot((s) => ({
        ...s,
        nodes: s.nodes.map((n) =>
          n.id === id ? { ...n, ...patch } : n,
        ),
      }));
    },
    [],
  );

  const deleteNode = useCallback((id: string) => {
    setSnapshot((s) => ({
      ...s,
      nodes: s.nodes.filter((n) => n.id !== id),
      links: s.links.filter((l) => l.source !== id && l.target !== id),
    }));
    setFocusedId((prev) => (prev === id ? null : prev));
    setEditingNodeId(null);
  }, []);

  const addFriend = useCallback(
    (input: {
      name: string;
      description: string;
      imageDataUrl: string | null;
      connectToId: string | null;
    }) => {
      const node: GraphNodeRecord = {
        id: newId(),
        kind: "friend",
        name: input.name.trim(),
        ...(input.description.trim()
          ? { description: input.description.trim() }
          : {}),
        ...(input.imageDataUrl ? { imageUrl: input.imageDataUrl } : {}),
        createdAt: new Date().toISOString(),
      };
      setSnapshot((s) => {
        const nodes = [...s.nodes, node];
        let links = s.links;
        if (input.connectToId) {
          const link: GraphLinkRecord = {
            id: newId(),
            source: node.id,
            target: input.connectToId,
            createdAt: new Date().toISOString(),
          };
          links = [...links, link];
        }
        return { ...s, nodes, links };
      });
    },
    [],
  );

  const addCategory = useCallback(
    (name: string, connectToId: string | null) => {
      const label = name.trim();
      const node: GraphNodeRecord = {
        id: newId(),
        kind: "category",
        name: label,
        createdAt: new Date().toISOString(),
      };
      setSnapshot((s) => {
        const nodes = [...s.nodes, node];
        let links = s.links;
        if (connectToId) {
          links = [
            ...links,
            {
              id: newId(),
              source: node.id,
              target: connectToId,
              createdAt: new Date().toISOString(),
            },
          ];
        }
        return { ...s, nodes, links };
      });
    },
    [],
  );

  const addLink = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setSnapshot((s) => {
      const dup = s.links.some(
        (l) =>
          (l.source === sourceId && l.target === targetId) ||
          (l.source === targetId && l.target === sourceId),
      );
      if (dup) return s;
      return {
        ...s,
        links: [
          ...s.links,
          {
            id: newId(),
            source: sourceId,
            target: targetId,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    });
  }, []);

  const nodeThreeObject = useCallback((node: NodeObject) => {
    const n = node as FGNode;
    const g = new THREE.Group();
    const radius = n.kind === "category" ? 7 : 6;

    const buildLabel = (yOffset: number) => {
      const label = displayName(n);
      const fontSize = 28;
      const padding = 14;
      const lc = document.createElement("canvas");
      const lctx = lc.getContext("2d")!;
      lctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      const textW = lctx.measureText(label).width;
      lc.width = textW + padding * 2;
      lc.height = fontSize + padding;
      lctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
      lctx.fillStyle = "rgba(255,255,255,0.93)";
      lctx.fillText(label, padding, fontSize);
      const ltex = new THREE.CanvasTexture(lc);
      const lmat = new THREE.SpriteMaterial({ map: ltex, transparent: true, depthWrite: false });
      const lsprite = new THREE.Sprite(lmat);
      const lw = lc.width / 12;
      const lh = lc.height / 12;
      lsprite.scale.set(lw, lh, 1);
      lsprite.position.set(0, yOffset, 0);
      return lsprite;
    };

    if (n.kind === "friend" && n.imageUrl) {
      // Draw the photo clipped to a circle on a canvas sprite
      const SIZE = 128;
      const pc = document.createElement("canvas");
      pc.width = SIZE;
      pc.height = SIZE;
      const pctx = pc.getContext("2d")!;

      const img = new Image();
      img.onload = () => {
        pctx.clearRect(0, 0, SIZE, SIZE);
        pctx.beginPath();
        pctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
        pctx.closePath();
        pctx.clip();
        // cover-fit the image
        const aspect = img.naturalWidth / img.naturalHeight;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (aspect > 1) { sw = img.naturalHeight; sx = (img.naturalWidth - sw) / 2; }
        else { sh = img.naturalWidth; sy = (img.naturalHeight - sh) / 2; }
        pctx.drawImage(img, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
        // ring
        pctx.beginPath();
        pctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
        pctx.strokeStyle = "rgba(52,211,153,0.85)";
        pctx.lineWidth = 5;
        pctx.stroke();
        ptex.needsUpdate = true;
      };
      img.src = n.imageUrl;

      const ptex = new THREE.CanvasTexture(pc);
      const pmat = new THREE.SpriteMaterial({ map: ptex, transparent: true, depthWrite: false });
      const psprite = new THREE.Sprite(pmat);
      psprite.scale.set(radius * 2.4, radius * 2.4, 1);
      g.add(psprite);
      g.add(buildLabel(radius * 1.5));
    } else {
      // Plain sphere for friends without image and all categories
      const geom = new THREE.SphereGeometry(radius, 28, 28);
      const mat = new THREE.MeshStandardMaterial({
        color: n.kind === "category" ? new THREE.Color("#818cf8") : new THREE.Color("#34d399"),
        metalness: 0.15,
        roughness: 0.55,
      });
      g.add(new THREE.Mesh(geom, mat));
      g.add(buildLabel(radius + 5));
    }

    return g;
  }, []);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading graph…
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* backdrop — tap outside on mobile to close */}
      {sidebarOpen && (
        <div
          className="absolute inset-0 z-20 bg-black/40 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* toggle button — always fixed top-left, always reachable */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className="fixed left-3 top-3 z-50 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/90 text-zinc-400 backdrop-blur-sm transition hover:border-zinc-500 hover:text-white"
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        {sidebarOpen ? "←" : "→"}
      </button>

      <aside
        className={`absolute left-0 top-0 z-30 flex h-full w-[min(380px,85vw)] flex-col gap-5 overflow-y-auto border-r border-zinc-800/80 bg-zinc-950 p-5 transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <header>
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Friend Tree Graph
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            3D graph with offline cache. Enable{" "}
            <span className="text-zinc-400">NEXT_PUBLIC_FIREBASE_*</span> for
            Firestore sync (anonymous auth).
          </p>
          <p className="mt-2 text-[11px] text-zinc-500">
            Status:{" "}
            {syncMode === "loading" ? (
              <span className="text-zinc-400">connecting…</span>
            ) : syncMode === "firebase" ? (
              <span className="text-emerald-400/90">Firestore sync</span>
            ) : (
              <span className="text-amber-400/90">Local only</span>
            )}
          </p>
          {syncBanner ? (
            <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-950/40 px-2 py-1.5 text-[11px] text-amber-100/90">
              {syncBanner}
            </p>
          ) : null}
        </header>

        <SearchAndFocus
          search={search}
          onSearchChange={setSearch}
          results={filteredForSearch}
          focusedId={focusedId}
          onPick={(id) => focusNode(id)}
          onClearFocus={clearFocus}
          onFit={() => {
            clearFocus();
            setTimeout(() => fgRef.current?.zoomToFit(900, 56), 120);
          }}
        />

        <AddFriendForm
          nodes={snapshot.nodes}
          onAdd={addFriend}
        />

        <AddCategoryForm
          nodes={snapshot.nodes}
          onAdd={addCategory}
        />

        <ConnectForm nodes={snapshot.nodes} onConnect={addLink} />

        <div className="mt-auto pt-4 text-center text-[11px] text-zinc-600">
          v1.0.0
        </div>
      </aside>

      <div className="relative h-full w-full overflow-hidden bg-zinc-950">
        <ForceGraph3D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
          backgroundColor="#0a0a0a"
          graphData={graphData}
          nodeLabel={(n) => {
            const node = n as FGNode;
            const title = displayName(node);
            return node.description ? `${title}\n${node.description}` : title;
          }}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          linkColor={() => "rgba(148,163,184,0.35)"}
          linkWidth={0.6}
          linkOpacity={0.75}
          linkCurvature={0.18}
          onNodeClick={(node) => {
            const id = String(node.id);
            focusNode(id);
            setEditingNodeId(id);
          }}
          onBackgroundClick={() => {
            clearFocus();
            setEditingNodeId(null);
          }}
          enableNavigationControls
          showNavInfo={false}
          cooldownTicks={120}
          onEngineStop={() => {
            if (!focusedId) fgRef.current?.zoomToFit(700, 48);
          }}
        />
        {editingNodeId ? (
          <EditNodeModal
            node={snapshot.nodes.find((n) => n.id === editingNodeId)!}
            onSave={(patch) => {
              updateNode(editingNodeId, patch);
              setEditingNodeId(null);
            }}
            onDelete={() => deleteNode(editingNodeId)}
            onClose={() => setEditingNodeId(null)}
          />
        ) : focusedId ? (
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-indigo-500/30 bg-indigo-950/80 px-3 py-2 text-xs text-indigo-100 backdrop-blur-sm">
            Click background to exit focus. Click a node to edit it.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SearchAndFocus(props: {
  search: string;
  onSearchChange: (v: string) => void;
  results: GraphNodeRecord[];
  focusedId: string | null;
  onPick: (id: string) => void;
  onClearFocus: () => void;
  onFit: () => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Search & focus
      </h2>
      <input
        type="search"
        value={props.search}
        onChange={(e) => props.onSearchChange(e.target.value)}
        placeholder="Search by name…"
        className="w-full rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm outline-none ring-indigo-500/0 transition focus:border-indigo-500/50 focus:ring-2"
      />
      <div className="max-h-40 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900/50">
        {props.results.length === 0 ? (
          <p className="p-3 text-xs text-zinc-500">No matches.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {props.results.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => props.onPick(n.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-zinc-800/80 ${
                    props.focusedId === n.id ? "bg-indigo-950/60 text-indigo-100" : ""
                  }`}
                >
                  <span className="truncate">{displayName(n)}</span>
                  <span className="ml-2 shrink-0 text-[10px] uppercase text-zinc-500">
                    {n.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onClearFocus}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Clear focus
        </button>
        <button
          type="button"
          onClick={props.onFit}
          className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Fit all
        </button>
      </div>
    </section>
  );
}

function AddFriendForm(props: {
  nodes: GraphNodeRecord[];
  onAdd: (input: {
    name: string;
    description: string;
    imageDataUrl: string | null;
    connectToId: string | null;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [connectToId, setConnectToId] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Add friend
      </h2>
      <input
        placeholder="Name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
      />
      <label className="block text-xs text-zinc-500">
        Photo (optional)
        <input
          type="file"
          accept="image/*"
          className="mt-1 block w-full text-xs text-zinc-400 file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-zinc-200"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setImageDataUrl(null);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") setImageDataUrl(reader.result);
            };
            reader.readAsDataURL(file);
          }}
        />
      </label>
      <select
        value={connectToId}
        onChange={(e) => setConnectToId(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
      >
        <option value="">Link to… (optional)</option>
        {props.nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {displayName(n)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          props.onAdd({
            name,
            description,
            imageDataUrl,
            connectToId: connectToId || null,
          });
          setName("");
          setDescription("");
          setConnectToId("");
          setImageDataUrl(null);
        }}
        className="w-full rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Create friend node
      </button>
    </section>
  );
}

function AddCategoryForm(props: {
  nodes: GraphNodeRecord[];
  onAdd: (name: string, connectToId: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [connectToId, setConnectToId] = useState("");

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Add category
      </h2>
      <input
        placeholder="e.g. Padel, Climbing…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
      />
      <select
        value={connectToId}
        onChange={(e) => setConnectToId(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm outline-none focus:border-indigo-500/50"
      >
        <option value="">Link to… (optional)</option>
        {props.nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {displayName(n)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          if (!name.trim()) return;
          props.onAdd(name, connectToId || null);
          setName("");
          setConnectToId("");
        }}
        className="w-full rounded-md border border-violet-500/40 bg-violet-950/60 py-2 text-sm font-medium text-violet-100 hover:bg-violet-900/60"
      >
        Create category node
      </button>
    </section>
  );
}

function ConnectForm(props: {
  nodes: GraphNodeRecord[];
  onConnect: (a: string, b: string) => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        Connect nodes
      </h2>
      <select
        value={a}
        onChange={(e) => setA(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm"
      >
        <option value="">From…</option>
        {props.nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {displayName(n)}
          </option>
        ))}
      </select>
      <select
        value={b}
        onChange={(e) => setB(e.target.value)}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm"
      >
        <option value="">To…</option>
        {props.nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {displayName(n)}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          if (a && b) props.onConnect(a, b);
        }}
        disabled={!a || !b || a === b}
        className="w-full rounded-md border border-zinc-600 bg-zinc-800 py-2 text-sm font-medium text-zinc-100 disabled:opacity-40"
      >
        Add edge
      </button>
    </section>
  );
}

function EditNodeModal(props: {
  node: GraphNodeRecord;
  onSave: (patch: Partial<Pick<GraphNodeRecord, "name" | "description" | "imageUrl">>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { node } = props;
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(node.description ?? "");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(node.imageUrl ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const inputCls =
    "w-full rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500/60";

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-zinc-700/60 px-5 py-4">
          <span className="text-sm font-semibold text-white">
            Edit{" "}
            <span className="text-zinc-400">{node.kind === "category" ? "category" : "friend"}</span>
          </span>
          <button
            onClick={props.onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Description (optional)"
              className={`${inputCls} resize-none`}
            />
          </div>

          {node.kind === "friend" && (
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Photo</label>
              {imageDataUrl && (
                <div className="mb-2 flex items-center gap-3">
                  <img
                    src={imageDataUrl}
                    alt="preview"
                    className="h-12 w-12 rounded-full object-cover ring-2 ring-emerald-500/50"
                  />
                  <button
                    onClick={() => setImageDataUrl(null)}
                    className="text-xs text-zinc-400 hover:text-red-400"
                  >
                    Remove photo
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="w-full text-xs text-zinc-400 file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-zinc-200"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    if (typeof reader.result === "string")
                      setImageDataUrl(reader.result);
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-zinc-700/60 px-5 py-4">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">Sure?</span>
              <button
                onClick={props.onDelete}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/50"
            >
              Delete node
            </button>
          )}
          <button
            onClick={() =>
              props.onSave({
                name: name.trim(),
                description: description.trim() || undefined,
                imageUrl: imageDataUrl ?? undefined,
              })
            }
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
