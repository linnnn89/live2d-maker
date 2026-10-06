# 环境安装

本页说明 Windows x64 的安装、构建和可选推理环境。日常操作见 [根 README](../README.md) 和 [Studio 使用说明](../studio/README.md)；代码入口见 [toolchain.md](toolchain.md)。

## 基础安装

先安装 Git for Windows、Python 3.10 x64（`py -3.10` 可用）、Node.js 20.19+（20.x）或 22.12+，包含 npm。viewer/Pose QA 使用系统 Microsoft Edge。

```bat
git clone https://github.com/linnnn89/live2d-maker.git
cd live2d-maker
setup-windows.bat
```

脚本解压随仓依赖、创建 `python/` venv、安装 [requirements-tools.txt](../requirements-tools.txt)，再在 Studio 执行 `npm ci` 和 `npm run build`。Python/npm 安装需要网络；Java、Gradle、SDK 和原生预览资源已经随仓提供。现有依赖目录保留，版本标记不匹配或关键文件缺失时会报错，由使用者移开旧目录后重装。

| 命令/选项 | 用途 |
|---|---|
| `setup-windows.bat -DryRun` | 校验依赖文件并显示计划，不创建环境 |
| `setup-windows.bat -SkipStudio` | 不安装/构建 Studio；仍安装 Python 工具 |
| `setup-windows.bat -SkipPortable` | 跳过 PSD2Live portable 解压和桌面配置；其余依赖照常处理，CLI/Studio 仍需已有 portable |
| `dependencies\install.bat` | 只安装随仓依赖，无需 Python/Node 或联网 |
| `dependencies\install.bat -DestinationRoot "D:\work\live2d-maker"` | 将依赖安装到另一目录；不复制源码或应用 JAR |

归档清单、校验方法和目录保留规则集中在 [dependencies/README.md](../dependencies/README.md)。

## 安装位置与版本

| 内容 | 位置 | 版本来源 |
|---|---|---|
| Python 工具环境 | `python/` | Python 3.10；requirements 固定包版本 |
| 原 portable 应用/JVM | `portable/PSD2Live/` | PSD2Live 0.7.1；上游运行时 |
| 本仓应用与原生预览资源 | `dependencies/native/` | 应用 JAR、资源 JAR、DLL/着色器 |
| JDK | `portable/build-tools/jdk-21.0.12.1+1/` | Temurin 21.0.12.1+1 |
| Gradle | `portable/build-tools/gradle-9.6.1/` | 9.6.1 |
| 完整 Native SDK | `dependencies/sdk/CubismSdkForNative-5-r.5/` | 官方 5-r.5 ZIP |
| Cubism Web | `live2d-viewer/public/vendor/cubism/` | Framework 5-r.5，Core native version 6.0.1 |
| Studio | `studio/` | [package-lock.json](../studio/package-lock.json) |

安装器将 `cubism-runtime.jar` 加入桌面启动配置，首次修改前保存 `.before-cubism` 备份；不用手工编译 DLL 或设置全局环境变量。Windows 原生预览需要可用的 OpenGL 图形环境，Studio 使用独立的 Web runtime。

Python venv、node_modules、解压后的依赖、Gradle 缓存与工作区输出保持本地，不提交 Git。

## 构建与检查

以下命令在仓库根目录执行：

```bat
build-psd2live.bat
build-psd2live.bat test
python\Scripts\python.exe -m tools.authoring_rig --help
python\Scripts\python.exe live2d-viewer\check_runtime.py
python\Scripts\python.exe skills\live2d-studio\scripts\check_routing.py
```

构建脚本使用本地 JDK/Gradle，默认任务是 `jar`，首次解析 Maven/插件依赖需要网络。不要把 portable 的 Java 运行时当作源码构建 JDK。

Studio 优先加载 `psd2live/build/libs/psd2live-0.7.1.jar`；没有开发构建时，原生 CLI 使用随仓应用 JAR。切换运行时后 Overlay baseline 要重新建立。原 portable 桌面程序继续使用上游应用，本仓扩展通过 Studio/CLI 或源码构建使用。

原生加载/渲染集成检查需要 Windows OpenGL：

```bat
build-psd2live.bat test --tests io.github.psd2live.core.CubismNativeRuntimeTest "-Dpsd2live.cubism.smoke=true"
```

## 可选 See-through

这部分不属于基础安装。先安装 Miniconda/Miniforge 和适用的 NVIDIA 驱动，再运行：

```bat
setup-windows.bat -WithSeeThrough
```

脚本创建 `see_through_dev` Conda 环境（Python 3.12），安装 PyTorch 2.8.0/CUDA 12.8 和 See-through requirements。需要下载模型时显式运行：

```bat
setup-windows.bat -WithSeeThrough -WithModels
```

`-WithModels` 会连同推理环境一起处理并下载数十 GB 模型，缓存位于 `see-through/.hf_home/`。固定来源为 `layerdifforg/seethroughv0.0.2_layerdiff3d`、`24yearsold/seethroughv0.0.1_marigold`、`24yearsold/l2d_sam_iter2`。本项目未验证这套可选推理环境；其他平台与推理方法见 [See-through README](../see-through/README.md)。

E6a 的 Python 原生入口要求应用 JAR 含 `AuthoringPipelineFacade`，仓库随附版本已经同步。自选旧 JAR 会在 JVM 启动前被拒绝；重建当前源码或使用当前随仓 JAR。更新应用 JAR 会改变原生 runtime hash，即使模型像素相同也不会自动重用旧 Overlay baseline。
