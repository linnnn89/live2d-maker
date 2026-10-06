"""Real native opacity replay and preserved evidence, with actionable failure identity."""
import base64
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage
from tools.authoring_rig.projects import create_project, project_root, pack_archive, restore_project
from tools.authoring_rig.rig_edits import update_rig_edits
from tools.authoring_rig.studio import snapshot


class LimitedModelEdits(unittest.TestCase):
    def create(self, root):
        source=root/'face.psd'; psd=PSDImage.new('RGBA',(140,140))
        psd.create_pixel_layer(Image.new('RGBA',(120,120),(20,110,190,255)),name='face',left=10,top=10);psd.save(source)
        catalog=root/'projects';created=create_project(catalog,{'schemaVersion':1,'kind':'psd','name':'Keyforms','data':base64.b64encode(source.read_bytes()).decode()})
        return project_root(catalog,created['project']['id']),catalog

    def build(self, work, ok=True):
        result=subprocess.run([sys.executable,'-m','tools.authoring_rig','studio-rebuild','--workspace',str(work)],capture_output=True,text=True,encoding='utf8',timeout=120)
        self.assertEqual(result.returncode,0 if ok else 1,result.stdout+result.stderr)
        return json.loads(result.stdout)

    def request(self, view):
        return {'schemaVersion':1,'revision':view['revision'],'settingsRevision':view['buildSettings']['revision'],'overlayRevision':view['overlayRevision']}

    def test_actual_opacity_model_replay_remove_revision_and_archive_keep_original_baseline(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);work,catalog=self.create(root);base=self.build(work);ir=(work/'authoring-rig.json').read_bytes()
            target=base['build']['classifications'][0]['drawable'];request={**self.request(base),'operation':'set-opacity','edit':{'targetId':target,'parameterId':'ParamAngleX','value':30,'opacity':0.4}}
            for edit in ({**request['edit'],'targetId':'MissingMesh'},{**request['edit'],'parameterId':'ParamMissing'},{**request['edit'],'value':46},{**request['edit'],'opacity':float('nan')}):
                with self.assertRaises(ValueError):update_rig_edits(work,{**request,'edit':edit})
                self.assertFalse((work/'overlay.json').exists());self.assertEqual((work/'authoring-rig.json').read_bytes(),ir)
            edited=update_rig_edits(work,request);self.assertTrue(edited['stale']['moc3']);self.assertEqual(edited['build']['modelSha256'],base['build']['modelSha256'])
            baseline=(work/'overlay-baseline.json').read_bytes();before=edited['project']['head']
            captured=json.loads((work/'project-revisions'/before/'revision.json').read_text());self.assertIsNone(captured['overlay'])
            with self.assertRaisesRegex(ValueError,'Model inputs or Overlay changed'):update_rig_edits(work,request)
            replay=self.build(work);self.assertEqual(replay['overlay']['status'],'ok');self.assertNotEqual(replay['build']['modelSha256'],base['build']['modelSha256']);self.assertEqual((work/'overlay-baseline.json').read_bytes(),baseline)
            state=json.loads((work/'studio-state.json').read_text());self.assertTrue(json.loads((work/state['latestBuild']/'native/native-replay.json').read_text())['reused_prepared_model'])
            archive=pack_archive(work);clone=create_project(catalog,{'schemaVersion':1,'kind':'archive','name':'Copy','data':base64.b64encode((work/'downloads'/Path(archive['url']).name).read_bytes()).decode()})
            copied=snapshot(project_root(catalog,clone['project']['id']));self.assertEqual(copied['rigEdits']['edits'],replay['rigEdits']['edits']);self.assertEqual(copied['rigEdits']['baselineModelSha256'],replay['rigEdits']['baselineModelSha256'])
            removed=update_rig_edits(work,{**self.request(replay),'operation':'remove','index':0});self.assertEqual(removed['rigEdits']['edits'],[])
            restored=self.build(work);self.assertEqual(restored['build']['modelSha256'],base['build']['modelSha256']);self.assertEqual((work/'authoring-rig.json').read_bytes(),ir)
            restore_project(work,{**self.request(restored),'posesRevision':restored['poses']['revision'],'schemaVersion':1,'head':restored['project']['head'],'id':before})
            self.assertEqual(snapshot(work)['overlay']['status'],'not-loaded');self.assertEqual((work/'overlay-baseline.json').read_bytes(),baseline)

    def test_actual_invalid_parameter_and_baseline_conflict_report_preserve_successful_model(self):
        with tempfile.TemporaryDirectory() as temporary:
            work,_=self.create(Path(temporary));base=self.build(work);target=base['build']['classifications'][0]['drawable']
            view=update_rig_edits(work,{**self.request(base),'operation':'set-opacity','edit':{'targetId':target,'parameterId':'ParamAngleX','value':30,'opacity':0.4}})
            overlay=json.loads((work/'overlay.json').read_text());overlay['keyformSets'][0]['coordinate']={'ParamRemoved':1};(work/'overlay.json').write_text(json.dumps(overlay))
            self.build(work,False);failed=snapshot(work);self.assertEqual(failed['build']['modelSha256'],base['build']['modelSha256']);self.assertTrue(any(issue['code']=='INVALID_PARAMETER' and issue.get('field')=='ParamRemoved' for issue in failed['issues']))
            # The native rejection identifies the invalid axis; no inferred mesh/layer correspondence.
            self.assertTrue(any('ParamRemoved' in issue['message'] for issue in failed['issues']))
            state=json.loads((work/'studio-state.json').read_text());failure=json.loads((work/state['lastBuildAttempt']['directory']/'failed-report.json').read_text());self.assertFalse(failure['applied'])
            overlay['keyformSets'][0]['coordinate']={'ParamAngleX':30};(work/'overlay.json').write_text(json.dumps(overlay))
            baseline=json.loads((work/'overlay-baseline.json').read_text());original=json.loads(json.dumps(baseline));baseline['runtime']['jvm.dll']='0'*64;(work/'overlay-baseline.json').write_text(json.dumps(baseline))
            self.build(work,False);conflict=snapshot(work);self.assertEqual(conflict['build']['modelSha256'],base['build']['modelSha256']);self.assertTrue(any('complete base model changed' in issue['message'] for issue in conflict['issues']));self.assertTrue(conflict['rigEdits']['failureUrl'])
            (work/'overlay-baseline.json').write_text(json.dumps(original));resolved=self.build(work);self.assertEqual(resolved['overlay']['status'],'ok')
