import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Method-only patch. No transplant/recompilation of AppellFrame or its shared module. */
class TitleSearchPatch {
 static int member(ABC a,MethodBody b,String name){for(var x:b.getCode().code)if(x.operands!=null&&x.operands.length>0&&Set.of("getlex","getproperty","setproperty","findproperty","callproperty","callpropvoid").contains(x.definition.instructionName)){int n=x.operands[0];if(name.equals(a.constants.getString(a.constants.getMultiname(n).name_index)))return n;}throw new IllegalStateException("Missing "+name);}
 static class Edit {
  List<AVM2Instruction> code=new ArrayList<>();Map<String,Integer> labels=new HashMap<>();Map<Integer,String> jumps=new HashMap<>();
  Edit op(int op,int...v){code.add(new AVM2Instruction(0,op,v));return this;} Edit label(String n){labels.put(n,code.size());return this;} Edit branch(int op,String n){jumps.put(code.size(),n);return op(op,0);}
  Edit text(ABC a,String s){return op(0x2c,a.constants.getStringId(s,true));}
  Edit prop(ABC a,MethodBody b,String p){return op(0x66,member(a,b,p));}
  Edit self(ABC a,MethodBody b,String p){return op(0xd0).prop(a,b,p);}
  Edit normalize(ABC a){
   String[][] rules={{"<[^>]*>",""},{"\\s+"," "},{"^\\s+|\\s+$",""},{"[áàâãä]","a"},{"[éèêë]","e"},{"[íìîï]","i"},{"[óòôõö]","o"},{"[úùûü]","u"},{"ç","c"}};
   op(0x46,a.constants.getPublicQnameId("toLowerCase",true),0);
   for(var rule:rules){int regex=a.constants.getPublicQnameId("RegExp",true);op(0x5d,regex);text(a,rule[0]);text(a,"g");op(0x4a,regex,2);text(a,rule[1]);op(0x46,a.constants.getPublicQnameId("replace",true),2);}return this;
  }
  AVM2Code finish(){int[] offsets=new int[code.size()+1];for(int n=0;n<code.size();n++)offsets[n+1]=offsets[n]+code.get(n).getBytesLength();for(var j:jumps.entrySet())code.get(j.getKey()).operands[0]=offsets[labels.get(j.getValue())]-offsets[j.getKey()+1];AVM2Code out=new AVM2Code();out.code.addAll(code);return out;}
 }
 public static void main(String[] args)throws Exception{
  SWF swf=new SWF(new FileInputStream(args[0]),true);int changed=0;
  for(var pack:swf.getAS3Packs())if(pack.getClassPath().toString().equals("appell.AppellFrame")){
   ABC a=pack.abc;MethodBody b=a.findBodyByClassAndName("AppellFrame","refreshList");
   if(b.getCode().code.size()!=121||b.exceptions.length!=0)throw new IllegalStateException("Unexpected title search baseline");
   int index=0;for(var x:b.getCode().code)if(x.definition.instructionName.equals("getproperty")&&a.constants.getMultiname(x.operands[0]).kind==0x1b){index=x.operands[0];break;}
   if(index==0)throw new IllegalStateException("Array index multiname missing");
   Edit e=new Edit();e.op(0xd0).op(0x30);
   e.self(a,b,"_searchTxt").prop(a,b,"text").normalize(a).op(0x63,2);
   e.self(a,b,"_listPanel").op(0x4f,member(a,b,"beginChanges"),0);
   e.self(a,b,"_listPanel").prop(a,b,"vectorListModel").op(0x4f,member(a,b,"clear"),0);
   e.op(0x62,2).prop(a,b,"length").branch(0x12,"tab");
   e.self(a,b,"model").op(0x24,0).op(0x46,a.constants.getPublicQnameId("getListByType",true),1).branch(0x10,"rows");
   e.label("tab").self(a,b,"model").op(0x46,member(a,b,"getCurrentList"),0);
   e.label("rows").op(0x63,3).op(0x56,0).op(0x63,7).op(0x20).op(0x63,8).op(0x24,0).op(0x63,5);
   e.label("loop").op(0x09).op(0x62,5).op(0x62,3).prop(a,b,"length").op(0xad).branch(0x12,"done");
   e.op(0x62,3).op(0x62,5).op(0x66,index).op(0x63,6);
   e.op(0x62,2).prop(a,b,"length").branch(0x12,"take");
   e.op(0x62,6).prop(a,b,"htmlTitle").normalize(a).op(0x62,2).op(0x46,member(a,b,"indexOf"),1).op(0x24,0).op(0xad).branch(0x11,"skip");
   e.label("take").op(0x62,6).op(0x62,6).prop(a,b,"TemplateId");
   e.op(0x60,member(a,b,"ArmyManager")).prop(a,b,"instance").prop(a,b,"thane").prop(a,b,"appellId").op(0xab).op(0x61,member(a,b,"isEquiped"));
   e.op(0x62,7).op(0x62,6).op(0x4f,a.constants.getPublicQnameId("push",true),1);
   e.self(a,b,"_listPanel").prop(a,b,"vectorListModel").op(0x62,6).op(0x4f,member(a,b,"append"),1);
   e.op(0x62,8).branch(0x12,"select");
   e.op(0x62,6).prop(a,b,"TemplateId").self(a,b,"_lookAppellId").op(0xab).branch(0x12,"skip");
   e.label("select").op(0x62,6).op(0x63,8);
   e.label("skip").op(0xc2,5).branch(0x10,"loop");
   e.label("done").op(0xd0).op(0x62,7).op(0x61,member(a,b,"_appellList"));
   e.self(a,b,"_listPanel").op(0x4f,member(a,b,"commitChanges"),0);
   e.self(a,b,"_listPanel").op(0x4f,member(a,b,"invalidateViewport"),0);
   e.self(a,b,"_listPanel").prop(a,b,"list").op(0x62,8).op(0x61,member(a,b,"defaultSelectItemByCellValue"));
   e.self(a,b,"_listPanel").prop(a,b,"list").op(0x4f,member(a,b,"updateListView"),0).op(0x47);
   b.setCode(e.finish());b.max_stack=12;b.max_regs=Math.max(b.max_regs,10);b.setModified();((Tag)a.parentTag).setModified(true);changed++;
  }
  if(changed!=1)throw new IllegalStateException("Expected one title search method");try(var out=new FileOutputStream(args[1])){swf.saveTo(out);}System.out.println("Title search: one method patched");
 }
}
