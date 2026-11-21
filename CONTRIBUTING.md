# Contributing to AASpriteStacker

Thank you for helping build **AASpriteStacker** (`@aastack/*`) — an open-source, mobile-friendly, AI-first anti-aliased 6-DOF & 2.5D sprite-stacking engine SDK!

## Non-Negotiable Design Principles

Every PR and RFC is reviewed against four first-principles invariants:

1. **Zero Runtime Bloat:** `@aastack/core` and `@aastack/blueprint` MUST maintain **zero external runtime dependencies** and stay lightweight and tree-shakeable.
2. **Mobile-GPU First:** All WebGL2 shaders must strictly conform to **GLSL ES 3.00** with **zero required floating-point FBO extensions** (e.g., packed 16-bit `RGBA8` JFA seeds), respect adaptive DPR/DRS budgets, and preserve `44×44 px` minimum touch targets on coarse pointers.
3. **Engine First, AI-Native by Construction:** Never bundle AI vendor SDKs, API keys, or cloud network calls inside `@aastack/core` or `@aastack/blueprint`. Frontier model integrations belong in `@aastack/mcp`, `skills/`, and opt-in bridge packages built strictly atop deterministic engine hooks (`SceneIR`, `applyPatch`, `snapshot/restore`, `getStats`, `captureDataUrl`, `sampleTerrainHeight`, `raycastEntities`).
4. **1:1 CPU/GPU & Visual-Verification Discipline:**
   - World space is right-handed Y-up (`+X` right, `+Y` up, `-Z` forward); voxel asset space is `[0..W, 0..L, 0..H]` (`+X` right, `+Y` nose, `+Z` up). Never break `mat4AssetToLocal` parity.
   - Any change to terrain noise or terracing in `packages/core/src/shaders.ts` MUST be mirrored identically in `sampleTerrainHeight` (`packages/core/src/scene.ts`).
   - Any change to 3D DDA traversal, 3D SDF carving, or shader compositing must be verified both quantitatively (unit tests) and visually in a WebGL2 browser.

---

## Local Development Setup

### Prerequisites
- Node.js `>= 20` and npm `>= 10`
- Python `>= 3.11` (for the 4-view soft visual-hull carver CLI and Python test suite)

### Install & Build

```bash
npm install
npm run build
npm run typecheck
npm test
```

### Python 4-View Carver Environment

Always use the repo-local `.venv` (never global `pip install`):

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run test:py
```

### Run Everything Together

```bash
npm run typecheck && npm run test:all
```

### Serve Demos Locally

```bash
npm run dev:serve
# Open:
#   http://127.0.0.1:8765/examples/flight-6dof/index.html
#   http://127.0.0.1:8765/skills/aa-sprite-stacking/scripts/viewer.html
```

---

## Code & Shader Guidelines

- **TypeScript:** Strict mode (`tsconfig.base.json`), ESM imports with explicit `.js` extensions (`import { ... } from "./math.js"`), zero `any` in public APIs.
- **GLSL ES 3.00:**
  - Keep loop bounds constant (`for (int i = 0; i < 64; i++)` with early `break`) for iOS Safari / Adreno / Mali driver stability.
  - Gate axis `stepDir` with the exact same `abs(rd) > eps` threshold used for `invD` to avoid cardinal-angle (`90°`/`180°`) 1-voxel shift bugs.
  - Perform RGSS blending and bloom accumulation in **linear light** (`srgbToLin` → average → `linToSrgb`).
- **Bundle Discipline:** Check gzipped demo footprint after core edits:
  ```bash
  npm run build && gzip -c examples/flight-6dof/bundle.js | wc -c
  ```
- **Documentation Parity:** If you add a `SceneDocument` field, `BlueprintOp`, `RenderStyle`, or MCP tool, update `docs/api-reference.md` and `llms-full.txt` in the same PR.

---

## Pull Request Workflow

1. Fork or create a focused feature branch from `main` (e.g., `feat/my-feature`, `fix/dda-edge-case`, `docs/clarify-sockets`).
2. Keep commits small and follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `perf:`, `test:`, `refactor:`).
3. Run `npm run typecheck && npm run test:all` locally before pushing.
4. For visual/shader/UI changes, attach before/after screenshots (desktop `1280×800` and mobile `390×844` if UI changed) and confirm `0` WebGL/console errors.
5. Open a PR using the repository's Pull Request template and wait for GitHub Actions CI to pass.

---

## Reporting Bugs & Requesting Features

- **Bug Reports:** Use the Bug Report issue template and include browser/GPU details, reproduction steps (or a `world.snapshot()` JSON snippet!), and expected vs. actual behavior.
- **Feature Requests & RFCs:** Use the Feature Request template and explain the use case, mobile GPU impact, and how it fits the AI-first SceneIR / SDK architecture.
- **Security Issues:** Do **not** open a public issue — see [SECURITY.md](SECURITY.md).
