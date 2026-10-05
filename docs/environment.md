# 环境安装与工作区复现

本文件是唯一环境说明入口。目录布局和命令均以仓库根为基准；SDK、JDK、Gradle、PSD2Live 运行时已随仓放在 `dependencies/`，Python/Node 基础环境由使用者安装。

## 基础安装（Windows x64）

先安装 Git for Windows、Python 3.10 x64（`py -3.10` 可用）、Node.js 20.19+ 或 22.12+（含 npm）。viewer/Pose QA 使用系统 Microsoft Edge，无需另下载 Playwright Chromium。

```bat
git clone https://github.com/linnnn89/live2d-maker.git
cd live2d-maker
setup-windows.bat
```

安装脚本校验随仓依赖、解压到约定路径、创建 `python/` venv、安装固定 Python 版本 requirements，随后在 `studio/` 执行 `npm ci` 与 `npm run build`。无需系统 Java/Gradle。Python/npm 安装仍需网络；已有便携包和 JDK 等目录保留，脚本不删除或覆盖它们。

```bat
setup-windows.bat -DryRun
setup-windows.bat -SkipStudio
dependencies\install.bat
```

`-DryRun` 校验归档并打印计划，不创建环境；`-SkipStudio` 用于只运行 CLI/viewer。仅解压依赖的第三条不需要 Python/Node 或网络。

## 安装后的目录

```text
live2d-maker/
├─ dependencies/archives/    # 随 Git 的分卷包与完整官方 SDK ZIP
├─ dependencies/native/      # 当前源码构建的 PSD2Live JAR
├─ dependencies/sdk/         # 完整 Cubism Native 5-r.5（解压生成）
├─ portable/PSD2Live/         # 原始 portable JVM、启动器与依赖
├─ portable/build-tools/     # JDK 21、Gradle 9.6.1 和本地缓存
├─ python/                   # Python 3.10 venv（生成）
├─ studio/                   # 编辑器源码、package-lock；node_modules 生成
├─ psd2live/                 # Kotlin/Gradle 源码
├─ see-through/              # 上游源码；模型和推理环境另行安装
├─ live2d-viewer/             # 官方 Web Core/Framework 与渲染 harness
├─ schemas/authoring-rig/     # IR schema
├─ tools/authoring_rig/       # CLI 与工作区处理
└─ docs/                     # 环境、计划、交接和来源说明
```

## 版本与构建

| 项目 | 固定版本 |
|---|---|
| PSD2Live | 0.7.1 系列；随仓当前源码 JAR 加原始 portable |
| Temurin JDK | 21.0.12.1+1，Windows x64 |
| Gradle | 9.6.1 |
| Cubism Native SDK | 5-r.5，官方完整 ZIP |
| Cubism Web Framework/Core | Framework 5-r.5，Core native version 6.0.1 |
| Studio | React 19.2.4、TypeScript 5.9.3、Vite 8.3.2，精确 lockfile |
| 辅助 Python | 3.10，精确依赖见 `requirements-tools.txt` |
| 当前验证机 Node/npm | 24.19.0 / 11.17.0 |
| See-through | commit `7f139bb25c46a0c8ac720d95ddab185fcda5451c` |
| See-through Python/PyTorch | 3.12 / 2.8.0 + CUDA 12.8 |

```bat
build-psd2live.bat
build-psd2live.bat test
```

脚本使用本地 JDK/Gradle，默认构建 `jar`；首次源码构建仍从 Maven/插件仓库解析配置中固定版本的库。不需要调用会再下载 Gradle 的 wrapper。Studio 优先使用 `psd2live/build/libs/psd2live-0.7.1.jar`，无开发构建时 CLI 自动使用 `dependencies/native/psd2live-0.7.1.jar`。原始 portable 桌面启动器继续使用上游应用；本轮工具扩展由 Studio/CLI 与本仓源码提供。

## Studio 与自检

Studio 的 PSD/IR 工作区初始化、启动与交互见 [Studio 使用说明](../studio/README.md)。构建出的前端 `dist/` 不能替代 Python/Vite CLI 桥接服务。

```bat
python\Scripts\python.exe -m tools.authoring_rig --help
python\Scripts\python.exe live2d-viewer\check_runtime.py
python\Scripts\python.exe skills\live2d-studio\scripts\check_routing.py
```

完整 Native SDK 已解压不代表桌面官方预览已经配置：上游专用 `live2d_renderer.dll` 桥接库不在官方 SDK ZIP 中，需要按 [SDK 配置说明](../psd2live/docs/zh/guide/CUBISM_SDK_SETUP.md) 另行构建/配置；Studio 使用 Web Core，不依赖该 DLL。

## 可选 See-through

需要使用拆层推理时，先装 Miniconda/Miniforge 和适用的 NVIDIA 驱动，再运行：

```bat
setup-windows.bat -WithSeeThrough
```

明确需要权重时才运行以下命令；会下载数十 GB 数据：

```bat
setup-windows.bat -WithSeeThrough -WithModels
```

权重来源：`layerdifforg/seethroughv0.0.2_layerdiff3d`、`24yearsold/seethroughv0.0.1_marigold`、`24yearsold/l2d_sam_iter2`。缓存统一为 `see-through/.hf_home/`；具体推理与 AMD/ROCm、Linux、Apple Silicon 配置见 See-through 自带 README。可选环境未包含在基础安装验证中。

## 提交边界

完整 SDK ZIP、JDK/Gradle/PSD2Live 分卷和当前应用 JAR 上传 Git；每个文件小于 100 MiB。归档清单与许可证见 [依赖目录](../dependencies/README.md) 和 [第三方来源](THIRD_PARTY.md)。环境目录、模型权重、Gradle 缓存、node_modules、构建输出、个人工作区与渲染结果保持本地，不重复上传。
