# GIF Crop Lab website

See the [project README](../README.md) for setup, Cloudflare Pages configuration and licensing.

From this directory, use Node.js 22.22.1, run `npm ci`, then `npm run build`.
Deploy `dist/`. Python is only needed for the optional local publication check:

```sh
python scripts/check-release.py
```

The check validates metadata, static references, icons, original notices and the downloadable Gifsicle source archive. Online routing, HTTPS, DNS, Cloudflare response headers and real mobile downloads require separate deployment checks.
