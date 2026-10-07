"""Independent, fingerprinted native delivery artifacts and explicit package selection."""
import copy
import hashlib
import json
import os
import re
import uuid
import zipfile
from pathlib import Path, PurePosixPath
from .binding import build_configuration, classification_audit
from .build_settings import load_settings, settings_signature
from .builder import build_psd
from .native import native_base, native_replay, runtime_identity
from .stale import _canonical_hash, model_input_signature
from .studio_protocol import StudioError, validate_protocol
from .validator import validate_authoring_rig


def overlay_revision(root, state):
    from .workspace_query import overlay_inputs
    return _canonical_hash(overlay_inputs(root, state))


def file_manifest(directory):
    directory = Path(directory).resolve(strict=True)
    result = {}
    for file in directory.rglob('*'):
        if file.is_file():
            if not file.resolve().is_relative_to(directory): raise ValueError('Export artifact contains an external link')
            raw = file.read_bytes()
            result[file.relative_to(directory).as_posix()] = {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    return result


def cached_artifact(root, state, key):
    from .workspace_store import read
    relative = state.get('exportCache',{}).get(key)
    if not relative: return None
    if not isinstance(relative,str) or not re.fullmatch(r'export-builds/[a-f0-9]{32}',relative):
        raise StudioError('INVALID_REQUEST','Invalid export cache reference','export')
    directory = root / relative
    if not directory.resolve().is_relative_to(root): raise ValueError('Export cache is outside the project')
    try:
        manifest = read(directory/'cache.json')
        if manifest['key'] == key and manifest['files'] == file_manifest(directory/'native'):
            return directory, manifest
    except (OSError, ValueError, KeyError):
        pass
    return None


def model_references(manifest):
    refs=manifest['FileReferences']
    names=[refs['Moc'],*refs['Textures']]
    names += [refs[key] for key in ('Physics','Pose','UserData','DisplayInfo') if refs.get(key)]
    names += [entry['File'] for entry in refs.get('Expressions',[])]
    names += [entry['File'] for group in refs.get('Motions',{}).values() for entry in group]
    for name in names:
        path=PurePosixPath(name)
        if path.as_posix()!=name or path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name:
            raise ValueError('Invalid model package reference')
    return names


def export_model(root,payload):
    validate_protocol('ModelExportRequest',payload)
    from .studio import ROOT, read, write, locked, revision, file_url
    root=Path(root).resolve(strict=True)
    with locked(root):
        data=read(root/'authoring-rig.json');validate_authoring_rig(data,root)
        state=read(root/'studio-state.json');settings=load_settings(root)
        if payload['revision']!=revision(data) or payload['settingsRevision']!=settings_signature(settings) or payload['overlayRevision']!=overlay_revision(root,state):
            raise StudioError('BASE_CONFLICT','Project inputs changed before export; read the current project','export')
        source_jar=ROOT/'psd2live/build/libs/psd2live-0.7.1.jar'
        native_jar=source_jar if source_jar.is_file() else None
        runtime=runtime_identity(native_jar)
        key=_canonical_hash({'version':1,'modelInput':model_input_signature(data),'settings':settings,
                             'overlay':overlay_revision(root,state),'runtime':runtime,'generatePhysics':payload['generatePhysics']})
        cached=cached_artifact(root,state,key)
        reused=bool(cached)
        if cached:
            directory,cache=cached
        else:
            directory=root/'export-builds'/uuid.uuid4().hex;directory.mkdir(parents=True)
            write(directory/'build-ir.json',data);write(directory/'build-settings.json',settings)
            built=build_psd(root/'authoring-rig.json',directory/'artwork.psd')
            # Prepare both output formats once. Subsequent file selection only repackages this same model.
            configuration={**settings,**build_configuration(data,built['layers']),'generatePhysics':payload['generatePhysics'],
                           'exportCmo3':True,'exportMotions':True}
            write(directory/'native-configuration.json',configuration)
            if state['overlay']:
                result=native_replay(directory/'artwork.psd',root/'overlay.json',root/'overlay-baseline.json',directory/'native',native_jar,configuration)
            else:result=native_base(directory/'artwork.psd',directory/'native',native_jar,configuration)
            if result['status']!='ok':
                write(directory/'failed-report.json',result)
                raise StudioError('EXPORT_FAILED',f"Overlay {result['status']}: {result.get('reasons',[])}; previous exports retained",'export')
            if payload['overlayRevision']!=overlay_revision(root,state):raise StudioError('BASE_CONFLICT','Overlay changed during export','export')
            labels=read(next((directory/'native').glob('*.psd2live.json')))
            classifications=classification_audit(data,built['layers'],labels['layers'])
            if any(item['semanticTag']=='UNKNOWN' for item in classifications):raise StudioError('EXPORT_FAILED','Unknown classifications require correction before delivery','export')
            adopted_runtime=result['runtime'] if state['overlay'] else read(directory/'native/native-base.json')['runtime']
            if adopted_runtime!=runtime:raise StudioError('EXPORT_FAILED','Native runtime changed during export','export')
            if not list((directory/'native').glob('*.cmo3')):raise StudioError('EXPORT_FAILED','Editable CMO3 output missing','export')
            cache={'key':key,'builtArtworkRevision':revision(data),'modelInputSignature':model_input_signature(data),
                   'buildSettingsSignature':settings_signature(settings),'runtime':runtime,'warnings':result.get('warnings',[]),
                   'files':file_manifest(directory/'native')}
            write(directory/'cache.json',cache)
            state.setdefault('exportCache',{})[key]=directory.relative_to(root).as_posix()
        model_path=next((directory/'native').glob('*.model3.json'))
        model=copy.deepcopy(read(model_path))
        if not payload['exportMotions']:model['FileReferences'].pop('Motions',None)
        references=model_references(model)
        files={model_path.name:json.dumps(model,ensure_ascii=False,indent=2).encode()}
        for relative in references:
            file=(directory/'native'/relative).resolve(strict=True)
            if not file.is_relative_to((directory/'native').resolve()):raise ValueError('Export resource outside bundle')
            files[relative]=file.read_bytes()
        if payload['target']=='editor':
            cmo=next((directory/'native').glob('*.cmo3'));files[cmo.name]=cmo.read_bytes()
            files['artwork.psd']=(directory/'artwork.psd').read_bytes()
        moc_sha=hashlib.sha256(files[model['FileReferences']['Moc']]).hexdigest()
        identifier=uuid.uuid4().hex;delivery=root/'deliveries'/identifier;delivery.mkdir(parents=True)
        package_manifest={'format':'live2d-studio-model-export','schemaVersion':1,'target':payload['target'],
                          'artworkRevision':revision(data),'builtArtworkRevision':cache['builtArtworkRevision'],
                          'modelInputSignature':cache['modelInputSignature'],'buildSettings':settings,'runtime':runtime,
                          'overlayRevision':payload['overlayRevision'],'modelSha256':moc_sha,
                          'files':{name:{'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()} for name,raw in files.items()},
                          'warnings':cache['warnings']}
        files['export-report.json']=json.dumps(package_manifest,ensure_ascii=False,indent=2).encode()
        # Serve precisely the selected package, not the cache (which also contains omitted motions/editor files).
        preview=delivery/'model';preview.mkdir()
        for name,raw in files.items():
            file=preview/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(raw)
        output=root/'downloads';output.mkdir(exist_ok=True);filename=identifier+'.model.zip';temporary=output/(filename+'.tmp')
        try:
            with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED) as archive:
                for name,raw in files.items():archive.writestr(name,raw)
            os.replace(temporary,output/filename)
        finally:temporary.unlink(missing_ok=True)
        project_name=read(root/'project.json')['name'] if (root/'project.json').exists() else data.get('metadata',{}).get('name','model')
        report={'schemaVersion':1,'target':payload['target'],'url':file_url(root,output/filename),
                'modelUrl':file_url(root,preview/model_path.name),
                'filename':project_name+('.cmo3.zip' if payload['target']=='editor' else '.model.zip'),
                'files':[{'name':name,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()} for name,raw in files.items()],
                'warnings':cache['warnings'],'cacheId':directory.name,'reused':reused,'buildSettings':settings,
                'physics':bool(model['FileReferences'].get('Physics')),'motions':sum(len(group) for group in model['FileReferences'].get('Motions',{}).values()),
                'modelSha256':moc_sha,'modelInputSignature':model_input_signature(data),'overlayRevision':payload['overlayRevision']}
        write(delivery/'export-report.json',report)
        state['latestExport']=delivery.relative_to(root).as_posix();write(root/'studio-state.json',state)
    return report
