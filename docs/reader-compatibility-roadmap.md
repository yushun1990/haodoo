# Reader Compatibility Roadmap & Architecture

> Status snapshot: 2026-08-13
>
> This document records the current Android WebView compatibility breakthrough, the architectural direction for the reader stack, and the next execution plan. It complements `docs/design.md`, `docs/plan.md`, and `docs/p2-reader-baseline.md`.

## 1. Current status

Haodoo has reached a useful transition point: the core catalog/PWA path works, EPUB reading works in mainstream engines, and the main Android WebView blank-page failure has been reproduced, diagnosed, and bypassed.

Confirmed working paths:

- Chrome / Chromium: EPUB reading works.
- Firefox Android: EPUB reading works.
- Baidu Browser Android WebView: EPUB body now renders.
- Via Android WebView: EPUB body now renders.
- PWA install UX is available, with Chrome/Chromium as the best native-install path and Firefox/iOS handled with browser-specific guidance.

The current priority is no longer "make one browser render a page". The priority is to freeze compatibility behavior, turn the fixes into a maintainable architecture, and then resume reader UX and offline work.

---

## 2. What was learned from Android WebView

### 2.1 Legacy JavaScript API gap

Some embedded browser environments lacked modern JavaScript APIs used by Foliate, including:

- `Array.prototype.at`
- `Array.prototype.findLast`
- `Array.prototype.findLastIndex`
- `Object.fromEntries`
- `Object.groupBy`
- `Map.groupBy`
- `String.prototype.replaceAll`

Compatibility is currently handled in two layers:

1. an early legacy-WebView bootstrap before the main application module;
2. build-time Foliate compatibility patches for APIs that must not depend on the runtime environment.

The long-term direction is to keep generic language compatibility in a dedicated compatibility/bootstrap layer and reduce source rewriting inside Foliate wherever possible.

### 2.2 The real blank-page root cause

The WebView diagnostics route established the important capability boundary:

```text
PASS  JavaScript compatibility
FAIL  fetch(blob:)
FAIL  sandbox iframe navigation to blob:
PASS  iframe srcdoc
PASS  iframe document.write
PASS  CSS columns
PASS  Range geometry
PASS  ResizeObserver
PASS  document.fonts
```

This means the affected WebViews are capable of rendering and paginating the EPUB document, but cannot reliably use Foliate's default blob URL transport path.

Foliate's normal reflowable EPUB section path is roughly:

```text
EPUB section
    ↓
rewrite internal resources
    ↓
Blob URL
    ↓
sandbox iframe src=blob:
    ↓
layout / pagination
```

On the failing WebViews:

```text
Blob URL creation             works
fetch(blob:)                  fails
sandbox iframe src=blob:      fails / times out
srcdoc / document.write       works
CSS columns / Range geometry  works
```

So the solution is to preserve the already-rewritten section HTML before it becomes inaccessible behind a blob URL.

### 2.3 Current fallback

The current compatibility flow is:

```text
Foliate Loader
    ↓
rewritten XHTML / HTML
    ├── create Blob URL (normal browsers)
    └── register rewritten text in memory
                    ↓
               BlobTextRegistry
                    ↓
Paginator tries blob iframe
    ↓ success                         ↓ failure
normal Foliate path             recover HTML by blob URL key
                                      ↓
                                   srcdoc
                                      ↓ failure
                                document.write
                                      ↓
                              normal Foliate render
```

Important: this is capability-driven behavior. The application must not grow browser-brand branches such as `if (isVia)` or `if (isBaidu)`.

---

## 3. Architectural principle

The long-term rule is:

> Foliate owns EPUB semantics and pagination; Haodoo owns browser adaptation, lifecycle, persistence, diagnostics, and product behavior.

The reader UI should not know which browser is running. It should consume a stable Reader API. Browser capability probing and transport fallbacks should be hidden behind compatibility interfaces.

Target dependency direction:

```text
Haodoo App
    │
    ├── Catalog / Routing / PWA
    │
    └── Reader UI
          │
          ▼
    ReaderController
          │
          ▼
     ReaderEngine
          │
          ▼
 FoliateReaderEngine
          │
          ├── BrowserCapabilities
          ├── SectionDocumentLoader
          ├── BlobTextRegistry
          └── FoliateCompatibilityAdapter
```

