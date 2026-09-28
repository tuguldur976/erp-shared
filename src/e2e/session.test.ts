import { afterEach, describe, expect, it } from "vitest";
import { closedPortURL, startFakeStack, type FakeStack } from "./fake-stack.fixture.js";
import {
  cookieHeader,
  coreSessionAlive,
  hasSessionCookie,
  SIGN_IN_PATH,
  signInCore,
} from "./session.js";

let stack: FakeStack | null = null;
afterEach(async () => {
  await stack?.close();
  stack = null;
});

const SESSION = "erp.session_token=abc123; Path=/; HttpOnly; SameSite=Lax";

describe("cookieHeader / hasSessionCookie", () => {
  it("joins pairs the way a browser sends them", () => {
    expect(cookieHeader([{ name: "a", value: "1" }, { name: "b", value: "2" }])).toBe("a=1; b=2");
  });

  // Review Focus 3: https adds the __Secure- prefix.
  it("knows both spellings of the session cookie", () => {
    expect(hasSessionCookie([{ name: "erp.session_token", value: "x" }])).toBe(true);
    expect(hasSessionCookie([{ name: "__Secure-erp.session_token", value: "x" }])).toBe(true);
    expect(hasSessionCookie([{ name: "scm_jwt", value: "x" }])).toBe(false);
  });
});

describe("signInCore", () => {
  it("posts JSON with the stack's origin to the core-web auth proxy and returns every cookie", async () => {
    stack = await startFakeStack((_req, res) => {
      res.setHeader("set-cookie", [SESSION, "erp.session_data=zzz; Path=/"]);
      res.statusCode = 200;
      res.end();
    });

    const cookies = await signInCore(stack.baseURL, "admin@spark.mn", "pw");

    expect(cookies).toEqual([
      { name: "erp.session_token", value: "abc123" },
      { name: "erp.session_data", value: "zzz" },
    ]);
    const [req] = stack.requests;
    expect(req?.method).toBe("POST");
    expect(req?.url).toBe(SIGN_IN_PATH);
    expect(req?.headers.origin).toBe(stack.baseURL);
    expect(req?.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(req?.body ?? "")).toEqual({ email: "admin@spark.mn", password: "pw" });
  });

  it("accepts the __Secure- session cookie", async () => {
    stack = await startFakeStack((_req, res) => {
      res.setHeader("set-cookie", "__Secure-erp.session_token=s1; Path=/; Secure");
      res.end();
    });
    await expect(signInCore(stack.baseURL, "a@b.mn", "pw")).resolves.toEqual([
      { name: "__Secure-erp.session_token", value: "s1" },
    ]);
  });

  // Review Focus 2.
  it("says wrong email or password on 401, naming the email but not the password", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 401;
      res.end();
    });
    const failure = signInCore(stack.baseURL, "e2e-a@e2e.local", "hunter2-secret");
    await expect(failure).rejects.toThrow("Core refused sign-in for e2e-a@e2e.local (401): wrong email or password.");
    await expect(failure).rejects.not.toThrow(/hunter2-secret/);
  });

  it("explains the rate limit on 429", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 429;
      res.end();
    });
    await expect(signInCore(stack.baseURL, "a@b.mn", "pw")).rejects.toThrow(
      "Core sign-in limit hit (3 per 10 s). Wait 10 s and run again.",
    );
  });

  it("reports any other status as the answer it was", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 403;
      res.end();
    });
    await expect(signInCore(stack.baseURL, "a@b.mn", "pw")).rejects.toThrow(
      `Core sign-in at ${stack.baseURL} answered 403.`,
    );
  });

  it("fails loudly when sign-in sets no session cookie", async () => {
    stack = await startFakeStack((_req, res) => {
      res.setHeader("set-cookie", "other=1; Path=/");
      res.end();
    });
    await expect(signInCore(stack.baseURL, "a@b.mn", "pw")).rejects.toThrow(/set no session cookie/);
  });

  it("says the stack is not reachable when nothing listens", async () => {
    const url = await closedPortURL();
    await expect(signInCore(url, "a@b.mn", "pw")).rejects.toThrow(
      new RegExp(`Stack not reachable at ${url.replace(/[.]/g, "\\.")} \\(ECONNREFUSED\\)`),
    );
  });
});

describe("coreSessionAlive", () => {
  it("is true when / answers 200, and sends the cookies", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 200;
      res.end("<html></html>");
    });
    await expect(coreSessionAlive(stack.baseURL, [{ name: "erp.session_token", value: "abc" }])).resolves.toBe(true);
    expect(stack.requests[0]?.url).toBe("/");
    expect(stack.requests[0]?.headers.cookie).toBe("erp.session_token=abc");
  });

  // Review Focus 5: proxy.ts answers with an absolute URL, requireSession()'s
  // redirect() with a relative path — both mean the cookie is dead.
  it("is false on a redirect to an absolute /login URL", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 307;
      res.setHeader("location", "http://erp.localhost/login?next=%2F");
      res.end();
    });
    await expect(coreSessionAlive(stack.baseURL, [])).resolves.toBe(false);
  });

  it("is false on a redirect to a relative /login path", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 307;
      res.setHeader("location", "/login?next=%2F");
      res.end();
    });
    await expect(coreSessionAlive(stack.baseURL, [])).resolves.toBe(false);
  });

  // Review Focus 1: a down stack is not a dead cookie.
  it("throws instead of answering false when the stack answers 502", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 502;
      res.end();
    });
    await expect(coreSessionAlive(stack.baseURL, [])).rejects.toThrow(/Stack not reachable at .* \(502\)/);
  });

  it("throws on a redirect somewhere other than /login", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "/somewhere");
      res.end();
    });
    await expect(coreSessionAlive(stack.baseURL, [])).rejects.toThrow("(302 → /somewhere)");
  });
});
