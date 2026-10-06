import { useState } from 'react';
import { useWorkspace } from './WorkspaceContext';
import { Icon } from './Icon';
export function LayerList(){
  const {ir,selected,setSelected,draft,editingLocked,edit}=useWorkspace();
  const [search,setSearch]=useState('');
  const orderedParts=ir?[...ir.parts].sort((a,b)=>b.z-a.z).filter(p=>p.name.toLowerCase().includes(search.toLowerCase())):[];
  return (<aside className="panel parts-panel"><h2>图层</h2><label className="search"><Icon name="search"/><input aria-label="搜索图层" placeholder="搜索图层" value={search} onChange={e => setSearch(e.target.value)}/></label>
        <div className="part-list">{orderedParts.map(p => <div className={'part-row ' + (selected === p.id ? 'selected' : '')} key={p.id}>
          <button className={'visibility ' + (p.appearance?.visible === false ? 'hidden' : '')} disabled={editingLocked} aria-label={`${p.appearance?.visible === false ? '显示' : '隐藏'} ${p.name}`} onClick={() => edit([{ type: 'set_visibility', partId: p.id, visible: p.appearance?.visible === false }])}><Icon name="eye"/></button>
          <button disabled={draft?.phase === 'gesture'} className="part-select" onClick={() => { setSelected(p.id); }} aria-pressed={selected === p.id}><img src={'/studio-files/' + p.asset.path} alt=""/><span>{p.name}</span><span className="chevron">›</span></button>
        </div>)}{ir && !orderedParts.length && <p className="empty">没有匹配的图层</p>}</div>
      </aside>);
}
