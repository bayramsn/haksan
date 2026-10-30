import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runtimeVersionErrors, nativeBoundaryErrors, releaseAssetErrors } from '../../scripts/lib/release-config.mjs';

test('splash accepts portrait PNG while fixed store icon requirements remain enforced', () => {
  const image=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(image);image.writeUInt32BE(13,8);image.write('IHDR',12);image.writeUInt32BE(1284,16);image.writeUInt32BE(2778,20);
  assert.deepEqual(releaseAssetErrors(image,null),[]);
  assert.ok(releaseAssetErrors(image,[1024,1024]).length);
  image.writeUInt32BE(0,16);assert.ok(releaseAssetErrors(image,null).length);
  assert.ok(releaseAssetErrors(Buffer.from('not a png'),null).length);
});

test('explicit runtime matches native app version and rejects incompatible platform overrides', () => {
  assert.deepEqual(runtimeVersionErrors({ version:'1.2.0',runtimeVersion:'1.2.0' }),[]);
  assert.ok(runtimeVersionErrors({ version:'1.2.0',runtimeVersion:'1.1.0' }).length);
  assert.ok(runtimeVersionErrors({ version:'1.2.0',runtimeVersion:'1.2.0',ios:{runtimeVersion:'1.1.0'} }).length);
  assert.ok(runtimeVersionErrors({ version:'1.2.0',runtimeVersion:{policy:'appVersion'} }).length);
  assert.ok(runtimeVersionErrors({}).length);
});
test('CNG boundary accepts anchored rules and rejects tracked native files or missing ignores', () => {
  const root=mkdtempSync(join(tmpdir(),'haksan-release-'));
  const project=join(root,'apps/mobile-v2'); mkdirSync(join(project,'ios'),{recursive:true});mkdirSync(join(project,'android'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
  try {
    git('init');writeFileSync(join(project,'.gitignore'),'/ios/\n/android/\n');
    assert.deepEqual(nativeBoundaryErrors(root),[]);
    writeFileSync(join(project,'ios','project.pbxproj'),'fixture');git('add','-f','apps/mobile-v2/ios/project.pbxproj');
    assert.ok(nativeBoundaryErrors(root).some(error=>error.includes('are tracked')));
    git('rm','--cached','apps/mobile-v2/ios/project.pbxproj');
    writeFileSync(join(project,'.gitignore'),'ios/\nandroid/\n');assert.deepEqual(nativeBoundaryErrors(root),[]);
    writeFileSync(join(project,'.gitignore'),'ios/\n');assert.ok(nativeBoundaryErrors(root).some(error=>error.includes('android')));
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('failed Git inspection is never treated as a passed release gate',()=>assert.ok(nativeBoundaryErrors('/missing',()=>({status:128,stdout:''})).length));
