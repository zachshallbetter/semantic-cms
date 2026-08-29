/**
 * The document shell (SCMS-037).
 *
 * Separated from the adapter on purpose: `expressReaderWeb` decides what the
 * surface becomes, and this decides only what wraps it. Keeping the shell out
 * of the adapter is what lets the equivalence checker compare the adapter's
 * output against a voice expression without the comparison drowning in chrome.
 */
export interface ShellOptions {
  title: string;
  siteTitle: string;
  /** Rendered by an expression adapter — never hand-authored here. */
  body: string;
  /** Shown in the footer: what this page is derived from. */
  provenance?: { snapshot: string; fingerprint: string };
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--ground:#FBFBF9;--ink:#1A1A18;--muted:#5F6360;--rule:#E2E2DC;--accent:#3A5A46;--surface:#FFF}
@media (prefers-color-scheme:dark){:root{--ground:#111311;--ink:#E8E8E3;--muted:#989D98;--rule:#262A26;--accent:#8FBFA2;--surface:#171A17}}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font:16px/1.6 ui-serif,Georgia,"Times New Roman",serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:44rem;margin:0 auto;padding:2.5rem 1.5rem 5rem}
header.site{border-bottom:1px solid var(--rule);padding-bottom:1rem;margin-bottom:2.5rem;
  display:flex;gap:1.25rem;align-items:baseline;flex-wrap:wrap}
header.site a{color:inherit;text-decoration:none;font-family:ui-sans-serif,system-ui,sans-serif;font-size:.9rem}
header.site a:hover{color:var(--accent)}
header.site .brand{font-weight:600;letter-spacing:-.01em}
h1{font-size:2rem;line-height:1.15;margin:0 0 .5rem;text-wrap:balance;letter-spacing:-.015em}
h2{font-size:1.15rem;margin:0 0 .25rem;letter-spacing:-.01em}
.dek{color:var(--muted);font-size:1.05rem;margin:0 0 2rem}
.prose{white-space:pre-wrap}
.g--index-list{display:flex;flex-direction:column;gap:.25rem}
a.card{display:block;padding:1rem 1.1rem;margin:0 0 .25rem;border:1px solid var(--rule);
  border-radius:.5rem;background:var(--surface);color:inherit;text-decoration:none}
a.card:hover{border-color:var(--accent)}
a.card p{margin:.35rem 0 0;color:var(--muted);font-size:.95rem}
nav[data-operations]{display:none}
nav[data-operations]:has(button){display:flex;gap:.5rem;margin-top:2rem}
#live-chip{margin-left:.4rem}
#live-chip[data-state="live"]{color:var(--accent)}
#live-chip[data-state="stale"]{color:var(--muted)}
footer.prov{margin-top:4rem;padding-top:1rem;border-top:1px solid var(--rule);
  color:var(--muted);font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
`;

export function renderShell(o: ShellOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title>
<link rel="alternate" type="application/rss+xml" href="/rss.xml">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="site">
  <a class="brand" href="/">${esc(o.siteTitle)}</a>
  <a href="/writing">Writing</a>
  <a href="/work">Work</a>
</header>
${o.body}
${o.provenance
  ? `<footer class="prov">rendered from Canon · snapshot ${esc(o.provenance.snapshot)} · surface ${esc(o.provenance.fingerprint.slice(0, 16))}
     <span id="live-chip" data-state="snapshot">· snapshot</span></footer>`
  : ""}
<script>
// §8.3: the channel pushes invalidation KEYS and the client re-fetches through
// its own access projection. It never receives content, so it cannot be shown
// anything the page itself would not have resolved.
//
// And failure degrades to truth: if the channel drops, the chip says snapshot
// and the page keeps the state it has. It never spins, and it never claims live
// without a connection behind it (the rule NR-scms-010 was written about).
(function () {
  var chip = document.getElementById("live-chip");
  if (!chip || !window.EventSource) return;
  var say = function (state, text) { chip.dataset.state = state; chip.textContent = "· " + text; };

  var es = new EventSource("/events?path=" + encodeURIComponent(window.location.pathname));
  es.addEventListener("ready", function () { say("live", "live"); });
  es.addEventListener("invalidate", function (e) {
    var keys = [];
    try { keys = (JSON.parse(e.data) || {}).keys || []; } catch (_) { return; }
    if (!keys.length) return;
    say("stale", keys.length + " changed \u2014 refreshing");
    // Re-fetch through the same route, which resolves through access
    // projection exactly as the first render did.
    fetch(window.location.pathname, { headers: { "cache-control": "no-cache" } })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var next = doc.querySelector(".wrap");
        var here = document.querySelector(".wrap");
        if (next && here) { here.innerHTML = next.innerHTML; say("live", "live"); }
      })
      .catch(function () { say("snapshot", "snapshot \u2014 refresh failed"); });
  });
  es.onerror = function () { say("snapshot", "snapshot"); };
})();
</script>
</div>
</body>
</html>`;
}
