// Build real editable PowerPoint slides and export with the same native layout engine.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import fs from 'node:fs';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const source=join(root,'submission','source');
const run=(command,args)=>{
  const result=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Presentation build failed; published files were not replaced.');
};
if(process.platform!=='win32')throw Error('Native export requires Windows and installed Microsoft PowerPoint. The editable PPTX can also be opened and exported directly.');
run(process.execPath,[join(source,'generate-deck.mjs')]);
const quote=value=>"'"+value.replaceAll("'","''")+"'";
// Execute this local source without changing the machine's execution policy.
const command=`& ([ScriptBlock]::Create((Get-Content -LiteralPath ${quote(join(source,'build-deck.ps1'))} -Raw -Encoding UTF8))) -ProjectRoot ${quote(root)}`;
run('powershell.exe',['-NoProfile','-NonInteractive','-Command',command]);
const review=join(root,'.artifacts','submission','native-review');
const layout=JSON.parse(fs.readFileSync(join(review,'layout.json'),'utf8').replace(/^\uFEFF/,''));
if(layout.pageCount!==11||layout.slides.some(s=>s.collisions.length||s.textBoxes.some(t=>t.issues.length)))throw Error('Native layout verification failed.');
const staged=join(root,'.artifacts','submission','rebuilt');
for(const name of ['Teamfare-pitch-deck.pptx','Teamfare-pitch-deck.pdf','Teamfare-cover.png']){
  const input=join(staged,name),output=join(root,'submission',name);
  if(fs.statSync(input).size<1000)throw Error('Empty presentation export.');
  fs.copyFileSync(input,output);
}
console.log(JSON.stringify({slides:11,font:'Times New Roman',renderer:layout.renderer,textOverflows:0,textCollisions:0,outputs:['submission/Teamfare-pitch-deck.pdf','submission/Teamfare-pitch-deck.pptx','submission/Teamfare-cover.png']}));
