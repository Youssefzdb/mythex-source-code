# Mythex frontend source extracted from public source maps

This tree contains original TypeScript/TSX application sources recovered from
`sourcesContent` in the publicly accessible source maps. Dependency sources
under `node_modules` were excluded. This is frontend source only, not backend
source code or a complete buildable repository.

## Counts

- Production: 224 unique application files from 8 maps; 0 identical duplicate entries; 0 conflicts.
- Staging: 156 unique application files from 1 maps; 0 identical duplicate entries; 0 conflicts.

## Useful entry points

- `production/src/App.tsx`
- `production/src/lib/api.ts`
- `production/src/lib/auth.tsx`
- `production/src/pages/admin/AdminApp.tsx`
- `production/src/pages/Workspace.tsx`
- `production/src/pages/BillingPage.tsx`

Each unit has a `MANIFEST.tsv` mapping original source-map paths and map files
to extracted paths and SHA-256 hashes. Any differing duplicate source would be
preserved under `__conflicts__/`.
