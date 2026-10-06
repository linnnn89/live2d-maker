"""Browser regression for the actual Cubism renderer and Pose QA workflow."""
import copy
import json
import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "live2d-viewer"))
from qa import local_server, run_qa
from shot import content_bbox, snapshot_pose, viewer_url
from check_runtime import check_runtime


class TestViewer(unittest.TestCase):
    def test_dynamic_sdk_motion_physics_fixed_steps_reset_and_resource_failure(self):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        output=ROOT/'out';output.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='r8-viewer-',dir=output) as temporary, local_server(port), sync_playwright() as playwright:
            root=Path(temporary)
            model=json.loads((ROOT/'live2d-viewer/public/models/yelan/yelan.model3.json').read_text(encoding='utf8'))
            refs=model['FileReferences']
            for key in ('Moc','Physics','DisplayInfo'):refs[key]='/live2d-viewer/public/models/yelan/'+refs[key]
            refs['Textures']=['/live2d-viewer/public/models/yelan/'+name for name in refs['Textures']]
            refs['Motions']={'Test':[{'File':'linear.motion3.json'}]}
            (root/'model.model3.json').write_text(json.dumps(model),encoding='utf8')
            motion={'Version':3,'Meta':{'Duration':1,'Fps':60,'Loop':False,'CurveCount':1,'TotalSegmentCount':1,'TotalPointCount':2,'UserDataCount':0,'TotalUserDataSize':0,'FadeInTime':0,'FadeOutTime':0},
                    'Curves':[{'Target':'Parameter','Id':'ParamAngleX','Segments':[0,0,0,1,30]}]}
            (root/'linear.motion3.json').write_text(json.dumps(motion),encoding='utf8')
            url=f'http://127.0.0.1:{port}/live2d-viewer/index.html?dynamics=1&model=/{root.relative_to(ROOT).as_posix()}/model.model3.json'
            browser=playwright.chromium.launch(channel='msedge',headless=True,args=['--use-angle=swiftshader'])
            page=browser.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(url);page.wait_for_function('viewer.ready || viewer.errors.length')
            self.assertEqual(page.evaluate('viewer.errors'),[])
            self.assertTrue(page.evaluate('viewer.dynamics().physicsAvailable'))
            self.assertEqual(page.evaluate('viewer.dynamics().elapsed'),0)
            page.evaluate("viewer.setPhysics(false);viewer.selectMotion('Test:0');for(let i=0;i<31;i++)viewer.step(1/60);viewer.render()")
            self.assertAlmostEqual(page.evaluate("viewer.params().find(p=>p.id==='ParamAngleX').value"),15,places=4)
            page.evaluate('for(let i=0;i<40;i++)viewer.step(1/60)')
            self.assertTrue(page.evaluate('viewer.dynamics().finished'))
            with self.assertRaisesRegex(Exception,'fixed 1/60'):page.evaluate('viewer.step(.1)')
            def physics(enabled):
                return page.evaluate('''enabled=>{viewer.selectMotion(null);viewer.setPhysics(enabled);viewer.setParams({ParamAngleX:25});
                  for(let i=0;i<120;i++)viewer.step(1/60);viewer.render();return {params:viewer.params(),png:viewer.snapshot(),time:viewer.dynamics().elapsed};}''',enabled)
            off=physics(False);on=physics(True);again=physics(True)
            self.assertEqual(on,again);self.assertEqual(on['time'],2)
            self.assertNotEqual(on['params'],off['params']);self.assertNotEqual(on['png'],off['png'])
            self.assertTrue(all(p['min']<=p['value']<=p['max'] for p in on['params']))
            page.evaluate('viewer.reset();viewer.render()');self.assertEqual(page.evaluate('viewer.dynamics().elapsed'),0)
            self.assertTrue(page.evaluate('viewer.params().every(p=>p.value===p.default)'));self.assertEqual(errors,[])
            refs['Motions']['Test'][0]['File']='missing.motion3.json';(root/'broken.model3.json').write_text(json.dumps(model),encoding='utf8')
            page.goto(url.replace('/model.model3.json','/broken.model3.json'));page.wait_for_function('viewer.errors.length')
            self.assertFalse(page.evaluate('viewer.ready'));self.assertIn('fetch 404',page.evaluate('viewer.errors[0]'));browser.close()

    def test_real_renderer_mapping_pose_qa_and_failure_contract(self):
        check_runtime()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        spec = json.loads((ROOT / "live2d-viewer/specs/smoke-fixture.json").read_text())
        spec.update(canvas=[512, 768], canvaspx=[512, 768])
        with local_server(port), sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="msedge", headless=True, args=["--use-angle=swiftshader"])
            page = browser.new_page()
            failures = []
            page.on("pageerror", lambda error: failures.append(str(error)))
            page.on("response", lambda response: failures.append(response.url) if response.status >= 400 else None)
            # P0: the URL without overrides must load the bundled model/runtime.
            page.goto(f"http://127.0.0.1:{port}/live2d-viewer/index.html")
            page.wait_for_function("viewer.ready || viewer.errors.length")
            self.assertEqual(page.evaluate("viewer.errors"), [])
            self.assertEqual(page.evaluate("viewer.coreVersion"), "6.0.1")
            self.assertEqual(page.evaluate("viewer.params().length"), 82)
            page.goto(viewer_url(spec, {}, port))
            page.wait_for_function("viewer.ready || viewer.errors.length")
            ordinary, _, view = snapshot_pose(page, spec, {"name": "neutral"})
            self.assertAlmostEqual(view["pxPerCanvas"], 0.93, places=6)
            exact, _, exact_view = snapshot_pose(page, spec, {"name": "exact", "exact": True})
            self.assertAlmostEqual(exact_view["pxPerCanvas"], 1.0, places=6)
            # Independent alpha bounds confirm the rendered scale ratio, not just the API value.
            a, b = content_bbox(ordinary), content_bbox(exact)
            for lo, hi in ((0, 2), (1, 3)):
                self.assertLess(abs((b[hi] - b[lo]) * 0.93 - (a[hi] - a[lo])), 2)
            with self.assertRaisesRegex(ValueError, "unknown parameters"):
                snapshot_pose(page, spec, {"name": "invalid", "params": {"ParamMissing": 1}})
            with self.assertRaisesRegex(ValueError, "out-of-range"):
                snapshot_pose(page, spec, {"name": "clamped", "params": {"ParamAngleX": 999}})
            self.assertEqual(failures, [])
            browser.close()
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            spec["shots"] = [
                {"name": "focus", "focus": [170, 80, 340, 210]},
                {"name": "neutral", "params": {}},
                {"name": "exact", "exact": True},
                {"name": "larger", "canvas": [600, 900]},
            ]
            spec_path = root / "spec.json"
            spec_path.write_text(json.dumps(spec), encoding="utf-8")
            report = run_qa(spec_path, root / "review", port)
            self.assertGreater(report["shots"][0]["view"]["zoom"], 1)
            self.assertEqual(report["shots"][1]["view"]["zoom"], 1)
            self.assertAlmostEqual(report["shots"][2]["view"]["pxPerCanvas"], 1)
            with Image.open(root / "review/full/larger.png") as image:
                self.assertEqual(image.size, (600, 900))
            broken = copy.deepcopy(spec)
            broken["shots"][0]["params"] = {"ParamMissing": 1}
            spec_path.write_text(json.dumps(broken), encoding="utf-8")
            result = subprocess.run([sys.executable, str(ROOT / "live2d-viewer/qa.py"),
                                     "--spec", str(spec_path), "--outdir", str(root / "review"),
                                     "--port", str(port)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(json.loads(result.stdout)["status"], "error")
            self.assertEqual(json.loads((root / "review/review.json").read_text())["status"], "error")
