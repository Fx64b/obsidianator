# Security review — obsidianator 0.1.0-beta (June 2026)

Scope: full application — Go CLI (`export`, `serve`, `--watch`), HTTP serving
(`Serve`, `ServeInMemory`, `Watch`), vault parser, React frontend rendering
pipeline, and third-party dependencies.

Threat model assumed: the tool is intended for **local/private use**. The two
realistic attacker positions are (1) a machine on the same network while a
serve command is running, (2) untrusted *content* — notes, attachments, or
embedded diagrams in a vault you didn't fully author (shared vault, synced
vault, or an exported site whose note authors differ from the site owner) —
and (3) arbitrary websites open in the user's browser while the server runs.

---

## High

### H1 — Servers bind to all interfaces, exposing the entire vault to the network

`Serve`, `ServeInMemory`, and `Watch` all call
`http.ListenAndServe(fmt.Sprintf(":%d", port), …)` (`internal/export/exporter.go:138`,
`exporter.go:259`, `exporter.go:400`). The empty host means the listener binds
`0.0.0.0`/`[::]` — every interface, not just loopback — while the console
banner prints `http://localhost:<port>`, giving a false sense that the server
is local-only.

Impact: anyone on the same LAN / Wi-Fi can fetch `vault-data.json`, which
contains the **full raw content of every note plus all frontmatter** (often
where people keep personal data, tokens, internal URLs), and every attachment
under `/files/`. There is no authentication.

Fix: bind `127.0.0.1:<port>` by default and add an explicit opt-in flag
(`--host 0.0.0.0`) for users who really want LAN access. Apply to all three
serve paths.

### H2 — No Host-header validation → DNS-rebinding exfiltration even on localhost

None of the handlers validate the `Host` header. A classic DNS-rebinding
attack (the same class that hit webpack-dev-server, Vite, and Node inspector)
lets any website the user visits while `obsidianator serve` is running point
an attacker-controlled hostname at `127.0.0.1` and then read
`http://attacker-domain:3000/vault-data.json` from JavaScript — the
same-origin policy does not help because the browser believes it is talking
to the attacker's own origin. CSP and the absence of CORS headers do not
prevent this.

Fix: reject requests whose `Host` is not `localhost:<port>`,
`127.0.0.1:<port>`, or `[::1]:<port>` (plus the value of `--host` when set)
with `403`. One small middleware next to `securityHeaders` covers all three
servers.

---

## Medium

### M1 — Vulnerable runtime dependency: mermaid 11.14.0 (and `shadcn` misplaced in `dependencies`)

`pnpm audit --prod` reports 19 advisories. The ones that actually ship in the
bundle:

- **mermaid ≤11.14.0** — HTML injection via `classDef`/`classDefs` in
  state diagrams (GHSA advisories, fixed in 11.15.0), CSS injection via
  configuration, and a Gantt-chart infinite-loop DoS. Vault content flows
  directly into `mermaid.render()` (`MermaidBlock` in `MarkdownView.tsx`), so
  a malicious note in a shared/exported vault can exploit these despite
  `securityLevel: "strict"` — the bugs are in mermaid's own sanitizer.
  **Fix: bump `mermaid` to ≥11.15.0.**
- **uuid <11.1.1** (via mermaid) — fixed by the same bump.

The remaining 14 advisories (hono, fast-uri, qs, ip-address, …) all come via
**`shadcn`**, which is a code-generator CLI and should not be a runtime
dependency at all. It isn't bundled into the site, but it inflates the
supply-chain surface and the audit noise. **Fix: move `shadcn` to
`devDependencies` (or remove it).**

### M2 — Exported static sites ship with no CSP; SVG attachments are copied verbatim

`securityHeaders` (CSP, nosniff, frame-ancestors) only exists on the built-in
Go servers. The primary product — the exported `dist/` hosted on Netlify /
GitHub Pages / nginx — has none of those headers, so the only XSS defense is
`rehype-sanitize`. That is a good defense for markdown, but:

- `.svg` is on `allowedAttachmentExt`, and `Export` copies attachments
  byte-for-byte. An SVG containing `<script>` becomes **stored XSS on the
  hosting origin** the moment someone opens `/files/evil.svg` directly.
  (On the built-in servers the CSP `script-src 'self'` blocks this; on a
  third-party host nothing does.)

