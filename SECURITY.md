# Security Policy

## Supported Versions

During pre-`1.0` development (`0.1.x`), security fixes are applied directly to the `main` branch and the latest release tag.

| Version | Supported |
| --- | --- |
| `main` / `0.1.x` | Yes |

## Security Architecture Notes

- **`@aastack/core` & `@aastack/blueprint`:** Pure client-side WebGL2/TypeScript libraries with **zero external runtime dependencies**, zero network requests, zero telemetry, and zero embedded credentials.
- **`@aastack/mcp`:** Runs locally over stdio (`stdin`/`stdout`) as an MCP tool server for coding agents. Tools such as `aastack_inspect_vox` and `aastack_carve_4view` read/write local files specified by the host agent; always run `@aastack/mcp` within trusted local workspaces and review file paths passed by automated agents.
- **Asset Parsers:** `parseVox`, `loadSliceStripPixels`, and `compileBlueprint` enforce grid-size bounds (maximum `256 × 256 × 128` voxels) to guard against excessive memory allocation from untrusted assets.

## Reporting a Vulnerability

If you discover a security vulnerability (for example: path traversal or command injection in `@aastack/mcp`, malformed `.vox` / `BlueprintSpec` DoS, or unsafe DOM/HTML handling in demo/viewer tooling):

1. **Do not open a public GitHub issue.**
2. Use GitHub's **Private Vulnerability Reporting** ("Security" → "Advisories" → "Report a vulnerability") on this repository, or contact the repository owner privately.
3. Include a minimal reproduction, affected package/commit SHA, and impact summary.

We aim to acknowledge reports within 72 hours and publish a fix and advisory promptly once verified.
