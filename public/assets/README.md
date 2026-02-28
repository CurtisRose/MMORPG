Asset images referenced by content catalogs.

- Item images: `/assets/items/...`
- Resource images: `/assets/resources/...`

These paths are referenced from:
- `server/data/content/items.json`
- `server/data/content/resources.json`

Server startup validates that each referenced image file exists under `public`.
