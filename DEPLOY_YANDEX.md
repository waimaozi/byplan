# Deploy to Yandex Object Storage (byplan.ru)

This repo is a static site. You only need to upload the site files (no build).

## 1) What to upload
Upload the following from the repo root:
- `index.html`
- `404.html`
- `robots.txt`
- `assets/` (all files inside)

Do not upload: `node_modules/`, `hotel-ai-landing/`, `.git/`.

## 2) Buckets
Create two buckets:

### Primary domain
- Bucket name: `byplan.ru` (must match the domain exactly).
- Public access: allow public read for objects and list.
- Encryption: **disabled** (static hosting does not work with bucket encryption).
- Website hosting:
  - Index document: `index.html`
  - Error document: `404.html`

### www domain (redirect)
- Bucket name: `www.byplan.ru`
- Public access: allow public read for objects and list.
- Website hosting: **Redirect all requests** to `byplan.ru` with protocol `https`.

## 3) DNS records
You need to point the domains to Object Storage website endpoints.

For the root domain (`byplan.ru`):
- Prefer **ANAME/ALIAS** record to:
  - `byplan.ru.website.yandexcloud.net`
- If your DNS provider does not support ANAME/ALIAS, use Yandex Cloud DNS (it supports ANAME for second‑level domains).

For `www.byplan.ru`:
- **CNAME** to:
  - `www.byplan.ru.website.yandexcloud.net`

Notes:
- Object Storage website endpoints are in the form:
  - `https://<bucket_name>.website.yandexcloud.net`
- A CNAME on a second‑level root domain is usually not allowed by DNS providers, hence ANAME/ALIAS.

## 4) HTTPS (Certificate Manager)
Buckets with dots in the name require a custom certificate for HTTPS.

Steps:
1. In Yandex Certificate Manager, issue or import a certificate for:
   - `byplan.ru`
   - `www.byplan.ru`
2. In Object Storage → bucket settings → HTTPS, attach the certificate to each bucket.
3. HTTP → HTTPS redirect is enabled automatically after HTTPS is configured.

## 5) Optional: CDN
If you want CDN caching:
1. Create a Cloud CDN resource with the Object Storage website endpoint as the origin.
2. Set the primary CDN domain to `byplan.ru` (and optionally `www.byplan.ru`).
3. In DNS, create a CNAME from `byplan.ru` to the CDN provider domain (looks like `*.topology.gslb.yccdn.ru`).
4. Keep the Object Storage buckets as the origin; CDN will cache and serve.

## 6) Quick checklist
- Bucket names match domain names.
- Public access enabled.
- Website hosting enabled with `index.html` and `404.html`.
- DNS records created and propagated.
- Certificates attached for HTTPS.
- Files uploaded: `index.html`, `404.html`, `robots.txt`, `assets/`.

## Useful docs
- Static website hosting: https://yandex.cloud/en/docs/storage/concepts/hosting
- Custom domain: https://yandex.cloud/en/docs/storage/operations/hosting/own-domain
- Setting up hosting: https://yandex.cloud/en/docs/storage/operations/hosting/setup
- CDN with Object Storage: https://yandex.cloud/en/docs/storage/tutorials/cdn-hosting/
