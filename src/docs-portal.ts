/**
 * docs-portal.ts
 *
 * Self-contained documentation portal for the Stackby MCP Server.
 * Reads markdown files from the docs/ directory at runtime and serves a
 * full interactive HTML site at GET /docs and GET /docs/:slug.
 *
 * Exported surface:
 *   handleDocsRequest(req, res, url)  — drop-in route handler for the HTTP server
 */

import * as http from "node:http";
import * as fs   from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Resolve docs/ directory (dist/docs-portal.js  →  ../docs)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
/** Absolute path to the docs/ folder that lives next to package.json. */
export const DOCS_DIR = path.resolve(__dirname, "..", "docs");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DocFile { rel: string; label: string; slug: string }
interface NavItem  { label: string; slug: string; children?: NavItem[] }

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** Recursively collect every .md file under dir. */
function collectDocFiles(dir: string, base = ""): DocFile[] {
  const results: DocFile[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      results.push(...collectDocFiles(path.join(dir, entry.name), base + entry.name + "/"));
    } else if (entry.name.endsWith(".md")) {
      const rel  = base + entry.name;
      const slug = rel.replace(/\\/g, "/").replace(/\.md$/, "");
      const label = entry.name
        .replace(/\.md$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/^Readme$/i, "Overview");
      results.push({ rel, label, slug });
    }
  }
  return results;
}

/**
 * Read a markdown file by slug (e.g. "tools/read-operations").
 * Returns null if the file doesn't exist or the path would escape DOCS_DIR.
 */
