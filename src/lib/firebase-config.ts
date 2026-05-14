export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_GRAPH_OWNER_ID,
  );
}

/** Fixed owner ID — same on every device, drives the shared Firestore path. */
export function getGraphOwnerId(): string {
  return process.env.NEXT_PUBLIC_GRAPH_OWNER_ID ?? "";
}
