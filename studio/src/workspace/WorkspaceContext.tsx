import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useWorkspaceActions } from './useWorkspaceActions';
import { ArtworkClient } from '../artwork/ArtworkClient';
import { captureArtwork } from '../artwork/capture';
import type { CaptureRequest,CaptureResult } from '../artwork/contracts';
import type { DraftRequest,DraftResult,DraftReadRequest,DraftReadResult } from '../editor/contracts';
import type { Snapshot } from '../protocol';
declare global { interface Window { studioDraft?: {
  schemaVersion:1;
  execute(request:DraftReadRequest):Promise<DraftReadResult>;
  execute(request:DraftRequest):Promise<DraftResult<Snapshot>>;
  capture(request:CaptureRequest):Promise<CaptureResult>;
} } }
type Workspace=ReturnType<typeof useWorkspaceActions>&{artwork:ArtworkClient};
const Context=createContext<Workspace|null>(null);
export function WorkspaceProvider({children}:{children:ReactNode}){
  const workspace=useWorkspaceActions(),{editor}=workspace;
  const [artwork]=useState(()=>new ArtworkClient());
  useEffect(() => {
    const bridge = { schemaVersion: 1 as const, execute: editor.execute.bind(editor),
      capture: (request: CaptureRequest) => captureArtwork(request, editor.getSnapshot, editor.getBase, ir => artwork.capture(ir)) };
    window.studioDraft = bridge;
    return () => { if (window.studioDraft === bridge) delete window.studioDraft; };
  }, [editor, artwork]);

  useEffect(() => () => artwork.dispose(), [artwork]);

  return <Context.Provider value={{...workspace,artwork}}>{children}</Context.Provider>;
}
export function useWorkspace():Workspace{const value=useContext(Context);if(!value)throw new Error('WorkspaceProvider missing');return value;}
