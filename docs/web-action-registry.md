# Web Action Registry

> Otomatik üretildi — `node scripts/audit-action-parity.mjs`.
> Her aksiyon `<namespace>.<method>` formundadır ve `apps/web/src/lib/services.ts` ile API controller permission key'i ile eşleşir.

- Toplam web aksiyonu: **333**
- Tarana sayfa: **51**

## Namespace özeti

| Namespace | Aksiyon sayısı | Permission key örneği |
|---|---:|---|
| `accessRequest` | 3 | `companies.read` |
| `activity` | 6 | `activities.read` |
| `admin` | 41 | `users.read` |
| `auth` | 2 | `—` |
| `calendar` | 8 | `calendar.read` |
| `chat` | 16 | `—` |
| `company` | 10 | `companies.read` |
| `competitor` | 5 | `competitors.read` |
| `contact` | 6 | `contacts.read` |
| `document` | 14 | `proformas.read` |
| `file` | 6 | `files.create` |
| `finance` | 18 | `receivables.read` |
| `inventory` | 14 | `warehouses.read` |
| `leadAssignmentRule` | 4 | `—` |
| `lookup` | 3 | `—` |
| `mail` | 4 | `—` |
| `noteTemplate` | 4 | `—` |
| `notification` | 3 | `—` |
| `opportunity` | 17 | `opportunities.read` |
| `product` | 24 | `brands.read` |
| `publicComplaint` | 4 | `—` |
| `purchaseOrder` | 9 | `purchase_orders.read` |
| `quote` | 15 | `quotes.read` |
| `reference` | 5 | `companies.read` |
| `report` | 20 | `reports.read` |
| `salesOrder` | 10 | `sales_orders.read` |
| `service` | 43 | `service_tickets.read` |
| `signature` | 3 | `—` |
| `tasks` | 10 | `tasks.read` |
| `tradeFair` | 6 | `trade_fairs.read` |

## Sayfa bazında aksiyon kullanımı

### `apps/web/src/app/components/pages/admin/DepartmentsPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.createDept` | POST | `/departments` | `departments.create` |
| `admin.departmentTargets` | GET | `/department-targets` | `users.read` |
| `admin.departments` | GET | `/departments` | `departments.read` |
| `admin.saveDepartmentTarget` | POST | `/departments/:param/targets` | `departments.update` |

### `apps/web/src/app/components/pages/admin/RolesPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.createRole` | POST | `/roles` | `roles.create` |
| `admin.permissions` | GET | `/permissions` | `roles.read` |
| `admin.roleTargetMembers` | GET | `/roles/:param/target-members` | `roles.read` |
| `admin.roles` | GET | `/roles` | `roles.read` |
| `admin.saveRoleTarget` | POST | `/roles/:param/targets` | `roles.update` |
| `admin.updateRole` | PATCH | `/roles/:param` | `roles.update` |

### `apps/web/src/app/components/pages/admin/UsersPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.deleteUser` | DELETE | `/users/:param` | `users.delete` |
| `admin.departments` | GET | `/departments` | `departments.read` |
| `admin.divisions` | GET | `/divisions` | `users.read` |
| `admin.roles` | GET | `/roles` | `roles.read` |
| `admin.saveUserTarget` | POST | `/users/:param/targets` | `users.update` |
| `admin.unlockUser` | POST | `/users/:param/unlock` | `users.update` |
| `admin.updateUser` | PATCH | `/users/:param` | `users.update` |
| `admin.userTargets` | GET | `/user-targets` | `users.read` |
| `admin.users` | GET | `/users` | `users.read` |
| `lookup.byName` | GET | `/lookups/:param` | — |

### `apps/web/src/app/components/pages/CalendarPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `calendar.create` | POST | `/calendar/events` | `calendar.create` |
| `calendar.events` | GET | `/calendar/events` | `calendar.read` |
| `calendar.importCommit` | POST | `/calendar/import/commit` | `calendar.create` |
| `calendar.importPreview` | POST | `/calendar/import/preview` | `calendar.create` |
| `calendar.owners` | GET | `/calendar/owners` | `calendar.read` |
| `calendar.remove` | DELETE | `/calendar/events/:param` | `calendar.delete` |
| `calendar.restore` | POST | `/calendar/events/:param/restore` | `calendar.update` |
| `calendar.update` | PATCH | `/calendar/events/:param` | `calendar.update` |

### `apps/web/src/app/components/pages/chat/ChatPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `chat.conversation` | GET | `/chat/conversations/:param` | — |
| `chat.conversations` | GET | `/chat/conversations` | — |
| `chat.createDm` | POST | `/chat/conversations/dm` | — |
| `chat.deleteMessage` | DELETE | `/chat/messages/:param` | — |
| `chat.directory` | GET | `/chat/directory` | — |
| `chat.editMessage` | PATCH | `/chat/messages/:param` | — |
| `chat.markRead` | POST | `/chat/conversations/:param/read` | — |
| `chat.messages` | GET | `/chat/conversations/:param/messages` | — |
| `chat.sendMessage` | POST | `/chat/conversations/:param/messages` | — |
| `chat.toggleReaction` | POST | `/chat/messages/:param/reactions` | — |
| `file.signedUpload` | POST | `/files/signed-upload-url` | `files.create` |
| `file.uploadBinary` | ? | `?` | — |

### `apps/web/src/app/components/pages/chat/GroupDialogs.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `chat.addMembers` | POST | `/chat/conversations/:param/members` | — |
| `chat.createGroup` | POST | `/chat/conversations/group` | — |
| `chat.removeMember` | DELETE | `/chat/conversations/:param/members/:param` | — |
| `chat.setMemberRole` | PATCH | `/chat/conversations/:param/members/:param/role` | — |
| `chat.updateGroup` | PATCH | `/chat/conversations/:param` | — |

### `apps/web/src/app/components/pages/chat/ShareRecordDialog.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `opportunity.list` | GET | `/opportunities` | `opportunities.read` |
| `quote.list` | GET | `/quotes` | `quotes.read` |
| `service.tickets` | GET | `/service-tickets` | `service_tickets.read` |

### `apps/web/src/app/components/pages/Contacts.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `contact.list` | GET | `/contacts` | `contacts.read` |
| `contact.summary` | GET | `/contacts/summary` | `contacts.read` |

### `apps/web/src/app/components/pages/CustomerDetail.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `file.signedDownload` | POST | `/files/signed-download-url` | `files.read` |
| `salesOrder.list` | GET | `/sales-orders` | `sales_orders.read` |

### `apps/web/src/app/components/pages/Dashboard.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `report.myTargetProgress` | GET | `/reports/my-target-progress` | — |

### `apps/web/src/app/components/pages/dashboard/DashboardTasksPanel.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `tasks.counts` | GET | `/tasks/counts` | `tasks.read` |
| `tasks.list` | GET | `/tasks` | `tasks.read` |
| `tasks.summary` | GET | `/tasks/summary` | — |

### `apps/web/src/app/components/pages/dashboard/TargetWorkspace.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.departmentTargets` | GET | `/department-targets` | `users.read` |
| `admin.departments` | GET | `/departments` | `departments.read` |
| `admin.divisionTargets` | GET | `/division-targets` | `users.read` |
| `admin.divisions` | GET | `/divisions` | `users.read` |
| `admin.saveDepartmentTarget` | POST | `/departments/:param/targets` | `departments.update` |
| `admin.saveDivisionTarget` | POST | `/divisions/:param/targets` | `divisions.update` |
| `admin.saveUserTarget` | POST | `/users/:param/targets` | `users.update` |
| `admin.userTargets` | GET | `/user-targets` | `users.read` |
| `admin.users` | GET | `/users` | `users.read` |
| `report.myTargetProgress` | GET | `/reports/my-target-progress` | — |

