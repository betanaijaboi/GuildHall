import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Local-disk object storage for uploads. The interface (put / stat / stream) is what an S3/R2
 * adapter would implement; swap it before running more than one server.
 */
const ROOT = path.resolve(process.env.UPLOAD_DIR ?? ".data/uploads");

const KEY = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

function resolveKey(key: string): string {
  if (!KEY.test(key)) throw new Error("Invalid storage key");
  return path.join(ROOT, key.slice(0, 2), key);
}

export async function putFile(data: Uint8Array, ext: string): Promise<string> {
  const key = `${randomUUID()}.${ext}`;
  const file = resolveKey(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data, { flag: "wx" });
  return key;
}

export async function fileSize(key: string): Promise<number> {
  return (await stat(resolveKey(key))).size;
}

export function readFileStream(key: string, range?: { start: number; end: number }): ReadableStream<Uint8Array> {
  return Readable.toWeb(createReadStream(resolveKey(key), range)) as ReadableStream<Uint8Array>;
}
