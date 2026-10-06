import base64
import copy
import io
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import Group
from psd_tools.constants import BlendMode
from tools.authoring_rig.projects import (create_project, project_root, list_projects, save_project, restore_project,
    revision_list, recover_project, pack_archive)
from tools.authoring_rig.studio import snapshot, save_workspace, save_build_settings, read, write
from tools.authoring_rig.studio_protocol import StudioError


class StudioProjects(unittest.TestCase):
    def test_real_project_archive_revisions_conflicts_and_interrupted_restore(self):
        with tempfile.TemporaryDirectory() as temporary:
            catalog=Path(temporary)/'projects'; source=Path(temporary)/'source.psd'
            psd=PSDImage.new('RGBA',(32,32));psd.create_pixel_layer(Image.new('RGBA',(20,20),(30,80,100,255)),name='face',left=2,top=3);psd.save(source)
            original=source.read_bytes()
            created=create_project(catalog,{'schemaVersion':1,'kind':'psd','name':'My project','data':base64.b64encode(original).decode()})
            root=project_root(catalog,created['project']['id']); initial=snapshot(root);first=revision_list(root)['head']
            ir=copy.deepcopy(initial['ir']);ir['parts'][0]['appearance']['opacity']=180
            changed=save_workspace(root,{'revision':initial['revision'],'ir':ir})
            changed=save_build_settings(root,{'schemaVersion':1,'revision':changed['revision'],'settingsRevision':changed['buildSettings']['revision'],
                'settings':{**changed['buildSettings']['settings'],'headTurnStrength':0.5}})
            payload={'schemaVersion':1,'revision':changed['revision'],'settingsRevision':changed['buildSettings']['revision'],'head':first,'message':'Artwork and settings'}
            second=save_project(root,payload)['head']
            with self.assertRaises(StudioError) as conflict:save_project(root,payload)
            self.assertEqual(conflict.exception.detail['code'],'PROJECT_CONFLICT')
            with self.assertRaises(StudioError):restore_project(root,{**{k:v for k,v in payload.items() if k!='message'},'id':first})
            request={**{k:v for k,v in payload.items() if k!='message'},'head':second,'id':first}
            real_write=write
            def interrupted(path,data):
                if Path(path).name=='build-settings.json' and (root/'.project-transaction.json').exists():raise OSError('simulated interruption')
                real_write(path,data)
            with patch('tools.authoring_rig.studio.write',side_effect=interrupted),self.assertRaises(OSError):restore_project(root,request)
            self.assertTrue((root/'.project-transaction.json').exists());self.assertFalse((root/'.studio.lock').exists())
            recover_project(root)
            restored=snapshot(root)
            self.assertEqual(restored['ir'],initial['ir']);self.assertEqual(restored['buildSettings'],initial['buildSettings'])
            self.assertEqual(revision_list(root)['head'],first)
            self.assertTrue(any(record['message']=='恢复前自动保存' for record in revision_list(root)['revisions']))
            self.assertEqual(read(root/'project-revisions'/second/'revision.json')['ir'],ir)
            download=pack_archive(root); archive=(root/'downloads'/Path(download['url']).name).read_bytes()
            # The portable archive must work without the source project or original PSD.
            shutil.rmtree(root);source.unlink()
            imported=create_project(catalog,{'schemaVersion':1,'kind':'archive','name':'Restored copy','data':base64.b64encode(archive).decode()})
            clone=project_root(catalog,imported['project']['id']);view=snapshot(clone)
            self.assertNotEqual(view['workspaceId'],initial['workspaceId']);self.assertEqual(view['ir'],initial['ir'])
            self.assertEqual((clone/'source.psd').read_bytes(),original)
            self.assertEqual(len(revision_list(clone)['revisions']),3)
            self.assertEqual(list_projects(catalog)['projects'][0]['id'],clone.name)
            self.assertTrue(view['sourceImage'].startswith('/projects/'+clone.name+'/'))
            self.assertFalse((clone/'.project-transaction.json').exists())

    def test_all_psd_restrictions_and_archive_path_hash_identity_rejections_are_atomic(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);catalog=root/'projects';psd=PSDImage.new('RGBA',(32,32))
            group=Group.new(parent=psd,name='Nested');psd.create_pixel_layer(Image.new('RGBA',(4,4),'white'),name='multiply',left=0,top=0).blend_mode=BlendMode.MULTIPLY
            source=root/'restricted.psd';psd.save(source)
            result=create_project(catalog,{'schemaVersion':1,'kind':'psd','name':'Restricted','data':base64.b64encode(source.read_bytes()).decode()})
            self.assertEqual(result['status'],'unsupported');self.assertEqual({item['name'] for item in result['issues']},{'Nested','multiply'})
            self.assertEqual(list_projects(catalog)['projects'],[])
            psd=PSDImage.new('RGBA',(16,16));psd.create_pixel_layer(Image.new('RGBA',(8,8),'white'),name='face');source=root/'valid.psd';psd.save(source)
            created=create_project(catalog,{'schemaVersion':1,'kind':'psd','name':'Valid','data':base64.b64encode(source.read_bytes()).decode()})
            project=project_root(catalog,created['project']['id']);download=pack_archive(project)
            raw=(project/'downloads'/Path(download['url']).name).read_bytes()
            with zipfile.ZipFile(io.BytesIO(raw)) as zipped: entries={name:zipped.read(name) for name in zipped.namelist()}
            before=list_projects(catalog)
            for change in ('traversal','hash','case','reference'):
                candidate=dict(entries);manifest=json.loads(candidate['manifest.json'])
                if change=='traversal':candidate['../outside.json']=b'{}';manifest['files']['../outside.json']={'bytes':2,'sha256':'0'*64}
                elif change=='hash':candidate['source.png']=b'corrupt'
                elif change=='case':candidate['assets/A.png']=b'x';candidate['assets/a.png']=b'x';manifest['files'].update({'assets/A.png':{},'assets/a.png':{}})
                else:
                    import hashlib
                    state=json.loads(candidate['studio-state.json']);state['latestBuild']='../../external';candidate['studio-state.json']=json.dumps(state).encode()
                    manifest['files']['studio-state.json']={'bytes':len(candidate['studio-state.json']),'sha256':hashlib.sha256(candidate['studio-state.json']).hexdigest()}
                candidate['manifest.json']=json.dumps(manifest).encode();output=io.BytesIO()
                with zipfile.ZipFile(output,'w') as zipped:
                    for name,data in candidate.items():zipped.writestr(name,data)
                with self.subTest(change=change),self.assertRaises(ValueError):create_project(catalog,{'schemaVersion':1,'kind':'archive','name':'Rejected','data':base64.b64encode(output.getvalue()).decode()})
                self.assertEqual(list_projects(catalog),before)
                self.assertFalse((root/'outside.json').exists())
            self.assertEqual(source.read_bytes(),(project/'source.psd').read_bytes())
            self.assertFalse(any(child.name.startswith('.project-import-') for child in catalog.iterdir()))
