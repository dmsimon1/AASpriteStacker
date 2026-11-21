# SkyStack — Flagship 6-DOF Flight Demo Guide

`examples/flight-6dof/` is the flagship playable showcase for **AASpriteStacker**, demonstrating that an entire anti-aliased 6-DOF flight sandbox — with Overhead, Chase, and Cockpit cameras, volumetric clouds, terraced island archipelago, live rendering style softswitch, 16-bit Cockpit HUD, and mobile multi-touch controls — ships in **`29.3 KB` gzipped** (`90 KB` raw JS) with **zero polygons** and **zero runtime dependencies**.

![SkyStack 6-DOF Chase View in 8-Bit AA Mode](assets/skystack-chase-8bit.png)

---

## 1. Running Locally

```bash
npm run build
npm run dev:serve
```

Open: `http://127.0.0.1:8765/examples/flight-6dof/index.html`

---

## 2. Controls & UI

### Desktop Controls
| Input | Action |
| --- | --- |
| **Mouse Pointer** or **`WASD` / Arrow Keys** | Steer yaw/bank & pitch climb/dive |
| **Click** or **`R`** | 360° barrel roll |
| **Hold Mouse** or **`Shift`** | Ignite twin afterburners (`36 → 64 u/s`, fiery extended plumes, FOV punch) |
| **`Space`** or **`V`** (or `Cam` button) | Cycle camera: **Chase → Cockpit → Overhead** |
| **`M`** (or `Style` button) | Cycle live `RenderStyle`: **8-Bit AA → HD-2D → Smooth Toy → Retro 1×** |
| **`C`** (or `A/B` button) | Toggle live draggable **Retro 1× vs. AA** split-screen curtain |
| **`Day` button** | Cycle **Day → Sunset → Night** lighting & bloom |
| **`IR` button** | Open the live **SceneIR Inspector** (`Snapshot`, `Rewind`, `Normals Overlay`, live telemetry JSON) |

### Mobile / Touch Controls (`pointer: coarse` or `< 760px`)
- **Left Half Drag:** Floating virtual thumbstick (`createTouchController`) controls yaw, bank, and climb/dive.
- **Right Action Pad:** `BOOST` (press-and-hold afterburner) and `ROLL` (360° barrel roll) — `66×66 px` touch targets with safe-area notch clearance.
- **Top Bar:** All camera, style, split-screen, and time-of-day buttons expand to `≥ 46 px` touch height automatically.

---

## 3. How the Demo Is Built (`examples/flight-6dof/src/main.ts`)

1. **Zero-Mesh Asset Compilation:** Compiles `FighterJet`, three `Cloud` variants, and hollow `SkyGate` checkpoint rings directly from `@aastack/blueprint` at startup (~25 ms total).
2. **Infinite Volumetric Cloud Field:** Spawns `22` clouds on desktop (`14` on mobile) with `outline: false` and `castShadow: true`, wrapping smoothly around the jet's XZ coordinates so the sky never runs out.
3. **1:1 Terrain Clearance & Radar:** Calls `world.sampleTerrainHeight(x, z)` — the exact CPU twin of `TERRAIN_FS` — both to enforce a smooth minimum terrain-clearance floor and to paint the live rotating `27×27` green CRT island radar in Cockpit mode.
4. **Semantic Socket Attachments:** Every frame reads live world coordinates from `world.getSocketWorldPos("jet", ...)`:
   - `wingtipL` / `wingtipR`: feeds depth-tested 3D white contrail ribbons.
   - `thrusterL` / `thrusterR`: spawns dual-layer emissive afterburner ribbons (outer red-orange flame `[255, 96, 26]` + inner white-gold core `[255, 240, 128]`), lively at cruise and roaring on boost.
   - `cockpitCam`: anchors the true 6-DOF horizon-rolling Cockpit camera directly inside the canopy.
5. **Style-Aware 16-Bit Cockpit HUD (`drawCockpitHud`):**
   - Translucent HUD combiner glass with dynamic heading compass strip (`N/E/S/W`), rolling pitch ladder, speed/alt readouts, and drop-shadowed contrast.
   - Curved beveled metallic canopy arch with racing orange trim.
   - Multi-bevel instrument console with rivets, live rotating green CRT terrain radar (with sweep beam and blue sky-gate blips), **4 analog dials** (`SPD`, `ALT`, `THR`, `BNK`) with moving orange needles, artificial horizon ball, live tilting physical flight yoke/stick, toggle switches + glowing `AB BOOST` indicator, and a right **top-down pixel-art jet status MFD** with dual segmented bar gauges.
   - Automatically compacts cleanly on screens `< 640px`.

---

## 4. Live Scripting & AI Console API (`window.__AASTACK__`)

The demo exposes a live handle on `window.__AASTACK__` for console experimentation, automated visual QA, and external agents:

```js
// Switch rendering style live
__AASTACK__.setStyle("smooth-toy");     // "arcade-8bit" | "hd-2d" | "smooth-toy" | "retro-raw"

// Switch camera mode
__AASTACK__.setCameraMode("cockpit");   // "overhead" | "chase" | "cockpit"

// Lock afterburners on/off
__AASTACK__.setThrust(true);

// Apply any SceneIR patch with full undo support
__AASTACK__.applyPatch([
  { op: "set", path: "lighting.timeOfDay", value: 0.52 },
  { op: "set", path: "debugOverlay", value: "normals" },
]);
__AASTACK__.world.undo();

// Deterministic time-travel & telemetry
const snap = __AASTACK__.world.snapshot();
console.log(__AASTACK__.renderer.getStats());
const pngDataUrl = __AASTACK__.renderer.captureDataUrl(__AASTACK__.world);
```

---

## 5. Footprint Breakdown

Built via `scripts/bundle-demos.mjs` (`esbuild --bundle --minify`):

- **Minified JS (`examples/flight-6dof/bundle.js`):** `90 KB` raw
- **Gzipped JS:** `29.3 KB`
- **HTML + CSS (`examples/flight-6dof/index.html`):** `~3.2 KB` gzipped
- **External Runtime Dependencies:** `0`
