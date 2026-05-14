import {
  ref,
  uploadString,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { getGraphOwnerId } from "@/lib/firebase-config";
import { getFirebaseStorage } from "@/lib/firebase-client";

function imageRef(nodeId: string) {
  return ref(
    getFirebaseStorage(),
    `owners/${getGraphOwnerId()}/images/${nodeId}`,
  );
}

/** Upload a base64 data URL, return the public download URL. */
export async function uploadNodeImage(
  nodeId: string,
  dataUrl: string,
): Promise<string> {
  const r = imageRef(nodeId);
  await uploadString(r, dataUrl, "data_url");
  return getDownloadURL(r);
}

/** Delete a node's image from Storage (ignore errors if it doesn't exist). */
export async function deleteNodeImage(nodeId: string): Promise<void> {
  try {
    await deleteObject(imageRef(nodeId));
  } catch {
    // file may not exist — safe to ignore
  }
}
