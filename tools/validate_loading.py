"""Fault-injection checks for independent video/geometry loading in Chromium."""
import argparse,gzip,json,os
from pathlib import Path
from urllib.parse import urlsplit
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH','/data1/xy/egohand/cache/playwright')
os.environ.setdefault('TMPDIR','/data1/xy/egohand/tmp')
from playwright.sync_api import sync_playwright

SITE=Path(__file__).resolve().parents[1]
MODES=['normal','no_decompression','video_network_error','already_decoded','http_gzip','webgl1','webgl_unavailable','geometry_failure','transient_network','context_loss']

def main(url,output,modes):
    output.mkdir(parents=True,exist_ok=True);rows=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        for mode in modes:
            page=browser.new_page(viewport={'width':1280,'height':1000});errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            if mode=='no_decompression':page.add_init_script('delete window.DecompressionStream')
            if mode=='video_network_error':page.route('**/assets/trajectories/**/rgb.mp4*',lambda r:r.abort('failed'))
            if mode=='geometry_failure':page.route('**/assets/trajectories/**/hands.bin.gz*',lambda r:r.abort('failed'))
            if mode in ['already_decoded','http_gzip']:
                def decoded(route):
                    name=Path(urlsplit(route.request.url).path).name
                    body=(SITE/'assets/trajectories/s1h1lotion_move'/name).read_bytes()
                    headers={'Content-Encoding':'gzip'} if mode=='http_gzip' else {}
                    route.fulfill(status=200,headers=headers,body=body if mode=='http_gzip' else gzip.decompress(body))
                page.route('**/assets/trajectories/**/*.gz',decoded)
            if mode in ['webgl1','webgl_unavailable']:
                condition='t==="webgl2"' if mode=='webgl1' else 't.includes("webgl")'
                page.add_init_script('const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return '+condition+'?null:original.call(this,t,...a)}')
            if mode=='transient_network':
                count=[0]
                def transient(route):
                    count[0]+=1
                    if count[0]==1:route.abort('failed')
                    else:route.continue_()
                page.route('**/assets/trajectories/**/hands.bin.gz*',transient)
            page.goto(url+'#data')
            page.wait_for_function('window.egoTrajectories?.loaded || !document.querySelector("#trajectory-retry").hidden',timeout=60000)
            page.locator('#trajectory-player').scroll_into_view_if_needed()
            state=page.evaluate('window.egoTrajectories')
            if mode=='context_loss':
                page.locator('#trajectory-canvas canvas').evaluate('(el)=>el.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()')
                page.wait_for_function('!window.egoTrajectories.loaded && !document.querySelector("#trajectory-retry").hidden')
                page.locator('#trajectory-retry').click();page.wait_for_function('window.egoTrajectories.loaded',timeout=30000)
            if mode in ['webgl_unavailable','geometry_failure']:
                assert not state['loaded'] and state['error'],state
                page.wait_for_function('document.querySelector("#trajectory-video").readyState>=2')
                page.locator('#trajectory-video').evaluate('(v)=>v.play()')
                page.wait_for_function('document.querySelector("#trajectory-video").currentTime>.1')
                if mode=='geometry_failure':
                    page.unroute('**/assets/trajectories/**/hands.bin.gz*')
                    page.locator('#trajectory-retry').click();page.wait_for_function('window.egoTrajectories?.loaded',timeout=60000)
            else:
                assert state['loaded'],state
                if mode=='webgl1':assert state['graphicsMode']=='webgl1'
                page.locator('#trajectory-play').click();page.wait_for_function('window.egoTrajectories.frame>3');page.locator('#trajectory-play').click()
                # Native video controls also drive the mesh, including paused seeking.
                if mode!='video_network_error':
                    page.locator('#trajectory-video').evaluate('(v)=>{v.pause();v.currentTime=2;}')
                    page.wait_for_function('Math.abs(window.egoTrajectories.frame-60)<=1')
                if mode=='normal':
                    page.locator('#trajectory-video').evaluate('(v)=>{v.playbackRate=2;return v.play();}')
                    page.wait_for_function('window.egoTrajectories.frame>65 && window.egoTrajectories.playing')
                    assert page.locator('#trajectory-speed').input_value()=='2'
                    page.locator('#trajectory-play').click()
                if mode in ['normal','webgl1']:
                    page.locator('#trajectory-player').screenshot(path=str(output/(mode+'.png')))
            assert page.locator('video').count()==1
            assert page.locator('[data-open], #hero-video, #demo-dialog, #explore').count()==0
            assert not errors,(mode,errors)
            rows.append(dict(mode=mode,passed=True,graphics=state.get('graphicsMode'),media_failed=state.get('mediaFailed'),error=state.get('error')))
            print('LOADING_PASS',mode,flush=True);page.close()
        browser.close()
    (output/'loading_validation.json').write_text(json.dumps(dict(passed=True,url=url,checks=rows),indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8766/');p.add_argument('--output',type=Path,required=True);p.add_argument('--modes',nargs='+',default=MODES,choices=MODES);a=p.parse_args()
    if not any(a.output.resolve().is_relative_to(Path(d)) for d in ['/data1','/data2']):p.error('Write QA artifacts to a data disk')
    main(a.url,a.output,a.modes)
