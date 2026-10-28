# Mobile Parity Gaps

> Otomatik üretildi. Web servislerinde olup mobil servislerinde **bulunmayan** action key'leri.
> Bu liste sıfırlanana kadar mobil "parite" hedefine ulaşmış sayılmaz.

- Web aksiyonu: **333**
- Mobil aksiyon: **238**
- Eksik (mobile'de yok): **100**

## Eksikler (namespace bazında)

### `activity` — 2 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `activity.remove` | DELETE | `/activities/:param` | `activities.delete` |
| `activity.update` | PATCH | `/activities/:param` | `activities.update` |

### `admin` — 21 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.batchSaveProductSpecTemplates` | PUT | `/admin/product-spec-templates/batch` | — |
| `admin.bulkCreateProductSpecTemplates` | POST | `/admin/product-spec-templates/bulk` | — |
| `admin.commitTechnicalImport` | POST | `/admin/technical-import/commit` | — |
| `admin.createLookup` | POST | `/admin/lookups/:param` | — |
| `admin.createMachineTemplate` | POST | `/admin/machine-templates` | — |
| `admin.createProductSpecTemplate` | POST | `/admin/product-spec-templates` | — |
| `admin.deleteDept` | DELETE | `/departments/:param` | `departments.delete` |
| `admin.deleteLookup` | DELETE | `/admin/lookups/:param/:param` | — |
| `admin.deleteProductSpecTemplate` | DELETE | `/admin/product-spec-templates/:param` | — |
| `admin.divisionTargets` | GET | `/division-targets` | `users.read` |
| `admin.lookupRows` | GET | `/admin/lookups/:param` | — |
| `admin.lookups` | GET | `/admin/lookups` | — |
| `admin.previewTechnicalImport` | POST | `/admin/technical-import/preview` | — |
| `admin.productSpecTemplates` | GET | `/admin/product-spec-templates` | — |
| `admin.reorderLookup` | PATCH | `/admin/lookups/:param/reorder` | — |
| `admin.roleTargetMembers` | GET | `/roles/:param/target-members` | `roles.read` |
| `admin.saveDivisionTarget` | POST | `/divisions/:param/targets` | `divisions.update` |
| `admin.saveRoleTarget` | POST | `/roles/:param/targets` | `roles.update` |
| `admin.unlockUser` | POST | `/users/:param/unlock` | `users.update` |
| `admin.updateLookup` | PATCH | `/admin/lookups/:param/:param` | — |
| `admin.updateProductSpecTemplate` | PATCH | `/admin/product-spec-templates/:param` | — |

### `chat` — 1 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `chat.webrtcConfig` | GET | `/chat/webrtc-config` | — |

### `company` — 5 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `company.commitCompanyContactImport` | POST | `/companies/imports/company-contacts/commit` | — |
| `company.osmSearch` | GET | `/companies/osm-search` | `companies.read` |
| `company.previewCompanyContactImport` | POST | `/companies/imports/company-contacts/preview` | — |
| `company.summary` | GET | `/companies/summary` | `companies.read` |
| `company.websiteLookup` | POST | `/companies/website-lookup` | `companies.create` |

### `contact` — 1 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `contact.summary` | GET | `/contacts/summary` | `contacts.read` |

### `document` — 2 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `document.updateStandaloneContract` | PATCH | `/contracts/standalone/:param` | `contracts.update` |
| `document.updateStandaloneProforma` | PATCH | `/proformas/standalone/:param` | `proformas.update` |

### `finance` — 1 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `finance.paymentTermSuggestion` | GET | `/accounting-invoices/payment-term-suggestion` | `accounting_invoices.read` |

### `leadAssignmentRule` — 4 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `leadAssignmentRule.create` | POST | `/lead-assignment-rules` | — |
| `leadAssignmentRule.list` | GET | `/lead-assignment-rules` | — |
| `leadAssignmentRule.remove` | DELETE | `/lead-assignment-rules/:param` | — |
| `leadAssignmentRule.update` | PATCH | `/lead-assignment-rules/:param` | — |

### `lookup` — 2 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `lookup.available` | GET | `/lookups` | — |
| `lookup.taxOffices` | GET | `/lookups/tax-offices` | — |

### `mail` — 4 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `mail.account` | GET | `/mail/account` | — |
| `mail.connect` | PUT | `/mail/account` | — |
| `mail.disconnect` | DELETE | `/mail/account` | — |
| `mail.send` | POST | `/mail/send` | — |

### `notification` — 1 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `notification.respond` | POST | `/notifications/:param/respond` | — |

### `opportunity` — 11 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `opportunity.assignees` | GET | `/opportunities/assignees` | `opportunities.read` |
| `opportunity.changeQualificationStage` | PATCH | `/opportunities/:param/qualification-stage` | `opportunities.update` |
| `opportunity.commitTrelloImport` | POST | `/opportunities/imports/trello/commit` | `opportunities.create` |
| `opportunity.convert` | POST | `/opportunities/:param/convert` | `opportunities.update` |
| `opportunity.createFromActivity` | POST | `/opportunities/from-activity/:param` | `activities.convert` |
| `opportunity.decideApproval` | POST | `/opportunities/:param/approvals/:param` | `opportunities.approve` |
| `opportunity.defer` | POST | `/opportunities/:param/defer` | `opportunities.update` |
| `opportunity.leadSummary` | GET | `/opportunities/lead-summary` | `opportunities.read` |
| `opportunity.linkCompany` | POST | `/opportunities/:param/company` | — |
| `opportunity.previewTrelloImport` | POST | `/opportunities/imports/trello/preview` | `opportunities.create` |
| `opportunity.recordContact` | POST | `/opportunities/:param/contact-events` | `opportunities.update` |

### `product` — 1 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `product.specTemplates` | GET | `/product-spec-templates` | `products.read` |

### `publicComplaint` — 1 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `publicComplaint.uploadBinary` | ? | `?` | — |

### `quote` — 3 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `quote.approvePrice` | POST | `/quotes/:param/price-approval/approve` | `quotes.approve` |
| `quote.changeStatus` | POST | `/quotes/:param/status` | `quotes.update` |
| `quote.rejectPrice` | POST | `/quotes/:param/price-approval/reject` | `quotes.reject` |

### `reference` — 5 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `reference.create` | POST | `/references` | `companies.create` |
| `reference.importFile` | POST | `/references/import` | `companies.create` |
| `reference.list` | GET | `/references` | `companies.read` |
| `reference.remove` | DELETE | `/references/:param` | `companies.delete` |
| `reference.update` | PATCH | `/references/:param` | `companies.update` |

### `report` — 5 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `report.monthlyActivities` | GET | `/reports/monthly-activities` | `reports.read` |
| `report.myTargetProgress` | GET | `/reports/my-target-progress` | — |
| `report.teamActivityDetails` | GET | `/reports/team-activity/details` | — |
| `report.weeklyActivities` | GET | `/reports/weekly-activities` | `reports.read` |
| `report.yearlyActivities` | GET | `/reports/yearly-activities` | `reports.read` |

### `service` — 11 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `service.completeMaintenancePlan` | POST | `/maintenance-plans/:param/complete` | `service_tickets.update` |
| `service.createMaintenancePlan` | POST | `/maintenance-plans` | `service_tickets.create` |
| `service.deleteDelivery` | DELETE | `/deliveries/:param` | `shipments.update` |
| `service.deleteMaintenancePlan` | DELETE | `/maintenance-plans/:param` | `service_tickets.delete` |
| `service.deleteShipment` | DELETE | `/shipments/:param` | `shipments.update` |
| `service.maintenancePlans` | GET | `/maintenance-plans` | `service_tickets.read` |
| `service.openServiceFormPdf` | ? | `?` | — |
| `service.rotateComplaintLink` | PATCH | `/service-complaint-links/:param/rotate` | `service_tickets.update` |
| `service.shipmentCompanyOptions` | GET | `/shipments/company-options` | `shipments.read` |
| `service.startShipment` | POST | `/shipments/:param/start` | `shipments.update` |
| `service.updateMaintenancePlan` | PATCH | `/maintenance-plans/:param` | `service_tickets.update` |

### `signature` — 3 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `signature.create` | POST | `/signatures` | — |
| `signature.remove` | DELETE | `/signatures/:param` | — |
| `signature.update` | PATCH | `/signatures/:param` | — |

### `tasks` — 10 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `tasks.assignees` | GET | `/tasks/assignees` | `tasks.read` |
| `tasks.comment` | POST | `/tasks/:param/comments` | `tasks.update` |
| `tasks.counts` | GET | `/tasks/counts` | `tasks.read` |
| `tasks.create` | POST | `/tasks` | `tasks.create` |
| `tasks.events` | GET | `/tasks/events` | `tasks.read` |
| `tasks.get` | GET | `/tasks/:param` | `tasks.read` |
| `tasks.list` | GET | `/tasks` | `tasks.read` |
| `tasks.remove` | DELETE | `/tasks/:param` | `tasks.delete` |
| `tasks.summary` | GET | `/tasks/summary` | — |
| `tasks.update` | PATCH | `/tasks/:param` | `tasks.update` |

### `tradeFair` — 6 eksik

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `tradeFair.create` | POST | `/trade-fairs` | `trade_fairs.create` |
| `tradeFair.list` | GET | `/trade-fairs` | `trade_fairs.read` |
| `tradeFair.remove` | DELETE | `/trade-fairs/:param` | `trade_fairs.delete` |
| `tradeFair.staff` | GET | `/trade-fairs/staff` | `trade_fairs.read` |
| `tradeFair.summary` | GET | `/trade-fairs/summary` | `trade_fairs.read` |
| `tradeFair.update` | PATCH | `/trade-fairs/:param` | `trade_fairs.update` |

## Sadece mobilde tanımlı aksiyonlar

> Bunlar mobil-specific akışlar (örn. çağrı asistanı) veya web tarafına eklenmesi gereken parite borcudur.

| Action key | HTTP | Path |
|---|---|---|
| `auth.logout` | POST | `/auth/logout` |
| `auth.me` | GET | `/auth/me` |
| `notification.registerPushToken` | POST | `/notifications/push-token` |
| `quote.openPdf` | ? | `?` |
| `report.targetProgress` | GET | `/reports/target-progress` |

