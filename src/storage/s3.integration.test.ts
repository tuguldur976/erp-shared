import { describe, expect, it } from "vitest";
import { StorageError } from "./adapter.js";
import { S3Storage } from "./s3.js";

// Run through `npm run test:integration` (scripts/garage-test.sh), which starts
// Garage and sets these. Spec §6 "shared integration".
function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — run npm run test:integration`);
  return value;
}

const storage = new S3Storage({
  endpoint: env("GARAGE_TEST_ENDPOINT"),
  region: "garage",
  bucket: env("GARAGE_TEST_BUCKET"),
  accessKeyId: env("GARAGE_TEST_KEY_ID"),
  secretAccessKey: env("GARAGE_TEST_SECRET"),
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe("S3Storage against Garage", () => {
  it("put → head → get → delete → gone", async () => {
    const key = `products/${crypto.randomUUID()}/a.jpg`;
    await storage.put(key, jpeg, "image/jpeg");
    expect(await storage.head(key)).toEqual({ size: jpeg.byteLength, contentType: "image/jpeg" });
    expect(await storage.get(key)).toEqual({ body: jpeg, contentType: "image/jpeg" });
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    expect(await storage.head(key)).toBeNull();
    await storage.delete(key);
  });

  // Review Focus 1: the signed path and Garage's canonical path must agree for any character.
  it("round-trips a key with spaces, +, Cyrillic and other reserved characters", async () => {
    const key = `products/${crypto.randomUUID()}/зураг 1+(2)!'*~;=,@$&#?%.jpg`;
    await storage.put(key, jpeg, "image/jpeg");
    expect((await storage.get(key))?.body).toEqual(jpeg);
    await storage.delete(key);
  });

  it("takes a ReadableStream body", async () => {
    const key = `products/${crypto.randomUUID()}/s.bin`;
    await storage.put(key, new Blob([new Uint8Array(70_000).fill(7)]).stream(), "application/octet-stream");
    expect((await storage.head(key))?.size).toBe(70_000);
    await storage.delete(key);
  });

  it("a missing bucket is a StorageError, not null", async () => {
    const other = new S3Storage({
      endpoint: env("GARAGE_TEST_ENDPOINT"),
      region: "garage",
      bucket: "no-such-bucket",
      accessKeyId: env("GARAGE_TEST_KEY_ID"),
      secretAccessKey: env("GARAGE_TEST_SECRET"),
    });
    await expect(other.get("a.jpg")).rejects.toBeInstanceOf(StorageError);
  });

  it("a wrong secret is a StorageError with Garage's code", async () => {
    const bad = new S3Storage({
      endpoint: env("GARAGE_TEST_ENDPOINT"),
      region: "garage",
      bucket: env("GARAGE_TEST_BUCKET"),
      accessKeyId: env("GARAGE_TEST_KEY_ID"),
      secretAccessKey: "f".repeat(64),
    });
    const err = await bad.get("a.jpg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).status).toBe(403);
  });
});