### `apps/web/src/app/components/pages/documents/DocumentsPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `company.get` | GET | `/companies/:param` | `companies.read` |
| `document.deleteCommercialInvoice` | DELETE | `/commercial-invoices/:param` | `commercial_invoices.delete` |
| `document.deleteContract` | DELETE | `/contracts/:param` | `contracts.delete` |
| `document.deleteProforma` | DELETE | `/proformas/:param` | `proformas.delete` |
| `file.remove` | DELETE | `/files/:param` | `files.delete` |
| `file.signedDownload` | POST | `/files/signed-download-url` | `files.read` |
| `service.installations` | GET | `/installations` | `installations.read` |

### `apps/web/src/app/components/pages/finance/AccountingInvoicesPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `finance.accountingInvoice` | GET | `/accounting-invoices/:param` | `accounting_invoices.read` |
| `finance.deleteAccountingInvoice` | DELETE | `/accounting-invoices/:param` | `accounting_invoices.delete` |

### `apps/web/src/app/components/pages/finance/CreateAccountingInvoiceDialog.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `finance.createAccountingInvoice` | POST | `/accounting-invoices` | `accounting_invoices.create` |
| `finance.updateAccountingInvoice` | PATCH | `/accounting-invoices/:param` | `accounting_invoices.update` |

### `apps/web/src/app/components/pages/finance/CustomerBalancesPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `finance.companyStatement` | GET | `/companies/:param/statement` | `receivables.read` |

### `apps/web/src/app/components/pages/finance/DueDatesCalendarPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `finance.dueDates` | GET | `/reports/due-dates` | `receivables.read` |

### `apps/web/src/app/components/pages/Kanban.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `inventory.customerDevices` | GET | `/customer-devices` | `customer_devices.read` |

### `apps/web/src/app/components/pages/Login.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `auth.forgotPassword` | POST | `/auth/forgot-password` | — |
| `auth.resetPassword` | POST | `/auth/reset-password` | — |

### `apps/web/src/app/components/pages/logistics/InstallationsPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `service.deleteInstallation` | DELETE | `/installations/:param` | `installations.delete` |
| `service.installations` | GET | `/installations` | `installations.read` |
| `service.updateInstallation` | PATCH | `/installations/:param` | `installations.update` |
| `service.updateInstallationStatus` | PATCH | `/installations/:param/status` | `installations.update` |

### `apps/web/src/app/components/pages/logistics/ShipmentsPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `service.shipment` | GET | `/shipments/:param` | `shipments.read` |

### `apps/web/src/app/components/pages/machines/MachinesPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `inventory.deleteCustomerDevice` | DELETE | `/customer-devices/:param` | `customer_devices.delete` |

### `apps/web/src/app/components/pages/machines/MaintenancePlanPanel.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `service.completeMaintenancePlan` | POST | `/maintenance-plans/:param/complete` | `service_tickets.update` |
| `service.createMaintenancePlan` | POST | `/maintenance-plans` | `service_tickets.create` |
| `service.deleteMaintenancePlan` | DELETE | `/maintenance-plans/:param` | `service_tickets.delete` |
| `service.maintenancePlans` | GET | `/maintenance-plans` | `service_tickets.read` |

### `apps/web/src/app/components/pages/offers/OffersPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `file.signedDownload` | POST | `/files/signed-download-url` | `files.read` |
| `quote.approve` | POST | `/quotes/:param/approve` | `quotes.approve` |
| `quote.approvePrice` | POST | `/quotes/:param/price-approval/approve` | `quotes.approve` |
| `quote.changeStatus` | POST | `/quotes/:param/status` | `quotes.update` |
| `quote.reject` | POST | `/quotes/:param/reject` | `quotes.reject` |
| `quote.rejectPrice` | POST | `/quotes/:param/price-approval/reject` | `quotes.reject` |
| `quote.remove` | DELETE | `/quotes/:param` | `quotes.delete` |
| `quote.send` | POST | `/quotes/:param/send` | `quotes.update` |
| `salesOrder.createFromQuote` | POST | `/sales-orders/from-quote/:param` | `sales_orders.create` |

### `apps/web/src/app/components/pages/OpportunityContractList.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `file.signedDownload` | POST | `/files/signed-download-url` | `files.read` |

### `apps/web/src/app/components/pages/OpportunityProcessCenter.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `opportunity.changeQualificationStage` | PATCH | `/opportunities/:param/qualification-stage` | `opportunities.update` |
| `opportunity.get` | GET | `/opportunities/:param` | `opportunities.read` |

### `apps/web/src/app/components/pages/OpportunityWorkspace.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `opportunity.get` | GET | `/opportunities/:param` | `opportunities.read` |

### `apps/web/src/app/components/pages/payments/PaymentsPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `file.link` | POST | `/files/link` | `files.create` |
| `file.signedDownload` | POST | `/files/signed-download-url` | `files.read` |
| `file.signedUpload` | POST | `/files/signed-upload-url` | `files.create` |
| `file.uploadBinary` | ? | `?` | — |
| `finance.deletePayment` | DELETE | `/payments/:param` | `payments.delete` |
| `finance.updatePayment` | PATCH | `/payments/:param` | `payments.update` |
| `finance.updatePaymentStatus` | PATCH | `/payments/:param/status` | `payments.update` |
| `finance.updateReceivableStatus` | PATCH | `/receivables/:param/status` | `receivables.update` |

### `apps/web/src/app/components/pages/PriceLists.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `product.createPriceListItem` | POST | `/price-lists/:param/items` | `price_lists.create` |
| `product.updatePriceListItem` | PATCH | `/price-lists/:param/items/:param` | `price_lists.update` |

### `apps/web/src/app/components/pages/ProcessChecklistPanel.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `activity.create` | POST | `/activities` | `activities.create` |

### `apps/web/src/app/components/pages/PublicServiceComplaint.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `publicComplaint.signedUpload` | POST | `/public/service-complaints/:param/:param/files/signed-upload-url` | — |
| `publicComplaint.submit` | POST | `/public/service-complaints/:param/:param` | — |
| `publicComplaint.uploadBinary` | ? | `?` | — |

### `apps/web/src/app/components/pages/purchase/PurchaseOrdersPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `product.list` | GET | `/products` | `products.read` |
| `purchaseOrder.addItem` | POST | `/purchase-orders/:param/items` | `purchase_orders.update` |
| `purchaseOrder.approve` | POST | `/purchase-orders/:param/approve` | `purchase_orders.approve` |
| `purchaseOrder.create` | POST | `/purchase-orders` | `purchase_orders.create` |
| `purchaseOrder.get` | GET | `/purchase-orders/:param` | `purchase_orders.read` |
| `purchaseOrder.remove` | DELETE | `/purchase-orders/:param` | `purchase_orders.delete` |
| `purchaseOrder.send` | POST | `/purchase-orders/:param/send` | `purchase_orders.update` |
| `purchaseOrder.setStatus` | PATCH | `/purchase-orders/:param/status` | `purchase_orders.update` |

### `apps/web/src/app/components/pages/ReferencesPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `reference.create` | POST | `/references` | `companies.create` |
| `reference.list` | GET | `/references` | `companies.read` |
| `reference.remove` | DELETE | `/references/:param` | `companies.delete` |
| `reference.update` | PATCH | `/references/:param` | `companies.update` |

### `apps/web/src/app/components/pages/reports/OperationalReport.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `report.operational` | GET | `/reports/operational` | `reports.read` |

