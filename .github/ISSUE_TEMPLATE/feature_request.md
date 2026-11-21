---
name: Feature Request / RFC
about: Propose a new engine capability, Blueprint op, RenderStyle, or AI/MCP interface
title: "[Feature]: "
labels: enhancement
---

## Problem Statement
What gameplay, visual, or AI-workflow limitation does this solve?

## Proposed Design
Describe the API, `SceneIR` schema, shader pass, or MCP tool surface.

## Invariants Check
- [ ] Keeps `@aastack/core` and `@aastack/blueprint` at **zero external runtime dependencies**
- [ ] Compatible with **WebGL2 ES 3.00** mobile GPUs (no required float-FBO extensions)
- [ ] Keeps AI vendor SDKs / API keys out of the runtime renderer

## Alternatives Considered
Any trade-offs or alternative approaches considered.
