import base64
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from PIL import Image
from psd_tools import PSDImage
from tools.authoring_rig.projects import create_project, project_root, pack_archive
from tools.authoring_rig.studio import snapshot, read, write, save_workspace, save_build_settings


class NativeDelivery(unittest.TestCase):
    def test_actual_native_overlay_editable_playable_selection_cache_and_portable_delivery(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source.psd';catalog=root/'projects'
            psd=PSDImage.new('RGBA',(140,140));psd.create_pixel_layer(Image.new('RGBA',(120,120),(30,90,140,255)),name='face',left=10,top=10);psd.save(source)
            original=source.read_bytes()
            created=create_project(catalog,{'schemaVersion':1,'kind':'psd','name':'Delivery','data':base64.b64encode(original).decode()})
            work=project_root(catalog,created['project']['id'])
            def command(name,payload=None,expect=0):
                result=subprocess.run([sys.executable,'-m','tools.authoring_rig',name,'--workspace',str(work)],
                    input=json.dumps(payload) if payload else None,cwd=Path(__file__).resolve().parents[3],capture_output=True,text=True,encoding='utf8',timeout=120)
                self.assertEqual(result.returncode,expect,result.stdout+result.stderr);return json.loads(result.stdout)
            baseline=command('studio-rebuild');state=read(work/'studio-state.json')
            write(work/'overlay.json',{'keyformSets':[{'target':{'kind':'art_mesh','id':'ArtMeshFace'},'coordinate':{'ParamAngleX':30},'channels':{'opacity':0.7}}]})
            write(work/'overlay-baseline.json',read(work/state['latestBuild']/'native/native-base.json'))
            state['overlay']='overlay.json';write(work/'studio-state.json',state)
            view=snapshot(work)
            def request(view,**options):return {'schemaVersion':1,'revision':view['revision'],'settingsRevision':view['buildSettings']['revision'],
                'overlayRevision':view['overlayRevision'],'target':'editor','exportMotions':True,'generatePhysics':False,**options}
            editor=command('studio-model-export',request(view))
            self.assertFalse(editor['reused']);self.assertGreater(editor['motions'],0)
            self.assertNotEqual(editor['modelSha256'],baseline['build']['modelSha256'])
            self.assertEqual(read(work/'studio-state.json')['latestBuild'],state['latestBuild'])
            editor_file=work/'downloads'/Path(editor['url']).name
            with zipfile.ZipFile(editor_file) as archive:
                self.assertTrue(any(name.endswith('.cmo3') for name in archive.namelist()));self.assertIn('artwork.psd',archive.namelist())
                for item in editor['files']:self.assertEqual(hashlib.sha256(archive.read(item['name'])).hexdigest(),item['sha256'])
                preview=work/'deliveries'/read(work/'studio-state.json')['latestExport'].split('/')[-1]/'model'
                self.assertEqual({p.relative_to(preview).as_posix():p.read_bytes() for p in preview.rglob('*') if p.is_file()},
                                 {name:archive.read(name) for name in archive.namelist()})
                self.assertEqual(Path(editor['modelUrl']).name,next(name for name in archive.namelist() if name.endswith('.model3.json')))
            playable=command('studio-model-export',request(view,target='playable',exportMotions=False))
            self.assertTrue(playable['reused']);self.assertEqual(playable['cacheId'],editor['cacheId']);self.assertEqual(playable['modelSha256'],editor['modelSha256']);self.assertEqual(playable['motions'],0)
            with zipfile.ZipFile(work/'downloads'/Path(playable['url']).name) as archive:
                self.assertFalse(any(name.endswith(('.cmo3','.psd','.motion3.json')) for name in archive.namelist()))
                manifest=json.loads(archive.read(next(name for name in archive.namelist() if name.endswith('.model3.json'))))
                self.assertNotIn('Motions',manifest['FileReferences']);self.assertIn(manifest['FileReferences']['Moc'],archive.namelist())
                preview=work/read(work/'studio-state.json')['latestExport']/'model'
                self.assertEqual({p.relative_to(preview).as_posix():p.read_bytes() for p in preview.rglob('*') if p.is_file()},
                                 {name:archive.read(name) for name in archive.namelist()})
            note=copy.deepcopy(view['ir']);note['parts'][0]['geometry']['landmarks']={'note':[20,20]}
            current=save_workspace(work,{'revision':view['revision'],'ir':note})
            annotated=command('studio-model-export',request(current,target='playable',exportMotions=False));self.assertTrue(annotated['reused'])
            archive=pack_archive(work);data=(work/'downloads'/Path(archive['url']).name).read_bytes()
            imported=create_project(catalog,{'schemaVersion':1,'kind':'archive','name':'Delivery copy','data':base64.b64encode(data).decode()})
            clone=project_root(catalog,imported['project']['id']);cloned=snapshot(clone)
            self.assertTrue(cloned['export']['current']);self.assertTrue(cloned['export']['result']['url'].startswith('/projects/'+clone.name+'/'))
            self.assertTrue(cloned['export']['result']['modelUrl'].startswith('/projects/'+clone.name+'/'))
            self.assertNotIn('/projects/'+work.name+'/',cloned['export']['result']['modelUrl'])
            self.assertEqual((clone/'downloads'/Path(cloned['export']['result']['url']).name).read_bytes(),(work/'downloads'/Path(annotated['url']).name).read_bytes())
            latest=read(work/'studio-state.json')['latestExport']
            write(work/'overlay.json',{'keyformSets':[{'target':{'kind':'art_mesh','id':'missing'},'coordinate':{'ParamAngleX':30},'channels':{'opacity':0.7}}]})
            rejected=command('studio-model-export',request(snapshot(work)),expect=1)
            self.assertEqual(rejected['detail']['code'],'EXPORT_FAILED');self.assertEqual(read(work/'studio-state.json')['latestExport'],latest)
            self.assertFalse(snapshot(work)['export']['current']);self.assertEqual(source.read_bytes(),original)

    def test_tampered_cache_rebuilds_and_settings_or_stale_request_cannot_reuse_wrong_model(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);psd=PSDImage.new('RGBA',(140,140));psd.create_pixel_layer(Image.new('RGBA',(120,120),'white'),name='face',left=10,top=10);source=root/'source.psd';psd.save(source)
            from tools.authoring_rig.studio import open_workspace
            work=root/'workspace';view=open_workspace(work,source_psd=source)
            payload={'schemaVersion':1,'revision':view['revision'],'settingsRevision':view['buildSettings']['revision'],'overlayRevision':view['overlayRevision'],'target':'playable','exportMotions':False,'generatePhysics':False}
            def export(payload,expect=0):
                result=subprocess.run([sys.executable,'-m','tools.authoring_rig','studio-model-export','--workspace',str(work)],input=json.dumps(payload),cwd=Path(__file__).resolve().parents[3],capture_output=True,text=True,encoding='utf8',timeout=120)
                self.assertEqual(result.returncode,expect,result.stdout+result.stderr);return json.loads(result.stdout)
            first=export(payload);cached=work/'export-builds'/first['cacheId']/'native';model=next(cached.glob('*.moc3'));model.write_bytes(b'corrupt')
            rebuilt=export(payload);self.assertFalse(rebuilt['reused']);self.assertNotEqual(first['cacheId'],rebuilt['cacheId']);self.assertEqual(rebuilt['modelSha256'],first['modelSha256']);self.assertEqual(model.read_bytes(),b'corrupt')
            current=snapshot(work);changed=save_build_settings(work,{'schemaVersion':1,'revision':current['revision'],'settingsRevision':current['buildSettings']['revision'],'settings':{**current['buildSettings']['settings'],'meshInteriorDensity':12}})
            self.assertFalse(changed['export']['current']);last=read(work/'studio-state.json')['latestExport']
            stale=export(payload,expect=1);self.assertEqual(stale['detail']['code'],'BASE_CONFLICT');self.assertEqual(read(work/'studio-state.json')['latestExport'],last)
            updated=export({**payload,'settingsRevision':changed['buildSettings']['revision']});self.assertFalse(updated['reused']);self.assertNotEqual(updated['modelSha256'],first['modelSha256'])
