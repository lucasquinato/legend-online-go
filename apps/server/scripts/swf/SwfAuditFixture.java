import java.io.*;import com.jpexs.decompiler.flash.*;import com.jpexs.decompiler.flash.abc.*;import com.jpexs.decompiler.flash.tags.*;import com.jpexs.decompiler.flash.abc.types.*;
class SwfAuditFixture {public static void main(String[] args)throws Exception{SWF swf=new SWF(new FileInputStream(args[0]),true);
 if(args[2].equals("empty")){DoABC2Tag tag=new DoABC2Tag(swf);tag.flags=1;tag.name="EmptyRegression";swf.addTag(swf.getTags().size()-2,tag);}
 else for(ScriptPack p:swf.getAS3Packs())if(p.getClassPath().toString().equals(args[3])){ABC abc=p.abc;abc.bodies.get(0).max_stack++;((Tag)abc.parentTag).setModified(true);break;}
 try(OutputStream out=new FileOutputStream(args[1])){swf.saveTo(out);}
}}
