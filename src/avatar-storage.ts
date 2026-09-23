const DATABASE_NAME = "pyrealtime-web";
const STORE_NAME = "avatar-assets";
const AVATAR_KEY = "active-glb";
export const MAX_AVATAR_BYTES = 50 * 1024 * 1024;

export interface StoredAvatar {
  name: string;
  type: string;
  size: number;
  updatedAt: number;
  data: ArrayBuffer;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open avatar storage"));
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Avatar storage request failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Avatar storage transaction was aborted"));
    });
  } finally {
    db.close();
  }
}

export function validateAvatarFile(file: File): void {
  if (!file.name.toLowerCase().endsWith(".glb")) throw new Error("Choose a binary .glb file.");
  if (file.size === 0) throw new Error("The selected GLB is empty.");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("The selected GLB is larger than 50 MB.");
}

export async function saveAvatarFile(file: File): Promise<StoredAvatar> {
  validateAvatarFile(file);
  const avatar: StoredAvatar = {
    name: file.name,
    type: file.type || "model/gltf-binary",
    size: file.size,
    updatedAt: Date.now(),
    data: await file.arrayBuffer(),
  };
  await transaction("readwrite", (store) => store.put(avatar, AVATAR_KEY));
  return avatar;
}

export async function getSavedAvatar(): Promise<StoredAvatar | null> {
  return (await transaction("readonly", (store) => store.get(AVATAR_KEY))) ?? null;
}

export async function removeSavedAvatar(): Promise<void> {
  await transaction("readwrite", (store) => store.delete(AVATAR_KEY));
}

export async function withAvatarObjectUrl<T>(avatar: StoredAvatar, action: (url: string) => Promise<T>): Promise<T> {
  const url = URL.createObjectURL(new Blob([avatar.data], { type: avatar.type }));
  try {
    return await action(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
