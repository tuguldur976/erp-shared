import { describe, expect, it } from "vitest";
import { InvalidStorageKeyError } from "./adapter.js";
import { assertValidKey, encodeKey } from "./key.js";

describe("assertValidKey", () => {
  it.each([
    "products/7f3a/a1b2.jpg",
    "products/7f3a/a1b2-256.jpg",
    "po-documents/c1/p1/d1.pdf",
    "a..b/c.jpg",
    "products/зураг 1.jpg",
  ])("accepts %j", (key) => {
    expect(() => assertValidKey(key)).not.toThrow();
  });

  it.each([
    ["empty", ""],
    ["leading slash", "/products/a.jpg"],
    ["parent segment", "products/../scm/a.jpg"],
    ["parent segment at the end", "products/.."],
    ["only a parent segment", ".."],
    ["backslash", "products\\a.jpg"],
    ["backslash parent", "products\\..\\a.jpg"],
    // Review Focus 1: the URL parser drops "." — S3 would write another key.
    ["dot segment", "products/./a.jpg"],
  ])("refuses %s", (_label, key) => {
    expect(() => assertValidKey(key)).toThrow(InvalidStorageKeyError);
  });

  it("names the key in the message", () => {
    expect(() => assertValidKey("/x")).toThrow('Invalid storage key: "/x"');
  });
});

describe("encodeKey", () => {
  it("encodes each segment and keeps the slashes", () => {
    expect(encodeKey("products/7f3a/a b+c#?%.jpg")).toBe("products/7f3a/a%20b%2Bc%23%3F%25.jpg");
  });

  it("encodes non-ASCII as UTF-8", () => {
    expect(encodeKey("p/ө.jpg")).toBe("p/%D3%A9.jpg");
  });
});