No lower layer should import or depend on a concrete page component.

---

## 4. Proposed reader architecture

### 4.1 ReaderController

`ReaderController` owns application-level reader lifecycle and state coordination:

- open / close a book;
- restore reading position;
- persist CFI / stable location;
- apply reader preferences;
- coordinate navigation commands;
- expose reader state to UI;
- convert low-level engine failures to user-facing errors.

It must not implement EPUB parsing or browser-specific iframe logic.

Example responsibility boundary:

```ts
interface ReaderController {
  open(request: OpenBookRequest): Promise<void>
  close(): Promise<void>
  next(): Promise<void>
  prev(): Promise<void>
  goTo(target: ReadingTarget): Promise<void>
  applyPreferences(preferences: ReaderPreferences): Promise<void>
}
```

### 4.2 ReaderEngine

The existing engine abstraction remains the stable border around third-party EPUB libraries.

Target surface should stay small:

```ts
interface ReaderEngine {
  open(source: ReaderSource, options?: ReaderOpenOptions): Promise<void>
  destroy(): void

  next(): Promise<void>
  prev(): Promise<void>
  goTo(target: ReadingTarget): Promise<void>

  getToc(): TocItem[]
  getLocation(): ReadingLocation | undefined
  applyPreferences(preferences: ReaderPreferences): Promise<void>
}
```

Foliate-specific events, custom elements, CFI implementation details, iframe behavior, and patch internals must not leak into catalog or UI components.

### 4.3 BrowserCapabilities

The current diagnostics work should become a reusable capability module rather than remain a separate one-off test implementation.

Proposed model:

```ts
type BrowserCapabilities = {
  blobFetch: boolean
  blobIframe: boolean
  srcdocIframe: boolean
  documentWriteIframe: boolean
  cssColumns: boolean
  rangeGeometry: boolean
  resizeObserver: boolean
  documentFonts: boolean
}
```

Requirements:

- capability detection is based on runtime behavior, not browser brand;
- expensive probes run only when needed;
- results are cached for the page/session;
- `#diagnostics` displays the same capability data used by the reader;
- failures include enough detail to copy into a bug report.

### 4.4 SectionDocumentLoader

The section transport strategy should become explicit.

Suggested contract:

```ts
interface SectionDocumentLoader {
  load(input: SectionDocumentInput): Promise<Document>
}

type SectionDocumentInput = {
  blobUrl?: string
  html?: string
}
```

Strategy order:

```text
1. blob iframe
      ↓ fail / unsupported
2. srcdoc
      ↓ fail / unsupported
3. document.write
      ↓ fail
4. explicit compatibility error
```

The strategy should use `BrowserCapabilities` to skip known-broken paths instead of waiting for the same timeout on every chapter.

### 4.5 BlobTextRegistry

The blob-text mapping discovered during the WebView fix should be promoted into a named adapter with a clear lifecycle.

Responsibilities:

- register rewritten textual EPUB resources when Foliate creates a blob URL;
- retrieve source text by blob URL during fallback;
- remove entries when Foliate releases/revokes a resource;
- clear all entries when a book/engine is destroyed;
- never become persistent storage.

Target API:

```ts
interface BlobTextRegistry {
  register(url: string, text: string): void
  get(url: string): string | undefined
  delete(url: string): void
  clear(): void
}
```

This component exists only to bridge a runtime browser limitation. It must not become a second EPUB cache.

### 4.6 FoliateCompatibilityAdapter

All Foliate-specific compatibility work should be classified and kept in one boundary.

Current patches fall into three groups:

#### A. Upstream bug hardening

- propagate section-load errors;
- detached-document guards;
- navigation lock cleanup with `finally`;
- robust iframe load/error handling.

These are candidates for upstream contribution or removal when a future Foliate release contains equivalent fixes.

#### B. Language/runtime compatibility

- `Object.groupBy` / `Map.groupBy` compatibility;
- other missing modern JS APIs.

These should migrate toward the generic compatibility/bootstrap layer wherever possible.

#### C. Haodoo WebView adaptation

- rewritten HTML registry;
- fallback from blob iframe to `srcdoc` / `document.write`;
- diagnostics and capability routing.

