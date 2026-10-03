import { describe, expect, it } from "vitest";
import { InvalidStorageKeyError } from "./adapter.js";
import { MemoryStorage } from "./memory.js";

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(values);

describe("MemoryStorage", () => {
  it("round-trips put → get → head → delete", async () => {
    const s = new MemoryStorage();
    await s.put("products/p1/a.jpg", bytes(0xff, 0xd8, 0xff), "image/jpeg");
    expect(await s.get("products/p1/a.jpg")).toEqual({ body: bytes(0xff, 0xd8, 0xff), contentType: "image/jpeg" });
    expect(await s.head("products/p1/a.jpg")).toEqual({ size: 3, contentType: "image/jpeg" });
    await s.delete("products/p1/a.jpg");
    expect(await s.get("products/p1/a.jpg")).toBeNull();
    expect(await s.head("products/p1/a.jpg")).toBeNull();
  });

  it("answers null for a key never written, and deleting it is fine", async () => {
    const s = new MemoryStorage();
    expect(await s.get("nope.jpg")).toBeNull();
    expect(await s.head("nope.jpg")).toBeNull();
    await expect(s.delete("nope.jpg")).resolves.toBeUndefined();
  });

  it("takes an ArrayBuffer and a ReadableStream", async () => {
    const s = new MemoryStorage();
    await s.put("a.bin", bytes(1, 2).buffer, "application/octet-stream");
    await s.put("b.bin", new Blob([bytes(3, 4, 5)]).stream(), "application/octet-stream");
    expect((await s.get("a.bin"))?.body).toEqual(bytes(1, 2));
    expect((await s.head("b.bin"))?.size).toBe(3);
  });

  // Review Focus 3: a view (subarray, a pooled Node Buffer) stores only its own bytes.
  it("stores only the bytes a view covers", async () => {
    const s = new MemoryStorage();
    await s.put("v.bin", bytes(9, 1, 2, 9).subarray(1, 3), "application/octet-stream");
    expect((await s.get("v.bin"))?.body).toEqual(bytes(1, 2));
  });

  it("is not changed by the caller mutating what it passed or got", async () => {
    const s = new MemoryStorage();
    const input = bytes(1, 2, 3);
    await s.put("m.bin", input, "application/octet-stream");
    input[0] = 7;
    const got = await s.get("m.bin");
    if (got) got.body[1] = 7;
    expect((await s.get("m.bin"))?.body).toEqual(bytes(1, 2, 3));
  });

  it("copies a Node Buffer in and out, not a view of it", async () => {
    const s = new MemoryStorage();
    const input = Buffer.from([1, 2, 3]);
    await s.put("buf.bin", input, "application/octet-stream");
    input[0] = 7;
    const got = await s.get("buf.bin");
    if (got) got.body[1] = 7;
    expect((await s.get("buf.bin"))?.body).toEqual(bytes(1, 2, 3));
  });

  it("overwrites on a second put of the same key", async () => {
    const s = new MemoryStorage();
    await s.put("k.txt", bytes(1), "text/plain");
    await s.put("k.txt", bytes(2, 2), "application/pdf");
    expect(await s.head("k.txt")).toEqual({ size: 2, contentType: "application/pdf" });
  });

  it.each(["put", "get", "head", "delete"] as const)("checks the key on %s", async (method) => {
    const s = new MemoryStorage();
    const call =
      method === "put" ? s.put("../x", bytes(1), "text/plain") : s[method]("../x");
    await expect(call).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });
});
