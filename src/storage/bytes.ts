/**
 * Every put body as one byte array. A stream is read to the end first: S3
 * wants a Content-Length on PUT, and objects here are small (images ≤ 3 MB,
 * documents ≤ 10 MB — spec §2.2). A Uint8Array view keeps only its own bytes.
 */
export async function toBytes(data: ReadableStream | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await new Response(data).arrayBuffer());
}
