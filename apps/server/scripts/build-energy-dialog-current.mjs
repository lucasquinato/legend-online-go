import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('.'),dir=join(root,'reference/campaign/local-ui');mkdirSync(dir,{recursive:true});
const jar=resolve('../../vendor/ffdec/ffdec.jar');
const run=args=>execFileSync('java',['-Djava.awt.headless=true','-jar',jar,...args],{encoding:'utf8',windowsHide:true,timeout:60000});
const original=readFileSync('reference/campaign/evidence/current13/original.png');
assert.equal(createHash('sha256').update(original).digest('hex'),'680ddc63363643b285211bfd3e61911293130695f918ef2c33c9ec0602f2857a');
writeFileSync(join(dir,'original-13.png'),original);
const swf=Buffer.concat([Buffer.from('CWS'),original.subarray(-121),original.subarray(21,-121)]);
writeFileSync(join(dir,'original-13.swf'),swf);
const before=join(dir,'verify-original'),after=join(dir,'verify-local');
run(['-export','script',before,join(dir,'original-13.swf')]);
const evidence=readFileSync('reference/campaign/evidence/current13/scripts/selectcampaign/view/CampaignInfoView.as','utf8');
const helpers=evidence.slice(evidence.indexOf('      private function useWeary() : void'),evidence.indexOf('      private function alerrBack('));
const imports=['flash.events.TextEvent','flash.text.TextField','flash.display.DisplayObjectContainer','yishi.manager.GoodsManager','yishi.datas.templates.GoodsTemplateInfo','yishi.datas.playerinfo.PlayerInfo','yishi.service.managers.SocketSendManager','yishi.manager.TempleteManager','yishi.view.tips.MessageTipManager'];
const linkHandler=`      private function energyLinkHandler(event:TextEvent) : void
      {
         if(localEnergyPrompt != null)
         {
            localEnergyPrompt.dispose();
            localEnergyPrompt = null;
         }
         if(event.text == "local-energy-use") useWeary();
         if(event.text == "local-energy-buy") FrameControllerManager.instance.openControllerByInfo("shop");
      }
      private function fitEnergyDescription(container:DisplayObjectContainer, frame:TodayNotAlertFrame) : void
      {
         for(var i:int = 0; i < container.numChildren; i++)
         {
            var child:* = container.getChildAt(i);
            if(child is TextField && TextField(child).htmlText.indexOf("local-energy-use") >= 0)
            {
               var text:TextField = TextField(child);
               text.mouseEnabled = true;
               text.selectable = false;
               text.multiline = true;
               text.wordWrap = true;
               text.addEventListener("link",energyLinkHandler);
               var grow:Number = Math.max(0,text.textHeight + 10 - text.height);
               if(grow > 0)
               {
                  text.height += grow;
                  for(var j:int = 0; j < container.numChildren; j++)
                  {
                     var sibling:* = container.getChildAt(j);
                     if(sibling != text && sibling.y > text.y) sibling.y += grow;
                  }
                  frame.height += grow;
               }
               return;
            }
            if(child is DisplayObjectContainer) fitEnergyDescription(DisplayObjectContainer(child),frame);
         }
      }
`;
for(const name of ['CampaignInfoView','CampaignPointView']){
  const path=join(before,'scripts/selectcampaign/view',name+'.as');let source=readFileSync(path,'utf8');
  source=source.replace(/(public class [^{]+\{\s*)/, '$1private var localEnergyPrompt:TodayNotAlertFrame;\n');
  for(const name of imports)if(!source.includes('import '+name+';'))source=source.replace(/(   import [^;]+;)/,`   import ${name};\n$1`);
  const start=source.indexOf('      private function showThewAlert() : Boolean'),end=source.indexOf('      private function ',start+20);
  assert.ok(start>0&&end>start);
  const info=name==='CampaignInfoView',callback=info?'alerrBack':'thewAlertBack';
  const check=info?'PlayerManager.instance.currentPlayerModel.playerInfo.weary < 20 || (model.selectCampaign.DifficultyGrade == 2 && ("singleHeroCount" in playerModel.playerInfo) && Number(Object(playerModel.playerInfo)["singleHeroCount"]) <= 0)':'PlayerManager.instance.currentPlayerModel.playerInfo.weary < 20';
  const method=`      private function showThewAlert() : Boolean
      {
         if(!(${check})) return false;
         var prompt:TodayNotAlertFrame = ComponentFactory.Instance.creatComponentByStylename("core.TodayNotAlertFrame");
         localEnergyPrompt = prompt;
         var message:String = "Energia insuficiente ou tentativas heroicas esgotadas. Confirmar permite entrar sem XP, drops e cartas; o progresso da campanha continua válido.";
         message += "<br/><br/><font color='#0066FF'><a href='event:local-energy-use'><u>Usar poção de energia</u></a></font>";
         message += "<br/><font color='#0066FF'><a href='event:local-energy-buy'><u>Comprar poção de energia na loja</u></a></font>";
         prompt.show(message,LanguageMgr.GetTranslation("yishi.view.base.ThewAlertFrame.text"),${callback},null,"left",1,true);
         prompt.containerY = 18;
         fitEnergyDescription(prompt,prompt);
         return true;
      }
`;
  source=source.slice(0,start)+method+linkHandler+(info?'':helpers)+source.slice(end);
  writeFileSync(join(dir,name+'.as'),source);
}
writeFileSync(join(root,'data/energy-ui-compile.log'),run(['-replace',join(dir,'original-13.swf'),join(dir,'local-13.swf'),'selectcampaign.view.CampaignInfoView',join(dir,'CampaignInfoView.as'),'selectcampaign.view.CampaignPointView',join(dir,'CampaignPointView.as')]));
const modified=readFileSync(join(dir,'local-13.swf'));
// ModuleLoader.handleModule accepts CWS directly. MD5_OBJECT is empty in this
// client's Loading.swf: a road7 prefix would instead be passed to decry as SWF data.
assert.equal(modified.subarray(0,3).toString(),'CWS');
const wrapped=modified;
writeFileSync(join(dir,'local-13.png'),wrapped);
run(['-export','script',after,join(dir,'local-13.swf')]);
function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(path,e.name)):[join(path,e.name)]);}
let unchanged=0;
for(const path of files(join(before,'scripts'))){
  const name=relative(before,path),target=join(after,name);
  if(/CampaignInfoView\.as$|CampaignPointView\.as$/.test(name)){
    const text=readFileSync(target,'utf8');assert.ok(text.includes('Comprar poção de energia na loja'));assert.ok(text.includes('local-energy-use'));
    assert.ok(text.includes('openControllerByInfo("shop")'));continue;
  }
  assert.equal(readFileSync(path,'utf8'),readFileSync(target,'utf8'),name);unchanged++;
}
const manifest={sourcePath:'/cdn/13_2b946fcf.png',sourceSha256:createHash('sha256').update(original).digest('hex'),localSha256:createHash('sha256').update(wrapped).digest('hex'),localMd5:createHash('md5').update(wrapped).digest('hex').slice(8,16),format:'CWS',onlyChangedScripts:['selectcampaign.view.CampaignInfoView','selectcampaign.view.CampaignPointView'],unchangedScripts:unchanged};
writeFileSync(join(dir,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
