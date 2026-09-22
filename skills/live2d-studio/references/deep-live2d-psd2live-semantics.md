# PSD2Live 层语义与绑定核对

## 标签怎么定的

`LayerClassifier` 对层名做 normalize（NFKC + 小写 + 去首尾空白 + 去 "copy" 后缀）后**先按精确别名表**（`aliases[name]`）查，命中即得 tag；未命中再走 prefixMatch（别名 + 空格/`-`/`_` 分隔，或短别名后跟数字/纯非 ASCII），都没有则**按包围盒中心相对脸底线的位置兜底**到头部或身体容器。

关键后果：

- **下划线写法不一定在表里。** `backhair`、`back hair`、`hair back`、`hair_back`、`后发` 命中 BACK_HAIR，但 `back_hair` 不命中；`fronthair`、`front hair`、`hair_front`、`hair`、`bangs`、`前发`、`刘海` 命中 FRONT_HAIR，但 `front_hair` 不命中。未命中的发层会被兜底塞进头部容器，**永远拿不到 DeformHairBackFollow → DeformHairBackPhysics**，于是后发只随头壳平移、完全不理 `ParamHairBack`。
- 别名表里有多条目共用一个 tag（例如 `hair` 单独出现也映射到 FRONT_HAIR），所以精确命中优先于前缀匹配：先查表、再前缀，不要凭直觉猜哪个名字更"正确"。
- 层名里带 `-r` / `-l` 不改变 tag；相反，某些 tag（对称部件）会被 `ComponentSplitter` 自动按左右连通域切成 `<name>-r` / `<name>-l` 两层再进模型。**所以导出后的层名可能和 PSD 层名不同——核对时看 `tag`，不要看 `source` 名字。**

要改名字：PNG 文件名 + `source-manifest.json` 层名 + 重建出的 PSD 层名必须一致；同时避开仓库里已存在的素材名（例如原始素材 `hair_back.png` 已被 process_hair 之类脚本使用，新层叫 `backhair` 就不会撞名）。

## tag → 绑定（影响"跟谁动"）

| tag | 绑定的变形器/行为 |
| --- | --- |
| FRONT_HAIR | `DeformHairFrontFollow`（随后发跟随） |
| BACK_HAIR | `DeformHairBackFollow` → `DeformHairBackPhysics`，由 `ParamHairBack` 驱动摆动 |
| FACE / FACE_DETAIL | 脸部容器；FACE_DETAIL 是表情开关层，由参数切换显示 |
| BODY / TOPWEAR / BOTTOMWEAR | 身体容器，不随头部 |
| UNKNOWN | 按包围盒兜底（多数落进头部容器）——**这就是"该动的不动"的典型症状** |

物理摆动幅度不在这里定，来自模型自己的 `physics3.json`（各部件 `Scale` 与输入参数范围）；连接对了但幅度怪，去调 physics3，不要回头改层。

## 探针：绑定到底生效没有（先做这个，再动美术）

把某个物理参数拉满 +10 与 -10 各渲一张，逐像素比：

```python
# before/after 各渲 ParamHairBack=+10 / -10，然后
import numpy as np; from PIL import Image
d = np.array(Image.open(a).convert('RGBA')) != np.array(Image.open(b).convert('RGBA'))
print(d.any(axis=2).sum())   # 0 ⇒ 该层与该参数完全无绑定
```

判读：`0` 像素变化 = tag 没命中、层没挂上物理链；数万像素变化 = 已绑定。这套探针同样可用于 `ParamHairFront`、身体参数等，用它来**先证伪**"层序问题"的猜测。

## 导完必做的核对

用本技能自带的 `scripts/check_psd2live_tags.py` 一次性列出所有层的 tag/side，扫 `unknown` 和应为头发/表情的层是否拿到了正确 tag。改完素材后先跑它，再跑渲染验证。
