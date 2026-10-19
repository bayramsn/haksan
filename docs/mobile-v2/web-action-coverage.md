# mobile-v2 Web Aksiyon Kapsamı

> Otomatik üretildi — `node scripts/audit-action-parity.mjs --target=mobile-v2`.
> Eşleşme: web servis aksiyonunun HTTP metodu + yolu, `apps/mobile-v2/src/api` içindeki `request()` çağrılarında var mı.

- Web aksiyonu: **345**
- Mobilde karşılığı olan: **332** (%96)
- Eksik: **13**

## Eksikler (namespace bazında)

### `competitor` — 5 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `competitor.create` | POST | `/competitors` | `competitors.create` | — |
| `competitor.createProduct` | POST | `/competitors/:param/products` | `competitors.create` | — |
| `competitor.list` | GET | `/competitors` | `competitors.read` | — |
| `competitor.products` | GET | `/competitors/:param/products` | `competitors.read` | — |
| `competitor.update` | PATCH | `/competitors/:param` | `competitors.update` | — |

### `noteTemplate` — 4 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `noteTemplate.create` | POST | `/note-templates` | — | — |
| `noteTemplate.list` | GET | `/note-templates` | — | — |
| `noteTemplate.remove` | DELETE | `/note-templates/:param` | — | — |
| `noteTemplate.update` | PATCH | `/note-templates/:param` | — | — |

### `publicComplaint` — 4 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `publicComplaint.form` | GET | `/public/service-complaints/:param/:param` | — | — |
| `publicComplaint.signedUpload` | POST | `/public/service-complaints/:param/:param/files/signed-upload-url` | — | PublicServiceComplaint |
| `publicComplaint.submit` | POST | `/public/service-complaints/:param/:param` | — | PublicServiceComplaint |
| `publicComplaint.uploadBinary` | ? | `?` | — | PublicServiceComplaint |

