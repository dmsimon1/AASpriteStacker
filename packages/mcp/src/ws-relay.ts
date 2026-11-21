/**
 * Zero-dependency RFC 6455 localhost WebSocket relay with automatic multi-agent
 * leader/follower port sharing and strict loopback + Origin security checks.
 *
 * - Leader mode: binds http.Server strictly to 127.0.0.1:<port>, accepting both
 *   browser dev-bridge tabs (role="browser") and peer @aastack/mcp processes (role="agent").
 * - Follower mode: if <port> is already bound (EADDRINUSE), automatically connects
 *   as a peer WebSocket client so multiple IDE tabs/agents share one relay cleanly.
 */

import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { IncomingMessage, Server } from "node:http";
import { createConnection } from "node:net";
import type { Socket } from "node:net";
import type { BridgeSessionInfo, BridgeWireMessage, EngineToolResult } from "@aastack/bridge";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME_BYTES = 16 * 1024 * 1024; // 16 MB cap

export function isAllowedLocalOrigin(origin: string | undefined): boolean {
  if (!origin || origin === "null") return true; // CLI / Node / file:// viewer
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
}

/** Encode a single RFC 6455 frame (masked for client->server, unmasked for server->client). */
function encodeWsFrame(opcode: number, payload: Buffer, mask: boolean): Buffer {
  const len = payload.length;
  let headerLen = 2;
  if (len >= 126 && len < 65536) headerLen += 2;
  else if (len >= 65536) headerLen += 8;
  if (mask) headerLen += 4;

  const out = Buffer.allocUnsafe(headerLen + len);
  out[0] = 0x80 | (opcode & 0x0f);
  let off = 2;
  const maskBit = mask ? 0x80 : 0x00;
  if (len < 126) {
    out[1] = maskBit | len;
  } else if (len < 65536) {
    out[1] = maskBit | 126;
    out.writeUInt16BE(len, 2);
    off = 4;
  } else {
    out[1] = maskBit | 127;
    out.writeBigUInt64BE(BigInt(len), 2);
    off = 10;
  }

  if (mask) {
    const mk = randomBytes(4);
    mk.copy(out, off);
    off += 4;
    for (let i = 0; i < len; i++) {
      out[off + i] = payload[i] ^ mk[i & 3];
    }
  } else {
    payload.copy(out, off);
  }
  return out;
}

class FramedWsConn {
  private buf: Buffer = Buffer.alloc(0);
  private fragChunks: Buffer[] = [];
  private fragOpcode = 0;
  private closed = false;

  constructor(
    private readonly socket: Socket,
    private readonly isClient: boolean,
    private readonly onMessage: (text: string) => void,
    private readonly onClose: () => void,
  ) {
    socket.on("data", (chunk: Buffer) => this.handleData(chunk));
    socket.on("close", () => this.handleClose());
    socket.on("error", () => this.handleClose());
  }

  sendJson(msg: BridgeWireMessage): void {
    if (this.closed || this.socket.destroyed) return;
    const payload = Buffer.from(JSON.stringify(msg), "utf-8");
    this.socket.write(encodeWsFrame(0x01, payload, this.isClient));
  }

  close(code = 1000): void {
    if (this.closed) return;
    this.closed = true;
    try {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(code, 0);
      if (!this.socket.destroyed) {
        this.socket.write(encodeWsFrame(0x08, b, this.isClient));
        this.socket.end();
      }
    } catch {
      // ignore close write errors
    }
    this.onClose();
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }

