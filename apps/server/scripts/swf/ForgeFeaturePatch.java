import java.io.*;import java.util.*;
import com.jpexs.decompiler.flash.SWF;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.abc.types.*;import com.jpexs.decompiler.flash.abc.avm2.*;import com.jpexs.decompiler.flash.abc.avm2.instructions.*;import com.jpexs.decompiler.flash.tags.*;
/** Explicit forge-only presentation/gates; no class recompilation or shared fashion changes. */
class ForgeFeaturePatch {
 static AVM2Instruction i(int op,int...args){return new AVM2Instruction(0,op,args);}
 static int member(ABC a,MethodBody b,String name){for(var x:b.getCode().code)if(x.operands!=null&&x.operands.length>0&&Set.of("getlex","getproperty","callproperty","callpropvoid").contains(x.definition.instructionName)){int n=x.operands[0];if(name.equals(a.constants.getString(a.constants.getMultiname(n).name_index)))return n;}return a.constants.getPublicQnameId(name,true);}
 static class Code {
  AVM2Code c=new AVM2Code();Map<String,Integer> labels=new HashMap<>();Map<Integer,String> jumps=new HashMap<>();
  Code add(int op,int...a){c.code.add(i(op,a));return this;}Code label(String s){labels.put(s,c.code.size());return this;}Code branch(int op,String target){jumps.put(c.code.size(),target);return add(op,0);}
  void install(MethodBody b){int[] pos=new int[c.code.size()+1];for(int n=0;n<c.code.size();n++)pos[n+1]=pos[n]+c.code.get(n).getBytesLength();for(var j:jumps.entrySet())c.code.get(j.getKey()).operands[0]=pos[labels.get(j.getValue())]-pos[j.getKey()+1];b.setCode(c);b.max_stack=Math.max(16,b.max_stack);b.exceptions=new ABCException[0];b.setModified();}
 }
 static void predicate(ABC a,MethodBody b,boolean allow){Code c=new Code().add(0xd0).add(0x30);if(allow)c.add(0xd1).add(0x66,member(a,b,"templateInfo")).add(0x66,member(a,b,"SonType")).add(0x25,228).add(0xab);else c.add(0x27);c.add(0x48).install(b);}
 // Prepend a condition without changing old branch destinations (all old code moves equally).
 static void prepend(MethodBody b,Code guard){
  if(b.exceptions.length!=0)throw new IllegalStateException("Unexpected handlers");
  var original=new ArrayList<>(b.getCode().code);guard.label("continue");guard.c.code.addAll(original.subList(2,original.size()));guard.install(b);
 }
 static void lockFlag(ABC a,MethodBody b){boolean changed=false;var c=b.getCode().code;for(int n=0;n<c.size();n++){var x=c.get(n);if(x.definition.instructionName.equals("getproperty")&&"REFRESH_LOCK".equals(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index))){int len=x.getBytesLength();c.set(n,i(0x29));c.add(++n,i(0x26));for(int z=2;z<len;z++)c.add(++n,i(0x02));changed=true;}}if(!changed)throw new IllegalStateException("Missing lock gate");b.setModified();}
 public static void main(String[] args)throws Exception{
  SWF s=new SWF(new FileInputStream(args[0]),true);int changed=0;
  for(ScriptPack p:s.getAS3Packs()){
   ABC a=p.abc;String cls=p.getClassPath().toString(),simple=p.getClassPath().className;
   List<String> methods=switch(cls){
    case "mvc.controler.StoreControler" -> List.of("canShowForReslove","canReslove","checkSelectResolveItemValid");
    case "yishi.datas.goods.GoodsInfo" -> List.of("MOULD_MAX_GRADE","MOULD_MAX_RANK");
    case "bag.helper.GoodsCheck" -> List.of("isVocationFix","isGradeFix");
    case "cell.mediator.playerbag.PlayerBagCellClickMediator" -> List.of("__mouseDoubleClick");
    case "cell.mediator.playerbag.PlayerBagCellDropMediator" -> List.of("swapItem");
    case "store.NewResolveView" -> List.of("initView");
    case "store.StoreBagII" -> List.of("filterGoodsEquip","filterGoodsMaterial","filterGoods");
    case "store.StoreView1" -> List.of("initView","__mouseHandler");
    case "store.cast.CastView" -> List.of("mould");
    case "store.refresh.RefreshView" -> List.of("initView","refreshPoint");
    case "store.switched.SwitchView" -> List.of("discount");
    default -> List.of();};
   for(String name:methods){MethodBody b=a.findBodyByClassAndName(simple,name);if(b==null)throw new IllegalStateException("Missing method "+cls+"."+name);
    if(args.length==1){var c=b.getCode();c.markOffsets();for(int n=0;n<c.code.size();n++){var x=c.code.get(n);String symbol="";if(x.operands!=null&&x.operands.length>0&&Set.of("getproperty","setproperty","getlex","callproperty","callpropvoid").contains(x.definition.instructionName))symbol=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);System.out.println(cls+"."+name+" "+n+" "+x.getAddress()+" "+x.definition.instructionName+" "+Arrays.toString(x.operands)+" "+symbol);}continue;}
    if(cls.equals("store.switched.SwitchView"))new Code().add(0xd0).add(0x30).add(0x24,1).add(0x48).install(b);
    else if(cls.equals("mvc.controler.StoreControler"))predicate(a,b,true);
    else if(cls.equals("bag.helper.GoodsCheck")){
     Code c=new Code().add(0xd0).add(0x30).add(0x25,117).add(0x25,118).add(0x56,2).add(0xd2).add(0x66,a.constants.getPublicQnameId("SonType",true)).add(0x46,a.constants.getPublicQnameId("indexOf",true),1).add(0x24,0).branch(0x15,"continue")
      .add(0xd1).add(0x66,a.constants.getPublicQnameId("grades",true)).add(0x24,80).add(0xb0).add(0x48);prepend(b,c);
    }
    else if(cls.startsWith("cell.mediator.playerbag.")){
     var code=b.getCode().code;int level=0,avenger=0;
     for(int n=0;n<code.size();n++){var x=code.get(n);if(!x.definition.instructionName.equals("getproperty"))continue;String property=a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index);
      if("vocationGrades".equals(property)){var next=code.get(n+1);if(!next.definition.instructionName.equals("pushbyte")||next.operands[0]!=0)throw new IllegalStateException("Unexpected equipment advancement gate");b.replaceInstruction(n,i(0x66,a.constants.getPublicQnameId("grades",true)));code=b.getCode().code;code.get(n+1).operands[0]=79;level++;}
      else if("isAvenger".equals(property)){int len=x.getBytesLength();code.set(n,i(0x29));code.add(++n,i(0x26));for(int z=2;z<len;z++)code.add(++n,i(0x02));avenger++;}
     }
     if(level!=1||avenger!=1)throw new IllegalStateException("Unexpected direct halidom gates "+level+"/"+avenger);b.setModified();
    }
    else if(cls.equals("yishi.datas.goods.GoodsInfo")){
     // Ordinary equipment only; other systems keep their original caps.
     Code c=new Code().add(0xd0).add(0x30);
     for(int id:new int[]{117,118})c.add(0x25,id);
     c.add(0x56,2).add(0xd0).add(0x66,member(a,b,"templateInfo")).add(0x66,a.constants.getPublicQnameId("SonType",true)).add(0x46,a.constants.getPublicQnameId("indexOf",true),1).add(0x24,0).branch(0x15,"ordinary")
      .add(0xd0).add(0x66,a.constants.getPublicQnameId("templateId",true)).add(0x25,10000).add(0xa4).add(0x24,7).branch(0x15,"halidomBasic")
      .add(0x25,name.equals("MOULD_MAX_GRADE")?160:16).add(0x48).label("halidomBasic").add(0x24,name.equals("MOULD_MAX_GRADE")?80:8).add(0x48).label("ordinary");
     for(int id:new int[]{101,103,104,106,107,108})c.add(0x25,id);
     c.add(0x56,6).add(0xd0).add(0x66,member(a,b,"templateInfo")).add(0x66,a.constants.getPublicQnameId("SonType",true)).add(0x46,a.constants.getPublicQnameId("indexOf",true),1).add(0x24,0).branch(0x15,"continue")
      .add(0xd0).add(0x66,member(a,b,"templateInfo")).add(0x66,a.constants.getPublicQnameId("NeedGrades",true)).add(0x24,70).branch(0x15,"basic")
      .add(0x25,name.equals("MOULD_MAX_GRADE")?160:16).add(0x48).label("basic").add(0x24,name.equals("MOULD_MAX_GRADE")?80:8).add(0x48);prepend(b,c);
    }
    else if(cls.equals("store.StoreBagII")&&name.equals("filterGoodsEquip"))predicate(a,b,true);
    else if(cls.equals("store.StoreBagII")&&name.equals("filterGoodsMaterial"))predicate(a,b,false);
    else if(cls.equals("store.StoreBagII")){
     lockFlag(a,b);
     Code c=new Code().add(0xd0).add(0x30).add(0x60,member(a,b,"model")).add(0x66,member(a,b,"selectedPanel")).add(0x2c,a.constants.getStringId("STORE_PANEL_SWITCH",true)).branch(0x14,"continue")
      .add(0xd1).add(0x66,member(a,b,"templateInfo")).add(0x66,member(a,b,"SonType")).add(0x25,205).add(0xab).add(0x48);prepend(b,c);
    }
    else if(cls.equals("store.StoreView1")&&name.equals("initView")){
     int n=0;for(var x:b.getCode().code)if(x.definition.instructionName.equals("pushbyte")&&x.operands[0]==80){x.operands[0]=50;n++;}if(n!=3)throw new IllegalStateException("Cast level gates "+n);b.setModified();
    }
    else if(cls.equals("store.StoreView1")){
     Code c=new Code().add(0xd0).add(0x30).add(0xd1).add(0x66,member(a,b,"currentTarget")).add(0x60,member(a,b,"_castBtn")).branch(0x14,"continue").add(0x47);prepend(b,c);
    }
    else if(cls.equals("store.cast.CastView")){
     var code=b.getCode().code;int changes=0;for(int n=0;n<code.size();n++){var x=code.get(n);if(x.definition.instructionName.equals("getproperty")&&"vocationLevel".equals(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index))){int len=x.getBytesLength();code.set(n,i(0x29));code.add(++n,i(0x28));for(int z=2;z<len;z++)code.add(++n,i(0x02));changes++;}}if(changes!=3)throw new IllegalStateException("Cast advancement gates "+changes);b.setModified();
    }
    else if(cls.equals("store.refresh.RefreshView"))lockFlag(a,b);
    else {
     // Keep controls/listeners in place, omit only their addChild/addSelectItem calls.
     var code=b.getCode();code.markOffsets();byte[] bytes=b.getCodeBytes().clone();int changes=0;
     for(int n=0;n<code.code.size()-1;n++){var x=code.code.get(n);var next=code.code.get(n+1);if(!x.definition.instructionName.equals("getlex")||!Set.of("_theseusBtn","_treasureBtn","_avengerBtn").contains(a.constants.getString(a.constants.getMultiname(x.operands[0]).name_index)))continue;if(!next.definition.instructionName.equals("callpropvoid")||!Set.of("addChild","addSelectItem").contains(a.constants.getString(a.constants.getMultiname(next.operands[0]).name_index)))continue;int len=next.getBytesLength(),offset=(int)next.getAddress();bytes[offset]=0x29;bytes[offset+1]=0x29;for(int z=2;z<len;z++)bytes[offset+z]=0x02;changes++;}
     if(changes!=6)throw new IllegalStateException("Resolve tabs "+changes);b.setCodeBytes(bytes);b.getCode();b.setModified();
    }
    ((Tag)a.parentTag).setModified(true);changed++;
   }
  }
  if(args.length>1){if(changed!=9&&changed!=10)throw new IllegalStateException("Expected core(9) or module14(10), got "+changed);try(var out=new FileOutputStream(args[1])){s.saveTo(out);}System.out.println("Forge methods patched "+changed);}
 }
}
