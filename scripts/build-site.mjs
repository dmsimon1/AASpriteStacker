/**
 * Zero-dependency static site builder for aasprite.com (Cloudflare Workers Static Assets).
 * Builds site/dist/ in <100ms with:
 *   /                -> Flagship landing page + live interactive WebGL2 hero canvas
 *   /play/           -> Fullscreen SkyStack 6-DOF Flight Demo (desktop + mobile)
 *   /studio/         -> 4-View Look-Dev & A/B AA Studio (viewer.html)
 *   /docs/...        -> Static HTML docs rendered directly from repo docs/*.md (zero drift!)
 *   /llms-full.txt   -> Frontier AI SDK spec served straight from aasprite.com/llms-full.txt
 *   /404.html        -> Custom branded 404 page
 *   /_headers        -> Security & immutable cache headers for Workers Static Assets
 */

import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "site/dist");

rmSync(DIST, { recursive: true, force: true });
mkdirSync(resolve(DIST, "assets"), { recursive: true });
mkdirSync(resolve(DIST, "iso"), { recursive: true });
mkdirSync(resolve(DIST, "play"), { recursive: true });
mkdirSync(resolve(DIST, "normandy"), { recursive: true });
mkdirSync(resolve(DIST, "studio"), { recursive: true });
mkdirSync(resolve(DIST, "docs"), { recursive: true });

const ALIASES = {
  "@aastack/core/terrain": resolve(ROOT, "packages/core/dist/terrain-shader.js"),
  "@aastack/core": resolve(ROOT, "packages/core/dist/index.js"),
  "@aastack/blueprint": resolve(ROOT, "packages/blueprint/dist/index.js"),
  "@aastack/bridge/client": resolve(ROOT, "packages/bridge/dist/client.js"),
  "@aastack/bridge": resolve(ROOT, "packages/bridge/dist/index.js"),
};

// Unified persistent global navigation bar shared identically across /, /play/, /studio/, /docs/*, and /404.html
const GLOBAL_NAV_CSS = `<style id="aa-global-nav-css">
  .aa-gnav {
    position: sticky; top: 0; z-index: 90; width: 100%; height: 56px; flex: 0 0 56px;
    background: rgba(7, 12, 22, 0.92); backdrop-filter: blur(14px);
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    font: 600 13.5px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f1f5f9;
  }
  .aa-gnav * { box-sizing: border-box; }
  .aa-gnav-inner {
    max-width: 1220px; height: 100%; margin: 0 auto; padding: 0 18px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
  }
  .aa-gnav.fullbleed .aa-gnav-inner { max-width: none; padding: 0 14px; }
  .aa-gbrand {
    display: inline-flex; align-items: center; gap: 9px; text-decoration: none;
    color: #f8fafc; font-weight: 800; font-size: 15px; letter-spacing: -0.02em; white-space: nowrap;
  }
  .aa-gbrand:hover { text-decoration: none; opacity: 0.95; }
  .aa-gmark {
    width: 26px; height: 26px; border-radius: 7px; flex: none;
    background: linear-gradient(135deg, #38bdf8, #1d4ed8);
    display: grid; place-items: center;
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
    font: 800 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: #04111f;
  }
  .aa-gchip {
    font: 700 10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    padding: 4px 7px; border-radius: 6px;
    background: rgba(56, 189, 248, 0.14); color: #67e8f9;
    border: 1px solid rgba(56, 189, 248, 0.28);
  }
  .aa-glinks { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
  .aa-glink {
    display: inline-flex; align-items: center; padding: 7px 10px; border-radius: 8px;
    color: #94a3b8; text-decoration: none; font-weight: 600; font-size: 13px; white-space: nowrap;
    transition: color 120ms ease, background-color 120ms ease;
  }
  .aa-glink:hover { color: #f8fafc; background: rgba(148, 163, 184, 0.12); text-decoration: none; }
  .aa-glink[aria-current="page"] {
    color: #67e8f9; background: rgba(56, 189, 248, 0.14);
  }
  .aa-ggh {
    display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px;
    color: #e2e8f0; background: rgba(148, 163, 184, 0.10);
    border: 1px solid rgba(148, 163, 184, 0.24);
    text-decoration: none; font-weight: 700; font-size: 12.5px; white-space: nowrap; margin-left: 2px;
    transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease;
  }
  .aa-ggh:hover { color: #ffffff; background: rgba(56, 189, 248, 0.16); border-color: rgba(56, 189, 248, 0.48); text-decoration: none; }
  .aa-ggh svg { width: 15px; height: 15px; fill: currentColor; flex: none; }
  .aa-gstars { font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: #67e8f9; display: none; }
  .aa-gstars.loaded { display: inline; }
  .aa-gcta {
    display: inline-flex; align-items: center; padding: 7px 12px; border-radius: 8px;
    background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #ffffff !important;
    border: 1px solid rgba(125, 211, 252, 0.48); font-weight: 700; font-size: 12.5px;
    text-decoration: none; white-space: nowrap; margin-left: 4px;
    box-shadow: 0 4px 14px rgba(14, 165, 233, 0.28);
  }
  .aa-gcta:hover { background: linear-gradient(135deg, #38bdf8, #3b82f6); text-decoration: none; }
  @media (max-width: 720px) {
    .aa-ghide-sm { display: none !important; }
    .aa-glink { padding: 6px 8px; font-size: 12.5px; }
    .aa-ggh { padding: 6px 7px; }
    .aa-gbrand span.aa-gtitle { font-size: 14px; }
  }
  @media (max-width: 440px) {
    .aa-gbrand span.aa-gtitle { display: none; }
    .aa-gnav-inner { padding: 0 8px; gap: 4px; }
    .aa-glinks { gap: 2px; }
    .aa-glink { padding: 5px 5.5px; font-size: 11px; }
    .aa-ggh { padding: 5px 6px; margin-left: 1px; }
  }
</style>`;

