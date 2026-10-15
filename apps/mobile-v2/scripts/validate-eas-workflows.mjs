import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import * as yaml from 'js-yaml';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workflowRoot = resolve(projectRoot, '.eas/workflows');
const schemaUrl = 'https://api.expo.dev/v2/workflows/schema';
const maxWorkflowBytes = 16 * 1024;
const failures = [];
const isCi = /^(1|true)$/i.test(process.env.CI ?? '');

async function fetchCurrentSchema() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(schemaUrl, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!body?.data) throw new Error('schema response has no data');
      return body.data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((done) => setTimeout(done, attempt * 1_000));
    }
  }
  const message = `current Expo workflow schema could not be fetched: ${lastError?.message ?? 'unknown error'}`;
  // CI/release doğrulaması güncel Expo şeması olmadan başarı sayılmaz. Yerel,
  // ağsız geliştirmede ise YAML + proje semantiğini doğrulamaya devam eder ve
  // tam şema kontrolünün atlandığını açıkça bildirir.
  if (isCi) throw new Error(message);
  console.warn(`WARNING ${message}; running offline structural validation only`);
  return null;
}

function addFailure(file, message) {
  failures.push(`${file}: ${message}`);
}

function validateOfflineStructure(file, workflow) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    addFailure(file, 'workflow root must be an object');
    return false;
  }
  if (typeof workflow.name !== 'string' || !workflow.name.trim()) {
    addFailure(file, 'name must be a non-empty string');
  }
  if (!workflow.on || typeof workflow.on !== 'object' || Array.isArray(workflow.on)) {
    addFailure(file, 'on must be an event map');
  }
  if (!workflow.jobs || typeof workflow.jobs !== 'object' || Array.isArray(workflow.jobs)) {
    addFailure(file, 'jobs must be a non-empty map');
    return false;
  }
  const entries = Object.entries(workflow.jobs);
  if (entries.length === 0) addFailure(file, 'jobs must not be empty');
  for (const [jobId, job] of entries) {
    if (!/^[A-Za-z0-9_-]+$/.test(jobId)) addFailure(file, `invalid job id "${jobId}"`);
    if (!job || typeof job !== 'object' || Array.isArray(job)) {
      addFailure(file, `jobs.${jobId} must be an object`);
    }
  }
  return true;
}

function hasApprovalAncestor(jobs, jobId, seen = new Set()) {
  if (seen.has(jobId)) return false;
  seen.add(jobId);
  const job = jobs[jobId];
  if (!job) return false;
  if (job.type === 'require-approval') return true;
  return (job.needs ?? []).some((dependency) => hasApprovalAncestor(jobs, String(dependency), seen));
}

async function validateProjectSemantics(file, workflow, easConfig) {
  const jobs = workflow.jobs ?? {};
  const jobIds = new Set(Object.keys(jobs));

  for (const [jobId, job] of Object.entries(jobs)) {
    for (const relation of ['needs', 'after']) {
      for (const dependency of job[relation] ?? []) {
        if (!jobIds.has(String(dependency))) {
          addFailure(file, `jobs.${jobId}.${relation} references missing job "${dependency}"`);
        }
      }
    }

    if (job.type === 'build') {
      const profile = job.params?.profile ?? 'production';
      if (!easConfig.build?.[profile]) {
        addFailure(file, `jobs.${jobId} references missing EAS build profile "${profile}"`);
      }
    }

    if (job.type === 'submit') {
      const profile = job.params?.profile ?? 'production';
      if (!easConfig.submit?.[profile]) {
        addFailure(file, `jobs.${jobId} references missing EAS submit profile "${profile}"`);
      }
      if (!hasApprovalAncestor(jobs, jobId)) {
        addFailure(file, `jobs.${jobId} can submit a store build without a human approval ancestor`);
      }
    }

    if (job.type === 'update' && job.params?.channel === 'production' && !hasApprovalAncestor(jobs, jobId)) {
      addFailure(file, `jobs.${jobId} can publish a production OTA update without human approval`);
    }

    if (job.type === 'maestro') {
      const paths = Array.isArray(job.params?.flow_path) ? job.params.flow_path : [job.params?.flow_path];
      for (const flowPath of paths.filter(Boolean)) {
        if (/[*?{}[\]]/.test(flowPath)) continue;
        try {
          await stat(resolve(projectRoot, flowPath));
        } catch {
          addFailure(file, `jobs.${jobId} references missing Maestro flow "${flowPath}"`);
        }
      }
    }
  }
}

async function main() {
  const schema = await fetchCurrentSchema();
  let validate = null;
  if (schema) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    validate = ajv.compile(schema);
  }
  const easConfig = JSON.parse(await readFile(resolve(projectRoot, 'eas.json'), 'utf8'));
  const files = (await readdir(workflowRoot))
    .filter((file) => /\.ya?ml$/i.test(file))
    .sort();

  if (files.length === 0) throw new Error('no .eas/workflows/*.yml files found');

  for (const file of files) {
    const path = resolve(workflowRoot, file);
    const source = await readFile(path, 'utf8');
    if (Buffer.byteLength(source) > maxWorkflowBytes) {
      addFailure(file, `workflow exceeds Expo's ${maxWorkflowBytes}-byte limit`);
      continue;
    }

    let workflow;
    try {
      workflow = yaml.load(source);
    } catch (error) {
      addFailure(file, `invalid YAML: ${error.message}`);
      continue;
    }

    if (!validateOfflineStructure(file, workflow)) continue;

    if (validate && !validate(workflow)) {
      for (const error of validate.errors ?? []) {
        addFailure(file, `${error.instancePath || '(root)'} ${error.message}`);
      }
      continue;
    }

    await validateProjectSemantics(file, workflow, easConfig);
    console.log(
      validate
        ? `validated ${file} against the current Expo workflow schema`
        : `validated ${file} with offline structure and project-semantic checks`
    );
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`ERROR ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `validated ${files.length} EAS workflow file(s)${validate ? '' : ' (Expo schema check deferred until networked CI)'}`
  );
}

main().catch((error) => {
  console.error(`ERROR workflow validation failed: ${error.message}`);
  process.exitCode = 1;
});
