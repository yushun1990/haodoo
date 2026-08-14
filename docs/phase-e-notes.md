# P2.5 Phase E validation notes

Phase E is intentionally limited to Foliate compatibility-patch maintenance. It does not change Reader product behavior, upgrade Foliate, or expand P3 typography.

Validation gates for this phase:

- pinned `foliate-js@1.0.1` assertion;
- exact-source patch policy unit test, including unknown-source rejection;
- patch verifier after install and again during prebuild;
- generic `Object.groupBy` / `Map.groupBy` compatibility stays in `public/legacy-webview.js`, not embedded in `epub.js`;
- existing BlobTextRegistry lifecycle tests;
- production build;
- Chromium real-EPUB reader smoke;
- Firefox real-EPUB reader smoke.

After Phase E merges, P2.5 is still not complete. The next gate is Phase A final real-device freeze: Chrome Android, Firefox Android, Via, Baidu Android WebView, and iOS Safari when a device is available.
