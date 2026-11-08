import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Original PDFs, private to their owner. Keys are server-generated, never user text.
export interface DocumentStore {
  put(key: string, bytes: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

// The subset of the Cloudflare R2 binding this module uses.
type R2Bucket = {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
};

export const documentStorageKey = (ownerId: string, documentId: string) => `documents/${ownerId}/${documentId}.pdf`;
const validKey = (key: string) => /^documents\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/u.test(key);

export function createR2DocumentStore(bucket: R2Bucket): DocumentStore {
  return {
    async put(key, bytes) { if (!validKey(key)) throw new Error("Invalid key"); await bucket.put(key, bytes, { httpMetadata: { contentType: "application/pdf" } }); },
    async get(key) { if (!validKey(key)) return null; const object = await bucket.get(key); return object ? new Uint8Array(await object.arrayBuffer()) : null; },
    async delete(key) { if (validKey(key)) await bucket.delete(key); },
  };
}

// Local development and browser tests on Node, where no R2 binding exists.
export function createFileDocumentStore(root: string): DocumentStore {
  const path = (key: string) => { if (!validKey(key)) throw new Error("Invalid key"); return join(resolve(root), key); };
  return {
    async put(key, bytes) { const file = path(key); await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes); },
    async get(key) { try { return new Uint8Array(await readFile(path(key))); } catch { return null; } },
    async delete(key) { await rm(path(key), { force: true }); },
  };
}

export function createMemoryDocumentStore(): DocumentStore & { keys(): string[] } {
  const objects = new Map<string, Uint8Array>();
  return {
    async put(key, bytes) { if (!validKey(key)) throw new Error("Invalid key"); objects.set(key, bytes); },
    async get(key) { return objects.get(key) ?? null; },
    async delete(key) { objects.delete(key); },
    keys: () => [...objects.keys()],
  };
}