### `apps/web/src/app/components/pages/SalesCaseDetail.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `file.remove` | DELETE | `/files/:param` | `files.delete` |
| `file.signedDownload` | POST | `/files/signed-download-url` | `files.read` |
| `finance.createReceivable` | POST | `/receivables` | `receivables.create` |
| `opportunity.decideApproval` | POST | `/opportunities/:param/approvals/:param` | `opportunities.approve` |
| `opportunity.linkCompany` | POST | `/opportunities/:param/company` | — |
| `quote.approve` | POST | `/quotes/:param/approve` | `quotes.approve` |
| `quote.approvePrice` | POST | `/quotes/:param/price-approval/approve` | `quotes.approve` |
| `quote.reject` | POST | `/quotes/:param/reject` | `quotes.reject` |
| `quote.rejectPrice` | POST | `/quotes/:param/price-approval/reject` | `quotes.reject` |
| `quote.send` | POST | `/quotes/:param/send` | `quotes.update` |

### `apps/web/src/app/components/pages/service/ServicePages.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `file.link` | POST | `/files/link` | `files.create` |
| `file.signedUpload` | POST | `/files/signed-upload-url` | `files.create` |
| `file.uploadBinary` | ? | `?` | — |
| `inventory.consumeServiceParts` | POST | `/inventory/consume-service-parts` | `inventory.update` |
| `service.complaintLinks` | GET | `/service-complaint-links` | `service_tickets.read` |
| `service.complaints` | GET | `/service-complaints` | `service_tickets.read` |
| `service.convertComplaint` | POST | `/service-complaints/:param/convert` | `service_tickets.create` |
| `service.createComplaint` | POST | `/service-complaints` | `service_tickets.create` |
| `service.createComplaintLink` | POST | `/service-complaint-links` | `service_tickets.create` |
| `service.deleteTicket` | DELETE | `/service-tickets/:param` | `service_tickets.delete` |
| `service.openServiceFormPdf` | ? | `?` | — |
| `service.rejectComplaint` | POST | `/service-complaints/:param/reject` | `service_tickets.update` |
| `service.revokeComplaintLink` | PATCH | `/service-complaint-links/:param/revoke` | `service_tickets.update` |
| `service.rotateComplaintLink` | PATCH | `/service-complaint-links/:param/rotate` | `service_tickets.update` |
| `service.updateComplaint` | PATCH | `/service-complaints/:param` | `service_tickets.update` |

### `apps/web/src/app/components/pages/settings/DepartmentSettingsCard.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.createDept` | POST | `/departments` | `departments.create` |
| `admin.deleteDept` | DELETE | `/departments/:param` | `departments.delete` |
| `admin.departments` | GET | `/departments` | `departments.read` |
| `admin.updateDept` | PATCH | `/departments/:param` | `departments.update` |

### `apps/web/src/app/components/pages/settings/LaserProfilesPanel.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `product.listBrands` | GET | `/brands` | `brands.read` |

### `apps/web/src/app/components/pages/settings/LeadAssignmentRulesCard.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `leadAssignmentRule.create` | POST | `/lead-assignment-rules` | — |
| `leadAssignmentRule.list` | GET | `/lead-assignment-rules` | — |
| `leadAssignmentRule.remove` | DELETE | `/lead-assignment-rules/:param` | — |
| `leadAssignmentRule.update` | PATCH | `/lead-assignment-rules/:param` | — |

### `apps/web/src/app/components/pages/settings/LookupImportDialog.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.createLookup` | POST | `/admin/lookups/:param` | — |
| `admin.lookupRows` | GET | `/admin/lookups/:param` | — |
| `admin.updateLookup` | PATCH | `/admin/lookups/:param/:param` | — |

### `apps/web/src/app/components/pages/settings/LookupManagerTab.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.auditLogs` | GET | `/audit-logs` | `audit.read` |
| `admin.createLookup` | POST | `/admin/lookups/:param` | — |
| `admin.deleteLookup` | DELETE | `/admin/lookups/:param/:param` | — |
| `admin.lookupRows` | GET | `/admin/lookups/:param` | — |
| `admin.reorderLookup` | PATCH | `/admin/lookups/:param/reorder` | — |
| `admin.updateLookup` | PATCH | `/admin/lookups/:param/:param` | — |
| `file.link` | POST | `/files/link` | `files.create` |
| `file.signedUpload` | POST | `/files/signed-upload-url` | `files.create` |
| `file.uploadBinary` | ? | `?` | — |

### `apps/web/src/app/components/pages/settings/MailAccountSettings.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `mail.account` | GET | `/mail/account` | — |
| `mail.connect` | PUT | `/mail/account` | — |
| `mail.disconnect` | DELETE | `/mail/account` | — |

### `apps/web/src/app/components/pages/settings/ProductSpecTemplatesCard.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.batchSaveProductSpecTemplates` | PUT | `/admin/product-spec-templates/batch` | — |
| `admin.bulkCreateProductSpecTemplates` | POST | `/admin/product-spec-templates/bulk` | — |
| `admin.lookupRows` | GET | `/admin/lookups/:param` | — |
| `admin.productSpecTemplates` | GET | `/admin/product-spec-templates` | — |
| `product.listBrands` | GET | `/brands` | `brands.read` |

### `apps/web/src/app/components/pages/settings/SettingsPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `admin.updateTenant` | PATCH | `/tenant` | `tenants.update` |

### `apps/web/src/app/components/pages/settings/SignatureSettingsCard.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `signature.create` | POST | `/signatures` | — |
| `signature.remove` | DELETE | `/signatures/:param` | — |
| `signature.update` | PATCH | `/signatures/:param` | — |

### `apps/web/src/app/components/pages/tasks/TaskCompletionDialog.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `tasks.update` | PATCH | `/tasks/:param` | `tasks.update` |

### `apps/web/src/app/components/pages/tasks/TaskDetailPanel.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `tasks.comment` | POST | `/tasks/:param/comments` | `tasks.update` |
| `tasks.remove` | DELETE | `/tasks/:param` | `tasks.delete` |
| `tasks.update` | PATCH | `/tasks/:param` | `tasks.update` |

### `apps/web/src/app/components/pages/tasks/TaskFormDialog.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `tasks.create` | POST | `/tasks` | `tasks.create` |
| `tasks.update` | PATCH | `/tasks/:param` | `tasks.update` |

### `apps/web/src/app/components/pages/tasks/TaskRecordSection.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `tasks.assignees` | GET | `/tasks/assignees` | `tasks.read` |
| `tasks.list` | GET | `/tasks` | `tasks.read` |
| `tasks.update` | PATCH | `/tasks/:param` | `tasks.update` |

### `apps/web/src/app/components/pages/tasks/TasksPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `tasks.assignees` | GET | `/tasks/assignees` | `tasks.read` |
| `tasks.counts` | GET | `/tasks/counts` | `tasks.read` |
| `tasks.list` | GET | `/tasks` | `tasks.read` |
| `tasks.summary` | GET | `/tasks/summary` | — |
| `tasks.update` | PATCH | `/tasks/:param` | `tasks.update` |

### `apps/web/src/app/components/pages/TradeFairsPage.tsx`

| Action key | HTTP | Path | Permission |
|---|---|---|---|
| `file.link` | POST | `/files/link` | `files.create` |
| `file.links` | GET | `/files/links` | `files.read` |
| `file.remove` | DELETE | `/files/:param` | `files.delete` |
| `file.signedUpload` | POST | `/files/signed-upload-url` | `files.create` |
| `file.uploadBinary` | ? | `?` | — |
| `tradeFair.create` | POST | `/trade-fairs` | `trade_fairs.create` |
| `tradeFair.list` | GET | `/trade-fairs` | `trade_fairs.read` |
| `tradeFair.remove` | DELETE | `/trade-fairs/:param` | `trade_fairs.delete` |
| `tradeFair.staff` | GET | `/trade-fairs/staff` | `trade_fairs.read` |
| `tradeFair.summary` | GET | `/trade-fairs/summary` | `trade_fairs.read` |
| `tradeFair.update` | PATCH | `/trade-fairs/:param` | `trade_fairs.update` |

## Tam aksiyon listesi

