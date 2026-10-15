# mobile-v2 Web Aksiyon Kapsamı

> Otomatik üretildi — `node scripts/audit-action-parity.mjs --target=mobile-v2`.
> Eşleşme: web servis aksiyonunun HTTP metodu + yolu, `apps/mobile-v2/src/api` içindeki `request()` çağrılarında var mı.

- Web aksiyonu: **345**
- Mobilde karşılığı olan: **138** (%40)
- Eksik: **207**

## Eksikler (namespace bazında)

### `accessRequest` — 3 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `accessRequest.approve` | POST | `/access-requests/:param/approve` | `companies.update` | — |
| `accessRequest.list` | GET | `/access-requests` | `companies.read` | — |
| `accessRequest.reject` | POST | `/access-requests/:param/reject` | `companies.update` | — |

### `activity` — 2 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `activity.createCall` | POST | `/calls` | `activities.create` | — |
| `activity.createVisit` | POST | `/visits` | `activities.create` | — |

### `admin` — 41 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `admin.auditLogs` | GET | `/audit-logs` | `audit.read` | LookupManagerTab |
| `admin.batchSaveProductSpecTemplates` | PUT | `/admin/product-spec-templates/batch` | — | ProductSpecTemplatesCard |
| `admin.bulkCreateProductSpecTemplates` | POST | `/admin/product-spec-templates/bulk` | — | ProductSpecTemplatesCard |
| `admin.commitTechnicalImport` | POST | `/admin/technical-import/commit` | — | — |
| `admin.createDept` | POST | `/departments` | `departments.create` | DepartmentsPage, DepartmentSettingsCard |
| `admin.createLookup` | POST | `/admin/lookups/:param` | — | LookupImportDialog, LookupManagerTab |
| `admin.createMachineTemplate` | POST | `/admin/machine-templates` | — | — |
| `admin.createProductSpecTemplate` | POST | `/admin/product-spec-templates` | — | — |
| `admin.createRole` | POST | `/roles` | `roles.create` | RolesPage |
| `admin.createUser` | POST | `/users` | `users.create` | — |
| `admin.deleteDept` | DELETE | `/departments/:param` | `departments.delete` | DepartmentSettingsCard |
| `admin.deleteLookup` | DELETE | `/admin/lookups/:param/:param` | — | LookupManagerTab |
| `admin.deleteProductSpecTemplate` | DELETE | `/admin/product-spec-templates/:param` | — | — |
| `admin.deleteUser` | DELETE | `/users/:param` | `users.delete` | UsersPage |
| `admin.departments` | GET | `/departments` | `departments.read` | DepartmentsPage, UsersPage, TargetWorkspace, DepartmentSettingsCard |
| `admin.departmentTargets` | GET | `/department-targets` | `users.read` | DepartmentsPage, TargetWorkspace |
| `admin.divisions` | GET | `/divisions` | `users.read` | UsersPage, TargetWorkspace |
| `admin.divisionTargets` | GET | `/division-targets` | `users.read` | TargetWorkspace |
| `admin.lookupRows` | GET | `/admin/lookups/:param` | — | LookupImportDialog, LookupManagerTab, ProductSpecTemplatesCard |
| `admin.lookups` | GET | `/admin/lookups` | — | — |
| `admin.myTargets` | GET | `/me/targets` | — | — |
| `admin.permissions` | GET | `/permissions` | `roles.read` | RolesPage |
| `admin.previewTechnicalImport` | POST | `/admin/technical-import/preview` | — | — |
| `admin.productSpecTemplates` | GET | `/admin/product-spec-templates` | — | ProductSpecTemplatesCard |
| `admin.reorderLookup` | PATCH | `/admin/lookups/:param/reorder` | — | LookupManagerTab |
| `admin.roles` | GET | `/roles` | `roles.read` | RolesPage, UsersPage |
| `admin.roleTargetMembers` | GET | `/roles/:param/target-members` | `roles.read` | RolesPage |
| `admin.saveDepartmentTarget` | POST | `/departments/:param/targets` | `departments.update` | DepartmentsPage, TargetWorkspace |
| `admin.saveDivisionTarget` | POST | `/divisions/:param/targets` | `divisions.update` | TargetWorkspace |
| `admin.saveRoleTarget` | POST | `/roles/:param/targets` | `roles.update` | RolesPage |
| `admin.saveUserTarget` | POST | `/users/:param/targets` | `users.update` | UsersPage, TargetWorkspace |
| `admin.tenant` | GET | `/tenant` | — | — |
| `admin.unlockUser` | POST | `/users/:param/unlock` | `users.update` | UsersPage |
| `admin.updateDept` | PATCH | `/departments/:param` | `departments.update` | DepartmentSettingsCard |
| `admin.updateLookup` | PATCH | `/admin/lookups/:param/:param` | — | LookupImportDialog, LookupManagerTab |
| `admin.updateProductSpecTemplate` | PATCH | `/admin/product-spec-templates/:param` | — | — |
| `admin.updateRole` | PATCH | `/roles/:param` | `roles.update` | RolesPage |
| `admin.updateTenant` | PATCH | `/tenant` | `tenants.update` | SettingsPage |
| `admin.updateUser` | PATCH | `/users/:param` | `users.update` | UsersPage |
| `admin.users` | GET | `/users` | `users.read` | UsersPage, TargetWorkspace |
| `admin.userTargets` | GET | `/user-targets` | `users.read` | UsersPage, TargetWorkspace |

