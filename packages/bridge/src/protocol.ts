/**
 * Wire protocol and shared diagnostic/tool result types for @aastack/bridge and @aastack/mcp.
 * Pure TypeScript with zero runtime dependencies (safe in browsers, workers, and Node.js).
 */

import type { RenderStyle } from "@aastack/core";

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  path: string;
  message: string;
  suggestion?: string;
}

export interface CapturedImage {
  label?: string;
  mimeType: "image/png" | "image/webp";
  /** Raw base64-encoded image bytes (without data: URL prefix). */
  base64: string;
  width: number;
  height: number;
}

export interface EngineToolResult {
  ok: boolean;
  summary?: string;
  data?: Record<string, unknown>;
  diagnostics?: Diagnostic[];
  images?: CapturedImage[];
  error?: string;
}

export interface BridgeSessionInfo {
  sessionId: string;
  title: string;
  url: string;
  viewport: [number, number];
  isMobile: boolean;
  style: RenderStyle;
  fps: number;
  connectedAt: number;
  lastSeenAt: number;
}

export type BridgeWireMessage =
  | {
      type: "hello";
      role: "browser" | "agent";
      sessionId?: string;
      title?: string;
      url?: string;
      viewport?: [number, number];
      isMobile?: boolean;
      style?: RenderStyle;
      fps?: number;
      token?: string;
    }
  | {
      type: "welcome";
      role: "browser" | "agent";
      sessionId: string;
      bridgeVersion: string;
    }
  | {
      type: "heartbeat";
      sessionId: string;
      viewport?: [number, number];
      style?: RenderStyle;
      fps?: number;
    }
  | {
      type: "sessions_req";
      id: string;
    }
  | {
      type: "sessions_res";
      id: string;
      sessions: BridgeSessionInfo[];
    }
  | {
      type: "rpc_req";
      id: string;
      sessionId?: string;
      tool: string;
      args: Record<string, unknown>;
    }
  | {
      type: "rpc_res";
      id: string;
      result: EngineToolResult;
    };

export interface AgentActivityEvent {
  tool: string;
  summary: string;
  canUndo: boolean;
  diagnosticsCount: number;
  timestamp: number;
}
