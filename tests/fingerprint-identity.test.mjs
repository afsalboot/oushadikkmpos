import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { databaseIdentity, matchesLegacyIdentity } from '../scripts/fingerprint-identity.mjs';
test('database identity survives SRV node reordering but rejects another database or host set',()=>{
  const hosts=['node-c:27017','node-a:27017','node-b:27017'];
  const identity=databaseIdentity(hosts,'isolated');
  assert.equal(databaseIdentity([...hosts].reverse(),'isolated'),identity);
  assert.notEqual(databaseIdentity(hosts,'another'),identity);
  assert.notEqual(databaseIdentity(['node-d:27017',...hosts.slice(1)],'isolated'),identity);
});
test('legacy discovery-order identity is verified rather than overwriting the before report',()=>{
  const legacy=createHash('sha256').update('node-c:27017,node-a:27017,node-b:27017|isolated').digest('hex');
  assert.equal(matchesLegacyIdentity(legacy,['node-a:27017','node-b:27017','node-c:27017'],'isolated'),true);
  assert.equal(matchesLegacyIdentity(legacy,['node-a:27017','node-b:27017','node-d:27017'],'isolated'),false);
  assert.equal(matchesLegacyIdentity(legacy,['node-a:27017','node-b:27017','node-c:27017'],'another'),false);
});