### `calendar` — 3 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `calendar.importCommit` | POST | `/calendar/import/commit` | `calendar.create` | CalendarPage |
| `calendar.importPreview` | POST | `/calendar/import/preview` | `calendar.create` | CalendarPage |
| `calendar.restore` | POST | `/calendar/events/:param/restore` | `calendar.update` | CalendarPage |

### `chat` — 6 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `chat.addMembers` | POST | `/chat/conversations/:param/members` | — | GroupDialogs |
| `chat.conversation` | GET | `/chat/conversations/:param` | — | ChatPage |
| `chat.removeMember` | DELETE | `/chat/conversations/:param/members/:param` | — | GroupDialogs |
| `chat.setMemberRole` | PATCH | `/chat/conversations/:param/members/:param/role` | — | GroupDialogs |
| `chat.updateGroup` | PATCH | `/chat/conversations/:param` | — | GroupDialogs |
| `chat.webrtcConfig` | GET | `/chat/webrtc-config` | — | — |

### `company` — 4 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `company.commitCompanyContactImport` | POST | `/companies/imports/company-contacts/commit` | — | — |
| `company.osmSearch` | GET | `/companies/osm-search` | `companies.read` | — |
| `company.previewCompanyContactImport` | POST | `/companies/imports/company-contacts/preview` | — | — |
| `company.websiteLookup` | POST | `/companies/website-lookup` | `companies.create` | — |

### `competitor` — 5 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `competitor.create` | POST | `/competitors` | `competitors.create` | — |
| `competitor.createProduct` | POST | `/competitors/:param/products` | `competitors.create` | — |
| `competitor.list` | GET | `/competitors` | `competitors.read` | — |
| `competitor.products` | GET | `/competitors/:param/products` | `competitors.read` | — |
| `competitor.update` | PATCH | `/competitors/:param` | `competitors.update` | — |

### `document` — 11 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `document.createCommercialInvoice` | POST | `/commercial-invoices` | `commercial_invoices.create` | — |
| `document.createContract` | POST | `/contracts` | `contracts.create` | — |
| `document.createProforma` | POST | `/proformas` | `proformas.create` | — |
| `document.deleteCommercialInvoice` | DELETE | `/commercial-invoices/:param` | `commercial_invoices.delete` | DocumentsPage |
| `document.deleteContract` | DELETE | `/contracts/:param` | `contracts.delete` | DocumentsPage |
| `document.deleteProforma` | DELETE | `/proformas/:param` | `proformas.delete` | DocumentsPage |
| `document.updateCommercialInvoice` | PATCH | `/commercial-invoices/:param` | `commercial_invoices.update` | — |
| `document.updateContract` | PATCH | `/contracts/:param` | `contracts.update` | — |
| `document.updateProforma` | PATCH | `/proformas/:param` | `proformas.update` | — |
| `document.updateStandaloneContract` | PATCH | `/contracts/standalone/:param` | `contracts.update` | — |
| `document.updateStandaloneProforma` | PATCH | `/proformas/standalone/:param` | `proformas.update` | — |

### `file` — 2 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `file.links` | GET | `/files/links` | `files.read` | TradeFairsPage |
| `file.uploadBinary` | ? | `?` | — | TradeFairsPage, ChatPage, PaymentsPage, ServicePages, LookupManagerTab |

