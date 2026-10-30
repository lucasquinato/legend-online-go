import{readFileSync}from'node:fs';import{resolve}from'node:path';import{createHash}from'node:crypto';import{execFileSync}from'node:child_process';
const id=process.argv[2],candidate=process.argv[3];if(!/^\d+$/.test(id??'')||!candidate)throw Error('Usage: node scripts/swf/audit.mjs MODULE CANDIDATE.swf [REPORT.json]');
const release=JSON.parse(readFileSync('reference/ui-compat/release-lock.json')),entry=release.modules[id];if(!entry)throw Error('Module must be pinned in the release contract before auditing');
if(createHash('sha256').update(readFileSync(entry.file)).digest('hex')!==entry.sha256)throw Error('Pinned source hash changed');
const args=['-Djava.awt.headless=true','-cp',resolve('../../vendor/ffdec/ffdec.jar'),resolve('scripts/swf/SafeSwfAudit.java'),resolve(entry.file),resolve(candidate),resolve(process.argv[4]??'reference/ui-compat/audit-'+id+'.json'),...entry.allowedMethods];
execFileSync('java',args,{stdio:'inherit',windowsHide:true,timeout:120000});
