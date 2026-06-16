import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { LifecycleService } from './src/modules/lifecycle/lifecycle.service';
import { DbClient } from './src/db/client';
import { DB } from './src/shared/database/database.module';
import { eq } from 'drizzle-orm';
import { users, companies, productModels, inventoryItems, customerDevices, serviceTickets } from './src/db/schema';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const lifecycleService = app.get(LifecycleService);
  const db = app.get<DbClient>(DB);

  console.log('Starting full lifecycle test...');

  try {
    // 1. Get user context
    const [user] = await db.select().from(users).limit(1);
    if (!user) throw new Error('No user found');

    const authContext = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: [],
      permissions: [],
    };

    // 2. Setup dummy data
    const [company] = await db.insert(companies).values({
      tenantId: user.tenantId,
      legalTitle: 'Test Company A.S.',
      shortName: 'Test',
      taxNumber: '1234567890',
    }).returning();

    const [product] = await db.insert(productModels).values({
      tenantId: user.tenantId,
      modelCode: 'TEST-MDL',
      modelName: 'Test Machine',
    }).returning();

    const [inventory] = await db.insert(inventoryItems).values({
      tenantId: user.tenantId,
      productModelId: product.id,
      serialNumber: 'SN-TEST-001',
    }).returning();

    const [device] = await db.insert(customerDevices).values({
      tenantId: user.tenantId,
      companyId: company.id,
      inventoryItemId: inventory.id,
      saleDate: new Date(),
    }).returning();

    console.log('Dummy data created. Device ID:', device.id);

    // 3. Test publishPassport
    console.log('Testing publishPassport...');
    const publishRes = await lifecycleService.publishPassport(device.id, { publicTitle: 'My Test Passport' }, authContext);
    console.log('Passport published. Slug:', publishRes.passport.slug, 'URL:', publishRes.publicUrl);

    // 4. Test getPublicPassport
    console.log('Testing getPublicPassport...');
    const publicData = await lifecycleService.getPublicPassport(publishRes.passport.slug, publishRes.token);
    console.log('Public data retrieved:', publicData.passport.publicTitle);

    // 5. Test createPublicServiceTicket
    console.log('Testing createPublicServiceTicket...');
    const ticketRes = await lifecycleService.createPublicServiceTicket(publishRes.passport.slug, publishRes.token, {
      subject: 'Machine not starting',
      description: 'Needs help',
    });
    console.log('Public service ticket created:', ticketRes.ticketNo);

    // 6. Test rotatePassport
    console.log('Testing rotatePassport...');
    const rotateRes = await lifecycleService.rotatePassport(device.id, authContext);
    console.log('Passport rotated. New URL:', rotateRes.publicUrl);

    // 7. Test cpqPreview
    console.log('Testing cpqPreview...');
    const cpqRes = await lifecycleService.cpqPreview({
      productModelId: product.id,
      companyId: company.id,
    }, authContext);
    console.log('CPQ Preview total:', cpqRes.totalAmount);

    // 8. Test revokePassport
    console.log('Testing revokePassport...');
    await lifecycleService.revokePassport(device.id, authContext);
    console.log('Passport revoked successfully.');

    // Cleanup
    console.log('Cleaning up dummy data...');
    await db.delete(serviceTickets).where(eq(serviceTickets.tenantId, user.tenantId));
    await db.delete(customerDevices).where(eq(customerDevices.tenantId, user.tenantId));
    await db.delete(inventoryItems).where(eq(inventoryItems.tenantId, user.tenantId));
    await db.delete(productModels).where(eq(productModels.tenantId, user.tenantId));
    await db.delete(companies).where(eq(companies.tenantId, user.tenantId));

    console.log('All tests completed successfully!');

  } catch (err) {
    console.error('Error during testing:', err);
  } finally {
    await app.close();
  }
}

bootstrap();
