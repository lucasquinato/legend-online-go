import java.io.*;import com.jpexs.decompiler.flash.*;import com.jpexs.decompiler.flash.tags.*;import com.jpexs.decompiler.flash.abc.*;
class EmptyAbcProbe {public static void main(String[] a)throws Exception{SWF s=new SWF(new FileInputStream(a[0]),true);if(!a[2].equals("append"))for(Tag t:new java.util.ArrayList<Tag>(s.getTags().toArrayList()))if(t instanceof ABCContainerTag)s.removeTag(t);if(!a[2].equals("clean")){DoABC2Tag tag=new DoABC2Tag(s);tag.flags=1;tag.name="Empty";s.addTag(s.getTags().size()-2,tag);}try(OutputStream out=new FileOutputStream(a[1])){s.saveTo(out);}}}

