import java.io.*;import java.util.*;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.traits.*;import com.jpexs.decompiler.flash.tags.Tag;
/** Test-only constructor and field injection; actual load callback stays byte-identical. */
class CampaignImportAliases{
 public static void main(String[] args)throws Exception{SWF s=new SWF(new FileInputStream(args[0]),true);int count=0;
 for(var p:s.getAS3Packs())if(p.getClassPath().toString().equals("map.campaign.mediator.singlecampaign.SingleCampaignNpcAvatarView")){var a=p.abc;
 for(var info:a.instance_info)if(a.constants.getString(info.getName(a.constants).name_index).equals("SingleCampaignNpcAvatarView")){
  var ctor=a.findBody(info.iinit_index);AVM2Code c=new AVM2Code();for(int op:new int[]{0xd0,0x30,0xd0})c.code.add(new AVM2Instruction(0,op,new int[0]));c.code.add(new AVM2Instruction(0,0x49,new int[]{0}));c.code.add(new AVM2Instruction(0,0x47,new int[0]));ctor.setCode(c);ctor.setModified();
  for(var t:info.instance_traits.traits){String n=a.constants.getString(a.constants.getMultiname(t.name_index).name_index);if(t instanceof TraitSlotConst slot&&Set.of("_controller","_data","swfPath","_loader").contains(n)){a.constants.getMultiname(t.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(n,true)).namespace_index;if(n.equals("_controller"))slot.type_index=a.constants.getPublicQnameId("Object",true);}
   if(t instanceof TraitMethodGetterSetter method&&n.equals("__loadedCompleteHandler")){a.constants.getMultiname(t.name_index).namespace_index=a.constants.getMultiname(a.constants.getPublicQnameId(n,true)).namespace_index;}
  }
 }((Tag)a.parentTag).setModified(true);count++;}
 if(count!=1)throw new IllegalStateException("Expected campaign avatar class");try(var out=new FileOutputStream(args[1])){s.saveTo(out);}}
}