This is expected to remain Haodoo-specific unless Foliate itself adopts a pluggable section loader.

---

## 5. Proposed source layout

The goal is to move toward this structure incrementally, not through a single large rewrite:

```text
src/
├── app/
│   ├── routing/
│   └── catalog/
│
├── pwa/
│   ├── InstallButton.tsx
│   ├── installSupport.ts
│   └── serviceWorker.ts
│
├── reader/
│   ├── ReaderPage.tsx
│   ├── ReaderController.ts
│   │
│   ├── engine/
│   │   ├── ReaderEngine.ts
│   │   └── FoliateReaderEngine.ts
│   │
│   ├── compatibility/
│   │   ├── BrowserCapabilities.ts
│   │   ├── SectionDocumentLoader.ts
│   │   ├── BlobTextRegistry.ts
│   │   └── FoliateCompatibilityAdapter.ts
│   │
│   ├── storage/
│   │   ├── ReadingPositionStore.ts
│   │   ├── ReaderPreferencesStore.ts
│   │   └── BookStorage.ts
│   │
│   └── diagnostics/
│       └── ReaderDiagnostics.tsx
│
└── domain/
    └── book.ts

scripts/
├── patch-foliate.mjs
├── patch-foliate-legacy.mjs
└── sync-classic.ts
```

Migration rule: move one responsibility at a time while keeping existing browser behavior green.

---

## 6. Next execution phases

## Phase A — Compatibility freeze and regression matrix

Goal: prove that the current compatibility fix is stable before restructuring it.

Target environments:

- Chrome Android;
- Firefox Android;
- Via Android;
- Baidu Browser Android WebView;
- Desktop Chromium;
- Desktop Firefox;
- iOS Safari when a device is available.

Required scenarios:

- horizontal EPUB open;
- original vertical EPUB open;
- multi-part books;
- previous / next page;
- repeated page turns across section boundaries;
- table-of-contents jump;
- CFI/stable-position persistence;
- close and restore position;
- font size change;
- line-height change;
- margin/layout change;
- portrait / landscape transition;
- open a second book after closing the first;
- repeated open/destroy cycles.

Exit criteria:

- no blank reader body in supported test browsers;
- no permanent navigation lock after an error;
- no regression in Chromium/Firefox caused by WebView fallbacks;
- position restore remains stable after typography changes.

## Phase B — Extract BrowserCapabilities and diagnostics

Goal: make the diagnostic page and runtime reader share one implementation.

Tasks:

- extract probe functions from the diagnostics component;
- introduce typed `BrowserCapabilities`;
- cache capability results;
- preserve detailed copyable diagnostics output;
- add a lightweight capability summary for runtime decision-making;
- ensure diagnostics never opens a real EPUB.

Exit criteria:

- `#diagnostics` is only a presentation layer;
- reader decisions use the same capability module;
- no browser-name sniffing is needed for section loading.

## Phase C — Extract section loading strategy

Goal: turn the current patch logic into an explicit transport/fallback strategy.

Tasks:

- define `SectionDocumentLoader`;
- define strategy selection rules;
- use capability results to skip broken blob navigation;
- preserve timeouts for unknown environments;
- surface explicit failure reasons;
- keep Firefox/Chromium normal blob path fast.

Exit criteria:

- blob-capable browsers stay on normal Foliate behavior;
- WebViews known to fail blob navigation immediately choose a safe path;
- no 8-second timeout is paid on every chapter for a known-broken capability.

## Phase D — Formalize BlobTextRegistry

Goal: remove anonymous global compatibility state.

Tasks:

- wrap the registry in a named module/adapter;
- define ownership and cleanup lifecycle;
- verify no stale chapter text remains after book destruction;
- add focused tests for register/get/delete/clear behavior;
- document why the registry is memory-only.

Exit criteria:

- no uncontrolled global registry use outside the compatibility adapter;
- no leak across reader sessions.

## Phase E — Reduce Foliate patch surface

Goal: make upgrades possible without re-auditing one giant patch file.

Tasks:

