import { AwsClient } from "aws4fetch";
import { StorageError, type ObjectInfo, type StorageAdapter, type StoredObject } from "./adapter.js";
import { toBytes } from "./bytes.js";
import { assertValidKey, encodeKey } from "./key.js";

export interface S3StorageOptions {
  /** Origin of the S3 API, e.g. http://object-storage:3900 (Garage) or https://<account>.r2.cloudflarestorage.com. */
  endpoint: string;
  /** Always explicit: aws4fetch guesses only for AWS/R2 hostnames. Garage: "garage", R2: "auto". */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

const REQUIRED = ["endpoint", "region", "bucket", "accessKeyId", "secretAccessKey"] as const;
const FALLBACK_TYPE = "application/octet-stream";

/**
 * S3-compatible adapter (Garage on-prem, R2 on Cloudflare) on aws4fetch:
 * fetch + crypto.subtle only, so it runs on Node and Workers alike (R75).
 * Requests are signed with aws4fetch and sent once — aws4fetch's own
 * fetch() would retry 5xx up to 10 times, and retry policy is the caller's.
 */
export class S3Storage implements StorageAdapter {
  readonly #client: AwsClient;
  readonly #fetch: typeof fetch;
  readonly #base: string;

  constructor(opts: S3StorageOptions) {
    for (const name of REQUIRED) {
      // Names the option, never its value: two of them are secrets.
      if (typeof opts[name] !== "string" || opts[name] === "") {
        throw new TypeError(`S3Storage: option "${name}" is required`);
      }
    }
    if (!URL.canParse(opts.endpoint) || !/^https?:$/.test(new URL(opts.endpoint).protocol)) {
      throw new TypeError(`S3Storage: endpoint is not an http(s) URL: ${opts.endpoint}`);
    }
    this.#client = new AwsClient({
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      service: "s3",
      region: opts.region,
      retries: 0,
    });
    this.#fetch = opts.fetch ?? ((input, init) => fetch(input, init));
    this.#base = `${opts.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(opts.bucket)}`;
  }

  async put(key: string, data: ReadableStream | ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
    assertValidKey(key);
    const body = await toBytes(data);
    const res = await this.#send("PUT", key, { headers: { "Content-Type": contentType }, body });
    if (!res.ok) throw await failure("PUT", key, res);
    await res.arrayBuffer();
  }

  async get(key: string): Promise<StoredObject | null> {
    assertValidKey(key);
    const res = await this.#send("GET", key);
    if (res.status === 404) return missing("GET", key, res);
    if (!res.ok) throw await failure("GET", key, res);
    return {
      body: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? FALLBACK_TYPE,
    };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    assertValidKey(key);
    const res = await this.#send("HEAD", key);
    // A HEAD answer has no body, so a missing bucket also reads as null here.
    if (res.status === 404) return null;
    if (!res.ok) throw await failure("HEAD", key, res);
    return {
      size: Number(res.headers.get("content-length") ?? "0"),
      contentType: res.headers.get("content-type") ?? FALLBACK_TYPE,
    };
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    const res = await this.#send("DELETE", key);
    if (res.status === 404) {
      await missing("DELETE", key, res);
      return;
    }
    if (!res.ok) throw await failure("DELETE", key, res);
    await res.arrayBuffer();
  }

  async #send(method: string, key: string, init: { headers?: Record<string, string>; body?: Uint8Array } = {}): Promise<Response> {
    const signed = await this.#client.sign(`${this.#base}/${encodeKey(key)}`, { method, ...init });
    return this.#fetch(signed);
  }
}

/** The S3 error <Code>, or undefined when the body is empty or not S3 XML (a proxy's HTML page). */
async function s3Code(res: Response): Promise<string | undefined> {
  const text = await res.text().catch(() => "");
  return /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
}

async function failure(method: string, key: string, res: Response): Promise<StorageError> {
  const code = await s3Code(res);
  return new StorageError(`S3 ${method} ${key} failed: ${res.status}${code ? ` ${code}` : ""}`, res.status, code);
}

/** 404 on a missing object is null/success; on a missing bucket it is misconfiguration, never "no object". */
async function missing(method: string, key: string, res: Response): Promise<null> {
  const code = await s3Code(res);
  if (code === "NoSuchBucket") {
    throw new StorageError(`S3 ${method} ${key} failed: 404 NoSuchBucket`, 404, code);
  }
  return null;
}
