# FitQuest — Vite Edition

FitQuest is a mobile-first fitness RPG built with vanilla JavaScript ES modules and Vite.

## Requirements

- Node.js 20.19+ or 22.12+
- npm

## Development

```bash
npm install
npm run dev
```

Vite will print the local address. The dev server is configured with `--host 0.0.0.0`, so it can also be opened from another device on the same network when your environment permits it.

## Production build

```bash
npm run build
npm run preview
```

The production bundle is written to `dist/`.

## Project structure

```text
fitquest-vite/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
└── src/
    ├── app.js
    ├── styles.css
    ├── data/
    │   └── defaultData.js
    └── lib/
        ├── achievements.js
        ├── nutrition.js
        ├── progression.js
        └── storage.js
```

## Save compatibility

The conversion intentionally preserves the existing localStorage key (`fitquest-save-v1`). Running this version on the same origin/host preserves compatible FitQuest saves already stored by the browser.

Note: browser localStorage is origin-specific. If the hostname or port changes, the browser may treat it as a different storage origin even though the app uses the same key.

## Nutrition search

Online nutrition lookup still uses Open Food Facts from the browser. Internet access and browser CORS/network policies therefore apply.