### `finance` — 7 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `finance.companyStatement` | GET | `/companies/:param/statement` | `receivables.read` | CustomerBalancesPage |
| `finance.createAccountingInvoice` | POST | `/accounting-invoices` | `accounting_invoices.create` | CreateAccountingInvoiceDialog |
| `finance.deleteAccountingInvoice` | DELETE | `/accounting-invoices/:param` | `accounting_invoices.delete` | AccountingInvoicesPage |
| `finance.deletePayment` | DELETE | `/payments/:param` | `payments.delete` | PaymentsPage |
| `finance.paymentTermSuggestion` | GET | `/accounting-invoices/payment-term-suggestion` | `accounting_invoices.read` | — |
| `finance.updateAccountingInvoice` | PATCH | `/accounting-invoices/:param` | `accounting_invoices.update` | CreateAccountingInvoiceDialog |
| `finance.updatePayment` | PATCH | `/payments/:param` | `payments.update` | PaymentsPage |

### `inventory` — 5 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `inventory.consumeServiceParts` | POST | `/inventory/consume-service-parts` | `inventory.update` | ServicePages |
| `inventory.create` | POST | `/inventory` | `inventory.create` | — |
| `inventory.createCustomerDevice` | POST | `/customer-devices` | `customer_devices.update` | — |
| `inventory.createWarehouse` | POST | `/warehouses` | `warehouses.create` | — |
| `inventory.sell` | PATCH | `/inventory/:param/sell` | `inventory.update` | — |

### `leadAssignmentRule` — 4 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `leadAssignmentRule.create` | POST | `/lead-assignment-rules` | — | LeadAssignmentRulesCard |
| `leadAssignmentRule.list` | GET | `/lead-assignment-rules` | — | LeadAssignmentRulesCard |
| `leadAssignmentRule.remove` | DELETE | `/lead-assignment-rules/:param` | — | LeadAssignmentRulesCard |
| `leadAssignmentRule.update` | PATCH | `/lead-assignment-rules/:param` | — | LeadAssignmentRulesCard |

### `lookup` — 2 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `lookup.available` | GET | `/lookups` | — | — |
| `lookup.taxOffices` | GET | `/lookups/tax-offices` | — | — |

### `mail` — 7 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `mail.connect` | PUT | `/mail/account` | — | MailAccountSettings |
| `mail.disconnect` | DELETE | `/mail/account` | — | MailAccountSettings |
| `mail.saveSignature` | PUT | `/mail/signature/image` | — | MailAccountSettings |
| `mail.saveUserSignature` | PUT | `/mail/signature/users/:param` | — | AdminMailSignatureSettings |
| `mail.signature` | PUT | `/mail/signature` | — | MailAccountSettings |
| `mail.signatureUsers` | GET | `/mail/signature/users` | — | AdminMailSignatureSettings |
| `mail.userSignature` | GET | `/mail/signature/users/:param` | — | AdminMailSignatureSettings |

### `noteTemplate` — 4 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `noteTemplate.create` | POST | `/note-templates` | — | — |
| `noteTemplate.list` | GET | `/note-templates` | — | — |
| `noteTemplate.remove` | DELETE | `/note-templates/:param` | — | — |
| `noteTemplate.update` | PATCH | `/note-templates/:param` | — | — |

### `opportunity` — 7 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `opportunity.changeStage` | PATCH | `/opportunities/:param/stage` | `opportunities.update` | — |
| `opportunity.commitTrelloImport` | POST | `/opportunities/imports/trello/commit` | `opportunities.create` | — |
| `opportunity.createFromActivity` | POST | `/opportunities/from-activity/:param` | `activities.convert` | — |
| `opportunity.leadSummary` | GET | `/opportunities/lead-summary` | `opportunities.read` | — |
| `opportunity.linkCompany` | POST | `/opportunities/:param/company` | — | SalesCaseDetail |
| `opportunity.previewTrelloImport` | POST | `/opportunities/imports/trello/preview` | `opportunities.create` | — |
| `opportunity.recordContact` | POST | `/opportunities/:param/contact-events` | `opportunities.update` | — |

