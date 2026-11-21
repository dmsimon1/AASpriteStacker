/**
 * Opt-in browser WebSocket dev bridge client for AASpriteStacker.
 * Connects to the localhost @aastack/mcp relay (default ws://127.0.0.1:8787),
 * auto-reconnects gracefully, and dispatches incoming agent tools through executeEngineTool().
 */

import type { AgentActivityEvent, BridgeWireMessage } from "./protocol.js";
import { executeEngineTool } from "./tools.js";
import type { EngineToolContext } from "./tools.js";

export type BridgeConnectionStatus = "disconnected" | "connecting" | "connected";

export interface DevBridgeOptions {
  /** Localhost relay URL (defaults to ws://127.0.0.1:8787 or ?bridgePort= override). */
  url?: string;
  /** Optional session identifier (defaults to auto-generated tab id). */
  sessionId?: string;
  /** Human-readable tab label shown in aastack_live_sessions. */
  title?: string;
  /** Optional shared auth token matching AASTACK_BRIDGE_TOKEN. */
  token?: string;
  onStatusChange?: (status: BridgeConnectionStatus) => void;
  onAgentEvent?: (event: AgentActivityEvent) => void;
}

export interface DevBridgeHandle {
  readonly sessionId: string;
  getStatus(): BridgeConnectionStatus;
  disconnect(): void;
}

function makeSessionId(): string {
  return `tab-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultBridgeUrl(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const port = params.get("bridgePort") || "8787";
    return `ws://127.0.0.1:${port}`;
  }
  return "ws://127.0.0.1:8787";
}

export function connectDevBridge(ctx: EngineToolContext, opts: DevBridgeOptions = {}): DevBridgeHandle {
  const sessionId = opts.sessionId ?? makeSessionId();
  const url = opts.url ?? defaultBridgeUrl();
  const title = opts.title ?? (typeof document !== "undefined" ? document.title : "AASpriteStacker");
  const token =
    opts.token ??
    (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("bridgeToken") ?? undefined : undefined);

  const mergedCtx: EngineToolContext = {
    ...ctx,
    onAgentEvent: (ev) => {
      ctx.onAgentEvent?.(ev);
      opts.onAgentEvent?.(ev);
    },
  };

  let ws: WebSocket | null = null;
  let status: BridgeConnectionStatus = "disconnected";
  let closedByUser = false;
  let retryMs = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let hbTimer: ReturnType<typeof setInterval> | null = null;

  const setStatus = (next: BridgeConnectionStatus) => {
    if (status === next) return;
    status = next;
    opts.onStatusChange?.(next);
  };

  const sendMsg = (msg: BridgeWireMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const getViewport = (): [number, number] =>
    typeof window !== "undefined" ? [window.innerWidth, window.innerHeight] : [1280, 800];

  const connect = () => {
    if (closedByUser || typeof WebSocket === "undefined") return;
    setStatus("connecting");
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleRetry();
      return;
    }

    ws.addEventListener("open", () => {
      retryMs = 1000;
      setStatus("connected");
      const stats = mergedCtx.renderer?.getStats();
      sendMsg({
        type: "hello",
        role: "browser",
        sessionId,
        title,
        url: typeof window !== "undefined" ? window.location.href : "",
        viewport: getViewport(),
        isMobile: mergedCtx.renderer?.isMobile ?? false,
        style: mergedCtx.world.doc.style,
        fps: stats?.fps ?? 0,
        ...(token ? { token } : {}),
      });
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(() => {
        const st = mergedCtx.renderer?.getStats();
        sendMsg({
          type: "heartbeat",
          sessionId,
          viewport: getViewport(),
          style: mergedCtx.world.doc.style,
          fps: st?.fps ?? 0,
        });
      }, 4000);
    });

    ws.addEventListener("message", async (ev) => {
      let msg: BridgeWireMessage;
      try {
        msg = JSON.parse(String(ev.data)) as BridgeWireMessage;
      } catch {
        return;
      }
      if (msg.type === "rpc_req") {
        try {
          const result = await executeEngineTool(mergedCtx, msg.tool, msg.args ?? {});
          sendMsg({ type: "rpc_res", id: msg.id, result });
        } catch (err) {
          sendMsg({
            type: "rpc_res",
            id: msg.id,
            result: { ok: false, error: err instanceof Error ? err.message : String(err) },
          });
        }
      }
    });

    const onDisconnect = () => {
      if (hbTimer) {
        clearInterval(hbTimer);
        hbTimer = null;
      }
      ws = null;
      setStatus("disconnected");
      scheduleRetry();
    };

    ws.addEventListener("close", onDisconnect);
    ws.addEventListener("error", () => {
      ws?.close();
    });
  };

  const scheduleRetry = () => {
    if (closedByUser || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryMs);
    retryMs = Math.min(8000, Math.round(retryMs * 1.6));
  };

  connect();

  return {
    sessionId,
    getStatus: () => status,
    disconnect() {
      closedByUser = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (hbTimer) clearInterval(hbTimer);
      ws?.close();
      ws = null;
      setStatus("disconnected");
    },
  };
}