const GH_ICON_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;

const GH_STARS_SCRIPT = `<script>(function(){var els=document.querySelectorAll("[data-aa-stars]");if(!els.length)return;var k="aa_gh_stars_v1",now=Date.now();function show(n){if(!(n>0))return;var t="★ "+n;els.forEach(function(e){e.textContent=t;e.classList.add("loaded");});}try{var c=JSON.parse(sessionStorage.getItem(k)||"null");if(c&&now-c.t<18e5){show(c.n);return;}}catch(e){}fetch("https://api.github.com/repos/dmsimon1/AASpriteStacker").then(function(r){return r.ok?r.json():null;}).then(function(d){if(d&&typeof d.stargazers_count==="number"){try{sessionStorage.setItem(k,JSON.stringify({n:d.stargazers_count,t:now}));}catch(e){}show(d.stargazers_count);}}).catch(function(){});})();</script>`;

function renderGlobalNav(active, fullbleed = false) {
  const cur = (k) => (active === k ? ` aria-current="page"` : "");
  return `<nav class="aa-gnav${fullbleed ? " fullbleed" : ""}" aria-label="Site navigation">
  <div class="aa-gnav-inner">
    <a class="aa-gbrand" href="/">
      <span class="aa-gmark">AA</span>
      <span class="aa-gtitle">AASpriteStacker</span>
    </a>
    <div class="aa-glinks">
      <a class="aa-glink aa-ghide-sm" href="/"${cur("home")}>Home</a>
      <a class="aa-glink" href="/primer/"${cur("primer")}>Primer</a>
      <a class="aa-glink" href="/iso/"${cur("iso")}>2.5D Iso</a>
      <a class="aa-glink" href="/play/"${cur("play")}>6-DOF Demo</a>
      <a class="aa-glink aa-ghide-sm" href="/normandy/"${cur("normandy")}>Normandy</a>
      <a class="aa-glink" href="/studio/"${cur("studio")}>Studio</a>
      <a class="aa-glink" href="/docs/"${cur("docs")}>Docs</a>
      <a class="aa-ggh" href="https://github.com/dmsimon1/AASpriteStacker" target="_blank" rel="noopener" aria-label="AASpriteStacker open-source repository on GitHub">${GH_ICON_SVG}<span class="aa-ghide-sm">GitHub</span><span class="aa-gstars aa-ghide-sm" data-aa-stars></span></a>
    </div>
  </div>
</nav>${GH_STARS_SCRIPT}`;
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#04111f" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-weight="800" font-size="28">AA</text></svg>`;
const FAVICON_LINK = `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`;
writeFileSync(resolve(DIST, "favicon.svg"), FAVICON_SVG, "utf-8");

// 1. Build landing page + visual primer with unified global nav, copy stylesheet, verified screenshots, and llms-full.txt
let homeHtml = readFileSync(resolve(ROOT, "site/index.html"), "utf-8");
homeHtml = homeHtml.replace("</head>", `${FAVICON_LINK}\n${GLOBAL_NAV_CSS}\n</head>`).replace("<!--AA_GLOBAL_NAV-->", renderGlobalNav("home"));
writeFileSync(resolve(DIST, "index.html"), homeHtml, "utf-8");

mkdirSync(resolve(DIST, "primer"), { recursive: true });
let primerHtml = readFileSync(resolve(ROOT, "site/primer.html"), "utf-8");
primerHtml = primerHtml.replace("</head>", `${FAVICON_LINK}\n${GLOBAL_NAV_CSS}\n</head>`).replace("<!--AA_GLOBAL_NAV-->", renderGlobalNav("primer"));
writeFileSync(resolve(DIST, "primer/index.html"), primerHtml, "utf-8");
cpSync(resolve(ROOT, "site/src/styles.css"), resolve(DIST, "assets/styles.css"));
cpSync(resolve(ROOT, "docs/assets"), resolve(DIST, "assets"), { recursive: true });
cpSync(resolve(ROOT, "shaders"), resolve(DIST, "shaders"), { recursive: true });
cpSync(resolve(ROOT, "llms-full.txt"), resolve(DIST, "llms-full.txt"));
cpSync(resolve(ROOT, "llms-full.txt"), resolve(DIST, "llms.txt"));

// 2. Bundle live interactive hero showcase
await build({
  entryPoints: [resolve(ROOT, "site/src/hero-demo.ts")],
  outfile: resolve(DIST, "assets/hero-demo.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  alias: ALIASES,
});

// 2b. Bundle interactive 2.5D Isometric & Oblique Transparent Overlay sandbox into /iso/!
let isoHtml = readFileSync(resolve(ROOT, "examples/minimal-2d/index.html"), "utf-8");
const isoLayoutPatch = `${GLOBAL_NAV_CSS}
<style>
  body { display: flex !important; flex-direction: column; align-items: center; min-height: 100dvh; }
  .demo-wrap { margin: auto 0; }
</style>`;
isoHtml = isoHtml
  .replace("</head>", `${FAVICON_LINK}\n${isoLayoutPatch}\n</head>`)
  .replace("<body>", `<body>\n${renderGlobalNav("iso")}`);
writeFileSync(resolve(DIST, "iso/index.html"), isoHtml, "utf-8");

await build({
  entryPoints: [resolve(ROOT, "examples/minimal-2d/src/main.ts")],
  outfile: resolve(DIST, "iso/bundle.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  alias: ALIASES,
});

// 3. Bundle fullscreen playable SkyStack 6-DOF Flight Demo into /play/ with persistent global nav!
let playHtml = readFileSync(resolve(ROOT, "examples/flight-6dof/index.html"), "utf-8");
const playLayoutPatch = `${GLOBAL_NAV_CSS}
<style>
  body { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
  #stage { flex: 1 1 auto; height: auto !important; min-height: 0; }
</style>`;
playHtml = playHtml
  .replace("</head>", `${FAVICON_LINK}\n${playLayoutPatch}\n</head>`)
  .replace("<body>", `<body>\n${renderGlobalNav("play", true)}`);
writeFileSync(resolve(DIST, "play/index.html"), playHtml, "utf-8");

await build({
  entryPoints: { bundle: resolve(ROOT, "examples/flight-6dof/src/main.ts") },
  outdir: resolve(DIST, "play"),
  bundle: true,
  splitting: true,
  chunkNames: "dev-bridge-[name]-[hash]",
  format: "esm",
  target: "es2022",
  minify: true,
  alias: ALIASES,
});

// 3b. Copy Normandy 1944 Deferred AA + 6-DOF Showcase (MIT attribution to @loktar00) into /normandy/
cpSync(resolve(ROOT, "examples/normandy-aa/js"), resolve(DIST, "normandy/js"), { recursive: true });
cpSync(resolve(ROOT, "examples/normandy-aa/LICENSE-loktar00.txt"), resolve(DIST, "normandy/LICENSE-loktar00.txt"));
let normandyHtml = readFileSync(resolve(ROOT, "examples/normandy-aa/index.html"), "utf-8");
const normandyLayoutPatch = `${GLOBAL_NAV_CSS}
<style>
  body { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
  canvas { flex: 1 1 auto; width: 100%; height: auto !important; min-height: 0; }
  #panel, #controls { top: 68px; }
  #badge { top: 72px; }
  #splitBar { top: 56px; }
</style>`;
normandyHtml = normandyHtml
  .replace("</head>", `${FAVICON_LINK}\n${normandyLayoutPatch}\n</head>`)
  .replace("<body>", `<body>\n${renderGlobalNav("normandy", true)}`);
writeFileSync(resolve(DIST, "normandy/index.html"), normandyHtml, "utf-8");

// 4. Copy 4-View Look-Dev & A/B AA Studio into /studio/ with persistent global nav!
let studioHtml = readFileSync(resolve(ROOT, "skills/aa-sprite-stacking/scripts/viewer.html"), "utf-8");
const studioLayoutPatch = `${GLOBAL_NAV_CSS}
<style>
  body { grid-template-rows: auto auto 1fr auto !important; }
</style>`;
studioHtml = studioHtml
  .replace("</head>", `${FAVICON_LINK}\n${studioLayoutPatch}\n</head>`)
  .replace("<body>", `<body>\n${renderGlobalNav("studio", true)}`);
writeFileSync(resolve(DIST, "studio/index.html"), studioHtml, "utf-8");

// 5. Render repo docs/*.md cleanly into /docs/* static pages (zero external markdown deps!)
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderInline(text) {
  let out = escapeHtml(text);
  // Images
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, src) => {
    const fixed = src.replace(/^(?:\.\.\/)?(?:docs\/)?assets\//, "/assets/");
    return `<img src="${fixed}" alt="${alt}" loading="lazy" />`;
  });
  // Links (rewrite internal .md links cleanly to /docs/<slug>/ and repo paths cleanly)
  const GH_BLOB = "https://github.com/dmsimon1/AASpriteStacker/blob/main";
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    let target = href;
    if (target.endsWith("llms-full.txt")) target = "/llms-full.txt";
    else if (/^\.\.\/shaders\//.test(target)) {
      target = target.replace(/^\.\./, "");
    } else if (/^\.\.\/(examples|skills|packages)\//.test(target)) {
      return `<a href="${GH_BLOB}/${target.replace(/^\.\.\//, "")}" target="_blank" rel="noopener">${label}</a>`;
    } else if (/^(?:\.\/)?(getting-started|architecture|api-reference|flight-demo|ai-integration)\.md/.test(target)) {
      const slug = target.replace(/^(?:\.\/)?/, "").replace(/\.md.*$/, "");
      target = `/docs/${slug}/`;
    } else if (/^https?:\/\//.test(target)) {
      return `<a href="${target}" target="_blank" rel="noopener">${label}</a>`;
    }
    return `<a href="${target}">${label}</a>`;
  });
  // Inline code, bold, italic
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return out;
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let inList = false;
  let listTag = "ul";
  let tableRows = [];

  const flushList = () => {
    if (inList) { out.push(`</${listTag}>`); inList = false; }
  };
  const flushTable = () => {
    if (tableRows.length === 0) return;
    const rows = tableRows.filter((r) => !/^\|\s*[-:|\s]+\|$/.test(r.trim()));
    if (rows.length > 0) {
      out.push("<table>");
      rows.forEach((row, idx) => {
        const cells = row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const tag = idx === 0 ? "th" : "td";
        if (idx === 0) out.push("<thead>");
        if (idx === 1) out.push("<tbody>");
        out.push(`<tr>${cells.map((c) => `<${tag}>${renderInline(c)}</${tag}>`).join("")}</tr>`);
        if (idx === 0) out.push("</thead>");
      });
      if (rows.length > 1) out.push("</tbody>");
      out.push("</table>");
    }
    tableRows = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushList();
      flushTable();
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        codeBuf = [];
      } else {
        out.push(`<pre><code class="lang-${escapeHtml(codeLang)}">${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushList();
      tableRows.push(line);
      continue;
    }
    flushTable();

    if (/^\s*---\s*$/.test(line)) {
      flushList();
      out.push("<hr />");
      continue;
    }
    const hMatch = /^(#{1,4})\s+(.+)$/.exec(line);
    if (hMatch) {
      flushList();
      const lvl = hMatch[1].length;
      out.push(`<h${lvl}>${renderInline(hMatch[2])}</h${lvl}>`);
      continue;
    }
    if (line.startsWith("> ")) {
      flushList();
      out.push(`<blockquote><p>${renderInline(line.slice(2))}</p></blockquote>`);
      continue;
    }
    const ulMatch = /^\s*[-*]\s+(.+)$/.exec(line);
    const olMatch = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (ulMatch || olMatch) {
      const nextTag = olMatch ? "ol" : "ul";
      if (!inList || listTag !== nextTag) {
        flushList();
        listTag = nextTag;
        out.push(`<${listTag}>`);
        inList = true;
      }
      out.push(`<li>${renderInline((ulMatch ?? olMatch)[1])}</li>`);
      continue;
    }
    if (line.trim() === "") {
      flushList();
      continue;
    }
    flushList();
    out.push(`<p>${renderInline(line)}</p>`);
  }
  flushList();
  flushTable();
  return out.join("\n");
}

const DOC_PAGES = [
  { slug: "", title: "Getting Started", src: "docs/getting-started.md" },
  { slug: "getting-started", title: "Getting Started", src: "docs/getting-started.md" },
  { slug: "architecture", title: "Architecture & AA Math", src: "docs/architecture.md" },
  { slug: "api-reference", title: "API Reference", src: "docs/api-reference.md" },
  { slug: "flight-demo", title: "SkyStack 6-DOF Demo", src: "docs/flight-demo.md" },
  { slug: "ai-integration", title: "AI & Live MCP Bridge", src: "docs/ai-integration.md" },
];

const NAV_DOCS = DOC_PAGES.filter((p) => p.slug !== "");

for (const page of DOC_PAGES) {
  const md = readFileSync(resolve(ROOT, page.src), "utf-8");
  const bodyHtml = markdownToHtml(md);
  const activeSlug = page.slug || "getting-started";
  const sidebarHtml = NAV_DOCS.map(
    (n) => `<li><a href="/docs/${n.slug}/" class="${n.slug === activeSlug ? "active" : ""}">${n.title}</a></li>`,
  ).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <title>${escapeHtml(page.title)} | AASpriteStacker Docs</title>
  ${FAVICON_LINK}
  <link rel="stylesheet" href="/assets/styles.css" />
  ${GLOBAL_NAV_CSS}
</head>
<body>
  ${renderGlobalNav("docs")}
  <div class="container docs-layout">
    <aside class="docs-sidebar" aria-label="Documentation Navigation">
      <h4>Documentation</h4>
      <ul class="docs-nav">
        <li><a href="/primer/">Sprite Stacking Primer</a></li>
        ${sidebarHtml}
        <li><a href="/llms-full.txt">llms-full.txt (Agent Spec)</a></li>
      </ul>
    </aside>
    <article class="prose">${bodyHtml}</article>
  </div>
  <footer class="site-footer">
    <div class="container footer-inner">
      <div><strong>AASpriteStacker</strong> · MIT License · <a href="/">aasprite.com</a></div>
      <div class="footer-links">
        <a href="/play/">Play Demo</a>
        <a href="/normandy/">Normandy AA</a>
        <a href="/studio/">4-View Studio</a>
        <a href="/llms-full.txt">llms-full.txt</a>
      </div>
    </div>
  </footer>
</body>
</html>`;

  const outDir = page.slug ? resolve(DIST, "docs", page.slug) : resolve(DIST, "docs");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "index.html"), html, "utf-8");
}

// 6. Custom 404 page & Cloudflare Workers Static Assets _headers
writeFileSync(
  resolve(DIST, "404.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>404 | AASpriteStacker</title>
  <link rel="stylesheet" href="/assets/styles.css" />
  ${GLOBAL_NAV_CSS}
</head>
<body style="min-height:100dvh;display:flex;flex-direction:column">
  ${renderGlobalNav("")}
  <main style="flex:1;display:grid;place-items:center;padding:24px;text-align:center">
    <div class="card" style="max-width:440px">
      <span class="card-tag orange">404 · Out of Bounds</span>
      <h1 style="margin:8px 0">Slice Not Found</h1>
      <p style="margin-bottom:20px">That route doesn't exist in this volume. Jump back to the homepage or launch the 6-DOF demo.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <a class="btn btn-primary" href="/">← aasprite.com</a>
        <a class="btn" href="/play/">Play Demo</a>
      </div>
    </div>
  </main>
</body>
</html>`,
  "utf-8",
);

writeFileSync(
  resolve(DIST, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN

/play/dev-bridge-*
  Cache-Control: public, max-age=31536000, immutable
`,
  "utf-8",
);

console.log("Built aasprite.com static site into site/dist/");
