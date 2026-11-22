/**
 * aasprite.com — Live Interactive A/B Anti-Aliasing Stage
 *
 * Proves the core breakthrough of AASpriteStacker in the first 0.5 seconds:
 * a real-time WebGL2 split-screen comparison (Classic Nearest-Neighbor vs. Anti-Aliased)
 * with an active 4x pixel magnifier loupe right across the rotating silhouette.
 */

import {
  AASpriteRenderer,
  SceneWorld,
  clamp,
  quatFromYawPitchRoll,
  type AAQuality,
  type Vec3,
} from "@aastack/core";
import {
  compileBlueprint,
  createCottageBlueprint,
  createFighterJetBlueprint,
  createSkyGateBlueprint,
} from "@aastack/blueprint";

type SubjectKey = "cottage" | "jet" | "gate";

interface SubjectConfig {
  id: SubjectKey;
  assetId: string;
  label: string;
  cameraMode: "ortho" | "perspective";
  orthoSize: number;
  fovDeg: number;
  dist: number;
  elevDeg: number;
  targetY: number;
  entityY: number;
  scale: number;
  /** Default normalized [x, y] canvas spot for the 4x loupe when not hovering (x follows splitX). */
  loupeY: number;
}

const SUBJECTS: Record<SubjectKey, SubjectConfig> = {
  cottage: {
    id: "cottage",
    assetId: "aa-cottage",
    label: "Cottage",
    cameraMode: "ortho",
    orthoSize: 7.0,
    fovDeg: 38,
    dist: 24,
    elevDeg: 28,
    targetY: 3.1,
    entityY: 2.8,
    scale: 1.0,
    loupeY: 0.28,
  },
  jet: {
    id: "jet",
    assetId: "fighter-jet",
    label: "Fighter Jet",
    cameraMode: "perspective",
    orthoSize: 8.0,
    fovDeg: 34,
    dist: 13.0,
    elevDeg: 25,
    targetY: 2.8,
    entityY: 2.8,
    scale: 1.0,
    loupeY: 0.42,
  },
  gate: {
    id: "gate",
    assetId: "sky-gate",
    label: "Sky Gate",
    cameraMode: "perspective",
    orthoSize: 13,
    fovDeg: 38,
    dist: 24.0,
    elevDeg: 20,
    targetY: 8.5,
    entityY: 8.5,
    scale: 0.94,
    loupeY: 0.29,
  },
};

