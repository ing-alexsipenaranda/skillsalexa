'use strict';
const {DatabaseSync} = require('node:sqlite');
const {createHash, randomBytes, createCipheriv, createDecipheriv} = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
class Store {
  constructor(path, key) {
    this.key = key;
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS items (kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER NOT NULL, PRIMARY KEY(kind,id))');
  }
  seal(value) {
    const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', this.key, iv);
    return Buffer.concat([iv,c.update(JSON.stringify(value),'utf8'),c.final(),c.getAuthTag()]).toString('base64');
  }
  open(value) {
    const bytes = Buffer.from(value,'base64'), c = createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));
    c.setAuthTag(bytes.subarray(-16));
    return JSON.parse(Buffer.concat([c.update(bytes.subarray(12,-16)),c.final()]).toString());
  }
  put(kind,id,payload,expires) {
    this.db.prepare('INSERT OR REPLACE INTO items VALUES (?,?,?,?)').run(kind,digest(id),this.seal(payload),expires);
  }
  get(kind,id,consume=false) {
    const row = this.db.prepare('SELECT payload,expires FROM items WHERE kind=? AND id=?').get(kind,digest(id));
    if (!row) return null;
    if (consume || row.expires <= Date.now()) this.remove(kind,id);
    if (row.expires <= Date.now()) return null;
    return {value:this.open(row.payload),expires:row.expires};
  }
  remove(kind,id) { this.db.prepare('DELETE FROM items WHERE kind=? AND id=?').run(kind,digest(id)); }
  clean() { this.db.prepare('DELETE FROM items WHERE expires<=?').run(Date.now()); }
  close() { this.db.close(); }
}
module.exports = {Store,digest};
