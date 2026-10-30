import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';

// Administrative collection grant. Run with the local game server stopped.
const listening = await new Promise(resolve => {
  const socket = net.connect({ host: '127.0.0.1', port: 5004 });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});
assert.equal(listening, false, 'Stop the local game server before changing its save');
const db = new DatabaseSync('data/state.sqlite');
try {
  const row = db.prepare('SELECT w.state,u.username,p.icon FROM city_worlds w JOIN users u ON u.id=w.user_id JOIN tutorial_profiles p ON p.user_id=w.user_id WHERE w.user_id=1826').get();
  assert.equal(row.username, 'pirata_teste');
  assert.ok([3, 4].includes(row.icon), 'Target must be the mage');
  const before = JSON.parse(row.state);
  const after = structuredClone(before);
  const items = JSON.parse(fs.readFileSync('reference/item-templates.json', 'utf8')).items;
  const templates = Object.values(items).filter(r => r.MasterType === '1' && [109, 110, 111, 112].includes(Number(r.SonType)));
  const ids = templates.map(r => Number(r.TemplateId));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => before.state.fashionIds.includes(id)));
  let added = 0;
  for (const id of ids) {
    if (after.state.fashions[id]) continue;
    after.state.fashions[id] = { temp_id: id, is_switch: 0, appraisal_skill: 0 };
    added++;
  }
  const check = structuredClone(after);
  check.state.fashions = before.state.fashions;
  assert.deepEqual(check, before, 'Only the fashion collection may change');
  const otherRows = db.prepare('SELECT user_id,state FROM city_worlds WHERE user_id<>1826 ORDER BY user_id').all();
  const backup = path.join('data/backups', 'activate-mage-fashions-' + new Date().toISOString().replaceAll(':', '-'));
  fs.mkdirSync(backup, { recursive: true });
  db.prepare('VACUUM INTO ?').run(path.join(backup, 'state.sqlite'));
  db.exec('BEGIN IMMEDIATE');
  try {
    assert.equal(db.prepare('SELECT state FROM city_worlds WHERE user_id=1826').get().state, row.state);
    db.prepare('UPDATE city_worlds SET state=? WHERE user_id=1826').run(JSON.stringify(after));
    assert.deepEqual(db.prepare('SELECT user_id,state FROM city_worlds WHERE user_id<>1826 ORDER BY user_id').all(), otherRows);
    const saved = JSON.parse(db.prepare('SELECT state FROM city_worlds WHERE user_id=1826').get().state);
    assert.deepEqual(saved, after);
    assert.ok(ids.every(id => saved.state.fashions[id]?.temp_id === id));
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const report = {
    userId: 1826, username: row.username,
    before: Object.keys(before.state.fashions).length,
    added, total: Object.keys(after.state.fashions).length,
    byPart: Object.fromEntries([109, 110, 111, 112].map(type => [type, templates.filter(r => Number(r.SonType) === type).length])),
    backup, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(backup, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync('data/mage-fashions-activation.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  db.close();
}
