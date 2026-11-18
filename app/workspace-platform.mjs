import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, randomInt, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
export {randomBytes,randomInt,randomUUID,timingSafeEqual};
export const derive=promisify(scrypt);
export const fromHex=value=>Buffer.from(value,'hex');
export const tokenHash=value=>createHash('sha256').update(value).digest('hex');
export function openDatabase(file){
  let db;
  if (file!==':memory:') {
    file=resolve(file); mkdirSync(dirname(file),{recursive:true,mode:0o700});
    // Create the DB with owner-only permissions before SQLite can create sidecars.
    const previous=process.umask(0o077);
    try { db=new DatabaseSync(file); chmodSync(file,0o600); }
    finally { process.umask(previous); }
  } else db=new DatabaseSync(file);
  return db;
}
