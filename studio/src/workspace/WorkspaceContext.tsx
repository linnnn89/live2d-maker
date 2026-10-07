import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useWorkspaceActions } from './useWorkspaceActions';
import { ArtworkClient } from '../artwork/ArtworkClient';
import { createDraftBridge } from './DraftBridge';
import type { Snapshot } from '../protocol';
declare global { interface Window { studioDraft?: ReturnType<typeof createDraftBridge<Snapshot>>['bridge'] } }
type Workspace=ReturnType<typeof useWorkspaceActions>&{artwork:ArtworkClient};
const Context=createContext<Workspace|null>(null);
export function WorkspaceProvider({children}:{children:ReactNode}){
  const workspace=useWorkspaceActions(),{editor}=workspace;
  const [artwork,setArtwork]=useState<ArtworkClient|null>(null);
  useEffect(() => {
    const client = new ArtworkClient();
    const {bridge,dispose} = createDraftBridge(editor, ir => client.capture(ir));
    setArtwork(client);
    window.studioDraft = bridge;
    return () => {
      dispose();
      if (window.studioDraft === bridge) delete window.studioDraft;
      client.dispose();
    };
  }, [editor]);

  return artwork ? <Context.Provider value={{...workspace,artwork}}>{children}</Context.Provider> : null;
}
export function useWorkspace():Workspace{const value=useContext(Context);if(!value)throw new Error('WorkspaceProvider missing');return value;}
