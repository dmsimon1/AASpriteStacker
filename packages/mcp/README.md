# `@aastack/mcp`

Zero-dependency **Model Context Protocol (MCP)** stdio server exposing AASpriteStacker's asset compilation, validation, 4-view carving, and SDK specification tools to frontier coding agents (Claude Code, Cursor, Antigravity, Codex, Gemini CLI).

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

## Tools
- `aastack_get_sdk_spec` — Returns [`llms-full.txt`](../../llms-full.txt) for zero-hallucination code generation
- `aastack_compile_blueprint` — Validates & compiles a `BlueprintSpec` JSON and reports voxel occupancy, sockets, hash, and GPU 3D texture budget (`KB`)
- `aastack_inspect_vox` — Inspects a MagicaVoxel `.vox` binary on disk
- `aastack_carve_4view` — Runs `aa_views_to_slices.py` on a 4-view orthographic PNG
- `aastack_validate_scene_ir` — Validates a `SceneDocument` + `ScenePatchOp[]` against parent links, `RenderStyle`, scales, and mobile entity budgets

See the [AI Integration Guide](../../docs/ai-integration.md) for details and the upcoming `v0.1.0` live WebSocket browser bridge.
