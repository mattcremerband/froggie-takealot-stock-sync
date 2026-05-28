# Froggie to Takealot Stock Sync

Small Node.js CLI for reading Froggie CSV stock exports and PATCHing Takealot offer stock by SKU.

## Run

```bash
TAKEALOT_API_KEY="your-api-key" npm run sync -- --csv "C:\Users\USER-PC\Downloads\Shopify.csv"
```

Dry-run mode prints the planned payloads and does not call Takealot:

```bash
npm run sync -- --csv "C:\Users\USER-PC\Downloads\Shopify.csv" --dry-run
```

## Environment

- `TAKEALOT_API_KEY`: required unless `--dry-run` is used.
- `TAKEALOT_BASE_URL`: defaults to `https://marketplace-api.takealot.com/v1`.
- `TAKEALOT_SELLER_WAREHOUSE_ID`: defaults to `60143`.
- `TAKEALOT_CONCURRENCY`: defaults to `3`.

## CSV Rules

The reader uses fixed 1-based column positions, not header names:

- `Handle`: column `1`
- `Option1 Value`: column `3`
- `23 Harden Avenue`: column `8`

SKU is `trim(Handle) + trim(Option1 Value)`, except blank or `None` option values are skipped.

Quantity is read from column `8`, then reduced by `1` as a stock buffer. The quantity never goes below `0`.
