"""Parse selected source strings only. Never import or execute workspace code."""
import ast
import json
import sys


def parse(filename, text):
    imports=[]
    try:tree=ast.parse(text, filename=filename)
    except (SyntaxError, ValueError) as error:
        return {'imports':[], 'error':{'line':getattr(error,'lineno',1),'message':str(error)}}
    for node in ast.walk(tree):
        if isinstance(node,ast.Import):
            for alias in node.names:imports.append({'specifier':alias.name,'line':node.lineno,'level':0,'kind':'import'})
        elif isinstance(node,ast.ImportFrom):
            imports.append({'specifier':node.module or '', 'names':[a.name for a in node.names],
                            'line':node.lineno,'level':node.level,'kind':'from'})
        elif isinstance(node,ast.Call):
            name=node.func
            dynamic=(isinstance(name,ast.Name) and name.id=='__import__') or (isinstance(name,ast.Attribute) and name.attr=='import_module')
            if dynamic:imports.append({'specifier':node.args[0].value if node.args and isinstance(node.args[0],ast.Constant) and isinstance(node.args[0].value,str) else '<dynamic>',
                                       'line':node.lineno,'level':0,'kind':'dynamic'})
    return {'imports':imports,'error':None}


if __name__=='__main__':
    data=json.loads(sys.stdin.buffer.read(16*1024*1024))
    print(json.dumps({r['path']:parse(r['path'],r['content']) for r in data}))
