# Yardly web app

Yardly is a marketplace for discovering and booking private backyards, pools, gardens, patios, and other outdoor spaces by the hour.

The production scope and completion criteria live in [PROJECT_SCOPE.md](PROJECT_SCOPE.md). The iOS wrapper remains in this repository, but current product work and automated quality checks target the web app under `src/`.

## Local development

1. Copy `.env.example` to `.env.local` and provide the Yardly Supabase public URL and publishable key.
2. Install dependencies with `npm ci`.
3. Run `npm run dev` and open `http://localhost:3000`.

## Required checks

```bash
npm run lint
npm run build
npm run quality
npm audit --omit=dev --audit-level=high
```

Netlify builds the static export from `out/` using the settings in `netlify.toml`.
