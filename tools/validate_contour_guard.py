"""Browser and source-provenance checks for the published contour-guard gallery."""
import argparse,gzip,hashlib,io,json,os,subprocess
from collections import Counter
from pathlib import Path
os.environ['PLAYWRIGHT_BROWSERS_PATH']='/data1/xy/egohand/cache/playwright'
os.environ['TMPDIR']='/data1/xy/egohand/tmp'
from playwright.sync_api import sync_playwright

SITE=Path('/data1/xy/egohand/sites/ego-show')
QA=Path('/data1/xy/egohand/sites/ego-show-qa/20261113')

def main(url):
    catalog=json.loads((SITE/'assets/trajectories/catalog.json').read_text());rows=[]
    assert catalog['sceneCount']==12 and catalog['objectCount']==13 and catalog['frameCount']==1740
    assert all('milk' not in r['id'] for r in catalog['scenes'])
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
        for width in [1440,390]:
            page=browser.new_page(viewport={'width':width,'height':1100});errors=[];bad=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('response',lambda r:bad.append((r.status,r.url)) if r.status>=400 else None)
            page.goto(url+'#data',wait_until='load');page.wait_for_function('window.egoTrajectories?.loaded',timeout=90000)
            assert page.locator('[data-trajectory]').count()==12
            assert page.locator('[data-layer]').count()==6
            for i,r in enumerate(catalog['scenes']):
                if i:page.locator(f'[data-trajectory="{r["id"]}"]').click()
                page.wait_for_function('(id)=>window.egoTrajectories?.loaded&&window.egoTrajectories.id===id',arg=r['id'],timeout=90000)
                page.locator('#trajectory-player').scroll_into_view_if_needed()
                page.wait_for_function('document.querySelector("#trajectory-video").readyState>=2')
                assert abs(page.locator('#trajectory-video').evaluate('(v)=>v.duration')-r['duration'])<.03
                meta=json.loads(gzip.decompress((SITE/r['assetBase']/'scene.json.gz').read_bytes()))
                for f in [0,r['frames']//2,r['frames']-1]:
                    page.locator('#trajectory-timeline').evaluate('(e,f)=>{e.value=f;e.dispatchEvent(new Event("input",{bubbles:true}));}',f)
                    page.wait_for_function('(f)=>window.egoTrajectories.frame===f',arg=f)
                    actual=page.evaluate('window.egoTrajectories')
                    assert actual['objectCount']==len(r['objects'])
                    for j,m in enumerate(actual['objectMatrices']):assert max(abs(a-b) for a,b in zip(m,meta['objects'][j]['poses'][f]))<1e-9
                    assert max(abs(a-b) for a,b in zip(actual['cameraMatrix'],meta['cameraPoses'][f]))<1e-9
                    page.wait_for_function('(t)=>Math.abs(document.querySelector("#trajectory-video").currentTime-t)<.035',arg=f/30)
                page.locator('#trajectory-next').click();assert page.evaluate('window.egoTrajectories.frame')==r['frames']-1
                page.locator('#trajectory-prev').click();assert page.evaluate('window.egoTrajectories.frame')==r['frames']-2
                # Play through the end: this must wrap the mesh and video together.
                page.locator('#trajectory-play').click()
                page.wait_for_function('(n)=>egoTrajectories.playing&&egoTrajectories.frame<n-2',arg=r['frames'],timeout=8000)
                playing=page.evaluate('window.egoTrajectories')
                if playing['decodedTime'] is not None:
                    assert playing['frame']==int(playing['decodedTime']*30+1e-5)
                page.locator('#trajectory-play').click();assert page.evaluate('window.egoTrajectories.frame')<r['frames']-2
                if i==0 or len(r['objects'])==2:
                    for layer in ['scene','left','right','objects','axes','camera']:
                        page.locator(f'[data-layer="{layer}"]').uncheck()
                        assert page.evaluate('(k)=>window.egoTrajectories.layers[k]',layer) is False
                    page.wait_for_timeout(300)
                    png=page.locator('#trajectory-canvas canvas').screenshot()
                    # Element screenshots include the HTML labels over the canvas;
                    # inspect its inner area, excluding those fixed annotations.
                    rgb=subprocess.run(['ffmpeg','-v','error','-f','image2pipe','-i','pipe:0','-vf','crop=iw-40:ih-80:20:40','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],input=png,stdout=subprocess.PIPE,check=True).stdout
                    most=Counter(rgb[i:i+3] for i in range(0,len(rgb),36))
                    assert max(most.values())/sum(most.values())>.995,'All-off canvas contains leftover geometry'
                    for layer in ['scene','left','right','objects','axes','camera']:
                        page.locator(f'[data-layer="{layer}"]').check()
                        assert page.evaluate('(k)=>window.egoTrajectories.layers[k]',layer) is True
                    page.locator('#trajectory-reset').click();page.wait_for_timeout(200)
                    page.locator('#trajectory-player').screenshot(path=str(QA/f'viewer_{width}_{r["id"]}.png'))
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1')
                assert not errors,errors
                rows.append(dict(width=width,id=r['id'],frames=r['frames'],objects=len(r['objects']),passed=True))
                print('BROWSER_PASS',width,r['id'],flush=True)
            # A setting must persist across sequence loads, and fast selection must settle on the latest request.
            page.locator('[data-layer="scene"]').uncheck()
            page.locator('[data-trajectory="s1h1lotion_move"]').click()
            page.locator('[data-trajectory="s1h1chips_move"]').click()
            page.wait_for_function('window.egoTrajectories?.loaded&&window.egoTrajectories.id==="s1h1chips_move"',timeout=90000)
            assert page.evaluate('window.egoTrajectories.layers.scene') is False
            page.locator('[data-layer="scene"]').check()
            # Existing archive and language controls still work.
            page.locator('#language').click();assert page.locator('#trajectory-title').inner_text().startswith('薯片筒')
            assert page.locator('#trajectory-section-title').inner_text()=='逐帧观察，自由切换图层。'
            assert not errors and not bad,(errors,bad)
            page.locator('#data').screenshot(path=str(QA/f'gallery_{width}.png'))
            page.close()
        page=browser.new_page(java_script_enabled=False);page.goto(url)
        assert page.locator('noscript a[href*="lotion"]').is_visible();page.close()
        # GPU failure must keep the direct video usable.
        page=browser.new_page();page.add_init_script("const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t.includes('webgl')?null:original.call(this,t,...a)}")
        page.goto(url+'#data');page.wait_for_function('document.querySelector("#trajectory-status").textContent.includes("3D could not load")',timeout=90000)
        assert page.locator('#trajectory-video-link').get_attribute('href').endswith('/rgb.mp4');page.close();browser.close()
    (QA/('live_browser_validation.json' if url.startswith('https:') else 'browser_validation.json')).write_text(json.dumps(dict(passed=True,url=url,checks=rows),indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8765/');main(p.parse_args().url)
