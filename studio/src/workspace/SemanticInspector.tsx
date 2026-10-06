import { protocolSchema } from '../protocol/generated';
import { useWorkspace } from './WorkspaceContext';

const labels: Record<string, string> = {
  BACK_HAIR:'后发', FRONT_HAIR:'前发', HEADWEAR:'头饰', FACE:'脸', FACE_DETAIL:'面部细节',
  IRIDES:'虹膜', EYEBROW:'眉毛', EYEWHITE:'眼白', EYELASH:'睫毛', EYE_CLOSE:'闭眼',
  EYEWEAR:'眼饰', EARS:'耳朵', EARWEAR:'耳饰', NOSE:'鼻子', MOUTH:'嘴', MOUTH_OPEN:'张嘴',
  MOUTH_CLOSE:'闭嘴', TOOTH_T:'上牙', TOOTH_B:'下牙', TONGUE:'舌头', NECK:'脖子', NECKWEAR:'颈饰',
  TOPWEAR:'上装', HANDWEAR:'手部', BOTTOMWEAR:'下装', LEGWEAR:'腿部', FOOTWEAR:'脚部',
  TAIL:'尾巴', WINGS:'翅膀', OBJECTS:'其他物件', UNKNOWN:'未识别',
};
const sides = { none:'不指定', left:'左侧', right:'右侧' };
type Override = NonNullable<import('../protocol').Part['semantic']['override']>;

export function SemanticInspector() {
  const { ir, selected, saved, draft, edit, editingLocked } = useWorkspace();
  const part = ir?.parts.find(value => value.id === selected);
  if (!part) return null;
  const applied = saved?.build?.classifications?.filter(value => value.partId === selected) ?? [];
  const automatic = applied[0];
  const tag = part.semantic.override?.tag ?? automatic?.automaticTag ?? part.semantic.tag;
  const side = part.semantic.override?.side ?? automatic?.automaticSide?.toLowerCase() ?? part.semantic.side;
  const changed = draft?.changes.some(value => value.partId === part.id && value.field === 'semantic.override');
  const status = changed ? (part.semantic.override ? '人工覆盖尚未保存。' : '恢复自动识别尚未保存。')
    : part.semantic.override ? (saved?.stale.base_rig ? '人工覆盖已保存，重建后采用。' : '人工覆盖已保存；实际采用值见下方。')
    : '使用原生自动识别。';
  function change(value: Partial<Override>) {
    edit([{ type:'set_semantic', partId:part!.id, tag:tag as Override['tag'], side:side as Override['side'], ...value }]);
  }
  return <details className="semantic-editor" open><summary>部件设置</summary>
    <p>源名称：{part.name} · ID：{part.id}</p>
    <p>自动识别{automatic ? '（原生）' : '（导入估计）'}：{labels[automatic?.automaticTag ?? part.semantic.tag] ?? part.semantic.tag} / {sides[(automatic?.automaticSide?.toLowerCase() ?? part.semantic.side) as keyof typeof sides]}</p>
    <div className="semantic-fields">
      <label>类别 <select aria-label="部件类别" disabled={editingLocked} value={tag} onChange={e=>change({tag:e.target.value as Override['tag']})}>
        {protocolSchema.definitions.SemanticOverride.properties.tag.enum.map(value=><option key={value} value={value}>{labels[value]}</option>)}
      </select></label>
      <label>左右侧 <select aria-label="部件左右侧" disabled={editingLocked} value={side} onChange={e=>change({side:e.target.value as Override['side']})}>
        {Object.entries(sides).map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select></label>
      <button disabled={editingLocked || !part.semantic.override} onClick={()=>edit([{type:'reset_semantic',partId:part.id}])}>恢复自动识别</button>
    </div>
    <p>{status} 类别和左右侧会影响拆分及绑定；拆分部件可由原生保留其左右侧。</p>
    <div aria-label="原生分类结果">{applied.length ? <><strong>上次构建实际采用{saved?.stale.base_rig ? '（已过期）' : ''}</strong>
      <ul>{applied.map(value=><li key={value.componentId}>{labels[value.semanticTag] ?? value.semanticTag} / {sides[value.side.toLowerCase() as keyof typeof sides]} · {value.componentId} → {value.drawable || '无 drawable（空图层）'}</li>)}</ul></>
      : <p>保存并重建后显示实际组件和 drawable 对应关系。</p>}</div>
  </details>;
}
