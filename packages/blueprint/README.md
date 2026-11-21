# `@aastack/blueprint`

Declarative JSON/TypeScript **Voxel + 3D SDF CSG Blueprint compiler** and high-craft presets for `@aastack/core`.

## Why Blueprints?
Instead of hand-editing brittle binary voxel grids or 4-view images that cannot carve hollow cavities, `@aastack/blueprint` lets humans and frontier LLMs describe volumetric assets as compact, Git-diffable JSON CSG specs with symmetry, cutouts, emissive accents, and named semantic sockets.

## Supported Operations
- Primitives: `box`, `sphere`, `ellipsoid`, `capsule`, `wedge`, `torus`, `paint`
- Modifiers: `subtract: true` (hollow cutouts), `mirrorX: true` (X-axis symmetry), `emissive: true` (bloom mask)
- Attachments: `sockets: Record<string, { pos: [x,y,z], dir?: [x,y,z] }>`

## Built-In Presets
- `createFighterJetBlueprint(id?)` — Twin-engine swept-wing interceptor with `thrusterL`, `thrusterR`, `wingtipL`, `wingtipR`, and `cockpitCam` sockets
- `createCloudBlueprint(variant: 0 | 1 | 2, id?)` — 3-tone sunlit volumetric cumulus clouds
- `createSkyGateBlueprint(id?)` — Hollow emissive sky-ring checkpoint with `center` socket

## Usage

```ts
import { compileBlueprint, createFighterJetBlueprint } from "@aastack/blueprint";

const jet = compileBlueprint(createFighterJetBlueprint("fighter-jet"));
// Returns an @aastack/core VolumeAsset with 3D SDF, smooth normals/AO, RGB edge bleed, and sockets
```

See [Getting Started](../../docs/getting-started.md) and [API Reference](../../docs/api-reference.md).
