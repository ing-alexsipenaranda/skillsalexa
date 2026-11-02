'use strict';
const {DatabaseSync} = require('node:sqlite');
const {mkdirSync, chmodSync, existsSync} = require('node:fs');
const {dirname, resolve} = require('node:path');

const source = resolve(process.env.BROKER_DB || '/data/evoll-alexa.sqlite');
const destination = resolve(process.argv[2] || `/data/backups/evoll-alexa-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
if (source === destination) throw new Error('Backup destination must differ from BROKER_DB');
mkdirSync(dirname(destination), {recursive:true, mode:0o700});
if (existsSync(destination)) throw new Error('Backup destination already exists; choose a new filename');
const db = new DatabaseSync(source, {readOnly:true});
try { db.prepare('VACUUM INTO ?').run(destination); }
finally { db.close(); }
chmodSync(destination, 0o600);
console.log(destination);
