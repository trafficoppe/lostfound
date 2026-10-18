# Bangkok time and data-loading fixes

This proposal contains a tested patch for six HTML pages, the shared data/date module, tests, documentation and an optional Apps Script cache implementation. It does not change the live pages.

Inspect `bangkok-time-and-loading.patch`, then apply it from the repository root with `git apply proposals/bangkok-time-and-loading.patch`. Review existing authentication and deployment prerequisites before publishing the modified pages. The patch intentionally excludes inherited sensitive literals.

The date and parsing checks were run against a private local API snapshot with 784 displayed records under Bangkok, UTC and Los Angeles time zones. The local Dashboard and October 2026 filter were checked after login. No private data fixture is included.

The Apps Script cache implementation is a separate deployment step. It must replace the current getAllData function and be verified against the deployed project before use. Notification delivery and monthly reporting changes remain follow-up work.
