// Read-only audit of the backend cache; does not download or change game state.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { validMountAsset } from './collect-mount-assets.mjs';
const db = new DatabaseSync('data/state.sqlite', { readOnly: true });
try {
  const content = JSON.parse(readFileSync('reference/mounts/content.json'));
  const assets = db.prepare('SELECT * FROM assets ORDER BY saved_at DESC').all();
  const canonical = path => path.replace(/_[a-f0-9]{8}(?=\.[^/.]+$)/ig, '').replace(/\/+/g, '/').toLowerCase();
  const lookup = new Map();
  for (const asset of assets) {
    const key = canonical(asset.path);
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key).push(asset);
  }
  const checked = new Map();
  function verify(row) {
    if (!checked.has(row.sha256)) {
      let result;
      try {
        const bytes = readFileSync('data/assets/objects/' + row.sha256 + '.bin');
        result = { valid: bytes.length > 0 && bytes.length === row.bytes && createHash('sha256').update(bytes).digest('hex') === row.sha256, bytes: bytes.length };
      } catch (error) { result = { valid: false, error: error.code ?? error.message }; }
      checked.set(row.sha256, result);
    }
    const result = checked.get(row.sha256);
    return { ...result, valid: result.valid && result.bytes === row.bytes };
  }
  const indexRow = assets.find(row => row.path === '/client/res_md5.dat');
  if (!indexRow || !verify(indexRow).valid) throw new Error('Índice de recursos ausente ou inválido.');
  const xml = inflateSync(inflateSync(readFileSync('data/assets/objects/' + indexRow.sha256 + '.bin'))).toString();
  const index = new Map();
  for (const item of xml.matchAll(/<Item\s+([^>]+)\/?\s*>/g)) {
    const fields = Object.fromEntries([...item[1].matchAll(/(\w+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
    if (fields.name) index.set(canonical('/cdn/' + fields.name.replaceAll('\\', '/')), fields);
  }
  function resource(path) {
    const key = canonical(path), info = index.get(key);
    const expectedPath = info?.md5 ? key.replace(/(\.[^/.]+)$/, '_' + info.md5 + '$1') : key;
    const rows = lookup.get(key) ?? [];
    const objects = rows.map(row => {
      const result=verify(row), exact=row.path.replace(/\/+/g,'/').toLowerCase()===expectedPath;
      const valid=result.valid&&validMountAsset(readFileSync('data/assets/objects/'+row.sha256+'.bin'),{path:row.path,expectedBytes:exact&&info?Number(info.size):null},row.content_type);
      return { path: row.path, sha256: row.sha256, ...result, valid, declaredBytes: row.bytes, savedAt: row.saved_at };
    });
    const valid = objects.filter(row => row.valid);
    const exact = valid.filter(row => row.path.replace(/\/+/g, '/').toLowerCase() === expectedPath);
    return { path: key, expectedPath, indexed: Boolean(info), cached: valid.length > 0,
      expectedCached: exact.length > 0, status: exact.length ? 'expected-cached' : valid.length ? 'other-version-or-path-only' : objects.length ? 'invalid' : 'missing', objects };
  }
  const byMount = new Map();
  for (const card of content.cards) {
    const id = Number(card.Property1);
    if (!byMount.has(id)) byMount.set(id, []);
    byMount.get(id).push(card);
  }
  const accounts = db.prepare('SELECT u.username,c.state FROM users u JOIN city_worlds c ON c.user_id=u.id').all().map(row => ({ username: row.username, saved: JSON.parse(row.state) }));
  const mounts = content.mounts.map(mount => ({ id: Number(mount.TemplateId), name: mount.TemplateName,
    avatarPath: mount.AvatarPath, flying: Number(mount.IsFly) === 1,
    preview: resource('/cdn/equip_show' + mount.AvatarPath + '/2.swf'),
    world: resource('/cdn/swf/avatar' + mount.AvatarPath + '/2.bswf'),
    cards: (byMount.get(Number(mount.TemplateId)) ?? []).map(card => ({ id: Number(card.TemplateId), name: card.TemplateName,
      icon: resource('/cdn/icon/' + card.Icon.replace(/^\//, '')) })),
    activeOn: accounts.filter(({ saved }) => { const row = saved.mounts?.owned?.[mount.TemplateId]; return row && (row.expiresAt === null || row.expiresAt > Date.now()); }).map(row => row.username),
  }));
  function summarize(resources) {
    return { total: resources.length, cached: resources.filter(row => row.cached).length,
      expectedCached: resources.filter(row => row.expectedCached).length,
      otherVersionOrPathOnly: resources.filter(row => row.status === 'other-version-or-path-only').length,
      missing: resources.filter(row => row.status === 'missing').length, invalid: resources.filter(row => row.status === 'invalid').length };
  }
  const failures = db.prepare("SELECT path,status,hits,seen_at FROM dependencies WHERE path LIKE '%mount%' AND status<>200 ORDER BY hits DESC").all();
  const report = { at: new Date().toISOString(), scope: 'Todas as montarias da tabela recuperada; integridade por tamanho/SHA-256; não é teste visual no AIR.',
    evidence: { preview: 'reference/campaign/evidence/version2/scripts/yishi/utils/MountAvatarPathHelper.as:getUrl',
      world: 'reference/campaign/evidence/version2/scripts/yishi/manager/PathManager.as:getAvatarResourcePath (mount)',
      note: 'A presença do preview não substitui o BSWF do mapa. Recursos de personagem/modas em posição montada são dependências adicionais. Montarias de combate dragonic pertencem a outra tabela/sistema, não devem ser exigidas de todas as montarias comuns.' },
    sourceIndex: { path: indexRow.path, sha256: indexRow.sha256, savedAt: indexRow.saved_at },
    summary: { templates: mounts.length, previews: summarize(mounts.map(row => row.preview)), worldAnimations: summarize(mounts.map(row => row.world)),
      cardIcons: summarize(mounts.flatMap(row => row.cards.map(card => card.icon))),
      bothPreviewAndWorldCached: mounts.filter(row => row.preview.cached && row.world.cached).length,
      bothExpectedCached: mounts.filter(row => row.preview.expectedCached && row.world.expectedCached).length,
      objectsVerified: checked.size, invalidObjects: [...checked.values()].filter(row => !row.valid).length },
    mounts, observedFailedRequests: failures };
  writeFileSync('reports/montarias/visuais-auditoria-completa.json', JSON.stringify(report, null, 2));
  const rows = mounts.map(row => `${row.id}\t${row.name}\t${row.preview.status}\t${row.world.status}\t${row.cards.map(card => card.icon.status).join(',') || 'sem carta'}\t${row.avatarPath}`);
  const missingPreview = mounts.filter(row => !row.preview.cached).map(row => `- ${row.id}: ${row.name} (${row.preview.path})`);
  const text = ['Auditoria de visuais de todas as montarias', report.at, JSON.stringify(report.summary, null, 2),
    '', 'PREVIEWS AUSENTES/INVÁLIDOS', ...missingPreview, '', 'TODAS AS MONTARIAS',
    'ID\tNome\tPreview\tAnimação no mapa\tÍcones das cartas\tAvatarPath', ...rows,
    '', 'PEDIDOS OBSERVADOS COM FALHA (histórico; pode haver recurso obtido posteriormente)', ...failures.map(row => `${row.status}\t${row.hits}\t${row.path}`)].join('\n');
  writeFileSync('reports/montarias/visuais-auditoria-completa.txt', text);
  console.log(JSON.stringify(report.summary));
  console.log(JSON.stringify({ missingPreviewCount: missingPreview.length,
    mageActive: mounts.filter(row => row.activeOn.includes('pirata_teste')).length,
    mageActiveWithoutWorld: mounts.filter(row => row.activeOn.includes('pirata_teste') && !row.world.cached).length }));
} finally { db.close(); }
