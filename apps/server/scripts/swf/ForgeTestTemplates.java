import java.io.*;import java.util.Set;import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Fixture table getter in a test copy only; candidate forge methods remain byte-identical. */
class ForgeTestTemplates {public static void main(String[] args)throws Exception{
 SWF s=new SWF(new FileInputStream(args[0]),true);int changed=0;
 String xml="<ItemTempInfo TemplateId=\"1\" MasterType=\"1\" SonType=\"101\" NeedGrades=\"50\"/><ItemTempInfo TemplateId=\"2\" MasterType=\"1\" SonType=\"104\" NeedGrades=\"70\"/><ItemTempInfo TemplateId=\"3\" MasterType=\"2\" SonType=\"228\"/><ItemTempInfo TemplateId=\"4\" MasterType=\"2\" SonType=\"205\"/>";
 xml+="<ItemTempInfo TemplateId=\"1170003\" MasterType=\"1\" SonType=\"117\" NeedGrades=\"80\" NeedChangeJob=\"0\"/><ItemTempInfo TemplateId=\"1170007\" MasterType=\"1\" SonType=\"117\" NeedGrades=\"80\" NeedChangeJob=\"0\"/><ItemTempInfo TemplateId=\"1180003\" MasterType=\"1\" SonType=\"118\" NeedGrades=\"80\" NeedChangeJob=\"0\"/><ItemTempInfo TemplateId=\"1180010\" MasterType=\"1\" SonType=\"118\" NeedGrades=\"80\" NeedChangeJob=\"0\"/>";
 for(int family:new int[]{117,118})for(int tier=3;tier<=10;tier++)if(!Set.of(1170003,1170007,1180003,1180010).contains(family*10000+tier))xml+="<ItemTempInfo TemplateId=\""+(family*10000+tier)+"\" MasterType=\"1\" SonType=\""+family+"\" NeedGrades=\"80\" NeedChangeJob=\"0\"/>";
 for(var p:s.getAS3Packs())if(p.getClassPath().toString().equals("yishi.manager.TempleteManager")){
  var a=p.abc;var b=a.findBodyByClassAndName("TempleteManager","goodsTemplateCate");AVM2Code c=new AVM2Code();
  int cate=a.constants.getQnameId("GoodsTemplateCate",com.jpexs.decompiler.flash.abc.types.Namespace.KIND_PACKAGE,"yishi.datas.templates.cate",true);
  c.code.add(new AVM2Instruction(0,0xd0,new int[0]));c.code.add(new AVM2Instruction(0,0x30,new int[0]));c.code.add(new AVM2Instruction(0,0x60,new int[]{cate}));c.code.add(new AVM2Instruction(0,0x60,new int[]{a.constants.getPublicQnameId("XMLList",true)}));c.code.add(new AVM2Instruction(0,0x2c,new int[]{a.constants.getStringId(xml,true)}));c.code.add(new AVM2Instruction(0,0x42,new int[]{1}));c.code.add(new AVM2Instruction(0,0x42,new int[]{1}));c.code.add(new AVM2Instruction(0,0x48,new int[0]));b.setCode(c);b.max_stack=4;b.setModified();((Tag)a.parentTag).setModified(true);changed++;
 }if(changed!=1)throw new IllegalStateException();try(var out=new FileOutputStream(args[1])){s.saveTo(out);}
}}
