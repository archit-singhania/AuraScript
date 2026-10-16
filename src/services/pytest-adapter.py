"""Trusted-workspace pytest adapter; dependencies must already be installed."""
import json
import os
from pathlib import Path
import sys


def main():
    request=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    root=Path(request['root']).resolve();os.chdir(root)
    import pytest
    cases=[];results={}
    def location(value):
        try:return str(Path(value).resolve().relative_to(root)).replace('\\','/')
        except ValueError:return None
    def event(value):print('AURA_TEST_EVENT '+json.dumps(value),flush=True)
    class Reporter:
        def pytest_collection_finish(self,session):
            for item in session.items:
                relative=location(item.path)
                if relative:cases.append({'id':item.nodeid,'path':relative,'line':item.location[1]+1,'name':item.name})
        def pytest_runtest_logstart(self,nodeid,location):event({'type':'running','id':nodeid})
        def pytest_runtest_logreport(self,report):
            if report.when!='call' and report.outcome=='passed':return
            previous=results.get(report.nodeid)
            if previous and previous['status']=='failed':return
            value={'id':report.nodeid,'status':report.outcome,'duration':report.duration,'message':str(report.longrepr)[:20000] if report.failed else ''}
            if report.failed and hasattr(report.longrepr,'reprcrash'):
                crash=report.longrepr.reprcrash;value['failure_path']=location(crash.path);value['failure_line']=crash.lineno
            results[report.nodeid]=value;event(value)
    args=['-q','-p','no:cacheprovider','--rootdir='+str(root)]
    if request['mode']=='discover':args+=['--collect-only']
    else:args+=request['ids']
    coverage=None
    if request.get('coverage') and request['mode']=='run':
        import coverage as coverage_module
        coverage=coverage_module.Coverage(data_file=request['coverage_data'],source=[str(root)]);coverage.start()
    code=pytest.main(args,plugins=[Reporter()])
    if coverage:
        coverage.stop();coverage.save();coverage.json_report(outfile=request['coverage_output'])
    value={'runner':'pytest','code':int(code),'cases':cases[:5000],'results':list(results.values())[:5000]}
    Path(request['output']).write_text(json.dumps(value),encoding='utf-8');return int(code)


if __name__=='__main__':raise SystemExit(main())