### `product` — 22 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `product.addEquipment` | POST | `/products/:param/equipment` | `products.update` | — |
| `product.addOptionSet` | POST | `/products/:param/options` | `products.update` | — |
| `product.addOptionValue` | POST | `/products/options/:param/values` | `products.update` | — |
| `product.addSpec` | POST | `/products/:param/specs` | `product_specs.create` | — |
| `product.archiveOptionSet` | DELETE | `/products/options/:param` | `products.update` | — |
| `product.archiveOptionValue` | DELETE | `/products/options/values/:param` | `products.update` | — |
| `product.commitImport` | POST | `/products/import/commit` | `products.create` | — |
| `product.create` | POST | `/products` | `products.create` | — |
| `product.createBrand` | POST | `/brands` | `brands.create` | — |
| `product.createPriceList` | POST | `/price-lists` | `price_lists.create` | — |
| `product.createPriceListItem` | POST | `/price-lists/:param/items` | `price_lists.create` | PriceLists |
| `product.equipment` | GET | `/products/:param/equipment` | `products.read` | — |
| `product.listBrands` | GET | `/brands` | `brands.read` | LaserProfilesPanel, ProductSpecTemplatesCard |
| `product.previewImport` | POST | `/products/import/preview` | `products.create` | — |
| `product.remove` | DELETE | `/products/:param` | `products.delete` | — |
| `product.replaceDetails` | PUT | `/products/:param/details` | `products.update` | — |
| `product.specs` | GET | `/products/:param/specs` | `product_specs.read` | — |
| `product.specTemplates` | GET | `/product-spec-templates` | `products.read` | — |
| `product.updateOptionSet` | PATCH | `/products/options/:param` | `products.update` | — |
| `product.updateOptionValue` | PATCH | `/products/options/values/:param` | `products.update` | — |
| `product.updatePriceList` | PATCH | `/price-lists/:param` | `price_lists.update` | — |
| `product.updateStandardEquipment` | PUT | `/products/:param/standard-equipment` | `products.update` | — |

### `publicComplaint` — 4 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `publicComplaint.form` | GET | `/public/service-complaints/:param/:param` | — | — |
| `publicComplaint.signedUpload` | POST | `/public/service-complaints/:param/:param/files/signed-upload-url` | — | PublicServiceComplaint |
| `publicComplaint.submit` | POST | `/public/service-complaints/:param/:param` | — | PublicServiceComplaint |
| `publicComplaint.uploadBinary` | ? | `?` | — | PublicServiceComplaint |

### `purchaseOrder` — 4 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `purchaseOrder.addItem` | POST | `/purchase-orders/:param/items` | `purchase_orders.update` | PurchaseOrdersPage |
| `purchaseOrder.create` | POST | `/purchase-orders` | `purchase_orders.create` | PurchaseOrdersPage |
| `purchaseOrder.remove` | DELETE | `/purchase-orders/:param` | `purchase_orders.delete` | PurchaseOrdersPage |
| `purchaseOrder.update` | PATCH | `/purchase-orders/:param` | `purchase_orders.update` | — |

### `quote` — 8 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `quote.addItem` | POST | `/quotes/:param/items` | `quotes.update` | — |
| `quote.approvePrice` | POST | `/quotes/:param/price-approval/approve` | `quotes.approve` | SalesCaseDetail, OffersPage |
| `quote.create` | POST | `/quotes` | `quotes.create` | — |
| `quote.deleteItem` | DELETE | `/quotes/:param/items/:param` | `quotes.update` | — |
| `quote.rejectPrice` | POST | `/quotes/:param/price-approval/reject` | `quotes.reject` | SalesCaseDetail, OffersPage |
| `quote.terms` | PUT | `/quotes/:param/terms` | `quotes.update` | — |
| `quote.update` | PATCH | `/quotes/:param` | `quotes.update` | — |
| `quote.updateItem` | PATCH | `/quotes/:param/items/:param` | `quotes.update` | — |

### `reference` — 5 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `reference.create` | POST | `/references` | `companies.create` | ReferencesPage |
| `reference.importFile` | POST | `/references/import` | `companies.create` | — |
| `reference.list` | GET | `/references` | `companies.read` | ReferencesPage |
| `reference.remove` | DELETE | `/references/:param` | `companies.delete` | ReferencesPage |
| `reference.update` | PATCH | `/references/:param` | `companies.update` | ReferencesPage |

### `report` — 15 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `report.departmentPerformance` | GET | `/reports/department-performance` | `reports.read` | — |
| `report.downloadYearEnd` | ? | `?` | — | — |
| `report.monthlyActivities` | GET | `/reports/monthly-activities` | `reports.read` | — |
| `report.monthlyQuotes` | GET | `/reports/monthly-quotes-by-product` | `reports.read` | — |
| `report.monthlyVisits` | GET | `/reports/monthly-visits` | `reports.read` | — |
| `report.myTargetProgress` | GET | `/reports/my-target-progress` | — | Dashboard, TargetWorkspace |
| `report.operational` | GET | `/reports/operational` | `reports.read` | OperationalReport |
| `report.teamActivityDetails` | GET | `/reports/team-activity/details` | — | — |
| `report.warrantyExpiring` | GET | `/reports/warranty-expiring` | `reports.read` | — |
| `report.weeklyActivities` | GET | `/reports/weekly-activities` | `reports.read` | — |
| `report.weeklyQuotes` | GET | `/reports/weekly-quotes-by-product` | `reports.read` | — |
| `report.weeklyVisits` | GET | `/reports/weekly-visits` | `reports.read` | — |
| `report.yearEnd` | GET | `/reports/year-end` | `reports.read` | — |
| `report.yearlyActivities` | GET | `/reports/yearly-activities` | `reports.read` | — |
| `report.yearlyVisits` | GET | `/reports/yearly-visits` | `reports.read` | — |

