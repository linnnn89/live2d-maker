import { ProtocolError } from '../protocol';
import { validateCheckpoint, type DraftCheckpoint } from './checkpoint';

type Entry = { key: string; workspaceId: string; bytes: number; value: DraftCheckpoint };
const keyOf = (value: DraftCheckpoint) => JSON.stringify([value.workspaceId,value.draftId]);
export interface DraftPersistence {
  list(workspaceId: string): Promise<DraftCheckpoint[]>;
  put(value: DraftCheckpoint): Promise<void>;
  remove(value: DraftCheckpoint): Promise<void>;
}

/** Independent draft keys prevent tabs from overwriting each other's recovery records. */
export class IndexedDraftPersistence implements DraftPersistence {
  private database: Promise<IDBDatabase> | null = null;
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<() => void>();
  constructor(private factory?: IDBFactory) {
    try { if(typeof BroadcastChannel!=='undefined')this.channel=new BroadcastChannel('studio-draft-recovery'); } catch { /* Focus refresh remains available if channels are disabled. */ }
    if(this.channel)this.channel.onmessage=()=>this.emit(false);
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return()=>this.listeners.delete(listener); }
  close(): void { this.channel?.close();this.listeners.clear();void this.database?.then(db=>db.close()).catch(()=>{});this.database=null; }
  async list(workspaceId: string): Promise<DraftCheckpoint[]> {
    const db=await this.open();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('drafts','readonly');
      const request=transaction.objectStore('drafts').index('workspaceId').getAll(workspaceId);
      transaction.oncomplete=()=>{
        try { const values=(request.result as Entry[]).map(entry=>entry.value);for(const value of values)validateCheckpoint(value);resolve(values.sort((a,b)=>b.updatedAt-a.updatedAt)); }
        catch(error){reject(error);}
      };
      transaction.onabort=()=>reject(transaction.error ?? new Error('草稿读取事务已取消'));
    });
  }
  async put(value: DraftCheckpoint): Promise<void> {
    validateCheckpoint(value);
    const db=await this.open(), key=keyOf(value), bytes=new TextEncoder().encode(JSON.stringify(value)).byteLength;
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction('drafts','readwrite'), store=transaction.objectStore('drafts');
      let failure: unknown;
      const request=store.index('workspaceId').getAll(value.workspaceId);
      request.onsuccess=()=>{
        try {
          const entries=request.result as Entry[], previous=entries.find(entry=>entry.key===key);
          if(previous && previous.value.revision>value.revision) throw new ProtocolError('RECOVERY_CONFLICT','较新的草稿备份已存在，旧记录未覆盖它','recovery');
          const other=entries.filter(entry=>entry.key!==key);
          if(other.length>=20 || other.reduce((sum,entry)=>sum+entry.bytes,0)+bytes>32*1024*1024) {
            throw new ProtocolError('RECOVERY_SIZE','该工作区备份已达 20 份或 32 MiB，请导出并删除不再需要的记录','recovery');
          }
          store.put({key,workspaceId:value.workspaceId,bytes,value});
        } catch(error) {failure=error;transaction.abort();}
      };
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(failure ?? transaction.error ?? new Error('草稿写入事务已取消'));
    });
    this.emit();
  }
  async remove(value: DraftCheckpoint): Promise<void> {
    const db=await this.open(),key=keyOf(value);
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction('drafts','readwrite'), store=transaction.objectStore('drafts'),request=store.get(key);
      let failure: unknown;
      request.onsuccess=()=>{
        const previous=request.result as Entry|undefined;
        if(previous && (previous.value.revision!==value.revision || previous.value.updatedAt!==value.updatedAt)) {
          failure=new ProtocolError('RECOVERY_CONFLICT','备份已被另一个标签页更新，请刷新记录后处理','recovery');transaction.abort();
        } else store.delete(key);
      };
      transaction.oncomplete=()=>resolve();
      transaction.onabort=()=>reject(failure ?? transaction.error ?? new Error('草稿删除事务已取消'));
    });
    this.emit();
  }
  private emit(broadcast=true): void { for(const listener of this.listeners)listener();if(broadcast)this.channel?.postMessage('changed'); }
  private open(): Promise<IDBDatabase> {
    if(this.database)return this.database;
    this.database=new Promise<IDBDatabase>((resolve,reject)=>{
      const request=(this.factory??indexedDB).open('live2d-studio-drafts',1);
      let abandoned=false;
      request.onupgradeneeded=()=>{
        const store=request.result.createObjectStore('drafts',{keyPath:'key'});
        store.createIndex('workspaceId','workspaceId');
      };
      request.onblocked=()=>{abandoned=true;reject(new Error('其他标签页阻止草稿存储升级，请关闭旧标签页后重试'));};
      request.onerror=()=>reject(request.error ?? new Error('浏览器草稿存储不可用'));
      request.onsuccess=()=>{
        const db=request.result;
        if(abandoned){db.close();return;}
        db.onversionchange=()=>{db.close();this.database=null;this.emit(false);};
        resolve(db);
      };
    }).catch(error=>{this.database=null;throw error;});
    return this.database!;
  }
}
