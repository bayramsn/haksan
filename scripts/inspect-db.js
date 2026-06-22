const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgres://haksan:haksan_dev_pwd@localhost:5433/haksan'
  });
  
  try {
    await client.connect();
    console.log("Connected to database successfully!");
    
    // 1. Fetch Tenants
    const tenantsRes = await client.query('SELECT id, name, slug FROM tenants LIMIT 5');
    console.log("\\n--- TENANTS ---");
    console.log(tenantsRes.rows);
    
    // 2. Fetch Opportunity/Lead statuses
    const statusesRes = await client.query('SELECT id, code, name FROM opportunity_statuses LIMIT 10');
    console.log("\\n--- OPPORTUNITY STATUSES ---");
    console.log(statusesRes.rows);

    // 3. Fetch Service Ticket statuses
    const ticketStatusesRes = await client.query('SELECT id, code, name FROM service_ticket_statuses LIMIT 10');
    console.log("\\n--- SERVICE TICKET STATUSES ---");
    console.log(ticketStatusesRes.rows);

    // 4. Fetch first company
    const companyRes = await client.query('SELECT id, name FROM companies WHERE deleted_at IS NULL LIMIT 5');
    console.log("\\n--- COMPANIES ---");
    console.log(companyRes.rows);

    // 5. Fetch currencies
    const currRes = await client.query('SELECT id, code, name FROM currencies LIMIT 5');
    console.log("\\n--- CURRENCIES ---");
    console.log(currRes.rows);

    // 6. Fetch contact sources
    const srcRes = await client.query('SELECT id, code, name FROM contact_sources LIMIT 5');
    console.log("\\n--- CONTACT SOURCES ---");
    console.log(srcRes.rows);

  } catch (err) {
    console.error("Database connection or query error:", err);
  } finally {
    await client.end();
  }
}

main();
