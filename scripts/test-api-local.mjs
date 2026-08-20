import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const composeFile = fileURLToPath(new URL('../docker-compose.test.yml', import.meta.url));
const projectName = `haksan-api-test-${process.pid}`;
const coverage = process.argv.includes('--coverage');
const testFileArguments = process.argv.slice(2).filter((argument) => argument !== '--coverage');

function parsePort(name, fallback) {
  const raw = process.env[name] ?? String(fallback);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1024 and 65535`);
  }
  return port;
}

function canListenOn(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => resolve(true));
    });
  });
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve an isolated test port'));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function resolvePort(name, fallback) {
  const configured = process.env[name];
  if (configured !== undefined) return parsePort(name, fallback);
  return (await canListenOn(fallback)) ? fallback : findAvailablePort();
}

const databasePort = await resolvePort('HAKSAN_TEST_DB_PORT', 55_432);
const storagePort = await resolvePort('HAKSAN_TEST_S3_PORT', 59_000);
if (databasePort === storagePort) {
  throw new Error('HAKSAN_TEST_DB_PORT and HAKSAN_TEST_S3_PORT must be different');
}

console.log(`[test:local] isolated services: PostgreSQL 127.0.0.1:${databasePort}, MinIO 127.0.0.1:${storagePort}`);

const randomSecret = () => randomBytes(32).toString('hex');
const databasePassword = randomSecret();
const minioRootUser = `haksan_test_root_${process.pid}`;
const minioRootPassword = randomSecret();
const storageAccessKeyId = `haksan_test_app_${process.pid}`;
const storageSecretAccessKey = randomSecret();

const composeEnvironment = {
  ...process.env,
  HAKSAN_TEST_DB_PORT: String(databasePort),
  HAKSAN_TEST_S3_PORT: String(storagePort),
  HAKSAN_TEST_DB_PASSWORD: databasePassword,
  HAKSAN_TEST_MINIO_ROOT_USER: minioRootUser,
  HAKSAN_TEST_MINIO_ROOT_PASSWORD: minioRootPassword,
  HAKSAN_TEST_S3_ACCESS_KEY_ID: storageAccessKeyId,
  HAKSAN_TEST_S3_SECRET_ACCESS_KEY: storageSecretAccessKey,
};
const testEnvironment = {
  ...composeEnvironment,
  NODE_ENV: 'test',
  DATABASE_URL: `postgres://haksan_test:${databasePassword}@127.0.0.1:${databasePort}/haksan_test`,
  DATABASE_SSL: 'false',
  DATABASE_SSL_REJECT_UNAUTHORIZED: 'true',
  DATABASE_ALLOW_PLAINTEXT: 'true',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:4173',
  COOKIE_DOMAIN: 'localhost',
  COOKIE_SECURE: 'false',
  COOKIE_SAMESITE: 'lax',
  COOKIE_SECRET: randomSecret(),
  JWT_ACCESS_SECRET: randomSecret(),
  JWT_REFRESH_SECRET: randomSecret(),
  S3_PROVIDER: 'minio',
  S3_ENDPOINT: `http://127.0.0.1:${storagePort}`,
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: storageAccessKeyId,
  S3_SECRET_ACCESS_KEY: storageSecretAccessKey,
  S3_FORCE_PATH_STYLE: 'true',
  AUTH_DEV_RESET_TOKEN_RESPONSE: 'true',
  USER_MAIL_ENABLED: 'false',
  AUTOMATION_ENABLED: 'false',
  CHAT_REALTIME_ENABLED: 'false',
  RUN_STORAGE_INTEGRATION: 'true',
};
const composeArguments = ['compose', '-f', composeFile, '--project-name', projectName];
let activeChild;
let interruptedSignal;
let composeAttempted = false;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: options.env ?? process.env,
      stdio: 'inherit',
      shell: false,
    });
    activeChild = child;
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      activeChild = undefined;
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? `exit ${code}`})`));
    });
  });
}

function forwardSignal(signal) {
  interruptedSignal = signal;
  activeChild?.kill(signal);
}

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));

try {
  composeAttempted = true;
  await run('docker', [...composeArguments, 'up', '--detach', '--wait', '--wait-timeout', '90', 'postgres', 'minio'], {
    env: composeEnvironment,
  });
  await run('docker', [...composeArguments, 'run', '--rm', '--no-deps', 'minio-init'], {
    env: composeEnvironment,
  });
  await run('npm', ['run', 'db:migrate'], { env: testEnvironment });
  await run('npm', ['run', 'db:seed:demo'], { env: testEnvironment });
  const testArguments = ['--workspace', '@haksan/api', 'run', coverage ? 'test:coverage' : 'test'];
  if (testFileArguments.length) testArguments.push('--', ...testFileArguments);
  await run('npm', testArguments, {
    env: testEnvironment,
  });
} finally {
  if (composeAttempted) {
    try {
      await run('docker', [...composeArguments, 'down', '--remove-orphans'], {
        env: composeEnvironment,
      });
    } catch (error) {
      console.error(`[test:local] isolated service cleanup failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

if (interruptedSignal) {
  process.kill(process.pid, interruptedSignal);
}
