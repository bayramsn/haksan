import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const productionDeployScript = readFileSync(`${repositoryRoot}/deploy/deploy-ecr-release.sh`, 'utf8');

function fail(message) {
  console.error(`[deployment-profile] ${message}`);
  process.exitCode = 1;
}

function renderEnvValue(service, key) {
  return service?.envVars?.find((entry) => entry.key === key)?.value;
}

function parseEnvExample(contents) {
  return new Map(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

const blueprint = loadYaml(readFileSync(`${repositoryRoot}/render.yaml`, 'utf8'));
const renderApi = blueprint?.services?.find((service) => service.name === 'haksan-api');
const renderDatabase = blueprint?.databases?.find((database) => database.name === 'haksan-db');

if (!renderApi) fail('render.yaml must define the staging API service');
if (renderEnvValue(renderApi, 'DEPLOYMENT_PROFILE') !== 'staging') {
  fail('Render API must declare DEPLOYMENT_PROFILE=staging');
}
if (renderEnvValue(renderApi, 'DB_BACKUP_ENABLED') !== 'false') {
  fail('Render staging must keep DB_BACKUP_ENABLED=false');
}
if (renderEnvValue(renderApi, 'DB_BACKUP_REQUIRED') !== 'false') {
  fail('Render staging must keep DB_BACKUP_REQUIRED=false');
}
if (renderDatabase?.plan !== 'free') {
  fail('Render blueprint is staging-only and must keep its disposable database on the free plan');
}

const productionEnv = parseEnvExample(
  readFileSync(`${repositoryRoot}/deploy/.env.production.example`, 'utf8'),
);
for (const [key, expected] of [
  ['DEPLOYMENT_PROFILE', 'production'],
  ['DB_BACKUP_ENABLED', 'true'],
  ['DB_BACKUP_REQUIRED', 'true'],
]) {
  if (productionEnv.get(key) !== expected) {
    fail(`deploy/.env.production.example must set ${key}=${expected}`);
  }
}

for (const setting of [
  'DEPLOYMENT_PROFILE=production',
  'DB_BACKUP_ENABLED=true',
  'DB_BACKUP_REQUIRED=true',
]) {
  if (!productionDeployScript.includes(`'${setting}'`)) {
    fail(`deploy/deploy-ecr-release.sh must fail closed unless the runtime env contains ${setting}`);
  }
}

if (!process.exitCode) {
  console.log('[deployment-profile] Render staging and VDS production profiles are separated');
}
