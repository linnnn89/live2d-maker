import type { DraftState } from '../editor/contracts';
import { checkpoint, type DraftCheckpoint } from './checkpoint';
import type { DraftPersistence } from './IndexedDraftPersistence';

/** Coalesce edits; serialize writes and clean only records owned by this page. */
export class DraftBackup {
  private latest: DraftState | null = null;
  private running: Promise<void> | null = null;
  private owned = new Map<string,DraftCheckpoint>();
  constructor(private workspaceId: string,private storage: DraftPersistence,
    private status: (message:string,failed:boolean)=>void) {}
  update(state: DraftState): void { if(state.phase==='idle'){this.latest=state;this.status('正在备份草稿…',false);} }
  flush(): Promise<void> {
    if(this.running)return this.running;
    if(!this.latest)return Promise.resolve();
    this.running=Promise.resolve().then(async()=>{
      try {
        while(this.latest){
          const state=this.latest;this.latest=null;
          if(state.dirty){
            const value=checkpoint(this.workspaceId,state);
            await this.storage.put(value);this.owned.set(value.draftId,value);
          } else {
            for(const [id,value] of this.owned){await this.storage.remove(value);this.owned.delete(id);}
          }
        }
        this.status(this.owned.size?'草稿已备份，可在刷新后恢复':'没有未保存草稿',false);
      } catch(error){this.status('草稿备份失败：'+(error instanceof Error?error.message:String(error))+'；当前编辑仍在内存中',true);}
    }).finally(()=>{this.running=null;});
    return this.running;
  }
}
