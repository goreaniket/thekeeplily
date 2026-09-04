# Owner catalogue setup

Create a Google Sheet tab named `Product Catalogue`. The first row must contain the product field names from `lib/catalog.ts`; every following row is one product. Use `|` between multiple images, colours, sizes, variants, customisation options, labels, and tags. Use JSON for `variantPricing`.

Deploy `integrations/google-apps-script.js` as a Google Apps Script Web App. Set a Script Property named `CATALOG_TOKEN`, then save the private Web App URL including `?token=...` as the server-only `GOOGLE_SHEETS_API_URL`. Never place that URL or token in browser code.

The website calls `/api/catalog`, so Google Sheets can later be replaced by another database without changing the storefront components.