| Action key | HTTP | Path | Permission | Controller.handler |
|---|---|---|---|---|
| `accessRequest.approve` | POST | `/access-requests/:param/approve` | `companies.update` | AccessRequestsController.approve |
| `accessRequest.list` | GET | `/access-requests` | `companies.read` | AccessRequestsController.list |
| `accessRequest.reject` | POST | `/access-requests/:param/reject` | `companies.update` | AccessRequestsController.reject |
| `activity.create` | POST | `/activities` | `activities.create` | ActivitiesController.createActivity |
| `activity.createCall` | POST | `/calls` | `activities.create` | ActivitiesController.createCall |
| `activity.createVisit` | POST | `/visits` | `activities.create` | ActivitiesController.createVisit |
| `activity.list` | GET | `/activities` | `activities.read` | ActivitiesController.list |
| `activity.remove` | DELETE | `/activities/:param` | `activities.delete` | ActivitiesController.deleteActivity |
| `activity.update` | PATCH | `/activities/:param` | `activities.update` | ActivitiesController.updateActivity |
| `admin.auditLogs` | GET | `/audit-logs` | `audit.read` | AdminController.listAuditLogs |
| `admin.batchSaveProductSpecTemplates` | PUT | `/admin/product-spec-templates/batch` | — | AdminLookupsController.batchSaveProductSpecTemplates |
| `admin.bulkCreateProductSpecTemplates` | POST | `/admin/product-spec-templates/bulk` | — | AdminLookupsController.bulkCreateProductSpecTemplates |
| `admin.commitTechnicalImport` | POST | `/admin/technical-import/commit` | — | AdminLookupsController.commitTechnicalImport |
| `admin.createDept` | POST | `/departments` | `departments.create` | AdminController.createDept |
| `admin.createLookup` | POST | `/admin/lookups/:param` | — | AdminLookupsController.createLookup |
| `admin.createMachineTemplate` | POST | `/admin/machine-templates` | — | AdminLookupsController.createMachineTemplate |
| `admin.createProductSpecTemplate` | POST | `/admin/product-spec-templates` | — | AdminLookupsController.createProductSpecTemplate |
| `admin.createRole` | POST | `/roles` | `roles.create` | AdminController.createRole |
| `admin.createUser` | POST | `/users` | `users.create` | AdminController.createUser |
| `admin.deleteDept` | DELETE | `/departments/:param` | `departments.delete` | AdminController.deleteDept |
| `admin.deleteLookup` | DELETE | `/admin/lookups/:param/:param` | — | AdminLookupsController.deleteLookup |
| `admin.deleteProductSpecTemplate` | DELETE | `/admin/product-spec-templates/:param` | — | AdminLookupsController.deleteProductSpecTemplate |
| `admin.deleteUser` | DELETE | `/users/:param` | `users.delete` | AdminController.deleteUser |
| `admin.departments` | GET | `/departments` | `departments.read` | AdminController.listDepts |
| `admin.departmentTargets` | GET | `/department-targets` | `users.read` | AdminController.listDepartmentTargets |
| `admin.divisions` | GET | `/divisions` | `users.read` | AdminController.listDivisions |
| `admin.divisionTargets` | GET | `/division-targets` | `users.read` | AdminController.listDivisionTargets |
| `admin.lookupRows` | GET | `/admin/lookups/:param` | — | AdminLookupsController.listLookup |
| `admin.lookups` | GET | `/admin/lookups` | — | AdminLookupsController.listAvailable |
| `admin.myTargets` | GET | `/me/targets` | — | AdminController.listMyTargets |
| `admin.permissions` | GET | `/permissions` | `roles.read` | AdminController.listPermissions |
| `admin.previewTechnicalImport` | POST | `/admin/technical-import/preview` | — | AdminLookupsController.previewTechnicalImport |
| `admin.productSpecTemplates` | GET | `/admin/product-spec-templates` | — | AdminLookupsController.listProductSpecTemplates |
| `admin.reorderLookup` | PATCH | `/admin/lookups/:param/reorder` | — | AdminLookupsController.reorderLookup |
| `admin.roles` | GET | `/roles` | `roles.read` | AdminController.listRoles |
| `admin.roleTargetMembers` | GET | `/roles/:param/target-members` | `roles.read` | AdminController.roleTargetMembers |
| `admin.saveDepartmentTarget` | POST | `/departments/:param/targets` | `departments.update` | AdminController.upsertDepartmentTarget |
| `admin.saveDivisionTarget` | POST | `/divisions/:param/targets` | `divisions.update` | AdminController.upsertDivisionTarget |
| `admin.saveRoleTarget` | POST | `/roles/:param/targets` | `roles.update` | AdminController.upsertRoleTargets |
| `admin.saveUserTarget` | POST | `/users/:param/targets` | `users.update` | AdminController.upsertUserTarget |
| `admin.tenant` | GET | `/tenant` | — | AdminController.getTenant |
| `admin.unlockUser` | POST | `/users/:param/unlock` | `users.update` | AdminController.unlockUser |
| `admin.updateDept` | PATCH | `/departments/:param` | `departments.update` | AdminController.updateDept |
| `admin.updateLookup` | PATCH | `/admin/lookups/:param/:param` | — | AdminLookupsController.updateLookup |
| `admin.updateProductSpecTemplate` | PATCH | `/admin/product-spec-templates/:param` | — | AdminLookupsController.updateProductSpecTemplate |
| `admin.updateRole` | PATCH | `/roles/:param` | `roles.update` | AdminController.updateRole |
| `admin.updateTenant` | PATCH | `/tenant` | `tenants.update` | AdminController.updateTenant |
| `admin.updateUser` | PATCH | `/users/:param` | `users.update` | AdminController.updateUser |
| `admin.users` | GET | `/users` | `users.read` | AdminController.listUsers |
| `admin.userTargets` | GET | `/user-targets` | `users.read` | AdminController.listUserTargets |
| `auth.forgotPassword` | POST | `/auth/forgot-password` | — | AuthController.forgot |
| `auth.resetPassword` | POST | `/auth/reset-password` | — | AuthController.reset |
| `calendar.create` | POST | `/calendar/events` | `calendar.create` | CalendarController.create |
| `calendar.events` | GET | `/calendar/events` | `calendar.read` | CalendarController.list |
| `calendar.importCommit` | POST | `/calendar/import/commit` | `calendar.create` | CalendarController.importCommit |
| `calendar.importPreview` | POST | `/calendar/import/preview` | `calendar.create` | CalendarController.importPreview |
| `calendar.owners` | GET | `/calendar/owners` | `calendar.read` | CalendarController.owners |
| `calendar.remove` | DELETE | `/calendar/events/:param` | `calendar.delete` | CalendarController.remove |
| `calendar.restore` | POST | `/calendar/events/:param/restore` | `calendar.update` | CalendarController.restore |
| `calendar.update` | PATCH | `/calendar/events/:param` | `calendar.update` | CalendarController.update |
| `chat.addMembers` | POST | `/chat/conversations/:param/members` | — | ChatController.addMembers |
| `chat.conversation` | GET | `/chat/conversations/:param` | — | ChatController.getConversation |
| `chat.conversations` | GET | `/chat/conversations` | — | ChatController.listConversations |
| `chat.createDm` | POST | `/chat/conversations/dm` | — | ChatController.createDm |
| `chat.createGroup` | POST | `/chat/conversations/group` | — | ChatController.createGroup |
| `chat.deleteMessage` | DELETE | `/chat/messages/:param` | — | ChatController.deleteMessage |
| `chat.directory` | GET | `/chat/directory` | — | ChatController.directory |
| `chat.editMessage` | PATCH | `/chat/messages/:param` | — | ChatController.editMessage |
| `chat.markRead` | POST | `/chat/conversations/:param/read` | — | ChatController.markRead |
| `chat.messages` | GET | `/chat/conversations/:param/messages` | — | ChatController.listMessages |
| `chat.removeMember` | DELETE | `/chat/conversations/:param/members/:param` | — | ChatController.removeMember |
| `chat.sendMessage` | POST | `/chat/conversations/:param/messages` | — | ChatController.sendMessage |
| `chat.setMemberRole` | PATCH | `/chat/conversations/:param/members/:param/role` | — | ChatController.setMemberRole |
| `chat.toggleReaction` | POST | `/chat/messages/:param/reactions` | — | ChatController.toggleReaction |
| `chat.updateGroup` | PATCH | `/chat/conversations/:param` | — | ChatController.updateGroup |
| `chat.webrtcConfig` | GET | `/chat/webrtc-config` | — | ChatController.webRtcConfig |
| `company.commitCompanyContactImport` | POST | `/companies/imports/company-contacts/commit` | — | CompaniesController.commitCompanyContactImport |
| `company.create` | POST | `/companies` | `companies.create` | CompaniesController.create |
| `company.get` | GET | `/companies/:param` | `companies.read` | CompaniesController.get |
| `company.list` | GET | `/companies` | `companies.read` | CompaniesController.list |
| `company.osmSearch` | GET | `/companies/osm-search` | `companies.read` | CompaniesController.osmSearch |
| `company.previewCompanyContactImport` | POST | `/companies/imports/company-contacts/preview` | — | CompaniesController.previewCompanyContactImport |
| `company.remove` | DELETE | `/companies/:param` | `companies.delete` | CompaniesController.remove |
| `company.summary` | GET | `/companies/summary` | `companies.read` | CompaniesController.summary |
| `company.update` | PATCH | `/companies/:param` | `companies.update` | CompaniesController.update |
| `company.websiteLookup` | POST | `/companies/website-lookup` | `companies.create` | CompaniesController.websiteLookup |
| `competitor.create` | POST | `/competitors` | `competitors.create` | CompetitorsController.create |
| `competitor.createProduct` | POST | `/competitors/:param/products` | `competitors.create` | CompetitorsController.createProduct |
| `competitor.list` | GET | `/competitors` | `competitors.read` | CompetitorsController.list |
| `competitor.products` | GET | `/competitors/:param/products` | `competitors.read` | CompetitorsController.listProducts |
| `competitor.update` | PATCH | `/competitors/:param` | `competitors.update` | CompetitorsController.update |
| `contact.create` | POST | `/contacts` | `contacts.create` | ContactsController.create |
| `contact.get` | GET | `/contacts/:param` | `contacts.read` | ContactsController.get |
| `contact.list` | GET | `/contacts` | `contacts.read` | ContactsController.list |
| `contact.remove` | DELETE | `/contacts/:param` | `contacts.delete` | ContactsController.remove |
| `contact.summary` | GET | `/contacts/summary` | `contacts.read` | ContactsController.summary |
| `contact.update` | PATCH | `/contacts/:param` | `contacts.update` | ContactsController.update |
| `document.commercialInvoices` | GET | `/commercial-invoices` | `commercial_invoices.read` | CommercialDocumentsController.listCommercialInvoices |
| `document.contracts` | GET | `/contracts` | `contracts.read` | CommercialDocumentsController.listContracts |
| `document.createCommercialInvoice` | POST | `/commercial-invoices` | `commercial_invoices.create` | CommercialDocumentsController.createCommercialInvoice |
| `document.createContract` | POST | `/contracts` | `contracts.create` | CommercialDocumentsController.createContract |
| `document.createProforma` | POST | `/proformas` | `proformas.create` | CommercialDocumentsController.createProforma |
| `document.deleteCommercialInvoice` | DELETE | `/commercial-invoices/:param` | `commercial_invoices.delete` | CommercialDocumentsController.deleteCommercialInvoice |
| `document.deleteContract` | DELETE | `/contracts/:param` | `contracts.delete` | CommercialDocumentsController.deleteContract |
| `document.deleteProforma` | DELETE | `/proformas/:param` | `proformas.delete` | CommercialDocumentsController.deleteProforma |
| `document.proformas` | GET | `/proformas` | `proformas.read` | CommercialDocumentsController.listProformas |
| `document.updateCommercialInvoice` | PATCH | `/commercial-invoices/:param` | `commercial_invoices.update` | CommercialDocumentsController.updateCommercialInvoice |
| `document.updateContract` | PATCH | `/contracts/:param` | `contracts.update` | CommercialDocumentsController.updateContract |
| `document.updateProforma` | PATCH | `/proformas/:param` | `proformas.update` | CommercialDocumentsController.updateProforma |
| `document.updateStandaloneContract` | PATCH | `/contracts/standalone/:param` | `contracts.update` | CommercialDocumentsController.updateStandaloneContract |
| `document.updateStandaloneProforma` | PATCH | `/proformas/standalone/:param` | `proformas.update` | CommercialDocumentsController.updateStandaloneProforma |
| `file.link` | POST | `/files/link` | `files.create` | FilesController.link |
| `file.links` | GET | `/files/links` | `files.read` | FilesController.listLinks |
| `file.remove` | DELETE | `/files/:param` | `files.delete` | FilesController.remove |
| `file.signedDownload` | POST | `/files/signed-download-url` | `files.read` | FilesController.signedDownload |
| `file.signedUpload` | POST | `/files/signed-upload-url` | `files.create` | FilesController.signedUpload |
| `file.uploadBinary` | ? | `?` | — | — |
| `finance.accountingInvoice` | GET | `/accounting-invoices/:param` | `accounting_invoices.read` | FinanceController.getAccountingInvoice |
| `finance.accountingInvoices` | GET | `/accounting-invoices` | `accounting_invoices.read` | FinanceController.listAccountingInvoices |
| `finance.companyStatement` | GET | `/companies/:param/statement` | `receivables.read` | FinanceController.companyStatement |
| `finance.companySummary` | GET | `/companies/:param/finance-summary` | `receivables.read` | FinanceController.companyFinanceSummary |
| `finance.createAccountingInvoice` | POST | `/accounting-invoices` | `accounting_invoices.create` | FinanceController.createAccountingInvoice |
| `finance.createPayment` | POST | `/payments` | `payments.create` | FinanceController.createPayment |
| `finance.createReceivable` | POST | `/receivables` | `receivables.create` | FinanceController.createReceivable |
| `finance.customerBalances` | GET | `/reports/customer-balances` | `receivables.read` | FinanceController.customerBalances |
| `finance.deleteAccountingInvoice` | DELETE | `/accounting-invoices/:param` | `accounting_invoices.delete` | FinanceController.deleteAccountingInvoice |
| `finance.deletePayment` | DELETE | `/payments/:param` | `payments.delete` | FinanceController.deletePayment |
| `finance.dueDates` | GET | `/reports/due-dates` | `receivables.read` | FinanceController.dueDates |
| `finance.payments` | GET | `/payments` | `payments.read` | FinanceController.listPayments |
| `finance.paymentTermSuggestion` | GET | `/accounting-invoices/payment-term-suggestion` | `accounting_invoices.read` | FinanceController.paymentTermSuggestion |
| `finance.receivables` | GET | `/receivables` | `receivables.read` | FinanceController.listReceivables |
| `finance.updateAccountingInvoice` | PATCH | `/accounting-invoices/:param` | `accounting_invoices.update` | FinanceController.updateAccountingInvoice |
| `finance.updatePayment` | PATCH | `/payments/:param` | `payments.update` | FinanceController.updatePayment |
| `finance.updatePaymentStatus` | PATCH | `/payments/:param/status` | `payments.update` | FinanceController.updatePaymentStatus |
| `finance.updateReceivableStatus` | PATCH | `/receivables/:param/status` | `receivables.update` | FinanceController.updateReceivableStatus |
| `inventory.bySerial` | GET | `/inventory/serial/:param` | `inventory.read` | InventoryController.bySerial |
| `inventory.consumeServiceParts` | POST | `/inventory/consume-service-parts` | `inventory.update` | InventoryController.consumeServiceParts |
| `inventory.create` | POST | `/inventory` | `inventory.create` | InventoryController.create |
| `inventory.createCustomerDevice` | POST | `/customer-devices` | `customer_devices.update` | InventoryController.createCustomerDevice |
| `inventory.createWarehouse` | POST | `/warehouses` | `warehouses.create` | InventoryController.createWarehouse |
| `inventory.customerDevices` | GET | `/customer-devices` | `customer_devices.read` | InventoryController.cd |
| `inventory.deleteCustomerDevice` | DELETE | `/customer-devices/:param` | `customer_devices.delete` | InventoryController.deleteCustomerDevice |
| `inventory.get` | GET | `/inventory/:param` | `inventory.read` | InventoryController.get |
| `inventory.list` | GET | `/inventory` | `inventory.read` | InventoryController.list |
| `inventory.listWarehouses` | GET | `/warehouses` | `warehouses.read` | InventoryController.listWarehouses |
| `inventory.reserve` | PATCH | `/inventory/:param/reserve` | `inventory.update` | InventoryController.reserve |
| `inventory.sell` | PATCH | `/inventory/:param/sell` | `inventory.update` | InventoryController.sell |
| `inventory.update` | PATCH | `/inventory/:param` | `inventory.update` | InventoryController.update |
| `inventory.updateCustomerDevice` | PATCH | `/customer-devices/:param` | `customer_devices.update` | InventoryController.updateCustomerDevice |
| `leadAssignmentRule.create` | POST | `/lead-assignment-rules` | — | LeadAssignmentRulesController.create |
| `leadAssignmentRule.list` | GET | `/lead-assignment-rules` | — | LeadAssignmentRulesController.list |
| `leadAssignmentRule.remove` | DELETE | `/lead-assignment-rules/:param` | — | LeadAssignmentRulesController.remove |
| `leadAssignmentRule.update` | PATCH | `/lead-assignment-rules/:param` | — | LeadAssignmentRulesController.update |
| `lookup.available` | GET | `/lookups` | — | LookupsController.list |
| `lookup.byName` | GET | `/lookups/:param` | — | LookupsController.byName |
| `lookup.taxOffices` | GET | `/lookups/tax-offices` | — | — |
| `mail.account` | GET | `/mail/account` | — | MailController.account |
| `mail.connect` | PUT | `/mail/account` | — | — |
| `mail.disconnect` | DELETE | `/mail/account` | — | MailController.disconnect |
| `mail.send` | POST | `/mail/send` | — | — |
| `noteTemplate.create` | POST | `/note-templates` | — | NoteTemplatesController.create |
| `noteTemplate.list` | GET | `/note-templates` | — | NoteTemplatesController.list |
| `noteTemplate.remove` | DELETE | `/note-templates/:param` | — | NoteTemplatesController.remove |
| `noteTemplate.update` | PATCH | `/note-templates/:param` | — | NoteTemplatesController.update |
| `notification.list` | GET | `/notifications` | — | NotificationsController.list |
| `notification.markRead` | PATCH | `/notifications/:param/read` | — | NotificationsController.markRead |
| `notification.respond` | POST | `/notifications/:param/respond` | — | NotificationsController.respond |
| `opportunity.assignees` | GET | `/opportunities/assignees` | `opportunities.read` | OpportunitiesController.assignees |
| `opportunity.changeQualificationStage` | PATCH | `/opportunities/:param/qualification-stage` | `opportunities.update` | OpportunitiesController.changeQualificationStage |
| `opportunity.changeStage` | PATCH | `/opportunities/:param/stage` | `opportunities.update` | OpportunitiesController.changeStage |
| `opportunity.commitTrelloImport` | POST | `/opportunities/imports/trello/commit` | `opportunities.create` | OpportunitiesController.commitTrelloImport |
| `opportunity.convert` | POST | `/opportunities/:param/convert` | `opportunities.update` | OpportunitiesController.convertLead |
| `opportunity.create` | POST | `/opportunities` | `opportunities.create` | OpportunitiesController.create |
| `opportunity.createFromActivity` | POST | `/opportunities/from-activity/:param` | `activities.convert` | OpportunitiesController.createFromActivity |
| `opportunity.decideApproval` | POST | `/opportunities/:param/approvals/:param` | `opportunities.approve` | OpportunitiesController.decideQualificationApproval |
| `opportunity.defer` | POST | `/opportunities/:param/defer` | `opportunities.update` | OpportunitiesController.defer |
| `opportunity.get` | GET | `/opportunities/:param` | `opportunities.read` | OpportunitiesController.get |
| `opportunity.leadSummary` | GET | `/opportunities/lead-summary` | `opportunities.read` | OpportunitiesController.leadSummary |
| `opportunity.linkCompany` | POST | `/opportunities/:param/company` | — | OpportunitiesController.linkCompany |
| `opportunity.list` | GET | `/opportunities` | `opportunities.read` | OpportunitiesController.list |
| `opportunity.previewTrelloImport` | POST | `/opportunities/imports/trello/preview` | `opportunities.create` | OpportunitiesController.previewTrelloImport |
| `opportunity.recordContact` | POST | `/opportunities/:param/contact-events` | `opportunities.update` | OpportunitiesController.recordLeadContactEvent |
| `opportunity.remove` | DELETE | `/opportunities/:param` | `opportunities.delete` | OpportunitiesController.remove |
| `opportunity.update` | PATCH | `/opportunities/:param` | `opportunities.update` | OpportunitiesController.update |
| `product.addEquipment` | POST | `/products/:param/equipment` | `products.update` | ProductsController.addEquipment |
| `product.addSpec` | POST | `/products/:param/specs` | `product_specs.create` | ProductsController.addSpec |
| `product.commitImport` | POST | `/products/import/commit` | `products.create` | ProductsController.commitImport |
| `product.compatibleOptionalEquipment` | GET | `/products/:param/compatible-optional-equipment` | `products.read` | ProductsController.compatibleOptionalEquipment |
| `product.create` | POST | `/products` | `products.create` | ProductsController.create |
| `product.createBrand` | POST | `/brands` | `brands.create` | ProductsController.createBrand |
| `product.createPriceList` | POST | `/price-lists` | `price_lists.create` | ProductsController.createPriceList |
| `product.createPriceListItem` | POST | `/price-lists/:param/items` | `price_lists.create` | ProductsController.createPriceListItem |
| `product.equipment` | GET | `/products/:param/equipment` | `products.read` | ProductsController.equipment |
| `product.get` | GET | `/products/:param` | `products.read` | ProductsController.get |
| `product.list` | GET | `/products` | `products.read` | ProductsController.list |
| `product.listBrands` | GET | `/brands` | `brands.read` | ProductsController.listBrands |
| `product.listPriceListItems` | GET | `/price-lists/:param/items` | `price_lists.read` | ProductsController.listPriceListItems |
| `product.listPriceLists` | GET | `/price-lists` | `price_lists.read` | ProductsController.listPriceLists |
| `product.media` | GET | `/products/:param/media` | `products.read` | ProductsController.listMedia |
| `product.options` | GET | `/products/:param/options` | `products.read` | ProductsController.listOptions |
| `product.previewImport` | POST | `/products/import/preview` | `products.create` | ProductsController.previewImport |
| `product.remove` | DELETE | `/products/:param` | `products.delete` | ProductsController.remove |
| `product.replaceDetails` | PUT | `/products/:param/details` | `products.update` | ProductsController.replaceDetails |
| `product.specs` | GET | `/products/:param/specs` | `product_specs.read` | ProductsController.specs |
| `product.specTemplates` | GET | `/product-spec-templates` | `products.read` | ProductsController.listSpecTemplates |
| `product.update` | PATCH | `/products/:param` | `products.update` | ProductsController.update |
| `product.updatePriceList` | PATCH | `/price-lists/:param` | `price_lists.update` | ProductsController.updatePriceList |
| `product.updatePriceListItem` | PATCH | `/price-lists/:param/items/:param` | `price_lists.update` | ProductsController.updatePriceListItem |
| `publicComplaint.form` | GET | `/public/service-complaints/:param/:param` | — | PublicServiceComplaintsController.getPublicComplaintForm |
| `publicComplaint.signedUpload` | POST | `/public/service-complaints/:param/:param/files/signed-upload-url` | — | PublicServiceComplaintsController.createPublicSignedUploadUrl |
| `publicComplaint.submit` | POST | `/public/service-complaints/:param/:param` | — | PublicServiceComplaintsController.createPublicComplaint |
| `publicComplaint.uploadBinary` | ? | `?` | — | — |
| `purchaseOrder.addItem` | POST | `/purchase-orders/:param/items` | `purchase_orders.update` | PurchaseOrdersController.addItem |
| `purchaseOrder.approve` | POST | `/purchase-orders/:param/approve` | `purchase_orders.approve` | PurchaseOrdersController.approve |
| `purchaseOrder.create` | POST | `/purchase-orders` | `purchase_orders.create` | PurchaseOrdersController.create |
| `purchaseOrder.get` | GET | `/purchase-orders/:param` | `purchase_orders.read` | PurchaseOrdersController.get |
| `purchaseOrder.list` | GET | `/purchase-orders` | `purchase_orders.read` | PurchaseOrdersController.list |
| `purchaseOrder.remove` | DELETE | `/purchase-orders/:param` | `purchase_orders.delete` | PurchaseOrdersController.remove |
| `purchaseOrder.send` | POST | `/purchase-orders/:param/send` | `purchase_orders.update` | PurchaseOrdersController.send |
| `purchaseOrder.setStatus` | PATCH | `/purchase-orders/:param/status` | `purchase_orders.update` | PurchaseOrdersController.setStatus |
| `purchaseOrder.update` | PATCH | `/purchase-orders/:param` | `purchase_orders.update` | PurchaseOrdersController.update |
| `quote.addItem` | POST | `/quotes/:param/items` | `quotes.update` | QuotesController.addItem |
| `quote.approve` | POST | `/quotes/:param/approve` | `quotes.approve` | QuotesController.approve |
| `quote.approvePrice` | POST | `/quotes/:param/price-approval/approve` | `quotes.approve` | QuotesController.approvePrice |
| `quote.changeStatus` | POST | `/quotes/:param/status` | `quotes.update` | QuotesController.changeStatus |
| `quote.create` | POST | `/quotes` | `quotes.create` | QuotesController.create |
| `quote.deleteItem` | DELETE | `/quotes/:param/items/:param` | `quotes.update` | QuotesController.deleteItem |
| `quote.get` | GET | `/quotes/:param` | `quotes.read` | QuotesController.get |
| `quote.list` | GET | `/quotes` | `quotes.read` | QuotesController.list |
| `quote.reject` | POST | `/quotes/:param/reject` | `quotes.reject` | QuotesController.reject |
| `quote.rejectPrice` | POST | `/quotes/:param/price-approval/reject` | `quotes.reject` | QuotesController.rejectPrice |
| `quote.remove` | DELETE | `/quotes/:param` | `quotes.delete` | QuotesController.remove |
| `quote.send` | POST | `/quotes/:param/send` | `quotes.update` | QuotesController.send |
| `quote.terms` | PUT | `/quotes/:param/terms` | `quotes.update` | QuotesController.upsertTerms |
| `quote.update` | PATCH | `/quotes/:param` | `quotes.update` | QuotesController.update |
| `quote.updateItem` | PATCH | `/quotes/:param/items/:param` | `quotes.update` | QuotesController.updateItem |
| `reference.create` | POST | `/references` | `companies.create` | CompanyReferencesController.create |
| `reference.importFile` | POST | `/references/import` | `companies.create` | CompanyReferencesController.importFromFile |
| `reference.list` | GET | `/references` | `companies.read` | CompanyReferencesController.list |
| `reference.remove` | DELETE | `/references/:param` | `companies.delete` | CompanyReferencesController.remove |
| `reference.update` | PATCH | `/references/:param` | `companies.update` | CompanyReferencesController.update |
| `report.completedPayments` | GET | `/reports/completed-payments` | `reports.read` | ReportsController.completedPayments |
| `report.departmentPerformance` | GET | `/reports/department-performance` | `reports.read` | ReportsController.departmentPerformance |
| `report.downloadYearEnd` | ? | `?` | — | — |
| `report.expectedReceivables` | GET | `/reports/expected-receivables` | `reports.read` | ReportsController.expectedReceivables |
| `report.monthlyActivities` | GET | `/reports/monthly-activities` | `reports.read` | ReportsController.monthlyActivities |
| `report.monthlyQuotes` | GET | `/reports/monthly-quotes-by-product` | `reports.read` | ReportsController.monthlyQuotes |
| `report.monthlyVisits` | GET | `/reports/monthly-visits` | `reports.read` | ReportsController.monthlyVisits |
| `report.myTargetProgress` | GET | `/reports/my-target-progress` | — | ReportsController.myTargetProgress |
| `report.operational` | GET | `/reports/operational` | `reports.read` | ReportsController.operational |
| `report.pipelineSummary` | GET | `/reports/pipeline-summary` | `reports.read` | ReportsController.pipelineSummary |
| `report.serviceComplaintsSummary` | GET | `/reports/service-complaints-summary` | `reports.read` | ReportsController.serviceComplaintsSummary |
| `report.stockSummary` | GET | `/reports/stock-summary` | `reports.read` | ReportsController.stockSummary |
| `report.teamActivityDetails` | GET | `/reports/team-activity/details` | — | ReportsController.teamActivityDetails |
| `report.warrantyExpiring` | GET | `/reports/warranty-expiring` | `reports.read` | ReportsController.warranty |
| `report.weeklyActivities` | GET | `/reports/weekly-activities` | `reports.read` | ReportsController.weeklyActivities |
| `report.weeklyQuotes` | GET | `/reports/weekly-quotes-by-product` | `reports.read` | ReportsController.weeklyQuotes |
| `report.weeklyVisits` | GET | `/reports/weekly-visits` | `reports.read` | ReportsController.weeklyVisits |
| `report.yearEnd` | GET | `/reports/year-end` | `reports.read` | ReportsController.yearEnd |
| `report.yearlyActivities` | GET | `/reports/yearly-activities` | `reports.read` | ReportsController.yearlyActivities |
| `report.yearlyVisits` | GET | `/reports/yearly-visits` | `reports.read` | ReportsController.yearlyVisits |
| `salesOrder.addItem` | POST | `/sales-orders/:param/items` | `sales_orders.update` | SalesOrdersController.addItem |
| `salesOrder.approve` | POST | `/sales-orders/:param/approve` | `sales_orders.approve` | SalesOrdersController.approve |
| `salesOrder.create` | POST | `/sales-orders` | `sales_orders.create` | SalesOrdersController.create |
| `salesOrder.createFromQuote` | POST | `/sales-orders/from-quote/:param` | `sales_orders.create` | SalesOrdersController.createFromQuote |
| `salesOrder.get` | GET | `/sales-orders/:param` | `sales_orders.read` | SalesOrdersController.get |
| `salesOrder.list` | GET | `/sales-orders` | `sales_orders.read` | SalesOrdersController.list |
| `salesOrder.remove` | DELETE | `/sales-orders/:param` | `sales_orders.delete` | SalesOrdersController.remove |
| `salesOrder.reserve` | POST | `/sales-orders/:param/reserve` | `sales_orders.update` | SalesOrdersController.reserve |
| `salesOrder.setStatus` | PATCH | `/sales-orders/:param/status` | `sales_orders.update` | SalesOrdersController.setStatus |
| `salesOrder.update` | PATCH | `/sales-orders/:param` | `sales_orders.update` | SalesOrdersController.update |
| `service.approveWarranty` | POST | `/service-tickets/:param/warranty/approve` | `service_tickets.approve` | ServiceController.approveWarranty |
| `service.complaintLinks` | GET | `/service-complaint-links` | `service_tickets.read` | ServiceComplaintsController.listLinks |
| `service.complaints` | GET | `/service-complaints` | `service_tickets.read` | ServiceComplaintsController.listComplaints |
| `service.completeMaintenancePlan` | POST | `/maintenance-plans/:param/complete` | `service_tickets.update` | MaintenancePlansController.complete |
| `service.convertComplaint` | POST | `/service-complaints/:param/convert` | `service_tickets.create` | ServiceComplaintsController.convertComplaint |
| `service.createComplaint` | POST | `/service-complaints` | `service_tickets.create` | ServiceComplaintsController.createComplaint |
| `service.createComplaintLink` | POST | `/service-complaint-links` | `service_tickets.create` | ServiceComplaintsController.createLink |
| `service.createDelivery` | POST | `/deliveries` | `shipments.create` | ServiceController.createDelivery |
| `service.createInstallation` | POST | `/installations` | `installations.create` | ServiceController.createInstallation |
| `service.createMaintenancePlan` | POST | `/maintenance-plans` | `service_tickets.create` | MaintenancePlansController.create |
| `service.createShipment` | POST | `/shipments` | `shipments.create` | ServiceController.createShipment |
| `service.createTicket` | POST | `/service-tickets` | `service_tickets.create` | ServiceController.createTicket |
| `service.deleteDelivery` | DELETE | `/deliveries/:param` | `shipments.update` | ServiceController.deleteDelivery |
| `service.deleteInstallation` | DELETE | `/installations/:param` | `installations.delete` | ServiceController.deleteInstallation |
| `service.deleteMaintenancePlan` | DELETE | `/maintenance-plans/:param` | `service_tickets.delete` | MaintenancePlansController.remove |
| `service.deleteShipment` | DELETE | `/shipments/:param` | `shipments.update` | ServiceController.deleteShipment |
| `service.deleteTicket` | DELETE | `/service-tickets/:param` | `service_tickets.delete` | ServiceController.deleteTicket |
| `service.deliveries` | GET | `/deliveries` | `shipments.read` | ServiceController.listDeliveries |
| `service.installations` | GET | `/installations` | `installations.read` | ServiceController.listInstallations |
| `service.maintenancePlans` | GET | `/maintenance-plans` | `service_tickets.read` | MaintenancePlansController.list |
| `service.openServiceFormPdf` | ? | `?` | — | — |
| `service.rejectComplaint` | POST | `/service-complaints/:param/reject` | `service_tickets.update` | ServiceComplaintsController.rejectComplaint |
| `service.rejectWarranty` | POST | `/service-tickets/:param/warranty/reject` | `service_tickets.reject` | ServiceController.rejectWarranty |
| `service.revokeComplaintLink` | PATCH | `/service-complaint-links/:param/revoke` | `service_tickets.update` | ServiceComplaintsController.revokeLink |
| `service.rotateComplaintLink` | PATCH | `/service-complaint-links/:param/rotate` | `service_tickets.update` | ServiceComplaintsController.rotateLink |
| `service.shipment` | GET | `/shipments/:param` | `shipments.read` | ServiceController.getShipment |
| `service.shipmentCompanyOptions` | GET | `/shipments/company-options` | `shipments.read` | ServiceController.shipmentCompanyOptions |
| `service.shipments` | GET | `/shipments` | `shipments.read` | ServiceController.listShipments |
| `service.startShipment` | POST | `/shipments/:param/start` | `shipments.update` | ServiceController.startShipment |
| `service.submitWarranty` | POST | `/service-tickets/:param/warranty/submit` | `service_tickets.update` | ServiceController.submitWarranty |
| `service.tickets` | GET | `/service-tickets` | `service_tickets.read` | ServiceController.listTickets |
| `service.update` | PATCH | `/service-tickets/:param` | `service_tickets.update` | ServiceController.updateTicket |
| `service.updateComplaint` | PATCH | `/service-complaints/:param` | `service_tickets.update` | ServiceComplaintsController.updateComplaint |
| `service.updateDelivery` | PATCH | `/deliveries/:param` | `shipments.update` | ServiceController.updateDelivery |
| `service.updateDeliveryStatus` | PATCH | `/deliveries/:param/status` | `shipments.update` | ServiceController.updateDeliveryStatus |
| `service.updateInstallation` | PATCH | `/installations/:param` | `installations.update` | ServiceController.updateInstallation |
| `service.updateInstallationStatus` | PATCH | `/installations/:param/status` | `installations.update` | ServiceController.updateInstallationStatus |
| `service.updateMaintenancePlan` | PATCH | `/maintenance-plans/:param` | `service_tickets.update` | MaintenancePlansController.update |
| `service.updateShipmentStatus` | PATCH | `/shipments/:param/status` | `shipments.update` | ServiceController.updateShipmentStatus |
| `service.updateTicketStatus` | PATCH | `/service-tickets/:param/status` | `service_tickets.update` | ServiceController.updateTicketStatus |
| `service.updateWarranty` | PUT | `/service-tickets/:param/warranty` | `service_tickets.update` | ServiceController.upsertWarranty |
| `service.updateWarrantyParts` | PUT | `/service-tickets/:param/warranty/parts` | `service_tickets.update` | ServiceController.replaceWarrantyParts |
| `service.warranty` | GET | `/service-tickets/:param/warranty` | `service_tickets.read` | ServiceController.getWarranty |
| `signature.create` | POST | `/signatures` | — | SignaturesController.create |
| `signature.remove` | DELETE | `/signatures/:param` | — | SignaturesController.remove |
| `signature.update` | PATCH | `/signatures/:param` | — | SignaturesController.update |
| `tasks.assignees` | GET | `/tasks/assignees` | `tasks.read` | TasksController.assignees |
| `tasks.comment` | POST | `/tasks/:param/comments` | `tasks.update` | TasksController.comment |
| `tasks.counts` | GET | `/tasks/counts` | `tasks.read` | TasksController.counts |
| `tasks.create` | POST | `/tasks` | `tasks.create` | TasksController.create |
| `tasks.events` | GET | `/tasks/events` | `tasks.read` | TasksController.events |
| `tasks.get` | GET | `/tasks/:param` | `tasks.read` | TasksController.get |
| `tasks.list` | GET | `/tasks` | `tasks.read` | TasksController.list |
| `tasks.remove` | DELETE | `/tasks/:param` | `tasks.delete` | TasksController.remove |
| `tasks.summary` | GET | `/tasks/summary` | — | TasksController.summary |
| `tasks.update` | PATCH | `/tasks/:param` | `tasks.update` | TasksController.update |
| `tradeFair.create` | POST | `/trade-fairs` | `trade_fairs.create` | TradeFairsController.create |
| `tradeFair.list` | GET | `/trade-fairs` | `trade_fairs.read` | TradeFairsController.list |
| `tradeFair.remove` | DELETE | `/trade-fairs/:param` | `trade_fairs.delete` | TradeFairsController.remove |
| `tradeFair.staff` | GET | `/trade-fairs/staff` | `trade_fairs.read` | TradeFairsController.staff |
| `tradeFair.summary` | GET | `/trade-fairs/summary` | `trade_fairs.read` | TradeFairsController.summary |
| `tradeFair.update` | PATCH | `/trade-fairs/:param` | `trade_fairs.update` | TradeFairsController.update |
