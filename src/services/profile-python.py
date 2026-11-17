"""Trusted, explicitly launched profiling wrapper; uses only the standard library."""
import cProfile
import json
import os
import platform
import pstats
import runpy
import sys
import tracemalloc

request = json.load(open(sys.argv[1], encoding='utf-8'))
sys.argv = [request['entry'], *request['args']]
sys.path.insert(0, os.path.dirname(request['entry']))
profiler = cProfile.Profile()
if request['mode'] == 'python-memory':
    tracemalloc.start(16)
else:
    profiler.enable()
try:
    # Keep the namespace alive until the allocation snapshot has been collected.
    namespace = runpy.run_path(request['entry'], run_name='__main__')
finally:
    profiler.disable()
    nodes = []
    if request['mode'] == 'python-memory':
        snapshot = tracemalloc.take_snapshot()
        for i, item in enumerate(snapshot.statistics('lineno')[:2000]):
            frame = item.traceback[0]
            nodes.append(dict(id=i, name='Retained Python allocations', file=frame.filename,
                              line=frame.lineno, self=item.size, total=item.size, children=[]))
        units = 'bytes retained at exit'
        limitation = 'tracemalloc snapshots include traced Python allocations, not every native allocation or all allocations freed before exit.'
    else:
        stats = pstats.Stats(profiler).stats
        keys = sorted(stats, key=lambda k: stats[k][3], reverse=True)[:10000]
        ids = {key: i for i, key in enumerate(keys)}
        for key in keys:
            primitive, calls, own, cumulative, callers = stats[key]
            nodes.append(dict(id=ids[key], name=key[2], file=key[0], line=key[1],
                              self=own * 1000, total=cumulative * 1000, children=[], calls=calls))
        for key in keys:
            for caller in stats[key][4]:
                if caller in ids:
                    nodes[ids[caller]]['children'].append(ids[key])
        units = 'milliseconds'
        limitation = 'cProfile cumulative time includes callees. The call graph aggregates repeated calls; recursive paths are not additive.'
    result = dict(version=1, nodes=nodes, units=units, limitation=limitation,
                  runtime='Python ' + platform.python_version())
    with open(request['output'], 'w', encoding='utf-8') as stream:
        json.dump(result, stream, allow_nan=False)
