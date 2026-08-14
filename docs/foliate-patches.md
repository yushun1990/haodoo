# Foliate patch inventory

> Phase: P2.5 Phase E — patch cleanup
>
> Pinned dependency: `foliate-js@1.0.1`
>
> This file is the maintenance contract for every Haodoo source patch applied to Foliate. A Foliate version change is not allowed to bypass these assertions: update the pinned dependency only after reviewing the new upstream source, this inventory, and the Chromium/Firefox + final device regression matrix.

## 1. Rules

1. **Fail on unknown upstream source.** Patch scripts accept only the pinned version and exact known source snippets (or the exact Haodoo-patched snippet on an idempotent rerun).
2. **Generic JavaScript compatibility does not belong in Foliate source rewriting.** Early runtime polyfills live in `public/legacy-webview.js` and execute before the application module.
3. **Foliate keeps EPUB semantics and pagination.** Haodoo patches only lifecycle hardening and the browser-adaptation seam required by embedded WebViews.
4. **No browser-name branches.** Section transport remains capability-driven through `BrowserCapabilities` and `SectionDocumentLoader`.
5. **No persistence in compatibility adapters.** `BlobTextRegistry` is memory-only and mirrors Foliate-owned blob URL lifetime.

Execution order:

```text
patch-foliate-paginator.mjs
        ↓
patch-foliate-epub.mjs
        ↓
verify-foliate-patches.mjs
```

The verifier runs during `postinstall` and every `prebuild` through `npm run patch:foliate`.

## 2. Category A — upstream hardening

These patches are independent of Haodoo's WebView fallback and are candidates for removal when upstream contains equivalent behavior.

| Patch | Why it exists | Upstream status / candidate | Removal condition |
| --- | --- | --- | --- |
| `Paginator.render` detached-document guard | `ResizeObserver` can fire after a section iframe has detached or before `body` exists; later pagination dereferences the dead document. | Covered by upstream issue `johnfactotum/foliate-js#150`; suitable upstream hardening. | Remove after the pinned Foliate source contains an equivalent lifecycle guard and close/reopen regression stays green. |
| `View.expand` detached-document guard | Font/resize callbacks can reach `expand()` after teardown and dereference a missing `documentElement`. | Same lifecycle class as #150; upstream candidate together with the render guard. | Remove when upstream makes expansion safe for detached/bodyless section documents. |
| section-load error propagation | Upstream catches section load errors and returns `{}`, hiding the real failure and producing undefined section state downstream. | Explicitly reported in upstream issue `#146`; upstream candidate. | Remove when upstream propagates or otherwise exposes the original section-load failure without converting it to a successful empty result. |
| navigation-lock `finally` guard | A rejected section transition exits `#turnPage()` before clearing `#locked`, permanently disabling later Next/Previous actions. | Generic paginator hardening; upstream candidate. No Haodoo-specific transport assumption is required. | Remove when upstream releases the navigation lock on every success/error path and the failure-path navigation regression is covered. |

## 3. Category B — generic runtime compatibility

**No Foliate source patch remains in this category.**

Older Android WebViews may lack modern JavaScript APIs used by Foliate, including `Array.prototype.at`, `Object.groupBy`, and `Map.groupBy`. The compatibility layer is the classic script:

```text
index.html
  ↓ before /src/main.tsx
public/legacy-webview.js
```

Phase E removes the former `haodooObjectGroupBy` / `haodooMapGroupBy` helpers from `epub.js` and restores Foliate's native `Object.groupBy` / `Map.groupBy` calls. The verifier fails if those embedded helpers reappear.

Deletion condition for a specific polyfill: remove it only when Haodoo's supported runtime floor guarantees the API and the final Android compatibility matrix remains green. Do not replace this with user-agent checks.

## 4. Category C — Haodoo WebView adaptation

These patches bridge a runtime limitation demonstrated by Via/Baidu-style Android WebViews: rewritten EPUB text exists, while sandboxed iframe navigation to `blob:` may fail even though `srcdoc`, `document.write`, CSS columns, Range geometry and fonts work.

| Patch | Why it exists | Upstream suitability | Removal condition |
| --- | --- | --- | --- |
| `View.load` → `SectionDocumentLoader` bridge | Makes section transport explicit: blob iframe → srcdoc → document.write, with transport/render/pagination failure staging. | Haodoo-specific today. Could disappear if Foliate gains a pluggable section-document loader/transport hook. | Remove when upstream exposes an equivalent injectable loader and Haodoo can implement fallback without replacing `View.load`. |
| paginator HTML provider → `BlobTextRegistry.get()` | Supplies the exact rewritten section HTML when blob navigation/fetch is unusable. | Part of the same adaptation seam; not a generic Foliate bug. | Remove with the custom section loader if upstream provides rewritten text directly to a transport adapter. |
| `Loader.createURL()` registry register hook | Mirrors rewritten XHTML/HTML/SVG text under the Foliate-created blob URL. | Haodoo-specific unless upstream exposes a resource/URL lifecycle hook. | Remove when fallback HTML can be obtained without patching Foliate resource creation. |
| `Loader.unref()` / `destroy()` registry delete hooks | Keeps the memory mirror aligned with Foliate URL revoke lifetime and prevents stale entries. | Haodoo-specific lifecycle coupling. | Remove together with the register hook or when upstream lifecycle callbacks can own this synchronization. |

`SectionDocumentLoader` must continue to depend only on an HTML provider (`getHtml`) rather than importing `BlobTextRegistry` directly.

## 5. Source assertions and upgrade procedure

`foliate-patch-policy.mjs` rejects any installed Foliate version other than `1.0.1`. `replaceExact()` refuses to patch a source block that is neither the known upstream text nor the known Haodoo replacement.

For a future Foliate upgrade:

1. change nothing in the dependency first;
2. inspect upstream `paginator.js` and `epub.js` against every row above;
3. mark patches already solved upstream and delete them rather than mechanically porting them;
4. update exact source assertions only for patches still required;
5. update `FOLIATE_PATCH_VERSION` and the package dependency together;
6. run lint, typecheck, build, focused registry tests, Chromium smoke and Firefox smoke;
7. rerun the Phase A Android device matrix before accepting the upgrade.

A version bump that only makes the patch scripts pass is not sufficient evidence to upgrade.
