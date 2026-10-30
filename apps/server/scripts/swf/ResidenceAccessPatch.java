import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.abc.types.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.tags.Tag;
class ResidenceAccessPatch {
 public static void main(String[] args)throws Exception {
  SWF s=new SWF(new FileInputStream(args[0]),true);int methods=0;
  for(var p:s.getAS3Packs())if(p.getClassPath().toString().equals("farm.FarmEnterNewFrame")){
   var a=p.abc;var b=a.findBodyByClassAndName("FarmEnterNewFrame","__onBoatBtnClick");var code=b.getCode();int count=0;
   for(var x:code.code)if(x.definition.instructionName.equals("pushbyte")&&x.operands[0]==80){x.operands[0]=50;count++;}
   if(count!=2)throw new IllegalStateException("Expected exactly two level gates; found "+count);
   b.setCode(code);b.setModified();((Tag)a.parentTag).setModified(true);methods++;
  }
  for(var p:s.getAS3Packs()) {
   String name=p.getClassPath().toString();var a=p.abc;
   if(name.equals("map.campaign.mediator.singlecampaign.SingleCampaignNpcAvatarView")){
    var b=a.findBodyByClassAndName("SingleCampaignNpcAvatarView","__loadedCompleteHandler");var code=b.getCode();int patched=0,flag=a.constants.getPublicQnameId("allowCodeImport",true);
    for(int i=code.code.size()-1;i>=0;i--){var x=code.code.get(i);if(x.definition.instructionName.equals("callpropvoid")&&x.operands.length==2&&x.operands[1]==2&&a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index).equals("loadBytes")){
     // Preserve [loader, bytes, context] and permit executable avatar SWF on this exact context.
     b.insertAll(i,Arrays.asList(new AVM2Instruction(0,0x2a,new int[0]),new AVM2Instruction(0,0x26,new int[0]),new AVM2Instruction(0,0x61,new int[]{flag})));patched++;
    }}if(patched!=1)throw new IllegalStateException("Expected one campaign avatar import");b.max_stack+=2;b.setModified();((Tag)a.parentTag).setModified(true);
   }
   if(name.equals("map.campaign.view.house.FurnitureBagCell")){
    var b=a.findBodyByClassAndName("FurnitureBagCell","buyFurnitureCall");AVM2Code c=new AVM2Code();
    c.code.add(new AVM2Instruction(0,0xd0,new int[0]));c.code.add(new AVM2Instruction(0,0x30,new int[0]));c.code.add(new AVM2Instruction(0,0xd1,new int[0]));
    var branch=new AVM2Instruction(0,0x12,new int[]{0});c.code.add(branch);
    c.code.add(new AVM2Instruction(0,0x60,new int[]{a.constants.getQnameId("HomeSender",Namespace.KIND_PACKAGE,"home",true)}));
    c.code.add(new AVM2Instruction(0,0xd0,new int[0]));c.code.add(new AVM2Instruction(0,0x66,new int[]{a.constants.getPublicQnameId("furniture",true)}));
    c.code.add(new AVM2Instruction(0,0x66,new int[]{a.constants.getPublicQnameId("TemplateId",true)}));c.code.add(new AVM2Instruction(0,0xd2,new int[0]));
    c.code.add(new AVM2Instruction(0,0x4f,new int[]{a.constants.getPublicQnameId("buyFurniture",true),2}));
    int length=0;for(int n=4;n<c.code.size();n++)length+=c.code.get(n).getBytesLength();branch.operands[0]=length;c.code.add(new AVM2Instruction(0,0x47,new int[0]));b.max_stack=3;b.setCode(c);b.setModified();((Tag)a.parentTag).setModified(true);
   }
   if(name.equals("map.campaign.view.house.HouseUIView")){
    var b=a.findBodyByClassAndName("HouseUIView","__onBonfireClickHandler");AVM2Code c=new AVM2Code();c.code.add(new AVM2Instruction(0,0xd0,new int[0]));c.code.add(new AVM2Instruction(0,0x30,new int[0]));c.code.add(new AVM2Instruction(0,0x60,new int[]{a.constants.getQnameId("HomeSender",Namespace.KIND_PACKAGE,"home",true)}));c.code.add(new AVM2Instruction(0,0x4f,new int[]{a.constants.getPublicQnameId("getReward",true),0}));c.code.add(new AVM2Instruction(0,0x47,new int[0]));b.setCode(c);b.setModified();
    var status=a.findBodyByClassAndName("HouseUIView","farmStatusChange");var code=status.getCode();int count=0;for(var x:code.code)if(x.definition.instructionName.equals("pushstring")&&a.constants.getString(x.operands[0]).equals("")){x.operands[0]=a.constants.getStringId("Coletar ouro",true);count++;}if(count!=1)throw new IllegalStateException("Unexpected house status label");status.setCode(code);status.setModified();((Tag)a.parentTag).setModified(true);
   }
  }
  if(methods!=1)throw new IllegalStateException("Expected one residence navigation handler");try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
 }
}
