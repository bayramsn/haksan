import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
const root = process.cwd();
let report;
await build({
  root: path.join(root, 'apps/web'), configFile: path.join(root, 'apps/web/vite.config.ts'), logLevel: 'error', build: { write: false },
  plugins: [{ name: 'initial-bundle-audit', generateBundle(_options, bundle) {
    const entry = Object.values(bundle).find(item => item.type === 'chunk' && item.isEntry);
    if (!entry) throw new Error('Web entry chunk missing');
    const initial = new Set();
    function visit(file) { if(initial.has(file))return;initial.add(file);const chunk=bundle[file];if(chunk?.type==='chunk')chunk.imports.forEach(visit); }
    visit(entry.fileName);
    const chunks=[...initial].map(file=>bundle[file]).filter(chunk=>chunk?.type==='chunk');
    const modules=chunks.flatMap(chunk=>Object.keys(chunk.modules));
    const excluded=['/app/WorkspaceApp.tsx','/dialogs/CreateDialogs.tsx','/dialogs/QuoteDialog.tsx','/hexlaser-2026-data.ts','/laser-source-data.ts'];
    const unexpected=modules.filter(file=>excluded.some(suffix=>file.endsWith(suffix)));
    if(unexpected.length)throw new Error(`Deferred modules loaded initially: ${unexpected.join(', ')}`);
    report={ generatedAt:new Date().toISOString(), method:'Production Rollup initial entry plus recursive static imports; dynamic imports excluded; no runtime timing claims.', initialJsBytes:chunks.reduce((sum,chunk)=>sum+Buffer.byteLength(chunk.code),0), initialGzipBytes:chunks.reduce((sum,chunk)=>sum+gzipSync(chunk.code).length,0), chunks:chunks.map(chunk=>({file:chunk.fileName,bytes:Buffer.byteLength(chunk.code)})), deferredModuleChecks:excluded.map(module=>({module,deferred:true})), largestInitialModules:modules.map(file=>({file:path.relative(root,file),bytes:chunks.find(chunk=>chunk.modules[file])?.modules[file].renderedLength??0})).sort((a,b)=>b.bytes-a.bytes).slice(0,15) };
    if(report.initialJsBytes>650_000)throw new Error(`Initial JS budget exceeded: ${report.initialJsBytes} > 650000`);
  } }],
});
fs.writeFileSync(path.join(root,'docs/mobile-v2/web-bundle-audit-20261028.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({initialJsBytes:report.initialJsBytes,initialGzipBytes:report.initialGzipBytes,deferredChecks:report.deferredModuleChecks.length},null,2));