  private handleData(chunk: Buffer): void {
    if (this.closed) return;
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    if (this.buf.length > MAX_FRAME_BYTES) {
      this.close(1009);
      return;
    }

    while (this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;

      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME_BYTES)) {
          this.close(1009);
          return;
        }
        len = Number(big);
        off = 10;
      }

      const maskLen = masked ? 4 : 0;
      if (this.buf.length < off + maskLen + len) return;

      let payload: Buffer;
      if (masked) {
        const mk = this.buf.subarray(off, off + 4);
        off += 4;
        payload = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) {
          payload[i] = this.buf[off + i] ^ mk[i & 3];
        }
      } else {
        payload = Buffer.from(this.buf.subarray(off, off + len));
      }
      this.buf = this.buf.subarray(off + len);

      if (opcode === 0x08) {
        this.close(1000);
        return;
      }
      if (opcode === 0x09) {
        // Ping -> Pong
        if (!this.socket.destroyed) this.socket.write(encodeWsFrame(0x0a, payload, this.isClient));
        continue;
      }
      if (opcode === 0x0a) continue; // Pong

      if (opcode === 0x01 || opcode === 0x02) {
        if (fin) {
          this.onMessage(payload.toString("utf-8"));
        } else {
          this.fragOpcode = opcode;
          this.fragChunks = [payload];
        }
      } else if (opcode === 0x00 && this.fragOpcode !== 0) {
        this.fragChunks.push(payload);
        if (fin) {
          const full = Buffer.concat(this.fragChunks);
          this.fragChunks = [];
          this.fragOpcode = 0;
          this.onMessage(full.toString("utf-8"));
        }
      }
    }
  }
}

interface PendingReq<T> {
  resolve: (v: T) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  forwardTo?: FramedWsConn;
  origId?: string;
}

export interface BridgeRelayOptions {
  port?: number;
  token?: string;
}

export interface BridgeRelayHandle {
  readonly port: number;
  readonly mode: "leader" | "follower";
  listSessions(): Promise<BridgeSessionInfo[]>;
  callLiveTool(tool: string, args: Record<string, unknown>, sessionId?: string, timeoutMs?: number): Promise<EngineToolResult>;
  close(): Promise<void>;
}

/** Connect as a raw RFC 6455 WebSocket client to a localhost relay leader. */
function connectRawWsClient(port: number, onMessage: (text: string) => void, onClose: () => void): Promise<FramedWsConn> {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString("base64");
    const expectedAccept = createHash("sha1").update(key + WS_GUID).digest("base64");
    const sock = createConnection({ host: "127.0.0.1", port });
    let handshakeBuf: Buffer = Buffer.alloc(0);
    let upgraded = false;

    const fail = (err: Error) => {
      if (!upgraded) {
        sock.destroy();
        reject(err);
      }
    };

    sock.once("error", fail);
    sock.once("connect", () => {
      const req =
        `GET / HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n\r\n`;
      sock.write(req);
    });

    const onHandshakeData = (chunk: Buffer) => {
      handshakeBuf = Buffer.concat([handshakeBuf, chunk]);
      const sep = handshakeBuf.indexOf("\r\n\r\n");
      if (sep < 0) return;
      const head = handshakeBuf.subarray(0, sep).toString("utf-8");
      const leftover = handshakeBuf.subarray(sep + 4);
      sock.off("data", onHandshakeData);

      if (!head.startsWith("HTTP/1.1 101") || !head.toLowerCase().includes(expectedAccept.toLowerCase())) {
        fail(new Error("WebSocket upgrade rejected by bridge relay"));
        return;
      }
      upgraded = true;
      const conn = new FramedWsConn(sock, true, onMessage, onClose);
      if (leftover.length > 0) sock.emit("data", leftover);
      resolve(conn);
    };

    sock.on("data", onHandshakeData);
  });
}

