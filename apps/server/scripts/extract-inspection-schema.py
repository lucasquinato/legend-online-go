"""Recover only additional scalar inspection fields from the pinned core AS3 export.
Export the three classes with FFDec from release-lock.modules[2].file first.
This writes a protocol extension; it never changes SWF bytecode.
"""
from pathlib import Path
import json,re
base=json.loads(Path('reference/messages.json').read_text(encoding='utf8'))
result={}
for f in Path('reports/social/inspection-protocol/scripts/com/road/yishi/proto/simple').glob('*.as'):
    name='com.road.yishi.proto.simple.'+f.stem
    fields=dict(base[name])
    for wire,number,kind,field in re.findall(r'WriteUtils.writeTag\(param1,(\d+),(\d+)\);\s*WriteUtils.write\$TYPE_(\w+)\(param1,(\w+)\$field\)',f.read_text(encoding='utf8')):
        if number not in fields and kind!='MESSAGE':
            fields[number]={'name':field,'type':kind,'wire':int(wire),'repeated':False}
    result[name]=fields
assert len(result)==3,'Export the three pinned inspection classes first'
Path('reference/social/inspection-messages.json').write_bytes(json.dumps(result,ensure_ascii=False,indent=2).encode('utf8'))
