import { describe, expect, it } from "vitest";
import { InvalidStorageKeyError, StorageError } from "./adapter.js";
import { S3Storage, type S3StorageOptions } from "./s3.js";

interface Fake {
  requests: Request[];
  fetch: typeof fetch;
}

/** A fetch that records each request (cloned, body readable) and answers with `respond`. */
function fakeFetch(respond: (req: Request) => Response): Fake {
  const requests: Request[] = [];
  const impl: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    requests.push(req.clone());
    return respond(req);
  };
  return { requests, fetch: impl };
}

const GARAGE: S3StorageOptions = {
  endpoint: "http://object-storage:3900",
  region: "garage",
  bucket: "core",
  accessKeyId: "GK0123456789abcdef01234567",
  secretAccessKey: "s3cr3t-value-never-in-messages",
};

const storage = (fake: Fake, opts: Partial<S3StorageOptions> = {}): S3Storage =>
  new S3Storage({ ...GARAGE, ...opts, fetch: fake.fetch });

const xmlError = (status: number, code: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>m</Message></Error>`, {
    status,
    headers: { "content-type": "application/xml" },
  });

const sent = (fake: Fake, index = 0): Request => {
  const req = fake.requests[index];
  if (!req) throw new Error(`request ${index} was not sent`);
  return req;
};

describe("S3Storage — requests", () => {
  it("uses a path-style URL with each key segment encoded", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    await storage(fake, { endpoint: "http://object-storage:3900/" }).put(
      "products/7f3a/a b+c#?.jpg",
      new Uint8Array([1]),
      "image/jpeg",
    );
    expect(sent(fake).url).toBe("http://object-storage:3900/core/products/7f3a/a%20b%2Bc%23%3F.jpg");
  });

  it("signs with SigV4 for service s3 and the given region", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    await storage(fake).get("products/p1/a.jpg");
    const auth = sent(fake).headers.get("authorization") ?? "";
    expect(auth).toMatch(/^AWS4-HMAC-SHA256 Credential=GK0123456789abcdef01234567\/\d{8}\/garage\/s3\/aws4_request, /);
    expect(auth).toMatch(/SignedHeaders=[^,]*host[^,]*x-amz-date/);
    expect(auth).toMatch(/Signature=[0-9a-f]{64}$/);
    expect(sent(fake).headers.get("x-amz-content-sha256")).toBe("UNSIGNED-PAYLOAD");
    expect(auth).not.toContain(GARAGE.secretAccessKey);
  });

  it("keeps an explicit region even for an R2 host", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    await storage(fake, { endpoint: "https://acc123.r2.cloudflarestorage.com", region: "auto" }).head("a.jpg");
    expect(sent(fake).url).toBe("https://acc123.r2.cloudflarestorage.com/core/a.jpg");
    expect(sent(fake).headers.get("authorization")).toContain("/auto/s3/aws4_request");
  });

  it("PUT sends the bytes and Content-Type", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    await storage(fake).put("products/p1/a.jpg", new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");
    const req = sent(fake);
    expect(req.method).toBe("PUT");
    expect(req.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await req.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  // Review Focus 3: S3 needs a length, so a stream is read to the end first; a view keeps only its bytes.
  it("PUT reads a ReadableStream into bytes and sends only a view's bytes", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    const s = storage(fake);
    await s.put("s.bin", new Blob([new Uint8Array([4, 5, 6])]).stream(), "application/octet-stream");
    await s.put("v.bin", new Uint8Array([9, 1, 2, 9]).subarray(1, 3), "application/octet-stream");
    expect(new Uint8Array(await sent(fake, 0).arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));
    expect(new Uint8Array(await sent(fake, 1).arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  it("refuses a bad key before any request", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    const s = storage(fake);
    await expect(s.put("/abs.jpg", new Uint8Array([1]), "image/jpeg")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(s.get("a/../b.jpg")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(s.head("")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(s.delete("a\\b.jpg")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    expect(fake.requests).toHaveLength(0);
  });
});

describe("S3Storage — answers", () => {
  it("get returns the body and the stored Content-Type", async () => {
    const fake = fakeFetch(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    expect(await storage(fake).get("a.jpg")).toEqual({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" });
    expect(sent(fake).method).toBe("GET");
  });

  it("get falls back to application/octet-stream without a Content-Type", async () => {
    const fake = fakeFetch(() => new Response(new Uint8Array([1]), { status: 200 }));
    expect((await storage(fake).get("a.bin"))?.contentType).toBe("application/octet-stream");
  });

  it("head returns size and Content-Type", async () => {
    const fake = fakeFetch(
      () => new Response(null, { status: 200, headers: { "content-length": "421337", "content-type": "image/jpeg" } }),
    );
    expect(await storage(fake).head("a.jpg")).toEqual({ size: 421337, contentType: "image/jpeg" });
    expect(sent(fake).method).toBe("HEAD");
  });

  it("404 NoSuchKey: get and head are null, delete succeeds", async () => {
    const fake = fakeFetch((req) => (req.method === "HEAD" ? new Response(null, { status: 404 }) : xmlError(404, "NoSuchKey")));
    const s = storage(fake);
    expect(await s.get("gone.jpg")).toBeNull();
    expect(await s.head("gone.jpg")).toBeNull();
    await expect(s.delete("gone.jpg")).resolves.toBeUndefined();
  });

  it("delete succeeds on 204", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 204 }));
    await expect(storage(fake).delete("a.jpg")).resolves.toBeUndefined();
    expect(sent(fake).method).toBe("DELETE");
  });

  // Review Focus 2: a wrong bucket name must not read as "no image".
  it("404 NoSuchBucket is a StorageError for get and delete", async () => {
    const fake = fakeFetch(() => xmlError(404, "NoSuchBucket"));
    const s = storage(fake);
    await expect(s.get("a.jpg")).rejects.toMatchObject({ name: "StorageError", status: 404, code: "NoSuchBucket" });
    await expect(s.delete("a.jpg")).rejects.toBeInstanceOf(StorageError);
  });

  // Review Focus 4: aws4fetch's own fetch() retries 5xx ten times; the adapter sends once.
  it("5xx is a StorageError with status and S3 Code, after exactly one request", async () => {
    const fake = fakeFetch(() => xmlError(503, "SlowDown"));
    const err = await storage(fake).put("a.jpg", new Uint8Array([1]), "image/jpeg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect(err).toMatchObject({ status: 503, code: "SlowDown" });
    expect(fake.requests).toHaveLength(1);
  });

  // Review Focus 5: a proxy's HTML page or an empty HEAD answer is still a clean StorageError.
  it("a non-XML or empty error body gives code undefined", async () => {
    const html = fakeFetch(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
    await expect(storage(html).get("a.jpg")).rejects.toMatchObject({ status: 502, code: undefined });
    const head = fakeFetch(() => new Response(null, { status: 403 }));
    await expect(storage(head).head("a.jpg")).rejects.toMatchObject({ status: 403, code: undefined });
  });

  it("403 AccessDenied on get is a StorageError (another module's bucket — R110)", async () => {
    const fake = fakeFetch(() => xmlError(403, "AccessDenied"));
    await expect(storage(fake).get("a.jpg")).rejects.toMatchObject({ status: 403, code: "AccessDenied" });
  });
});

describe("S3Storage — options", () => {
  it.each(["endpoint", "region", "bucket", "accessKeyId", "secretAccessKey"] as const)(
    "names a missing %s without printing any value",
    (name) => {
      let message = "";
      try {
        new S3Storage({ ...GARAGE, [name]: "" });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain(name);
      expect(message).not.toContain(GARAGE.secretAccessKey);
      expect(message).not.toContain(GARAGE.accessKeyId);
    },
  );

  it("refuses an endpoint that is not an http(s) URL", () => {
    for (const bad of ["object-storage:3900", GARAGE.secretAccessKey]) {
      let error: unknown;
      try {
        new S3Storage({ ...GARAGE, endpoint: bad });
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(TypeError);
      const message = (error as Error).message;
      expect(message).toContain("endpoint");
      expect(message).not.toContain(bad);
    }
  });
});
