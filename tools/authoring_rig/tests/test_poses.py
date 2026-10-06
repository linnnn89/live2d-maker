"""Real native model ranges, pose CAS and portable project revisions."""
import base64
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage
from tools.authoring_rig.projects import create_project, project_root, save_project, restore_project, pack_archive
from tools.authoring_rig.poses import update_poses
from tools.authoring_rig.studio import snapshot


class SavedPreviewPoses(unittest.TestCase):
    def test_native_ranges_pose_cas_preserved_model_and_portable_revision_restore(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source.psd';catalog=root/'projects'
            psd=PSDImage.new('RGBA',(140,140));psd.create_pixel_layer(Image.new('RGBA',(120,120),(30,90,140,255)),name='face',left=10,top=10);psd.save(source)
            created=create_project(catalog,{'schemaVersion':1,'kind':'psd','name':'Poses','data':base64.b64encode(source.read_bytes()).decode()})
            work=project_root(catalog,created['project']['id']);first=snapshot(work)
            self.assertEqual(first['poses']['library']['items'],[]);self.assertFalse((work/'poses.json').exists())
            result=subprocess.run([sys.executable,'-m','tools.authoring_rig','studio-rebuild','--workspace',str(work)],cwd=Path(__file__).resolve().parents[3],capture_output=True,text=True,encoding='utf8',timeout=120)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr);view=json.loads(result.stdout)
            angle=next(parameter for parameter in view['build']['parameters'] if parameter['id']=='ParamAngleX')
            # RigBuilder's angle contract is -45..45; Pose QA samples a smaller -30..30 interval.
            self.assertEqual((angle['min'],angle['max'],angle['default']),(-45,45,0))
            state=json.loads((work/'studio-state.json').read_text());base=(work/'authoring-rig.json').read_bytes();build_file=work/state['latestBuild']/'native/artwork.moc3';model=build_file.read_bytes()
            def request(value):return {'schemaVersion':1,'operation':'save','revision':value['revision'],'settingsRevision':value['buildSettings']['revision'],'overlayRevision':value['overlayRevision'],'buildId':state['latestBuild'],'posesRevision':value['poses']['revision'],'name':'Look right','values':{'ParamAngleX':20}}
            saved=update_poses(work,request(view));pose=saved['poses']['library']['items'][0];self.assertEqual(pose['values'],{'ParamAngleX':20});self.assertEqual(pose['modelSha256'],view['build']['modelSha256'])
            library=(work/'poses.json').read_bytes()
            with self.assertRaisesRegex(ValueError,'Saved poses changed'):update_poses(work,request(view))
            for values in ({'ParamMissing':1},{'ParamAngleX':46},{'ParamAngleX':float('nan')}):
                with self.assertRaises(ValueError):update_poses(work,{**request(saved),'values':values})
                self.assertEqual((work/'poses.json').read_bytes(),library)
            with self.assertRaisesRegex(ValueError,'Model inputs changed'):update_poses(work,{**request(saved),'overlayRevision':'0'*64})
            self.assertEqual((work/'authoring-rig.json').read_bytes(),base);self.assertEqual(build_file.read_bytes(),model);self.assertFalse(saved['stale']['moc3'])
            project_request={'schemaVersion':1,'revision':saved['revision'],'settingsRevision':saved['buildSettings']['revision'],'overlayRevision':saved['overlayRevision'],'posesRevision':saved['poses']['revision'],'head':saved['project']['head'],'message':'Saved pose'}
            revisions=save_project(work,project_request)
            self.assertEqual(json.loads((work/'project-revisions'/revisions['head']/'revision.json').read_text())['poses'],saved['poses']['library'])
            archive=pack_archive(work);packed=work/'downloads'/Path(archive['url']).name
            clone=create_project(catalog,{'schemaVersion':1,'kind':'archive','name':'Pose copy','data':base64.b64encode(packed.read_bytes()).decode()})
            cloned=project_root(catalog,clone['project']['id']);self.assertEqual(snapshot(cloned)['poses'],saved['poses'])
            deleted=update_poses(work,{'schemaVersion':1,'operation':'delete','posesRevision':saved['poses']['revision'],'id':pose['id']})
            self.assertEqual(deleted['poses']['library']['items'],[])
            restore_request={key:value for key,value in project_request.items() if key!='message'}
            with self.assertRaisesRegex(ValueError,'Saved poses changed before restore'):
                restore_project(work,{**restore_request,'head':revisions['head'],'id':revisions['head']})
            restore_project(work,{**restore_request,'head':revisions['head'],'id':revisions['head'],'posesRevision':deleted['poses']['revision']})
            self.assertEqual(snapshot(work)['poses'],saved['poses']);self.assertEqual(build_file.read_bytes(),model)
