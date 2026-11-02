#!/usr/bin/env node
/** Static read-route inventory. This verifies route registration, not device UX or live data. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { normalizePath } from './audit-action-parity.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allMethods = process.argv.includes('--all-methods');
const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  if (entry.name.includes(' ') || entry.name === 'node_modules') return [];
  const full = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(full) : /\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name) ? [full] : [];
});
const parse = file => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const literals = node => {
  if (!node) return [];
  if (ts.isStringLiteralLike(node)) return [node.text];
  if (ts.isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const span of node.templateSpans) {
      const known = literals(span.expression);
      const choices = known.length ? known : ['${' + span.expression.getText() + '}'];
      values = values.flatMap(prefix => choices.map(choice => prefix + choice + span.literal.text));
    }
    return values;
  }
  if (ts.isConditionalExpression(node)) return [...literals(node.whenTrue), ...literals(node.whenFalse)];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(literals);
  return [];
};
const decorators = node => ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []).map(item => item.expression).filter(ts.isCallExpression) : [];
const objectProperty = (node, key) => ts.isObjectLiteralExpression(node ?? {}) ? node.properties.find(prop => ts.isPropertyAssignment(prop) && prop.name.getText().replace(/['"]/g, '') === key)?.initializer : undefined;
const endpoints = [];
for (const file of walk(path.join(root, 'apps/api/src/modules')).filter(file => file.endsWith('.controller.ts'))) {
  const source = parse(file);
  for (const declaration of source.statements.filter(ts.isClassDeclaration)) {
    const controller = decorators(declaration).find(item => item.expression.getText() === 'Controller');
    if (!controller) continue;
    const arg = controller.arguments[0];
    const bases = arg ? literals(objectProperty(arg, 'path') ?? arg) : [''];
    for (const member of declaration.members.filter(ts.isMethodDeclaration)) {
      for (const route of decorators(member).filter(item => /^(Get|Post|Put|Patch|Delete)$/.test(item.expression.getText()))) {
        for (const base of bases) for (const sub of route.arguments[0] ? literals(route.arguments[0]) : ['']) {
          endpoints.push({ method: route.expression.getText().toUpperCase(), path: normalizePath(`/${base}/${sub}`), controller: declaration.name?.text, handler: member.name.getText(), file: path.relative(root, file) });
        }
      }
    }
  }
}
const reads = [], unresolved = [];
for (const file of [...walk(path.join(root, 'apps/mobile-v2/src')), ...walk(path.join(root, 'apps/mobile-v2/app'))]) {
  const source = parse(file);
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'request') {
      const methods = literals(objectProperty(node.arguments[1], 'method'));
      if (allMethods || !methods.length || methods.includes('GET')) {
        const routes = literals(node.arguments[0]);
        const location = { file: path.relative(root, file), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 };
        if (!routes.length) unresolved.push({ ...location, expression: node.arguments[0]?.getText() ?? '' });
        const pathNode = node.arguments[0], methodNode = objectProperty(node.arguments[1], 'method');
        const paired = allMethods && pathNode && methodNode && ts.isConditionalExpression(pathNode) && ts.isConditionalExpression(methodNode) && pathNode.condition.getText() === methodNode.condition.getText();
        const variants = paired ? [[pathNode.whenTrue, methodNode.whenTrue], [pathNode.whenFalse, methodNode.whenFalse]].flatMap(([route, method]) => literals(route).flatMap(value => literals(method).map(verb => ({ method: verb, path: normalizePath(value) })))) : routes.flatMap(route => (allMethods && methods.length ? methods : ['GET']).map(method => ({ method, path: normalizePath(route) })));
        for (const variant of variants) reads.push({ ...location, ...variant });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matches = (read, endpoint) => endpoint.method === read.method && new RegExp('^' + endpoint.path.split('/').map(segment => segment.startsWith(':') ? '[^/]+' : escape(segment)).join('/') + '$').test(read.path);
const rows = reads.map(read => ({ ...read, registered: endpoints.filter(endpoint => matches(read, endpoint)).map(endpoint => ({ controller: endpoint.controller, handler: endpoint.handler })) }));
const missing = rows.filter(row => row.registered.length === 0);
const counts = allMethods ? { backendEndpoints: endpoints.length, mobileCallsites: rows.length, registeredCallsites: rows.length - missing.length, unresolvedExpressions: unresolved.length } : { backendEndpoints: endpoints.length, mobileReadCallsites: rows.length, registeredReadCallsites: rows.length - missing.length, unresolvedReadExpressions: unresolved.length };
const report = { generatedAt: new Date().toISOString(), counts, missing, unresolved, rows };
const target = path.join(root, allMethods ? 'docs/mobile-v2/api-all-route-audit.json' : 'docs/mobile-v2/api-read-route-audit.json');
fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report.counts, missing, unresolved }, null, 2));
if (missing.length) process.exitCode = 1;
