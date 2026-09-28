import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export type FakeHandler = (req: FakeRequest, res: ServerResponse) => void;

export interface FakeStack {
  baseURL: string;
  requests: FakeRequest[];
  close(): Promise<void>;
}

/** Test-only stand-in for http://erp.localhost. Records every request. */
export async function startFakeStack(handler: FakeHandler): Promise<FakeStack> {
  const requests: FakeRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const recorded: FakeRequest = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(recorded);
      handler(recorded, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A URL nothing listens on: a server is opened and closed again. */
export async function closedPortURL(): Promise<string> {
  const stack = await startFakeStack((_req, res) => res.end());
  await stack.close();
  return stack.baseURL;
}
