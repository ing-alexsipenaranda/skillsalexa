const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,readFileSync,statSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {Store}=require('../broker/store');
test('online WAL backup restores encrypted links and never overwrites an existing backup',t=>{
  const dir=mkdtempSync(join(tmpdir(),'evoll-backup-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'source.sqlite'),backup=join(dir,'backup.sqlite'),key=randomBytes(32);
  const store=new Store(source,key);
  t.after(()=>store.close());
  store.put('refresh','opaque-token',{user_id:'test-user',refresh_token:'private-value'},Date.now()+60000);
  const run=()=>spawnSync(process.execPath,['broker/backup.js',backup],{env:{...process.env,BROKER_DB:source},encoding:'utf8'});
  assert.equal(run().status,0);
  assert.equal(statSync(backup).mode&0o777,0o600);
  assert.equal(readFileSync(backup).includes(Buffer.from('private-value')),false);
  const restored=new Store(backup,key);
  try {
    assert.equal(restored.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(restored.get('refresh','opaque-token').value.refresh_token,'private-value');
  }finally{restored.close();}
  const before=readFileSync(backup);
  assert.notEqual(run().status,0);
  assert.deepEqual(readFileSync(backup),before);
  const wrongKey=new Store(backup,randomBytes(32));
  try {assert.throws(()=>wrongKey.get('refresh','opaque-token'));}finally{wrongKey.close();}
});
