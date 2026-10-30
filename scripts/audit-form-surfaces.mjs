import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Source inventory only. A missing local feedback component is a review signal,
// not proof of a bug: a parent or shared component may own that state.
const root = process.cwd();
const groups = [
  ['mobile', 'apps/mobile-v2/app'],
  ['mobile', 'apps/mobile-v2/src/ui'],
  ['web', 'apps/web/src/app/components'],
];
const controls = new Set(['Field', 'IconField', 'TextInput', 'Input', 'Textarea', 'textarea', 'input', 'select', 'Combobox', 'RemoteCompanyCombobox', 'RemoteContactCombobox', 'RequestedMachineCombobox', 'OptionPicker', 'MultiOptionPicker', 'SearchSelect', 'TokenSelect', 'CompanyPicker', 'CompanyPickerSheet', 'ContactPicker', 'CompanySelect', 'ContactSelect', 'ProductSelect', 'LookupSelect', 'AssigneeSelect', 'UserSelect', 'BrandSelect', 'TaxOfficeSelect', 'DateTimeField', 'Select', 'Switch', 'SwitchRow', 'Checkbox', 'CheckRow']);
const feedback = new Set(['SelectionStatus', 'ErrorState', 'Loading', 'EmptyState', 'ListSkeleton', 'DetailSkeleton', 'Notice', 'Alert', 'SyncStatus']);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const files = [];
for (const [platform, directory] of groups) {
  for (const file of walk(path.join(root, directory)).filter(file => file.endsWith('.tsx') && !/ \d+\.tsx$|\.test\.tsx$/.test(file))) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const fields = {}, localFeedback = {}, hookImports = new Set(), permissionCalls = new Set();
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        if (controls.has(tag)) fields[tag] = (fields[tag] ?? 0) + 1;
        if (feedback.has(tag)) localFeedback[tag] = (localFeedback[tag] ?? 0) + 1;
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        if (/api\/|lib\/services|\.hooks$/.test(specifier)) {
          for (const item of node.importClause?.namedBindings?.elements ?? []) {
            if (/^use[A-Z]/.test(item.name.text)) hookImports.add(item.name.text);
          }
        }
      }
      if (ts.isCallExpression(node) && /^(useCan|hasPermission|useCanAccessModule)$/.test(node.expression.getText(source))) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) permissionCalls.add(arg.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    files.push({ platform, file: path.relative(root, file), fields, apiHookImports: [...hookImports].sort(), localFeedback, literalPermissionCalls: [...permissionCalls].sort() });
  }
}
const summary = Object.fromEntries(['mobile', 'web'].map(platform => {
  const rows = files.filter(row => row.platform === platform);
  return [platform, { sourceFiles: rows.length, filesWithFields: rows.filter(row => Object.keys(row.fields).length).length, fieldCallsites: rows.reduce((sum, row) => sum + Object.values(row.fields).reduce((a, b) => a + b, 0), 0), byControl: Object.fromEntries([...controls].map(control => [control, rows.reduce((sum, row) => sum + (row.fields[control] ?? 0), 0)]).filter(([, count]) => count)) }];
}));
const report = { generatedAt: new Date().toISOString(), method: 'Static TSX inventory; excludes numbered copy files and tests; no API or device requests. Counts are source callsites, not rendered fields or verified flows.', summary, files };
const target = path.join(root, 'docs/mobile-v2/form-surface-inventory-20261028.json');
fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
