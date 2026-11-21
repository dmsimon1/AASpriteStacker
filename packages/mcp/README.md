# `@aastack/mcp`

Zero-dependency **Model Context Protocol (MCP)** stdio server + **embedded localhost RFC 6455 WebSocket dev bridge** exposing AASpriteStacker's live patching, blueprint hot-swap, 3D geometric linting, and native MCP `image/png` visual capture tools to frontier coding agents (Antigravity, Claude Code, Cursor, Codex, Gemini CLI).

## Build & Register

```bash
# From repo root
npm install
npm run build
```

Add to your MCP client config:

```json
{
  "mcpServers": {
    "aastack": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/AASpriteStacker/packages/mcp/dist/server.js"]
    }
  }
}
```

Launch any app wired with `@aastack/bridge/client` using `?bridge=1` (e.g., `http://127.0.0.1:8765/examples/flight-6dof/index.html?bridge=1`) and it connects automatically to `ws://127.0.0.1:8787` (override via `AASTACK_BRIDGE_PORT`). Multiple IDE windows/agents automatically share the same relay via leader/follower port election with zero `EADDRINUSE` conflicts.

## Tools

### Live Browser Co-Editing & Visual Self-Critique
- `aastack_live_sessions` — List connected WebGL2 browser tabs (`sessionId`, title, viewport, FPS, style)
- `aastack_live_state` — Inspect live SceneIR, registered assets, and telemetry
- `aastack_live_patch` — Apply schema-validated `ScenePatchOp[]` with automatic pre-patch undo snapshot
- `aastack_live_undo` / `aastack_live_redo` — Step through shared human + agent history
- `aastack_live_hot_swap_blueprint` — Validate, 3D-lint, compile, and hot-swap a `BlueprintSpec` JSON live with zero reload
- `aastack_live_query` — Exact 1:1 `terrainHeight`, `raycast`, and semantic `socket` queries
- `aastack_live_capture` — Capture a single `≤ 1024px` PNG returned as a native MCP `image/png` block + telemetry JSON
- `aastack_live_capture_views` — Capture a **2×2 labeled PNG contact sheet** (`turntable`: `0°/90°/180°/270°` or `scene`: `Chase/Overhead/Side 3/4/Normals Debug`) as a native MCP `image/png` block
- `aastack_live_snapshot` / `aastack_live_restore` — Deterministic time-travel capture & restore

### Offline Validation, Carving & Explicit Workspace Persistence
- `aastack_compile_blueprint` — Validate, 3D-lint (floating voxel islands, socket bounds, VRAM budget), and compile a `BlueprintSpec`
- `aastack_save_blueprint` — Validate, 3D-lint, and write a clean Git-diffable `.blueprint.json` inside the workspace
- `aastack_export_scene` — Export the live (or provided) `SceneDocument` to a clean `.scene.json` inside the workspace
- `aastack_inspect_vox` — Inspect and lint a MagicaVoxel `.vox` binary inside the workspace
- `aastack_carve_4view` — Run `aa_views_to_slices.py` on a 4-view orthographic PNG
- `aastack_validate_scene_ir` — Validate `SceneDocument` + `ScenePatchOp[]` against strict schemas and mobile budgets
- `aastack_get_sdk_spec` — Return [`llms-full.txt`](../../llms-full.txt)

## Security Boundaries
- Relay binds strictly to loopback `127.0.0.1` and enforces an explicit local `Origin` allowlist (`127.0.0.1`, `localhost`, `null`/`file://`), with optional `AASTACK_BRIDGE_TOKEN` auth.
- All file reads/writes are strictly confined inside the workspace root (`../` traversal is rejected).

See [AI Integration Guide](../../docs/ai-integration.md) for full details.