### `salesOrder` — 4 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `salesOrder.addItem` | POST | `/sales-orders/:param/items` | `sales_orders.update` | — |
| `salesOrder.create` | POST | `/sales-orders` | `sales_orders.create` | — |
| `salesOrder.remove` | DELETE | `/sales-orders/:param` | `sales_orders.delete` | — |
| `salesOrder.update` | PATCH | `/sales-orders/:param` | `sales_orders.update` | — |

### `service` — 20 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `service.approveWarranty` | POST | `/service-tickets/:param/warranty/approve` | `service_tickets.approve` | — |
| `service.complaintLinks` | GET | `/service-complaint-links` | `service_tickets.read` | ServicePages |
| `service.createComplaint` | POST | `/service-complaints` | `service_tickets.create` | ServicePages |
| `service.createComplaintLink` | POST | `/service-complaint-links` | `service_tickets.create` | ServicePages |
| `service.createDelivery` | POST | `/deliveries` | `shipments.create` | — |
| `service.createInstallation` | POST | `/installations` | `installations.create` | — |
| `service.createShipment` | POST | `/shipments` | `shipments.create` | — |
| `service.deleteDelivery` | DELETE | `/deliveries/:param` | `shipments.update` | — |
| `service.deleteInstallation` | DELETE | `/installations/:param` | `installations.delete` | InstallationsPage |
| `service.deleteMaintenancePlan` | DELETE | `/maintenance-plans/:param` | `service_tickets.delete` | MaintenancePlanPanel |
| `service.deleteShipment` | DELETE | `/shipments/:param` | `shipments.update` | — |
| `service.deliveries` | GET | `/deliveries` | `shipments.read` | — |
| `service.openServiceFormPdf` | ? | `?` | — | ServicePages |
| `service.rejectWarranty` | POST | `/service-tickets/:param/warranty/reject` | `service_tickets.reject` | — |
| `service.revokeComplaintLink` | PATCH | `/service-complaint-links/:param/revoke` | `service_tickets.update` | ServicePages |
| `service.rotateComplaintLink` | PATCH | `/service-complaint-links/:param/rotate` | `service_tickets.update` | ServicePages |
| `service.shipmentCompanyOptions` | GET | `/shipments/company-options` | `shipments.read` | — |
| `service.updateDelivery` | PATCH | `/deliveries/:param` | `shipments.update` | — |
| `service.updateDeliveryStatus` | PATCH | `/deliveries/:param/status` | `shipments.update` | — |
| `service.updateInstallation` | PATCH | `/installations/:param` | `installations.update` | InstallationsPage |

### `signature` — 3 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `signature.create` | POST | `/signatures` | — | SignatureSettingsCard |
| `signature.remove` | DELETE | `/signatures/:param` | — | SignatureSettingsCard |
| `signature.update` | PATCH | `/signatures/:param` | — | SignatureSettingsCard |

### `tasks` — 3 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `tasks.events` | GET | `/tasks/events` | `tasks.read` | — |
| `tasks.remove` | DELETE | `/tasks/:param` | `tasks.delete` | TaskDetailPanel |
| `tasks.summary` | GET | `/tasks/summary` | — | DashboardTasksPanel, TasksPage |

### `tradeFair` — 6 eksik

| Aksiyon | HTTP | Yol | İzin | Web sayfaları |
|---|---|---|---|---|
| `tradeFair.create` | POST | `/trade-fairs` | `trade_fairs.create` | TradeFairsPage |
| `tradeFair.list` | GET | `/trade-fairs` | `trade_fairs.read` | TradeFairsPage |
| `tradeFair.remove` | DELETE | `/trade-fairs/:param` | `trade_fairs.delete` | TradeFairsPage |
| `tradeFair.staff` | GET | `/trade-fairs/staff` | `trade_fairs.read` | TradeFairsPage |
| `tradeFair.summary` | GET | `/trade-fairs/summary` | `trade_fairs.read` | TradeFairsPage |
| `tradeFair.update` | PATCH | `/trade-fairs/:param` | `trade_fairs.update` | TradeFairsPage |