- classify each current source patch as A/B/C from section 4.6;
- move generic runtime compatibility out of Foliate patching where safe;
- keep patch assertions that fail loudly when upstream source changes;
- document each patch with upstream context and removal condition;
- evaluate newer Foliate releases only after regression coverage exists;
- consider upstream PRs for generic hardening fixes.

Exit criteria:

- every patch has a reason, owner, and deletion condition;
- upgrading Foliate produces a small, reviewable compatibility diff.

## Phase F — Reader UX

Only after compatibility architecture is stable:

Priority order:

1. left/right touch zones;
2. swipe page turning;
3. auto-hide reader chrome;
4. TOC navigation UX;
5. better progress display;
6. typography/settings UX;
7. orientation/state restoration;
8. dark/warm themes;
9. Firefox installed-PWA task-switch / black-preview behavior investigation.

Exit criteria:

- reader can be used comfortably one-handed on a phone;
- controls do not interfere with text selection or scrolling;
- preferences persist consistently.

## Phase G — Offline book storage

Goal: turn the PWA shell into a local-first reading client.

Proposed data path:

```text
Remote EPUB
    ↓
ResourceFetcher
    ↓
BookStorage
    ├── memory
    ├── Cache Storage
    └── IndexedDB / OPFS (after capability and browser review)
    ↓
ReaderEngine
```

Tasks:

- explicit "save offline" action;
- local book metadata/index;
- cached EPUB open path;
- offline app shell and catalog behavior;
- storage quota handling;
- remove downloaded book;
- storage usage display;
- later: recent-book opportunistic caching.

Do not silently cache the entire catalog of EPUB files.

## Phase H — PWA product hardening

Tasks:

- update/reload UX when a new service worker activates;
- install-state consistency;
- Chrome/Chromium native install path;
- Firefox Android manual install guidance;
- iOS Add to Home Screen guidance;
- standalone safe-area/status-bar polish;
- offline/update state messaging;
- version information in diagnostics/about UI.

## Phase I — Test and release system

Target test pyramid:

```text
Unit tests
├── capability logic
├── storage
├── routing/catalog
└── compatibility helpers

Browser smoke tests
├── Chromium
└── Firefox

Real-device compatibility matrix
├── Chrome Android
├── Firefox Android
├── Via
├── Baidu Android WebView
└── iOS Safari
```

The diagnostics report should become the standard first artifact requested for future browser compatibility bugs.

---

## 7. Immediate next task

The next implementation session should start with an audit, not a rewrite.

Recommended task statement:

> Audit the current `reader/`, diagnostics, legacy-WebView bootstrap, and Foliate patch code. Map every compatibility behavior to `BrowserCapabilities`, `SectionDocumentLoader`, `BlobTextRegistry`, or `FoliateCompatibilityAdapter`. Propose the smallest sequence of refactors that preserves current Chromium, Firefox, Via, and Baidu behavior. Do not introduce new reader features until the compatibility regression matrix is green.

First refactor should be **BrowserCapabilities extraction**, because it is the lowest-risk step and creates the foundation for all later WebView strategy work.

---

## 8. Guardrails

The following rules apply during the next phases:

- Do not reintroduce browser-brand-specific rendering logic.
- Do not remove the working WebView fallback until an equivalent path has passed real-device tests.
- Do not couple catalog/source URL logic to the reader engine.
- Do not persist transformed EPUB HTML as a replacement for the original EPUB.
- Do not use page number as the primary persisted reading location.
- Do not make offline storage a prerequisite for online reading.
- Do not upgrade Foliate and restructure compatibility code in the same change.
- Every compatibility refactor must preserve Chromium and Firefox smoke tests.
- Real-device Via/Baidu checks remain required until automated Android WebView coverage exists.

---

## 9. Definition of the next stable milestone

The next stable milestone is reached when all of the following are true:

- Chromium and Firefox smoke tests pass;
- Via and Baidu render real EPUB content without blank pages;
- capability detection drives the section-load strategy;
- `#diagnostics` shares its probes with production compatibility code;
- blob fallback has an explicit lifecycle and cleanup path;
- Foliate patches are classified and documented;
- reader UI no longer needs to know how a section document reached the iframe;
- the architecture is ready for reader UX and offline work without adding more ad-hoc WebView patches.

At that point, compatibility work becomes maintenance rather than the dominant reader development activity.
