import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export function openStore(path) {
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS entities(kind TEXT, id TEXT, version INTEGER, body TEXT NOT NULL, PRIMARY KEY(kind,id,version));
  CREATE TABLE IF NOT EXISTS credentials(user_id TEXT PRIMARY KEY, hash TEXT NOT NULL, must_change INTEGER NOT NULL DEFAULT 1, failures INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;
  CREATE TRIGGER IF NOT EXISTS entity_no_update BEFORE UPDATE ON entities BEGIN SELECT RAISE(ABORT,'append only'); END;
  CREATE TRIGGER IF NOT EXISTS entity_no_delete BEFORE DELETE ON entities BEGIN SELECT RAISE(ABORT,'append only'); END;`);
  const get=(kind,id)=> {const r=db.prepare('SELECT body FROM entities WHERE kind=? AND id=? ORDER BY version DESC LIMIT 1').get(kind,id); return r?JSON.parse(r.body):null;};
  const list=kind=>db.prepare('SELECT e.body FROM entities e WHERE kind=? AND version=(SELECT MAX(version) FROM entities WHERE kind=e.kind AND id=e.id)').all(kind).map(r=>JSON.parse(r.body));
  const audit=(actor,action,id)=>db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),actor,action,id);
  const save=(kind,body,actor='system')=> {const old=get(kind,body.id); const b={...body,version:(old?.version||0)+1,updatedAt:new Date().toISOString()}; db.prepare('INSERT INTO entities VALUES(?,?,?,?)').run(kind,b.id,b.version,JSON.stringify(b)); audit(actor,`${kind}.save`,b.id); return b;};
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try {const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}};
  return {db,get,list,save,audit,transaction};
}
