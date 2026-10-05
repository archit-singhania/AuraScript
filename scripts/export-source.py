"""Reproducible source export; run with Python3.11+ from the AuraScript root."""
from pathlib import Path
import hashlib, json, zipfile
root=Path(__file__).resolve().parent.parent
output=root/'dist/AuraScript-3.0.0-source.zip'
files=[]
for item in ['src','assets','scripts','tests','test-fixtures','docs','.github','README.md','LICENSE','package.json','package-lock.json','.gitignore']:
    target=root/item
    for f in (target.rglob('*') if target.is_dir() else [target]):
        if f.is_file() and '__pycache__' not in f.parts and f.suffix!='.pyc':
            relative=f.relative_to(root).as_posix()
            if any(part in relative.split('/') for part in ['node_modules','.runtime','.git','.env','test-results']):
                raise RuntimeError('Private path in source export')
            files.append((f,relative))
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for f,relative in sorted(files,key=lambda row:row[1]): archive.write(f,relative)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    for f,relative in files: assert archive.read(relative)==f.read_bytes(),relative
result={'files':len(files),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest().upper(),'matchesCurrentSource':True,'privateEntries':0}
(root/'test-results').mkdir(exist_ok=True)
(root/'test-results/source-archive.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
