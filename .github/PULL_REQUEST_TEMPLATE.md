## Summary
What does this PR change and why?

## Type of Change
- [ ] Engine / Shader (`@aastack/core`)
- [ ] Blueprint DSL / Presets (`@aastack/blueprint`)
- [ ] MCP / AI Interfaces (`@aastack/mcp`, `skills/`, `llms-full.txt`)
- [ ] Demo / Tooling (`examples/`, `scripts/`)
- [ ] Documentation (`README.md`, `docs/`)

## Verification Checklist
- [ ] `npm run typecheck` passes cleanly
- [ ] `npm test` (Node test suite) passes
- [ ] `npm run test:py` (Python AA carving suite) passes *(if Python or shader math touched)*
- [ ] Checked gzipped demo footprint (`gzip -c examples/flight-6dof/bundle.js | wc -c`)
- [ ] Visually verified in WebGL2 browser with `0` console/shader errors *(attach screenshot if visual/UI change)*
- [ ] Updated `docs/api-reference.md` and `llms-full.txt` if public APIs or SceneIR changed
