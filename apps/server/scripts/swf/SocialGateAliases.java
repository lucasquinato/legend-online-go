import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.traits.*;import com.jpexs.decompiler.flash.tags.Tag;
class SocialGateAliases {
 static AVM2Instruction i(int op,int...x){return new AVM2Instruction(0,op,x);}
 static void code(com.jpexs.decompiler.flash.abc.types.MethodBody b,AVM2Instruction...x){AVM2Code c=new AVM2Code();c.code.addAll(List.of(x));b.setCode(c);b.max_stack=8;b.max_regs=Math.max(b.max_regs,5);b.setModified();}
 public static void main(String[]args)throws Exception{SWF s=new SWF(new FileInputStream(args[0]),true);
 for(var p:s.getAS3Packs()){var a=p.abc;String name=p.getClassPath().toString(),simple=p.getClassPath().className;
  if(Set.of("yishi.manager.ArmyManager","map.campaign.CampaignManager","mvc.module.marry.MarryModel","chat.view.ChatItemMenu","managers.IMManager","yishi.view.tips.MessageTipManager","marry.propose.MarryQuestFrame","marry.income.MarryRingUpgradeView","marry.income.MarrySatisfactoryRateView").contains(name))for(var info:a.instance_info)if(a.constants.getString(info.getName(a.constants).name_index).equals(simple)){code(a.findBody(info.iinit_index),i(0xd0),i(0x30),i(0xd0),i(0x49,0),i(0x47));for(var t:info.instance_traits.traits){String n=a.constants.getString(a.constants.getMultiname(t.name_index).name_index);if(Set.of("__chatmessageHandler","__proposeHandler","_data","initData","_currentLevel","_satisfactoryFrameTrainButtonHandler","_trainCountValue").contains(n))a.constants.getMultiname(t.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(n,true)).namespace_index;}}
  if(name.equals("yishi.manager.ArmyManager")){var b=a.findBodyByClassAndName(simple,"thane");code(b,i(0xd0),i(0x30),i(0x60,a.constants.getQnameId("ThaneInfo",com.jpexs.decompiler.flash.abc.types.Namespace.KIND_PACKAGE,"yishi.datas.playerinfo",true)),i(0x42,0),i(0x2a),i(0x24,1),i(0x61,a.constants.getPublicQnameId("grades",true)),i(0x48));}
  if(name.equals("managers.FreedomTeamManager"))code(a.findBodyByClassAndName(simple,"isCrossAllowTeam"),i(0xd0),i(0x30),i(0x27),i(0x48));
  if(name.equals("yishi.manager.TempleteManager"))code(a.findBodyByClassAndName(simple,"getConfigInfoByConfigName"),i(0xd0),i(0x30),i(0x20),i(0x48));
  if(name.equals("manager.LanguageMgr"))code(a.findBodyByClassAndName(simple,"GetTranslation"),i(0xd0),i(0x30),i(0xd1),i(0x48));
  if(name.equals("managers.IMManager")||name.equals("yishi.view.tips.MessageTipManager")){String method=name.startsWith("managers")?"createIMFrame":"show";int error=a.constants.getPublicQnameId("Error",true);int str=a.constants.getStringId("private-opened",true);code(a.findBodyByClassAndName(simple,method),i(0xd0),i(0x30),i(0x60,error),name.startsWith("managers")?i(0x2c,str):i(0xd1),i(0x42,1),i(0x03));}
  if(name.equals("SocialMarriageBridge"))for(var info:a.class_info)for(var t:info.static_traits.traits){String n=a.constants.getString(a.constants.getMultiname(t.name_index).name_index);if(Set.of("data","listening","requested").contains(n))a.constants.getMultiname(t.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(n,true)).namespace_index;}
  ((Tag)a.parentTag).setModified(true);
 }
 try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}