# Theme configuration

Each `*.env` file in this folder captures a complete brand identity.
The values are not loaded automatically — they're a paste-ready
reference for what to set in Vercel + Railway when deploying a
brand-specific instance of the platform.

## How brand abstraction works

The codebase has two configuration entry points:

- **Frontend**: [frontend/src/config/brand.ts](../frontend/src/config/brand.ts) reads `NEXT_PUBLIC_BRAND_*` env vars (baked at build time on Vercel).
- **Backend**: [backend/src/main/java/com/spire/backend/config/BrandConfig.java](../backend/src/main/java/com/spire/backend/config/BrandConfig.java) reads `BRAND_*` env vars via Spring `@Value`.

Both default to the original Spire Info Tech values, so a build with no overrides is byte-equivalent to pre-refactor.

## Deploying a new brand

1. **Pick a theme file.** Start from `spire.env` (the defaults) and edit, or use the `sage.env` template and fill in the `# FIXME` slots.
2. **Set frontend env vars** in Vercel → Project Settings → Environment Variables. Every line that starts with `NEXT_PUBLIC_BRAND_*` belongs here.
3. **Set backend env vars** in Railway → Variables. Every line that starts with `BRAND_*` belongs here.
4. **Drop in the brand assets:**
   - Frontend logo → `frontend/public/<your-logo>.png`, then set `NEXT_PUBLIC_BRAND_LOGO_URL=/<your-logo>.png`.
   - Backend letterhead → `backend/src/main/resources/templates/<your-letterhead>.pdf`, then set `BRAND_LETTERHEAD_PATH=templates/<your-letterhead>.pdf`.
5. **Redeploy** both Vercel and Railway.

No code changes required.

## Available themes

| File | Brand | Status |
|------|-------|--------|
| `spire.env` | Spire Info Tech | Live (default values match the codebase) |
| `sage.env` | Sage IT Consulting | Template — fill in `# FIXME` slots before use |

Add a new theme by copying `spire.env`, renaming, and editing.
