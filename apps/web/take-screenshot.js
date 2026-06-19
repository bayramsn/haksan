import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Navigate to login
  await page.goto('http://localhost:5173/');
  
  // Fill login
  await page.locator('#login-email').fill('admin@haksan.local');
  await page.locator('#login-password').fill('admin12345');
  await page.click('button:has-text("Giriş Yap")');
  
  // Wait for dashboard
  await page.waitForSelector('button:has-text("Hızlı Oluştur")');
  
  // Go to shipments page (using URL directly)
  await page.goto('http://localhost:5173/#shipments');
  // Wait for some time to load
  await page.waitForTimeout(2000);
  
  // Take screenshot of shipments page before opening dialog
  await page.screenshot({ path: '/Users/bayramsenbay/.gemini/antigravity/brain/7645f9ee-04b7-4a0e-a83d-c6695a30b1ad/scratch/shipments_page.png' });
  
  // Click "Yeni Sevkiyat"
  await page.click('button:has-text("Yeni Sevkiyat")');
  await page.waitForTimeout(1000);
  
  // Take screenshot of the open dialog
  await page.screenshot({ path: '/Users/bayramsenbay/.gemini/antigravity/brain/7645f9ee-04b7-4a0e-a83d-c6695a30b1ad/scratch/shipment_dialog.png' });
  
  // Click on the select trigger for sales case to open it
  await page.click('#ship-case');
  await page.waitForTimeout(1000);
  
  // Take screenshot of the open select menu
  await page.screenshot({ path: '/Users/bayramsenbay/.gemini/antigravity/brain/7645f9ee-04b7-4a0e-a83d-c6695a30b1ad/scratch/shipment_select_open.png' });
  
  await browser.close();
  console.log('Screenshots taken successfully!');
})();
