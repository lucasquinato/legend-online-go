import java.io.*;import java.nio.file.*;import java.util.*;import java.util.regex.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Filters recipe presentation without removing recipes, templates or classes. */
class ForgeRecipeFilter {
 static AVM2Instruction i(int op,int...args){return new AVM2Instruction(0,op,args);}
 static int member(ABC a,MethodBody b,String name){for(var x:b.getCode().code)if(x.operands!=null&&x.operands.length>0&&Set.of("getlex","getproperty","callproperty","callpropvoid").contains(x.definition.instructionName)){int n=x.operands[0];if(name.equals(a.constants.getString(a.constants.getMultiname(n).name_index)))return n;}throw new IllegalStateException("Missing "+name);}
 static void inject(MethodBody b,int insert,int continuation,List<AVM2Instruction> guard,Map<Integer,Boolean> exits){
  inject(b,insert,continuation,guard,exits,false);
 }
 static void inject(MethodBody b,int insert,int continuation,List<AVM2Instruction> guard,Map<Integer,Boolean> exits,boolean enterAtBoundary){
  if(b.exceptions.length!=0)throw new IllegalStateException("Unexpected exception handlers");
  AVM2Code old=b.getCode();old.markOffsets();int offset=(int)old.code.get(insert).getAddress(),size=guard.stream().mapToInt(x->x.getBytesLength()).sum();
  for(var x:old.code){int a=(int)x.getAddress(),next=a+x.getBytesLength(),op=x.definition.instructionCode;
   if(op>=0x0c&&op<=0x1a){int target=next+x.operands[0];x.operands[0]=target+(target>offset||target==offset&&!enterAtBoundary?size:0)-(next+(a>=offset?size:0));}
   if(op==0x1b){for(int n=0;n<x.operands.length;n++){if(n==1)continue;int target=a+x.operands[n];x.operands[n]=target+(target>offset||target==offset&&!enterAtBoundary?size:0)-(a+(a>=offset?size:0));}}
  }
  int pos=offset;for(int n=0;n<guard.size();n++){var x=guard.get(n);if(exits.containsKey(n)){int target=exits.get(n)?offset+size:continuation+(continuation>=offset?size:0);x.operands[0]=target-pos-x.getBytesLength();}pos+=x.getBytesLength();}
  AVM2Code code=new AVM2Code();code.code.addAll(old.code.subList(0,insert));code.code.addAll(guard);code.code.addAll(old.code.subList(insert,old.code.size()));b.setCode(code);b.max_stack=Math.max(b.max_stack,160);b.setModified();
 }
 static void groupHalidoms(ABC a,MethodBody b){
  var code=b.getCode();code.markOffsets();int insert=-1;
  for(int n=0;n<code.code.size()-1;n++){var x=code.code.get(n);var next=code.code.get(n+1);if(x.definition.instructionName.equals("getlex")&&"_infoDic".equals(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index))&&next.definition.instructionName.equals("getlocal")&&next.operands[0]==5){insert=n;break;}}
  if(insert<0)throw new IllegalStateException("Missing equipment group lookup");
  List<AVM2Instruction> g=new ArrayList<>();Map<Integer,Boolean> exits=new HashMap<>();
  g.add(i(0x60,member(a,b,"model")));g.add(i(0x66,member(a,b,"composeType")));g.add(i(0x24,1));exits.put(g.size(),true);g.add(i(0x14,0));
  g.add(i(0x25,117));g.add(i(0x25,118));g.add(i(0x56,2));g.add(i(0xd2));g.add(i(0x66,a.constants.getPublicQnameId("SonType",true)));g.add(i(0x46,a.constants.getPublicQnameId("indexOf",true),1));g.add(i(0x24,0));exits.put(g.size(),true);g.add(i(0x15,0));
  // Groups sort numerically: 1000 Armadura (118), 1001 Criaturas (117).
  g.add(i(0xd2));g.add(i(0x66,a.constants.getPublicQnameId("SonType",true)));g.add(i(0x25,117));g.add(i(0xab));g.add(i(0x73));g.add(i(0x25,1000));g.add(i(0xa0));g.add(i(0x63,5));
  inject(b,insert,0,g,exits,true);
  MethodBody selected=a.findBodyByClassAndName("ComposeSubListView","defaultEquipSelected");int at=-1;
  for(int n=0;n<selected.getCode().code.size();n++){var x=selected.getCode().code.get(n);if(x.definition.instructionName.equals("pushbyte")&&x.operands[0]==90){at=n+1;break;}}
  if(at<0)throw new IllegalStateException("Missing default halidom selection");
  var selection=new ArrayList<AVM2Instruction>();selection.add(i(0x29));selection.add(i(0x60,member(a,selected,"curTemplateInfo")));selection.add(i(0x66,a.constants.getPublicQnameId("SonType",true)));selection.add(i(0x25,117));selection.add(i(0xab));selection.add(i(0x73));selection.add(i(0x25,1000));selection.add(i(0xa0));
  inject(selected,at,0,selection,new HashMap<>());
 }
 public static void main(String[] args)throws Exception{
  SWF swf=new SWF(new FileInputStream(args[0]),true);int changes=0;
  for(ScriptPack p:swf.getAS3Packs()){
   String cls=p.getClassPath().toString();if(!Set.of("store.compose.ComposeListView","store.compose.ComposeSubListView").contains(cls))continue;
   ABC a=p.abc;boolean sub=cls.endsWith("ComposeSubListView");MethodBody b=a.findBodyByClassAndName(sub?"ComposeSubListView":"ComposeListView",sub?"refreshData":"update");var code=b.getCode();code.markOffsets();
   if(args.length==1){for(int n=0;n<code.code.size();n++){var x=code.code.get(n);System.out.println(cls+" "+n+" "+x.getAddress()+" "+x.definition.instructionName+" "+Arrays.toString(x.operands));}continue;}
   String json=Files.readString(Path.of(args[2]));Matcher match=Pattern.compile("\"gems\":\\s*\\[([^]]+)\\]").matcher(json);if(!match.find())throw new IllegalStateException("Missing gem whitelist");
   List<Integer> ids=new ArrayList<>();if(sub){for(String id:match.group(1).split(","))ids.add(Integer.parseInt(id.trim()));}else{for(int id=2040101;id<=2040109;id++)ids.add(id);ids.add(208020);}
   int insert=-1,continuation=-1;
   if(sub){for(int n=0;n<code.code.size();n++){var x=code.code.get(n);if(x.definition.instructionName.equals("setlocal")&&x.operands[0]==8&&insert<0)insert=n+1;if(x.definition.instructionName.equals("hasnext2"))continuation=(int)x.getAddress();}}
   else{for(int n=0;n<code.code.size();n++){var x=code.code.get(n);if(x.definition.instructionName.equals("setlocal3")&&n>40&&insert<0)insert=n+1;if(Set.of("inclocal_i","inclocal").contains(x.definition.instructionName)&&x.operands[0]==6)continuation=(int)x.getAddress();}}
   if(insert<0||continuation<0)throw new IllegalStateException("Missing recipe loop "+cls);
   List<AVM2Instruction> guard=new ArrayList<>();Map<Integer,Boolean> exits=new HashMap<>();
   if(sub){
    Matcher equipment=Pattern.compile("\"NewMaterial\":\\s*\"(\\d+)\"").matcher(Files.readString(Path.of(args[3])));List<Integer> outputIds=new ArrayList<>();while(equipment.find())outputIds.add(Integer.parseInt(equipment.group(1)));if(outputIds.size()!=144)throw new IllegalStateException("Equipment tier whitelist");
    for(int family:new int[]{117,118})for(int tier=3;tier<=10;tier++)outputIds.add(family*10000+tier);
    for(int id:outputIds)guard.add(i(0x2d,a.constants.getIntId(id,true)));guard.add(i(0x56,outputIds.size()));guard.add(i(0x62,8));guard.add(i(0x66,member(a,b,"template")));guard.add(i(0x66,member(a,b,"NewMaterial")));guard.add(i(0x46,a.constants.getPublicQnameId("indexOf",true),1));guard.add(i(0x24,-1));
    // Non-equipment must continue into the existing gem filter, not skip it.
    int skip=guard.size();guard.add(i(0x13,0));int start=guard.stream().mapToInt(x->x.getBytesLength()).sum();
    guard.add(i(0x62,8));guard.add(i(0x66,member(a,b,"template")));guard.add(i(0x66,member(a,b,"NeedMinLevel")));guard.add(i(0x60,member(a,b,"thane")));guard.add(i(0x66,member(a,b,"grades")));exits.put(guard.size(),false);guard.add(i(0x17,0));
    guard.get(skip).operands[0]=guard.stream().mapToInt(x->x.getBytesLength()).sum()-start;
   }
   if(sub){guard.add(i(0x60,member(a,b,"model")));guard.add(i(0x66,member(a,b,"composeType")));guard.add(i(0x24,3));exits.put(guard.size(),true);guard.add(i(0x14,0));}
   for(int id:ids)guard.add(i(0x2d,a.constants.getIntId(id,true)));guard.add(i(0x56,ids.size()));
   if(sub){guard.add(i(0x62,8));guard.add(i(0x66,member(a,b,"template")));guard.add(i(0x66,member(a,b,"NewMaterial")));}
   else{guard.add(i(0xd3));guard.add(i(0x66,a.constants.getPublicQnameId("TemplateId",true)));}
   guard.add(i(0x46,a.constants.getPublicQnameId("indexOf",true),1));guard.add(i(0x24,-1));exits.put(guard.size(),true);guard.add(i(0x14,0));exits.put(guard.size(),false);guard.add(i(0x10,0));
   inject(b,insert,continuation,guard,exits);if(sub)groupHalidoms(a,b);((Tag)a.parentTag).setModified(true);changes++;
  }
  if(args.length>1){if(changes!=2)throw new IllegalStateException("Expected two recipe lists");try(var out=new FileOutputStream(args[1])){swf.saveTo(out);}}
 }
}
