# Product catalogue import

The CSV templates in `supabase/templates/` are blank by design. No demo product rows are included.

- `products.template.csv` has the importable columns from `public.products`. Database-generated `id`, `created_at`, and `updated_at` are omitted.
- `product-images.template.csv` matches `public.product_images`. Upload each real product image to the `product-images` Storage bucket first, then use its exact storage path and product UUID here.
- `categories.reference.csv` lists the six active category IDs read from the configured Supabase project on 2026-10-31. These UUIDs are project-specific; refresh them from `public.categories` before importing to another project or after a database reset.

## Required owner data

Provide one row per real product. Fill every non-null field in the template: `category_id`, unique `slug`, `name`, `price`, `currency`, actual `stock_quantity`, `track_inventory`, `allow_backorder`, `status`, the four merchandising/customisation flags, `customisation_charge`, `variants`, and `tags`. Use only `draft`, `active`, or `archived` for `status`; keep unverified products as drafts. Boolean values must be `true` or `false`. Do not mark a product active until its actual product-specific images have been uploaded and recorded.

`currency` must be `INR` for checkout. Sale price is optional; when approved, it must be non-negative and no greater than `price`. Optional descriptions, SKU, materials, dimensions, weight, preparation time, care instructions, and SEO text may be left blank. A blank included cell is `NULL`, not a request for the database default.

`variants` must be valid JSON: use `[]` when the product has no options, or objects such as `[{"name":"Small","price_adjustment":0}]`; any adjustment must be owner-approved and agree with the displayed and charged price. `tags` must use PostgreSQL text-array syntax, such as `{}` or `{"birthday","keepsake"}`. Use the same CSV escaping rules as any comma-containing spreadsheet value.

Do not use an empty cell or a database default as a substitute for an unknown stock quantity or price. Review each row against the database constraints before importing. Keep products as drafts until all details and images are verified.

## Still needed before accepting orders

The hosted public catalogue currently has no active product rows. The private source sheet and its image files were not available through the tools exposed to this session, so this template is not populated. The checkout pricing gate must remain false until the owner approves delivery destinations and charges, GST treatment, and cancellation/refund/abandoned-order stock rules, and the server-side order total implements those decisions.
