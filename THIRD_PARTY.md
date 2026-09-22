# 第三方来源与许可

本仓库是多个开源组件与项目自有工作流的聚合仓库。各组件继续受各自许可证约束。

## PSD2Live

- 上游：<https://github.com/tsunehimatoi/psd2live>
- 本仓目录：`psd2live/`
- 许可证：GNU GPL-3.0，见 `psd2live/LICENSE`
- 第三方声明：`psd2live/THIRD_PARTY_NOTICES.md`
- 当前工作区源码版本：`0.7.1` 系列；便携二进制不入 Git，由 `setup-windows.bat` 从上游 `v0.7.1` Release 下载。
- 本仓不包含、不分发 Live2D Cubism 官方专有 SDK。

## See-through

- 上游：<https://github.com/shitagaki-lab/see-through>
- 本仓目录：`see-through/`
- 固定导入基线：`7f139bb25c46a0c8ac720d95ddab185fcda5451c`
- 许可证：Apache-2.0，见 `see-through/LICENSE`
- 本仓直接包含其源码，未包含 Hugging Face 模型权重、虚拟环境、缓存或生成数据。

## 模型权重

See-through 在首次运行或执行 `setup-windows.bat --with-models` 时从 Hugging Face 下载：

- `layerdifforg/seethroughv0.0.2_layerdiff3d`
- `24yearsold/seethroughv0.0.1_marigold`
- `24yearsold/l2d_sam_iter2`

权重受各模型页面声明的条款约束，不属于本仓库源码发布物。

## live2d-studio 技能包

`skills/live2d-studio/` 是本工作区的项目自有路由、操作手册、验证脚本和自学习经验，由项目所有者授权随本仓公开。
