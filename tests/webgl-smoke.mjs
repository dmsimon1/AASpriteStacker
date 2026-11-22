/**
 * Headless WebGL2 Shader Compilation & Rendering Smoke Test (Playwright + SwiftShader).
 * Verifies every WebGL2 entry point in site/dist/ compiles all GLSL ES 3.00 shaders cleanly,
 * renders non-blank pixels with zero console/page errors, and proves 64x hardware instancing
 * renders 64 entities in <= 8 total draw calls (1 instanced OBB draw call + JFA passes).
 *
 * Run locally (requires `playwright` or `playwright-core` installed):
 *   npm run build:site && node tests/webgl-smoke.mjs
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const DIST_DIR = resolve("site/dist");
if (!existsSync(join(DIST_DIR, "index.html"))) {
  throw new Error("site/dist/index.html missing — run `npm run build:site` first.");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".gdshader": "text/plain; charset=utf-8",
  ".shader": "text/plain; charset=utf-8",
};

function startStaticServer(rootDir) {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      const urlPath = (req.url || "/").split("?")[0];
      let filePath = join(rootDir, decodeURIComponent(urlPath));
      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, "index.html");
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      const ext = extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(filePath));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolveServer({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function loadPlaywright() {
  for (const mod of ["playwright", "playwright-core"]) {
    try {
      return await import(mod);
    } catch {
      // try next
    }
  }
  throw new Error("Playwright not found. Install via `npm install --no-save playwright && npx playwright install chromium`.");
}

async function sampleCanvasStats(page, selector) {
  return page.evaluate(async (sel) => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const canvas = document.querySelector(sel);
    if (!canvas) return { found: false };
    const w = canvas.width;
    const h = canvas.height;
    const probe = document.createElement("canvas");
    const pw = 64, ph = 64;
    probe.width = pw;
    probe.height = ph;
    const ctx = probe.getContext("2d");
    ctx.drawImage(canvas, 0, 0, pw, ph);
    const data = ctx.getImageData(0, 0, pw, ph).data;
    let nonTransparent = 0;
    const distinctColors = new Set();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 16) {
        nonTransparent++;
        // Quantize to 4-bit buckets to count meaningful visual variety
        const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        distinctColors.add(key);
      }
    }
    return { found: true, width: w, height: h, nonTransparent, distinctColors: distinctColors.size };
  }, selector);
}

const { server, baseUrl } = await startStaticServer(DIST_DIR);
let browser;

try {
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--no-sandbox",
    ],
  });

  const checks = [
    { path: "/", canvas: "#heroCanvas", minColors: 6, label: "Homepage Hero (Fighter Jet + Studio BG)" },
    { path: "/iso/", canvas: "#aaCanvas", minColors: 4, label: "2.5D Isometric Transparent Overlay (Car)" },
    { path: "/play/", canvas: "#glCanvas", minColors: 8, label: "SkyStack 6-DOF Sandbox (@aastack/core/terrain)" },
    { path: "/studio/", canvas: "#view", minColors: 5, label: "Browser Studio (viewer.html)" },
  ];

  for (const c of checks) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Keep CI smoke test 100% hermetic (avoid unauthenticated GitHub API rate-limit 403 on shared CI runner IPs)
    await page.route("https://api.github.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"stargazers_count":0}' }),
    );
    const errors = [];
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
    });

    await page.goto(`${baseUrl}${c.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(c.canvas, { timeout: 10000 });
    await page.waitForTimeout(350);

    const stats = await sampleCanvasStats(page, c.canvas);
    assert.equal(stats.found, true, `${c.label}: canvas ${c.canvas} not found`);
    assert.ok(stats.width >= 64 && stats.height >= 64, `${c.label}: invalid canvas dims ${stats.width}x${stats.height}`);
    assert.ok(stats.nonTransparent > 40, `${c.label}: canvas appears blank (nonTransparent=${stats.nonTransparent})`);
    assert.ok(stats.distinctColors >= c.minColors, `${c.label}: too few colors (${stats.distinctColors} < ${c.minColors})`);

    // Extra hardware-instancing verification on /iso/: 64 cars in <= 8 draw calls!
    if (c.path === "/iso/") {
      const singleStats = await page.evaluate(() => window.__AA_ISO__?.renderer?.getStats());
      assert.equal(singleStats?.backend, "webgl2", "/iso/: expected WebGL2 backend");
      assert.equal(singleStats?.visibleEntities, 1, "/iso/: expected 1 initial car");

      await page.click("#crowdBtn");
      await page.waitForTimeout(250);
      const crowdStats = await page.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
        return window.__AA_ISO__?.renderer?.getStats();
      });
      assert.equal(crowdStats?.visibleEntities, 64, `/iso/ 64x: expected 64 visible cars, got ${crowdStats?.visibleEntities}`);
      assert.ok(
        crowdStats?.drawCalls <= 8,
        `/iso/ 64x: expected <= 8 draw calls via hardware instancing, got ${crowdStats?.drawCalls}`,
      );
      const crowdPixels = await sampleCanvasStats(page, c.canvas);
      assert.ok(crowdPixels.nonTransparent > 200, `/iso/ 64x: expected dense crowd pixels, got ${crowdPixels.nonTransparent}`);
      console.log(
        `  PASS ${c.label} + 64x Instanced (${crowdStats.visibleEntities} cars in ${crowdStats.drawCalls} dc, ${crowdPixels.distinctColors} colors)`,
      );
    } else {
      console.log(
        `  PASS ${c.label} (${stats.width}x${stats.height}, ${stats.nonTransparent} px, ${stats.distinctColors} colors)`,
      );
    }

    assert.deepEqual(errors, [], `${c.label}: unexpected runtime/WebGL errors: ${errors.join(" | ")}`);
    await page.close();
  }

  console.log("All WebGL2 headless shader & rendering smoke tests passed.");
} finally {
  if (browser) await browser.close();
  server.close();
}
