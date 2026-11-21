# `@aastack/bridge`

Zero-dependency isomorphic **JSON Schemas, 3D Geometric Linter, Vendor-Neutral LLM Tool Dispatcher, and Browser Live Dev Bridge Client** for AASpriteStacker.

## Design Philosophy
- **Zero production bloat:** `@aastack/core` stays 100% pure. Apps lazy-load `@aastack/bridge/client` only when `?bridge=1` or dev co-editing is active.
- **Vendor-neutral single source of truth:** The exact same tool schemas and `executeEngineTool()` dispatcher power `@aastack/mcp` (Claude Code, Antigravity, Cursor, Codex, Gemini CLI) AND any future in-browser BYOK AI Studio (Gemini, Anthropic, OpenAI).

## Subpath Exports

| Import | Contents |
| --- | --- |
| `@aastack/bridge/client` | `connectDevBridge(ctx, opts)` — browser WebSocket client + `"Agent Live"` activity callbacks (tree-shakes away static JSON Schemas!) |
| `@aastack/bridge/tools` | `executeEngineTool(ctx, tool, args)` — in-process live patch, undo/redo, blueprint hot-swap, 1:1 spatial queries, single-frame PNG capture, and 2×2 labeled multi-angle contact sheets |
| `@aastack/bridge/linter` | `lintVolumeAsset(asset)` (3D 6-connected-component floating voxel island detection, socket bounds/proximity, mobile VRAM budget) & `lintSceneWorld(world)` |
| `@aastack/bridge/schemas` | Draft 2020-12 JSON Schemas (`BLUEPRINT_SPEC_SCHEMA`, `SCENE_PATCH_OPS_SCHEMA`, `SCENE_DOCUMENT_SCHEMA`), `ENGINE_TOOL_DEFINITIONS`, `toOpenAITools()`, `toAnthropicTools()`, `toGeminiFunctionDeclarations()` |
| `@aastack/bridge/protocol` | Wire message & `EngineToolResult` / `Diagnostic` / `CapturedImage` TypeScript types |

## Quick Browser Setup (`?bridge=1`)

```ts
if (new URLSearchParams(window.location.search).get("bridge") === "1") {
  const { connectDevBridge } = await import("@aastack/bridge/client");
  connectDevBridge(
    { world, renderer, onSyncUI: () => syncControls() },
    { title: "My AASpriteStacker Game" },
  );
}
```

See the full [AI Integration Guide](../../docs/ai-integration.md) and [API Reference](../../docs/api-reference.md).