export async function startBridgeRelay(opts: BridgeRelayOptions = {}): Promise<BridgeRelayHandle> {
  const port = opts.port ?? (Number(process.env.AASTACK_BRIDGE_PORT) || 8787);
  const token = opts.token ?? process.env.AASTACK_BRIDGE_TOKEN;
  let seq = 1;
  const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`;

  // Leader state
  const browsers = new Map<string, { conn: FramedWsConn; info: BridgeSessionInfo }>();
  const pendingRpc = new Map<string, PendingReq<EngineToolResult>>();
  const pendingSessions = new Map<string, PendingReq<BridgeSessionInfo[]>>();

  const rejectAllPending = (reason: string) => {
    for (const [k, p] of pendingRpc) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      pendingRpc.delete(k);
    }
    for (const [k, p] of pendingSessions) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      pendingSessions.delete(k);
    }
  };

  const selectBrowser = (sessionId?: string) => {
    if (sessionId) return browsers.get(sessionId);
    let best: { conn: FramedWsConn; info: BridgeSessionInfo } | undefined;
    for (const b of browsers.values()) {
      if (!best || b.info.lastSeenAt > best.info.lastSeenAt) best = b;
    }
    return best;
  };

  const dispatchLeaderRpc = (
    tool: string,
    args: Record<string, unknown>,
    sessionId?: string,
    timeoutMs = 15_000,
    forwardTo?: FramedWsConn,
    origId?: string,
  ): Promise<EngineToolResult> => {
    const target = selectBrowser(sessionId);
    if (!target) {
      const errRes: EngineToolResult = {
        ok: false,
        error: sessionId
          ? `No connected browser tab with sessionId "${sessionId}". Open your AASpriteStacker app with ?bridge=1.`
          : `No live browser tab connected to ws://127.0.0.1:${port}. Open your AASpriteStacker app with ?bridge=1 (e.g. http://127.0.0.1:8765/examples/flight-6dof/index.html?bridge=1).`,
      };
      if (forwardTo && origId) forwardTo.sendJson({ type: "rpc_res", id: origId, result: errRes });
      return Promise.resolve(errRes);
    }
    const id = nextId("rpc");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRpc.delete(id);
        const timeoutRes: EngineToolResult = { ok: false, error: `Live tool "${tool}" timed out after ${timeoutMs}ms.` };
        if (forwardTo && origId) forwardTo.sendJson({ type: "rpc_res", id: origId, result: timeoutRes });
        resolve(timeoutRes);
      }, timeoutMs);
      pendingRpc.set(id, { resolve, reject, timer, forwardTo, origId });
      target.conn.sendJson({ type: "rpc_req", id, sessionId: target.info.sessionId, tool, args });
    });
  };

  // Attempt to bind as Leader on 127.0.0.1:<port>
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        service: "@aastack/mcp-bridge",
        port,
        sessions: Array.from(browsers.values()).map((b) => b.info),
      }),
    );
  });

  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const origin = req.headers.origin;
    if (!isAllowedLocalOrigin(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const wsKey = req.headers["sec-websocket-key"];
    if (!wsKey || typeof wsKey !== "string") {
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const accept = createHash("sha1").update(wsKey + WS_GUID).digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    let registeredBrowserId: string | null = null;
    const conn = new FramedWsConn(
      socket,
      false,
      (text) => {
        let msg: BridgeWireMessage;
        try {
          msg = JSON.parse(text) as BridgeWireMessage;
        } catch {
          return;
        }
        if (msg.type === "hello") {
          if (token && msg.token !== token) {
            conn.close(4003);
            return;
          }
          const sid = msg.sessionId || nextId(msg.role === "browser" ? "tab" : "agent");
          if (msg.role === "browser") {
            registeredBrowserId = sid;
            const now = Date.now();
            browsers.set(sid, {
              conn,
              info: {
                sessionId: sid,
                title: msg.title || "AASpriteStacker",
                url: msg.url || "",
                viewport: msg.viewport || [1280, 800],
                isMobile: Boolean(msg.isMobile),
                style: msg.style || "arcade-8bit",
                fps: msg.fps ?? 0,
                connectedAt: now,
                lastSeenAt: now,
              },
            });
          }
          conn.sendJson({ type: "welcome", role: msg.role, sessionId: sid, bridgeVersion: "0.1.0" });
        } else if (msg.type === "heartbeat") {
          const entry = browsers.get(msg.sessionId);
          if (entry) {
            entry.info.lastSeenAt = Date.now();
            if (msg.viewport) entry.info.viewport = msg.viewport;
            if (msg.style) entry.info.style = msg.style;
            if (typeof msg.fps === "number") entry.info.fps = msg.fps;
          }
        } else if (msg.type === "sessions_req") {
          conn.sendJson({
            type: "sessions_res",
            id: msg.id,
            sessions: Array.from(browsers.values()).map((b) => b.info),
          });
        } else if (msg.type === "rpc_req") {
          void dispatchLeaderRpc(msg.tool, msg.args, msg.sessionId, 15_000, conn, msg.id);
        } else if (msg.type === "rpc_res") {
          const p = pendingRpc.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            pendingRpc.delete(msg.id);
            if (p.forwardTo && p.origId) {
              p.forwardTo.sendJson({ type: "rpc_res", id: p.origId, result: msg.result });
            }
            p.resolve(msg.result);
          }
        }
      },
      () => {
        if (registeredBrowserId) browsers.delete(registeredBrowserId);
      },
    );

    if (head.length > 0) socket.emit("data", head);
  });

  const bindResult = await new Promise<"leader" | "eaddrinuse">((resolve, reject) => {
    const onErr = (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") resolve("eaddrinuse");
      else reject(err);
    };
    server.once("error", onErr);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onErr);
      resolve("leader");
    });
  });

  if (bindResult === "leader") {
    const actualAddr = server.address();
    const actualPort = typeof actualAddr === "object" && actualAddr ? actualAddr.port : port;
    return {
      port: actualPort,
      mode: "leader",
      async listSessions() {
        return Array.from(browsers.values()).map((b) => b.info);
      },
      callLiveTool(tool, args, sessionId, timeoutMs) {
        return dispatchLeaderRpc(tool, args, sessionId, timeoutMs);
      },
      async close() {
        rejectAllPending("Bridge relay closed");
        for (const b of browsers.values()) b.conn.close();
        browsers.clear();
        await new Promise<void>((res) => server.close(() => res()));
      },
    };
  }

  // Port already bound by an active @aastack/mcp relay -> attach cleanly as a Follower peer!
  let followerConn: FramedWsConn | null = null;
  let closed = false;

  const ensureFollower = async (): Promise<FramedWsConn> => {
    if (followerConn) return followerConn;
    const conn = await connectRawWsClient(
      port,
      (text) => {
        let msg: BridgeWireMessage;
        try {
          msg = JSON.parse(text) as BridgeWireMessage;
        } catch {
          return;
        }
        if (msg.type === "sessions_res") {
          const p = pendingSessions.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            pendingSessions.delete(msg.id);
            p.resolve(msg.sessions);
          }
        } else if (msg.type === "rpc_res") {
          const p = pendingRpc.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            pendingRpc.delete(msg.id);
            p.resolve(msg.result);
          }
        }
      },
      () => {
        followerConn = null;
        if (!closed) rejectAllPending("Disconnected from bridge relay leader");
      },
    );
    conn.sendJson({ type: "hello", role: "agent", ...(token ? { token } : {}) });
    followerConn = conn;
    return conn;
  };

  await ensureFollower();

  return {
    port,
    mode: "follower",
    async listSessions() {
      const conn = await ensureFollower();
      const id = nextId("sess");
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingSessions.delete(id);
          reject(new Error("Timed out listing bridge sessions"));
        }, 5000);
        pendingSessions.set(id, { resolve, reject, timer });
        conn.sendJson({ type: "sessions_req", id });
      });
    },
    async callLiveTool(tool, args, sessionId, timeoutMs = 15_000) {
      const conn = await ensureFollower();
      const id = nextId("frpc");
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRpc.delete(id);
          resolve({ ok: false, error: `Live tool "${tool}" timed out after ${timeoutMs}ms.` });
        }, timeoutMs);
        pendingRpc.set(id, { resolve, reject, timer });
        conn.sendJson({ type: "rpc_req", id, sessionId, tool, args });
      });
    },
    async close() {
      closed = true;
      rejectAllPending("Bridge follower closed");
      followerConn?.close();
      followerConn = null;
    },
  };
}