function initHeroStage() {
  const canvas = document.getElementById("heroCanvas") as HTMLCanvasElement | null;
  if (!canvas) return;

  const statsEl = document.getElementById("heroStats");
  const subjectBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-hero-subject]"));
  const qualityBtns = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-hero-quality]"));
  const loupeBtn = document.getElementById("heroLoupeBtn") as HTMLButtonElement | null;
  const pauseBtn = document.getElementById("heroPauseBtn") as HTMLButtonElement | null;
  const splitOverlay = document.getElementById("heroSplitOverlay") as HTMLElement | null;
  const splitHandle = document.getElementById("heroSplitHandle") as HTMLElement | null;
  const splitTagRight = document.getElementById("heroTagRight") as HTMLElement | null;
  const loupeBox = document.getElementById("heroLoupeBox") as HTMLElement | null;
  const loupeCanvas = document.getElementById("heroLoupeCanvas") as HTMLCanvasElement | null;
  const loupeCap = document.getElementById("heroLoupeCap") as HTMLElement | null;
  const loupeReticle = document.getElementById("heroLoupeReticle") as HTMLElement | null;

  let renderer: AASpriteRenderer;
  try {
    // Showcase defaults to full Ultra AA (8x RGSS + 2.0x Retina DPR + full-res JFA),
    // with a live runtime softswitch (Eco 2x / Bal 4x / Ultra 8x) right in the dock!
    renderer = new AASpriteRenderer(canvas, {
      background: "studio",
      quality: "ultra",
      powerPreference: "low-power",
      adaptiveDpr: false,
      maxDpr: 2.0,
    });
  } catch {
    if (statsEl) statsEl.textContent = "WebGL2 required for live comparison";
    return;
  }

  const world = new SceneWorld({ seed: 7 });
  world.registerAsset(compileBlueprint(createCottageBlueprint("aa-cottage")));
  world.registerAsset(compileBlueprint(createFighterJetBlueprint("fighter-jet")));
  world.registerAsset(compileBlueprint(createSkyGateBlueprint("sky-gate")));

  let currentSubject: SubjectKey = "jet";
  let loupeEnabled = true;
  let userPaused = false;

  // Start at a flattering diagonal rotation (~36 deg) so aliasing vs AA is instant on frame 1!
  let spinYaw = (36 * Math.PI) / 180;
  let orbitPitchDeg = SUBJECTS.jet.elevDeg;

  const applySubject = (key: SubjectKey) => {
    currentSubject = key;
    const cfg = SUBJECTS[key];
    orbitPitchDeg = cfg.elevDeg;
    world.doc.camera.mode = cfg.cameraMode;
    world.doc.camera.orthoSize = cfg.orthoSize;
    world.doc.camera.fovDeg = cfg.fovDeg;
    world.doc.camera.near = 0.5;
    world.doc.camera.far = 160;
    world.doc.entities = [
      {
        id: "hero-prop",
        assetId: cfg.assetId,
        pos: [0, cfg.entityY, 0],
        rot: quatFromYawPitchRoll(spinYaw, 0, 0),
        scale: cfg.scale,
        outline: true,
        castShadow: true,
        emissiveBoost: 1.0,
        tag: "player",
      },
    ];
    syncUI();
  };

  // Initial studio setup: 50/50 Classic (Aliased) vs. Full Ultra 8x Anti-Aliased ON BY DEFAULT!
  world.applyPatch(
    [
      { op: "set", path: "style", value: "arcade-8bit" },
      { op: "set", path: "aaMode", value: "voxel-dda" },
      { op: "set", path: "samples", value: 8 },
      { op: "set", path: "terrain.enabled", value: false },
      { op: "set", path: "lighting.timeOfDay", value: 0.0 },
      { op: "set", path: "lighting.fogDensity", value: 0.0 },
      { op: "set", path: "lighting.sunAzimuthDeg", value: 40 },
      { op: "set", path: "lighting.sunElevationDeg", value: 54 },
      { op: "set", path: "lighting.outlineWidth", value: 0.95 },
      {
        op: "set",
        path: "splitCompare",
        value: { enabled: true, splitX: 0.5, leftMode: "legacy", rightMode: "voxel-dda" },
      },
    ],
    false,
  );

  const syncUI = () => {
    const q = renderer.getQuality();
    const spp = world.doc.samples;
    for (const btn of subjectBtns) {
      btn.setAttribute("aria-pressed", String(btn.dataset.heroSubject === currentSubject));
    }
    for (const btn of qualityBtns) {
      btn.setAttribute("aria-pressed", String(btn.dataset.heroQuality === q));
    }
    loupeBtn?.setAttribute("aria-pressed", String(loupeEnabled));
    loupeBox?.classList.toggle("visible", loupeEnabled);
    loupeReticle?.classList.toggle("visible", loupeEnabled);

    const sx = world.doc.splitCompare.splitX;
    splitOverlay?.classList.add("visible");
    if (splitHandle) splitHandle.style.left = `${(sx * 100).toFixed(1)}%`;
    if (splitTagRight) splitTagRight.textContent = `AASpriteStacker · ${spp}×`;
    if (loupeCap) loupeCap.textContent = `4× · No AA | AA ${spp}×`;
  };

  applySubject("jet");

  for (const btn of subjectBtns) {
    btn.addEventListener("click", () => {
      const s = btn.dataset.heroSubject as SubjectKey | undefined;
      if (s && s in SUBJECTS) applySubject(s);
    });
  }

  for (const btn of qualityBtns) {
    btn.addEventListener("click", () => {
      const q = btn.dataset.heroQuality as AAQuality | undefined;
      if (!q) return;
      renderer.setQuality(q, world);
      syncUI();
      if (userPaused) renderOnce();
    });
  }

  loupeBtn?.addEventListener("click", () => {
    loupeEnabled = !loupeEnabled;
    syncUI();
    if (userPaused && loupeEnabled) renderOnce();
  });

  // Draggable vertical A/B split handle
  let draggingSplit = false;
  const updateSplit = (clientX: number) => {
    const rect = canvas.getBoundingClientRect();
    world.doc.splitCompare.splitX = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0.08, 0.92);
    syncUI();
    if (userPaused) renderOnce();
  };
  splitHandle?.addEventListener("pointerdown", (e) => {
    draggingSplit = true;
    splitHandle.setPointerCapture(e.pointerId);
    updateSplit(e.clientX);
    e.stopPropagation();
    e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => {
    if (draggingSplit) updateSplit(e.clientX);
  });
  window.addEventListener("pointerup", () => {
    draggingSplit = false;
  });

  // Interactive canvas drag-to-orbit + hover pointer tracking for the 4x pixel loupe!
  let orbiting = false;
  let lastPtrX = 0;
  let lastPtrY = 0;
  let pointerHover = false;
  let hoverNormX = 0.5;
  let hoverNormY = SUBJECTS.cottage.loupeY;

  canvas.addEventListener("pointerdown", (e) => {
    if (draggingSplit) return;
    orbiting = true;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    hoverNormX = clamp((e.clientX - rect.left) / Math.max(rect.width, 1), 0.06, 0.94);
    hoverNormY = clamp((e.clientY - rect.top) / Math.max(rect.height, 1), 0.08, 0.92);
    pointerHover = true;

    if (orbiting) {
      const dx = e.clientX - lastPtrX;
      const dy = e.clientY - lastPtrY;
      lastPtrX = e.clientX;
      lastPtrY = e.clientY;
      spinYaw += dx * 0.011;
      orbitPitchDeg = clamp(orbitPitchDeg + dy * 0.25, 6, 68);
      if (userPaused) renderOnce();
    } else if (userPaused && loupeEnabled) {
      renderOnce();
    }
  });
  canvas.addEventListener("pointerup", () => {
    orbiting = false;
  });
  canvas.addEventListener("pointerleave", () => {
    orbiting = false;
    pointerHover = false;
    if (userPaused && loupeEnabled) renderOnce();
  });

  const loupeCtx = loupeCanvas?.getContext("2d") ?? null;
  const drawLoupe = () => {
    if (!loupeEnabled || !loupeCtx || !loupeCanvas) return;
    const cw = canvas.width;
    const ch = canvas.height;
    if (cw < 32 || ch < 32) return;

    const cfg = SUBJECTS[currentSubject];
    // By default, lock the 4x magnifier straight onto the split boundary right on the silhouette edge!
    const focusX = pointerHover ? hoverNormX : world.doc.splitCompare.splitX;
    const focusY = pointerHover ? hoverNormY : cfg.loupeY;

    const lw = loupeCanvas.width;
    const lh = loupeCanvas.height;
    // Hold physical CSS patch constant (36 CSS px) so flipping Eco 2x / Bal 4x / Ultra 8x
    // visibly refines pixel smoothness inside the loupe without jumping magnification!
    const dpr = Math.max(1, renderer.getStats().dpr || 1);
    const sw = Math.max(16, Math.round(36 * dpr));
    const sh = sw;
    const sx = clamp(Math.round(focusX * cw - sw * 0.5), 0, Math.max(0, cw - sw));
    const sy = clamp(Math.round(focusY * ch - sh * 0.5), 0, Math.max(0, ch - sh));

    loupeCtx.imageSmoothingEnabled = false;
    loupeCtx.clearRect(0, 0, lw, lh);
    loupeCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, lw, lh);

    // Draw crisp hairline showing the exact Classic | AA seam inside the 4x magnified view
    const splitPxCanvas = world.doc.splitCompare.splitX * cw;
    const splitInLoupe = ((splitPxCanvas - sx) / sw) * lw;
    if (splitInLoupe >= 1 && splitInLoupe <= lw - 1) {
      loupeCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
      loupeCtx.fillRect(Math.round(splitInLoupe) - 1, 0, 2, lh);
      loupeCtx.fillStyle = "rgba(56, 189, 248, 0.95)";
      loupeCtx.fillRect(Math.round(splitInLoupe), 0, 1, lh);
    }

    // Position the subtle inspection box reticle on the main canvas
    if (loupeReticle) {
      loupeReticle.style.left = `${(focusX * 100).toFixed(2)}%`;
      loupeReticle.style.top = `${(focusY * 100).toFixed(2)}%`;
    }
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const updatePoseAndCamera = (dt: number) => {
    const cfg = SUBJECTS[currentSubject];
    if (!orbiting && dt > 0) {
      const rate = reducedMotion ? 0.15 : 1.0;
      // Gentle constant turntable rotation (~18 deg/sec) — the classic AA stress test!
      spinYaw += 0.31 * dt * rate;
    }

    const ent = world.getEntity("hero-prop");
    if (ent) {
      ent.pos = [0, cfg.entityY, 0];
      ent.rot = quatFromYawPitchRoll(spinYaw, 0, 0);
    }

    const elevRad = (orbitPitchDeg * Math.PI) / 180;
    const horiz = Math.cos(elevRad) * cfg.dist;
    const camY = cfg.targetY + Math.sin(elevRad) * cfg.dist;
    const camPos: Vec3 = [0, camY, horiz];
    world.doc.camera.pos = camPos;
    world.doc.camera.target = [0, cfg.targetY, 0];
    world.doc.camera.up = [0, 1, 0];
  };

  let tick = 0;
  const updateStats = () => {
    if (!statsEl || userPaused) return;
    const tel = renderer.getStats();
    const msLabel = tel.gpuMs !== undefined ? `${tel.gpuMs.toFixed(1)} ms gpu` : `${tel.frameMs.toFixed(1)} ms cpu`;
    statsEl.textContent = `${Math.round(tel.fps)} fps · ${msLabel}`;
  };

  const renderOnce = () => {
    updatePoseAndCamera(0);
    renderer.render(world);
    drawLoupe();
    updateStats();
  };

  let rafId = 0;
  let active = true;
  let lastNow = performance.now();
  const HERO_MIN_FRAME_MS = 1000 / 60 - 1.8;

  const loop = (now: number) => {
    if (!active || userPaused) {
      rafId = 0;
      return;
    }
    const elapsedMs = now - lastNow;
    if (elapsedMs < HERO_MIN_FRAME_MS) {
      rafId = requestAnimationFrame(loop);
      return;
    }
    const dt = Math.min(elapsedMs / 1000, 0.05);
    lastNow = now;
    updatePoseAndCamera(dt);
    renderer.render(world);
    drawLoupe();
    if (++tick % 18 === 0) updateStats();
    rafId = requestAnimationFrame(loop);
  };

  const setActive = (on: boolean) => {
    active = on;
    if (active && !userPaused && !rafId) {
      lastNow = performance.now();
      rafId = requestAnimationFrame(loop);
    } else if ((!active || userPaused) && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  pauseBtn?.addEventListener("click", () => {
    userPaused = !userPaused;
    pauseBtn.setAttribute("aria-pressed", String(userPaused));
    pauseBtn.textContent = userPaused ? "Resume" : "Pause";
    if (userPaused) {
      if (statsEl) statsEl.textContent = "Paused · 0% GPU";
      setActive(active);
    } else {
      setActive(active);
    }
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      const vis = entries[0]?.isIntersecting ?? true;
      setActive(vis && !document.hidden);
    }, { threshold: 0.08 });
    io.observe(canvas);
  }
  document.addEventListener("visibilitychange", () => setActive(!document.hidden));

  // Render an immediate crisp frame before RAF settles so first paint is instant
  renderOnce();
  rafId = requestAnimationFrame(loop);
}

function initCodeTabs() {
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-code-tab]"));
  const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-code-panel]"));
  const copyBtn = document.getElementById("copyCodeBtn") as HTMLButtonElement | null;

  const activate = (key: string) => {
    for (const b of tabButtons) b.setAttribute("aria-selected", String(b.dataset.codeTab === key));
    for (const p of panels) p.classList.toggle("active", p.dataset.codePanel === key);
  };

  for (const b of tabButtons) {
    b.addEventListener("click", () => {
      if (b.dataset.codeTab) activate(b.dataset.codeTab);
    });
  }

  copyBtn?.addEventListener("click", async () => {
    const activePanel = panels.find((p) => p.classList.contains("active"));
    if (!activePanel) return;
    try {
      await navigator.clipboard.writeText(activePanel.textContent ?? "");
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1600);
    } catch {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1600);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initHeroStage();
    initCodeTabs();
  });
} else {
  initHeroStage();
  initCodeTabs();
}
