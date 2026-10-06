import { useWorkspace } from './WorkspaceContext';
import { useArtworkEditing } from './useArtworkEditing';
import { ArtworkCanvas } from '../artwork/ArtworkCanvas';
import { Icon } from './Icon';
import { PointInspector } from './PointInspector';
import { DraftDiff } from './DraftDiff';
export function ArtworkWorkspace(){
  const {ir,saved,draft,artwork,editingLocked}=useWorkspace(),editing=useArtworkEditing();
  const {artworkSource,setArtworkSource,focused,setFocused,part,polygon,drawing,viewBox,viewWidth,start,move,finishGesture,downloadArtwork}=editing;
  return (<section className="panel artwork-panel"><div className="panel-heading"><h2>美术画布</h2><div className="view-actions"><button disabled={draft?.phase === 'gesture'} onClick={() => setFocused(false)} aria-pressed={!focused}><Icon name="full"/>全图</button><button disabled={!part || draft?.phase === 'gesture'} onClick={() => setFocused(true)} aria-pressed={focused}><Icon name="focus"/>聚焦图层</button></div></div>
        <div className="artwork-controls"><div role="group" aria-label="美术显示来源">
          {([['draft', '当前草稿'], ['saved', '已保存美术'], ['reference', '原始参照']] as const).map(([source, label]) => <button key={source} disabled={!ir || draft?.phase === 'gesture'} aria-pressed={artworkSource === source} onClick={() => setArtworkSource(source)}>{label}</button>)}
        </div><button disabled={editingLocked || !ir || artworkSource === 'reference'} onClick={downloadArtwork}>导出美术 PNG</button></div>
        {saved && <p className="canvas-reference">{artworkSource === 'draft' ? '当前草稿：显示当前图层、透明度和裁切效果，可直接编辑。' : artworkSource === 'saved' ? '已保存美术：显示上次保存的图层合成；切换到当前草稿可编辑。' : '原始参照：工作区打开时的参照图；切换到当前草稿可编辑。'} Cubism 区域仍显示上次生成模型。</p>}
        <div className="artboard checker"><svg ref={drawing} viewBox={viewBox} aria-label="可编辑美术画布" onPointerMove={move} onPointerUp={e => finishGesture(false, e.pointerId)} onPointerCancel={e => finishGesture(true, e.pointerId)} onLostPointerCapture={e => finishGesture(true, e.pointerId)}>
          {ir && saved && (artworkSource === 'reference' ? <image href={saved.sourceImage} x="0" y="0" width={ir.canvas.width} height={ir.canvas.height}/>
            : <ArtworkCanvas key={artworkSource} ir={artworkSource === 'saved' ? saved.ir : ir} client={artwork} source={artworkSource}/>)}
          {part && artworkSource === 'draft' && <g><polygon points={polygon.map(p => p.join(',')).join(' ')} fillRule="evenodd" fill="rgba(0,97,255,.035)" stroke="#0864ff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
            {polygon.map((point, i) => <circle key={i} data-handle={`polygon-${i}`} aria-label={`多边形顶点 ${i + 1}`} cx={point[0]} cy={point[1]} r={viewWidth / 115} fill="#0864ff" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={e => start(e, { kind: 'polygon', index: i })}/>)}
            {Object.entries(part.geometry.landmarks || {}).map(([name, point]) => <g key={name}><circle aria-label={`关键点 ${name}`} data-handle={`landmark-${name}`} cx={point[0]} cy={point[1]} r={viewWidth / 115} fill="#f19b28" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" onPointerDown={e => start(e, { kind: 'landmark', name })}/><text x={point[0] + viewWidth / 60} y={point[1]} fontSize={viewWidth / 55} fill="#674514">{name}</text></g>)}
          </g>}
        </svg></div><PointInspector editing={editing}/><DraftDiff/></section>);
}
