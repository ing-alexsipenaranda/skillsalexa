'use strict';
// Administrative command; never expose this operation through the public HTTP server.
const {Store}=require('./store');
if(process.argv[2]!=='--all')throw new Error('Usage: node broker/revoke.js --all (revokes every Alexa link on this broker)');
const key=Buffer.from(process.env.TOKEN_ENCRYPTION_KEY || '', 'base64');
if(!process.env.BROKER_DB || key.length!==32)throw new Error('BROKER_DB and valid TOKEN_ENCRYPTION_KEY required');
const store=new Store(process.env.BROKER_DB,key);
try{store.db.exec('DELETE FROM items');console.log('All broker links revoked. Existing Supabase access tokens expire at their normal expiry.');}finally{store.close();}
