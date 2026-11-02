# GIF Crop Lab

A browser-local animated GIF cropper. Selected GIFs are processed on the user's device.

Website: https://gifcroplab.com/

## Development and build

Use Node.js 22.22.1. From `web/`:

```sh
npm ci
npm run dev
npm run build
npm run preview
```

The production output is `web/dist/`. Chrome and Edge on desktop have been tested; real mobile devices and other browsers still require validation.

## Cloudflare Pages

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | `web` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable | `NODE_VERSION=22.22.1` |

After deployment, check HTTPS, domain redirects, an unknown path returning HTTP 404, and an actual GIF crop/download. The first Cloudflare dependency installation and build still require verification.

## License and source

Copyright (C) 2026 TangTang001. Original GIF Crop Lab website code is licensed under **GPL-2.0-only**; see [LICENSE](LICENSE). Third-party components retain their original copyrights and licenses.

Third-party notices are in `web/public/licenses/` and the website's `/licenses/` page. Gifsicle C source, browser build scripts, wrapper source and provenance are supplied in [the source archive](web/public/source/gifsicle-1.92-source.zip); see [source notes](web/public/source/README.txt) and [checksums](web/public/source/provenance.json).

Development research, prototypes, historical acceptance reports and test datasets are kept locally and are not part of the current release tree. Git history has not been rewritten.
