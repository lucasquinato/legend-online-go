import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const server=fileURLToPath(new URL('../apps/server/',import.meta.url));
const child=spawn(process.execPath,['--import','tsx','--test',...process.argv.slice(2),'test/*.test.ts'],{cwd:server,stdio:'inherit',windowsHide:true,env:{...process.env,LEGEND_SKIP_ENV_FILE:'true'}});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
