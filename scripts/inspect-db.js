const { Client } = require('pg');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set before running this script.');
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('Connected to database successfully!');

    const tenantsRes = await client.query('SELECT id, name, slug FROM tenants LIMIT 5');
    console.log('\\n--- TENANTS ---');
    console.log(tenantsRes.rows);

    const statusesRes = await client.query(
      'SELECT id, code, name FROM opportunity_statuses LIMIT 10',
    );
    console.log('\\n--- OPPORTUNITY STATUSES ---');
    console.log(statusesRes.rows);

    const ticketStatusesRes = await client.query(
      'SELECT id, code, name FROM service_ticket_statuses LIMIT 10',
    );
    console.log('\\n--- SERVICE TICKET STATUSES ---');
    console.log(ticketStatusesRes.rows);

    const companyRes = await client.query(
      'SELECT id, name FROM companies WHERE deleted_at IS NULL LIMIT 5',
    );
    console.log('\\n--- COMPANIES ---');
    console.log(companyRes.rows);

    const currRes = await client.query('SELECT id, code, name FROM currencies LIMIT 5');
    console.log('\\n--- CURRENCIES ---');
    console.log(currRes.rows);

    const srcRes = await client.query('SELECT id, code, name FROM contact_sources LIMIT 5');
    console.log('\\n--- CONTACT SOURCES ---');
    console.log(srcRes.rows);
  } catch (error) {
    console.error('Database connection or query error:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
