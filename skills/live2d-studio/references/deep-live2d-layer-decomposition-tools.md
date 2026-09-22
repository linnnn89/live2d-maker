# 单张立绘 → 分层 PSD：拆层工具（See-through）

用途：手上只有一张整图、要拿到分层 PSD 进本仓库链路时用它拆层（输出约 23 个语义层 + 伪深度序），再走 PSD2Live 建模型。

## 三个模型各管什么（从 HuggingFace 拉）

| 模型 | repo | 职责 |
|---|---|---|
| LayerDiff 3D | `layerdifforg/seethroughv0.0.2_layerdiff3d` | 透明层生成（SDXL 基座 + 自定义透明 VAE） |
| Marigold Depth | `24yearsold/seethroughv0.0.1_marigold` | 动漫伪深度，决定层的先后序 |
| SAM Body Parsing | `24yearsold/l2d_sam_iter2` | 19 部件语义分割 |

## 为什么不能换成别的二次元底模

`common/utils/inference_utils.py` 的 `apply_layerdiff()` 里，出层能力来自两个**自定义类**：

- `TransparentVAE.from_pretrained(repo, subfolder='trans_vae')` —— RGBA 潜空间的透明 VAE；
- `UNetFrameConditionModel.from_pretrained(repo, subfolder='unet')` —— 微调过的 frame-condition UNet；

两者被塞进 `KDiffusionStableDiffusionXLPipeline`。因此：

- 普通二次元全量 checkpoint（4GB 级 fp16）键名对不上，加载即报错；
- 就算键名对得上，没有 `trans_vae` 就**根本出不了 alpha**，"拆层"这件事不存在；
- `--vae_ckpt/--unet_ckpt` 只接受**同族** ckpt（键前缀 `trans_decoder.` / `vae.`），不是给任意底模换的接口；
- 深度与分割两段是专用架构，与文生图模型不同类，更替不了。

用户问"能不能用我自己的底模替掉它"时，先把上面三条讲清楚，不要先下载再试。

## 正确串联方式

本地底模在 WebUI / img2img / 局部重绘里把整图做到满意 → 把这张 PNG 交给拆层工具 → 分层 PSD → 本仓库链路。

必须同时讲清的代价：**被遮挡部分的补绘（inpaint）由拆层模型决定，不是本地底模的风格**（例如头发后面的脸、身体后面的后发）。想让补绘也走自己的风格只能重训，官方训练配方是 8×H200 级，本机做不了。

## 低显存与小图

- `inference/scripts/inference_psd.py --group_offload`（分组卸载）、`--resolution 1024`（默认 1280）；
- `inference/scripts/inference_psd_quantized.py` 是更低显存的入口；
- 主流程：`--srcp <单图或目录> --save_to_psd`，输出默认在 `workspace/layerdiff_output/`；**必须从仓库根目录运行**（脚本里有相对路径）。

## 环境与安装要点

- 仓库只含代码，权重在首次运行 `from_pretrained` 时下载到 HF 缓存——**下载量与耗时先跟用户确认再动手**。
- 建环境用 `uv venv --python 3.12 --python-preference only-managed`。默认的 `uv venv --python 3.12` 会抓到系统里其它软件的 python（例如 LibreOffice 自带的解释器）然后拒绝用它建 venv；加 `only-managed` 才会去下官方 CPython。
- 依赖分档：`requirements.txt` 是核心档；detectron2 / SAM2 / mmdet 各是独立可选档（需 `--no-build-isolation`），核心档不含它们。
- 首次跑之前确认仓库根有 `assets` 指向 `common/assets`。