function readDocFile(slug: string): string | null {
  const safe     = slug.replace(/\.\./g, "").replace(/\\/g, "/");
  const filePath = path.resolve(DOCS_DIR, safe + ".md");
  if (!filePath.startsWith(DOCS_DIR)) return null;          // path-traversal guard
  try { return fs.readFileSync(filePath, "utf8"); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Navigation builder
// ---------------------------------------------------------------------------

/** Convert a flat list of DocFiles into a two-level nav tree. */
function buildNav(files: DocFile[]): NavItem[] {
  const top: NavItem[]               = [];
  const groups: Record<string, NavItem> = {};

  for (const f of files) {
    const parts = f.rel.replace(/\\/g, "/").split("/");

    if (parts.length === 1) {
      // top-level page
      top.push({
        label: parts[0].replace(/\.md$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        slug : parts[0].replace(/\.md$/, ""),
      });
    } else {
      // sub-folder page
      const folder   = parts[0];
      const fileSlug = parts.slice(0, -1).join("/") + "/" + parts[parts.length - 1].replace(/\.md$/, "");
      const fileLabel = parts[parts.length - 1]
        .replace(/\.md$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase())
        .replace(/^Readme$/i, "Overview");

      if (!groups[folder]) {
        groups[folder] = {
          label   : folder.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          slug    : "",
          children: [],
        };
      }
      groups[folder].children!.push({ label: fileLabel, slug: fileSlug });
    }
  }

  // index page first, rest alphabetical, then folder groups
  const idxPos = top.findIndex(t => t.slug === "index");
  const idxItem = idxPos >= 0 ? top.splice(idxPos, 1)[0] : null;
  top.sort((a, b) => a.label.localeCompare(b.label));

  const sortedGroups = Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
  for (const g of sortedGroups) {
    g.children!.sort((a, b) => {
      if (a.slug.toLowerCase().endsWith("/readme")) return -1;
      if (b.slug.toLowerCase().endsWith("/readme")) return  1;
      return a.label.localeCompare(b.label);
    });
  }

  return [...(idxItem ? [idxItem] : []), ...top, ...sortedGroups];
}

// ---------------------------------------------------------------------------
// HTML renderer
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderNavItems(items: NavItem[], activeSlug: string): string {
  return items.map(item => {
    if (item.children?.length) {
      return `
        <li class="nav-group">
          <div class="nav-group-label">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" class="group-arrow">
              <path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${esc(item.label)}
          </div>
          <ul class="nav-children">${renderNavItems(item.children, activeSlug)}</ul>
        </li>`;
    }
    const active = item.slug === activeSlug ? "active" : "";
    return `<li><a href="/docs/${item.slug}" class="nav-link ${active}" data-slug="${esc(item.slug)}">${esc(item.label)}</a></li>`;
  }).join("");
}

/** Build the complete HTML page for the docs portal. */
function renderDocsHtml(nav: NavItem[], initialSlug: string, initialContent: string): string {
  const navJson  = JSON.stringify(nav).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  const navHtml  = `<ul class="nav-list">${renderNavItems(nav, initialSlug)}</ul>`;

  // Escape the markdown so it's safe to embed in a JS template literal
  const mdEscaped = initialContent
    .replace(/\\/g, "\\\\")
    .replace(/`/g,  "\\`")
    .replace(/\$/g, "\\$");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Stackby MCP Server — Docs</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
  <script src="https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/highlight.min.js"></script>
  <link  rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #f8f9fb; --sidebar-bg: #fff; --sidebar-w: 272px; --content-max: 860px;
      --brand: #6c47ff; --brand-l: #ede9ff; --brand-d: #4c2fe0;
      --text: #1a1d23; --muted: #6b7280; --light: #9ca3af;
      --border: #e5e7eb; --border-l: #f3f4f6; --code-bg: #f6f8fa;
      --nav-hover: #f5f3ff; --radius: 8px;
      --shadow-sm: 0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
      --shadow-md: 0 4px 12px rgba(0,0,0,.08);
    }
    html { font-size: 15px; }
    body { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:var(--bg); color:var(--text); display:flex; height:100vh; overflow:hidden; }

    /* TOPBAR */
    .topbar { position:fixed; top:0; left:0; right:0; height:56px; background:#fff; border-bottom:1px solid var(--border); display:flex; align-items:center; padding:0 20px; z-index:100; gap:16px; box-shadow:var(--shadow-sm); }
    .logo { display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--text); font-weight:700; font-size:1rem; letter-spacing:-.02em; }
    .logo-icon { width:32px; height:32px; background:var(--brand); border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:16px; font-weight:800; flex-shrink:0; }
    .badge { font-size:.7rem; font-weight:600; background:var(--brand-l); color:var(--brand); padding:2px 8px; border-radius:20px; letter-spacing:.02em; }
    .topbar-links { margin-left:auto; display:flex; align-items:center; gap:6px; }
    .tl { font-size:.8rem; color:var(--muted); text-decoration:none; padding:5px 10px; border-radius:6px; font-weight:500; transition:background .15s,color .15s; }
    .tl:hover { background:var(--bg); color:var(--text); }
    .tl.cta { background:var(--brand); color:#fff; font-weight:600; }
    .tl.cta:hover { background:var(--brand-d); }
    .menu-btn { display:none; background:none; border:none; cursor:pointer; padding:6px; color:var(--text); }

    /* SIDEBAR */
    .sidebar { position:fixed; top:56px; left:0; bottom:0; width:var(--sidebar-w); background:var(--sidebar-bg); border-right:1px solid var(--border); overflow-y:auto; padding:16px 0 40px; z-index:50; }
    .sidebar::-webkit-scrollbar { width:4px; }
    .sidebar::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
    .s-search { margin:0 12px 12px; position:relative; }
    .s-search input { width:100%; padding:7px 10px 7px 32px; border:1px solid var(--border); border-radius:6px; font-size:.8rem; background:var(--bg); color:var(--text); outline:none; font-family:inherit; transition:border-color .15s; }
    .s-search input:focus { border-color:var(--brand); }
    .s-icon { position:absolute; left:9px; top:50%; transform:translateY(-50%); color:var(--light); pointer-events:none; }
    .nav-list { list-style:none; }
    .nav-list li { position:relative; }
    .nav-link { display:block; padding:6px 16px; font-size:.85rem; color:var(--muted); text-decoration:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:background .12s,color .12s; border-left:2px solid transparent; line-height:1.4; }
    .nav-link:hover { background:var(--nav-hover); color:var(--text); }
    .nav-link.active { color:var(--brand); background:var(--brand-l); border-left-color:var(--brand); font-weight:600; }
    .nav-group { margin-top:4px; }
    .nav-group-label { display:flex; align-items:center; gap:6px; padding:7px 16px 4px; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:var(--light); cursor:pointer; user-select:none; }
    .nav-group-label:hover { color:var(--muted); }
    .group-arrow { transition:transform .2s; flex-shrink:0; }
    .nav-group.collapsed .group-arrow { transform:rotate(0deg); }
    .nav-group:not(.collapsed) .group-arrow { transform:rotate(90deg); }
    .nav-children { list-style:none; }
    .nav-children .nav-link { padding-left:28px; font-size:.82rem; }
    .nav-group.collapsed .nav-children { display:none; }

    /* MAIN */
    .main { margin-left:var(--sidebar-w); margin-top:56px; flex:1; overflow-y:auto; padding:40px 48px; min-height:calc(100vh - 56px); }
    .main::-webkit-scrollbar { width:6px; }
    .main::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
    .cw { max-width:var(--content-max); margin:0 auto; }

    /* LOADING */
    .loading { display:none; flex-direction:column; align-items:center; justify-content:center; padding:80px 0; color:var(--muted); gap:14px; }
    .loading.on { display:flex; }
    .spinner { width:32px; height:32px; border:3px solid var(--border); border-top-color:var(--brand); border-radius:50%; animation:spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* NOT FOUND */
    .nf { display:none; text-align:center; padding:80px 0; }
    .nf.on { display:block; }
    .nf h2 { font-size:1.3rem; color:var(--muted); font-weight:600; margin-bottom:8px; }
    .nf p  { color:var(--light); font-size:.9rem; }

    /* BREADCRUMB */
    .bc { display:flex; align-items:center; gap:6px; font-size:.8rem; color:var(--light); margin-bottom:24px; }
    .bc a { color:var(--muted); text-decoration:none; }
    .bc a:hover { color:var(--brand); }
    .bc-sep { color:var(--border); }

    /* CONTENT */
    .doc h1 { font-size:2rem; font-weight:700; letter-spacing:-.03em; margin-bottom:8px; line-height:1.2; padding-bottom:16px; border-bottom:1px solid var(--border); }
    .doc h2 { font-size:1.35rem; font-weight:700; letter-spacing:-.02em; margin-top:40px; margin-bottom:14px; }
    .doc h3 { font-size:1.1rem; font-weight:600; margin-top:28px; margin-bottom:10px; }
    .doc h4 { font-size:.95rem; font-weight:600; color:var(--muted); margin-top:20px; margin-bottom:8px; text-transform:uppercase; letter-spacing:.05em; }
    .doc p  { line-height:1.75; color:#374151; margin-bottom:14px; font-size:.93rem; }
    .doc ul,.doc ol { margin:10px 0 16px 20px; line-height:1.75; }
    .doc li { margin-bottom:4px; font-size:.93rem; color:#374151; }
    .doc a  { color:var(--brand); text-decoration:none; font-weight:500; }
    .doc a:hover { text-decoration:underline; }
    .doc hr { border:none; border-top:1px solid var(--border); margin:32px 0; }
    .doc code { font-family:'JetBrains Mono',Consolas,monospace; font-size:.82rem; background:var(--code-bg); border:1px solid var(--border); border-radius:4px; padding:1px 5px; color:#d63384; }
    .doc pre { background:#1e2026; border-radius:var(--radius); padding:18px 20px; margin:16px 0; overflow-x:auto; position:relative; box-shadow:var(--shadow-sm); }
    .doc pre code { font-family:'JetBrains Mono',Consolas,monospace; font-size:.82rem; background:transparent; border:none; padding:0; color:#e5e7eb; }
    .copy-btn { position:absolute; top:10px; right:10px; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); color:#9ca3af; border-radius:5px; padding:3px 9px; font-size:.73rem; cursor:pointer; font-family:inherit; transition:background .15s,color .15s; }
    .copy-btn:hover { background:rgba(255,255,255,.2); color:#fff; }
    .copy-btn.ok { background:#10b981; border-color:#10b981; color:#fff; }
    .doc table { width:100%; border-collapse:collapse; margin:18px 0; font-size:.87rem; box-shadow:var(--shadow-sm); border-radius:var(--radius); overflow:hidden; }
    .doc thead tr { background:var(--brand); color:#fff; }
    .doc th { padding:10px 14px; text-align:left; font-weight:600; font-size:.8rem; letter-spacing:.02em; }
    .doc td { padding:9px 14px; border-bottom:1px solid var(--border-l); vertical-align:top; color:#374151; }
    .doc tbody tr:last-child td { border-bottom:none; }
    .doc tbody tr:nth-child(even) { background:#fafafa; }
    .doc tbody tr:hover { background:var(--nav-hover); }
    .doc blockquote { border-left:3px solid var(--brand); background:var(--brand-l); padding:12px 16px; border-radius:0 var(--radius) var(--radius) 0; margin:16px 0; }
    .doc blockquote p { margin:0; color:#374151; }

    /* MOBILE */
    .overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:40; }
    .overlay.on { display:block; }
    @media (max-width:768px) {
      .sidebar { transform:translateX(-100%); transition:transform .25s; }
      .sidebar.open { transform:translateX(0); box-shadow:var(--shadow-md); }
      .main { margin-left:0; padding:24px 20px; }
      .menu-btn { display:flex; }
      .doc h1 { font-size:1.5rem; }
    }
  </style>
</head>
<body>

  <header class="topbar">
    <button class="menu-btn" id="menuBtn" aria-label="Toggle menu">
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
      </svg>
    </button>
    <a class="logo" href="/docs">
      <div class="logo-icon">S</div>
      <span>Stackby MCP Server</span>
    </a>
    <span class="badge">v0.5.0</span>
    <nav class="topbar-links">
      <a class="tl" href="/health">Health</a>
      <a class="tl" href="https://github.com/stackbyhq/stackby-mcp-server" target="_blank" rel="noopener">GitHub</a>
      <a class="tl" href="https://stackby.com" target="_blank" rel="noopener">Stackby</a>
      <a class="tl cta" href="/mcp">API Endpoint</a>
    </nav>
  </header>

  <aside class="sidebar" id="sidebar">
    <div class="s-search">
      <svg class="s-icon" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/>
      </svg>
      <input type="text" id="searchInput" placeholder="Search docs…" autocomplete="off"/>
    </div>
    ${navHtml}
  </aside>

  <div class="overlay" id="overlay"></div>

  <main class="main" id="main">
    <div class="cw">
      <div class="bc"  id="bc"></div>
      <div class="loading" id="loading"><div class="spinner"></div><span>Loading…</span></div>
      <div class="nf"  id="nf"><h2>Page not found</h2><p>The requested page does not exist.</p></div>
      <div class="doc" id="doc"></div>
    </div>
  </main>

  <script>
    const NAV = ${navJson};
    let cur = ${JSON.stringify(initialSlug)};

    marked.setOptions({ gfm: true, breaks: false });

    function renderMd(md) {
      const el = document.getElementById('doc');
      el.innerHTML = marked.parse(md);
      el.querySelectorAll('pre code').forEach(block => {
        if (window.hljs) hljs.highlightElement(block);
        const pre = block.parentElement;
        const btn = document.createElement('button');
        btn.className = 'copy-btn'; btn.textContent = 'Copy';
        btn.onclick = () => navigator.clipboard.writeText(block.innerText).then(() => {
          btn.textContent = 'Copied!'; btn.classList.add('ok');
          setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('ok'); }, 2000);
        });
        pre.style.position = 'relative'; pre.appendChild(btn);
      });
      el.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto')) {
          a.addEventListener('click', e => {
            e.preventDefault();
            let r = href.replace(/\\.md$/, '').replace(/^\\.\\//,'');
            const parts = cur.split('/'); parts.pop();
            const base = parts.join('/');
            go(base ? base + '/' + r : r);
          });
        }
      });
    }

    function setBc(slug) {
      const parts = slug.split('/');
      let html = '<a href="/docs">Docs</a>', built = '';
      parts.forEach((p, i) => {
        built = built ? built + '/' + p : p;
        const lbl = p.replace(/[-_]/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());
        html += '<span class="bc-sep">/</span>';
        html += i < parts.length - 1
          ? '<a href="/docs/' + built + '">' + lbl + '</a>'
          : '<span>' + lbl + '</span>';
      });
      document.getElementById('bc').innerHTML = html;
    }

    function setActive(slug) {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      const l = document.querySelector('[data-slug="' + slug + '"]');
      if (l) { l.classList.add('active'); l.scrollIntoView({ block:'nearest', behavior:'smooth' }); }
    }

    function go(slug, push = true) {
      slug = slug || 'index';
      const loading = document.getElementById('loading');
      const doc     = document.getElementById('doc');
      const nf      = document.getElementById('nf');
      loading.classList.add('on'); doc.innerHTML = ''; nf.classList.remove('on');
      document.getElementById('main').scrollTop = 0;
      fetch('/docs/' + slug + '?raw=1')
        .then(r => { if (!r.ok) throw 0; return r.text(); })
        .then(md => {
          loading.classList.remove('on'); renderMd(md); setBc(slug); setActive(slug); cur = slug;
          if (push) history.pushState({ slug }, '', '/docs/' + slug);
          document.title = 'Stackby MCP — ' + slug.split('/').pop().replace(/[-_]/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());
        })
        .catch(() => { loading.classList.remove('on'); nf.classList.add('on'); });
    }

    document.querySelectorAll('.nav-link').forEach(l => l.addEventListener('click', e => {
      e.preventDefault();
      if (l.dataset.slug) go(l.dataset.slug);
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('overlay').classList.remove('on');
    }));
    document.querySelectorAll('.nav-group-label').forEach(l =>
      l.addEventListener('click', () => l.parentElement.classList.toggle('collapsed'))
    );
    window.addEventListener('popstate', e => go((e.state && e.state.slug) || 'index', false));
    document.getElementById('menuBtn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('overlay').classList.toggle('on');
    });
    document.getElementById('overlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('overlay').classList.remove('on');
    });
    document.getElementById('searchInput').addEventListener('input', function () {
      const q = this.value.toLowerCase().trim();
      document.querySelectorAll('.nav-link').forEach(l => {
        l.parentElement.style.display = (!q || l.textContent.toLowerCase().includes(q)) ? '' : 'none';
      });
      document.querySelectorAll('.nav-group').forEach(g => {
        const vis = [...g.querySelectorAll('.nav-link')].some(l => l.parentElement.style.display !== 'none');
        g.style.display = vis ? '' : 'none';
        if (q && vis) g.classList.remove('collapsed');
      });
    });

    // Initial paint — content is embedded; no round-trip needed
    (function () {
      renderMd(\`${mdEscaped}\`);
      setBc(cur);
      history.replaceState({ slug: cur }, '', '/docs/' + cur);
    })();
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public route handler — import this in server-http.ts
// ---------------------------------------------------------------------------

/**
 * Handle every GET /docs and GET /docs/* request.
 *
 * Appending ?raw=1 returns the raw markdown (used by the client-side fetch
 * when the user clicks a link in the sidebar or inside a document).
 */
export async function handleDocsRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<void> {
  const isRaw  = url.includes("?raw=1");
  const clean  = url.split("?")[0];

  // Derive the doc slug from the URL path, e.g. /docs/tools/automation → tools/automation
  const docSlug =
    clean
      .replace(/^\/docs\/?/, "")
      .replace(/\.md$/, "")
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "") || "index";

  const content = readDocFile(docSlug);

  // ---- Raw mode (client-side fetch) ----
  if (isRaw) {
    if (!content) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
    res.end(content);
    return;
  }

  // ---- Full HTML portal ----
  const nav            = buildNav(collectDocFiles(DOCS_DIR));
  const initialContent = content ?? `# Page Not Found\n\nThe page \`${docSlug}\` does not exist.`;
  const html           = renderDocsHtml(nav, docSlug, initialContent);

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}
