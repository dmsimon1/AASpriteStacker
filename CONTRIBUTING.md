# Contributing to AASpriteStacker

Thank you for helping build the open-source anti-aliased 6-DOF & 2.5D sprite-stacking engine SDK!

## Design Principles

1. **Zero Runtime Bloat:** `@aastack/core` and `@aastack/blueprint` MUST have zero external runtime dependencies and stay mobile-GPU friendly (WebGL2 ES 3.00, no required float-FBO extensions).
2. **Engine First, AI-Native by Construction:** Never hardcode AI vendor API keys or cloud dependencies inside the runtime renderer. Keep AI integrations in `@aastack/mcp`, `skills/`, and build-time tools backed by clean deterministic hooks (`SceneIR`, `applyPatch`, `snapshot/restore`, `capture`, `stats`).
3. **Verify Visually & Quantitatively:** Any change to shaders, carving, or SDF math must pass both `npm test` and `.venv/bin/python tests/test_aa_stacker.py`.

## Local Setup

```bash
npm install
npm run build
npm test

# Python 4-view soft visual-hull carver tests
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python tests/test_aa_stacker.py
```
