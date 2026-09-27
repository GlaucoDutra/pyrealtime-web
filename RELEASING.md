# Releasing the browser client

1. Keep `package.json` and `CHANGELOG.md` on the same SemVer version.
2. Run `npm ci`, `npm test`, `npm run build`, and `npm run pack:check`.
3. Merge to `main`, create an annotated `vX.Y.Z` tag, and push it.
4. The Release workflow tests, builds, packs, and attaches the tarball to a GitHub release.
5. To publish `@glaucodutra/pyrealtime-client` to npm, configure npm trusted publishing for this repository/workflow and set `NPM_PUBLISH_ENABLED=true` in repository variables.

Only `dist-client`, `README.md`, and `LICENSE` are shipped. The Vite demo UI remains a reference application, not part of the npm package API.