Fix options (any or all):
- Inject a `<meta http-equiv="Content-Security-Policy">` equivalent of the
  current policy into the exported `index.html` (note `frame-ancestors`
  doesn't work via `<meta>`, the rest does).
- Sanitize SVGs at export/serve time, or serve them with
  `Content-Disposition: attachment`.
- At minimum, document that exports of untrusted vaults should be hosted
  with a CSP.

### M3 — No HTTP server timeouts (slowloris)

All three servers use the package-level `http.ListenAndServe`, which has no
`ReadHeaderTimeout` / `IdleTimeout`. Combined with H1 this allows a trivial
remote connection-exhaustion DoS. Use an explicit `http.Server` with
`ReadHeaderTimeout` (and a sane `IdleTimeout`); leave write timeouts off for
the SSE endpoint or set them per-route.

---

## Low

### L1 — `/files/` serves any allowlisted-extension file in the vault, including hidden directories

The in-memory handler (`exporter.go:194`) checks containment and extension
but not whether the file is actually a referenced attachment. The parser
skips dot-directories (`.obsidian`, `.trash`), but the file handler does not,
so e.g. `/files/.trash/private.pdf` — attachments of "deleted" notes — is
served. Fix: require the requested path to be a value in `data.Attachments`,
or reject any path segment starting with `.`.

### L2 — Sanitizer clobber protection disabled + heading-derived DOM ids

`sanitizeSchema` sets `clobberPrefix: ""` (MarkdownView.tsx:17) and the
heading components assign `id={slugify(text)}` from arbitrary note text. This
re-enables DOM-clobbering: a crafted heading or footnote id can shadow a
global property that the app or a bundled library reads off `window` /
`document`. No concretely exploitable gadget was identified in the current
bundle, and CSP limits what a successful clobber could escalate to, so this
stays Low. The prefix was disabled for footnote-href compatibility with
remark-gfm; if it must stay empty, namespace the heading ids instead (e.g.
`id={"h-" + slugify(text)}` plus the matching anchor handler).

### L3 — `urlTransform={(url) => url}` removes react-markdown's URL scrubbing

`MarkdownView.tsx` overrides the default `urlTransform`, which normally
strips `javascript:` / `data:` URLs from links and images. Not exploitable
today because `rehype-sanitize`'s protocol allowlist runs afterwards and
drops those hrefs — but it silently couples link safety to the sanitize
schema two files away. Either remove the override or make it reject
non-allowlisted schemes explicitly.

---

## Positive observations

- `/files/` path handling is done right: `filepath.Join` + `EvalSymlinks` +
  resolved-prefix containment check + extension allowlist
  (`exporter.go:194`); symlinks escaping the vault are also rejected at
  parse time (`isWithinVault`).
- Markdown XSS pipeline is ordered correctly: `rehype-raw` →
  `rehype-sanitize` → katex/highlight, with a deliberately scoped schema.
- CSP on the built-in servers is tight (`default-src 'self'`,
  `frame-ancestors 'none'`, nosniff, no-referrer); `'unsafe-inline'` only on
  styles.
- Mermaid runs with `securityLevel: "strict"` and
  `suppressErrorRendering: true`.
- The SSE broker caps subscribers (100), bounding `/reload` fan-out.
- Hidden directories (`.obsidian` etc.) are skipped by the parser walk.

---

## Remediation status

Fixed on `claude/app-security-review-braklk` (commit `58e477b`):

- **H1** — all servers now bind `127.0.0.1` by default; `--host` flag added
  to `serve` and `export` for explicit network exposure; banner prints the
  real reachability and warns when listening on all interfaces; README
  documents the no-authentication caveat.
- **M1** — mermaid bumped to ≥11.15.0, `shadcn` moved to `devDependencies`,
  `uuid` overridden to ≥11.1.1; `pnpm audit --prod` is clean (0 advisories,
  down from 19).
- **M3** — shared `newServer` helper sets `ReadHeaderTimeout: 10s` and
  `IdleTimeout: 2m` on all three servers; read/write timeouts intentionally
  unset so the `/reload` SSE stream stays open.

Open (accepted for now, revisit before any "serve publicly" feature):

- **H2** — Host-header validation / DNS-rebinding protection.
- **M2** — CSP for exported static sites; SVG attachments copied verbatim.
- **L1** — `/files/` can serve allowlisted-extension files from hidden
  directories (e.g. `.trash`).
- **L2 / L3** — DOM-clobber prefix and `urlTransform` defense-in-depth.