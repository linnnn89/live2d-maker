# live2d-maker

用于处理分层 PSD、生成 Live2D 模型和检查导出效果的本地工具。核心建模与导出由 [PSD2Live](psd2live/README.md) 完成，浏览器编辑器 Studio 用来调整图层裁切、导入素材、重建模型和检查不同姿态。

项目仍在开发中。Studio 已支持编辑、保存、重建和预览，但还没有独立安装包，需要在本地启动服务。

## 功能

- 从分层 PSD 生成模型，导出 `.cmo3` 编辑器工程和 `.moc3` 运行时文件。
- 在 Studio 中查看图层、调整裁切轮廓、添加标记点，以及在画布放置/缩放、绘制保护区并预检新增或替换透明 PNG 素材。
- 重建后通过 Cubism 查看模型，用参数滑块检查动作，并批量渲染姿态检查图。
- 通过可选的 See-through 将单张立绘拆成分层 PSD。这部分需要单独安装推理环境和模型。

Studio 的裁切轮廓用于控制图层显示范围；标记点目前只保存位置，还不参与自动绑定。具体操作和限制见 [Studio 使用说明](studio/README.md)。

## 安装

目前提供 Windows x64 的安装脚本。先准备：

- Git for Windows
- Python 3.10 x64，能够运行 `py -3.10`
- Node.js 20.19+（20.x）或 22.12+，包含 npm
- Microsoft Edge，用于浏览器渲染检查

在命令提示符中执行：

```bat
git clone https://github.com/linnnn89/live2d-maker.git
cd live2d-maker
setup-windows.bat
```

脚本会解压随仓提供的 PSD2Live、JDK 21、Gradle、完整 Cubism Native SDK 和原生预览运行时，再创建 Python 环境、安装并构建 Studio。Python 和 npm 依赖的安装需要网络；不用另外安装 Java 或 Gradle。

只解压随仓依赖，可以运行：

```bat
dependencies\install.bat
```

原生预览所需的 `live2d_renderer.dll` 和着色器已经包含在仓库中，安装脚本会配置桌面启动器。See-through 模型权重不包含在基础安装中，安装方法见 [环境说明](docs/environment.md)。

## 使用

### 浏览器编辑器

安装完成后，在仓库根目录执行：

```bat
cd studio
npm run dev
```

打开 <http://127.0.0.1:5173/>，在项目页导入自己的 PSD、打开 Studio 工程归档或选择最近工程。点击 **Rebuild** 生成模型预览，修改后可保存项目修订，再重建并用 **Run Pose QA** 检查姿态。工程面板支持恢复旧修订和下载归档；“导出模型”可独立生成 cmo3 工程或可播放模型包，选择动作示例及默认物理，检查文件与警告后下载。示例与启动变量保留在“打开开发工作区”入口。

使用自己的 PSD、导入素材和切换工作区，见 [Studio 使用说明](studio/README.md)。编辑与导出结果保存在工作区中，源 PSD 不会被就地覆盖。

### 桌面程序

安装后运行：

```bat
portable\PSD2Live\PSD2Live.exe
```

便携版桌面程序使用上游 PSD2Live 应用。本仓新增的 Studio 工作流通过浏览器界面和 CLI 使用。桌面操作见 [PSD2Live 用户指南](psd2live/docs/zh/guide/USER_GUIDE.md)。

### 源码构建与命令行

以下命令在仓库根目录执行：

```bat
build-psd2live.bat
python\Scripts\python.exe -m tools.authoring_rig --help
```

构建脚本使用随仓 JDK 和 Gradle，默认生成应用 JAR；首次构建需要下载 Maven 依赖。CLI 无需先构建源码，可以使用随仓提供的应用 JAR。

## 目录与文档

| 目录 | 内容 |
|---|---|
| [`studio/`](studio/README.md) | 浏览器编辑器 |
| [`psd2live/`](psd2live/README.md) | 建模、导出和桌面程序源码 |
| [`tools/authoring_rig/`](tools/authoring_rig/) | 图层编辑、素材导入、重建和检查的 Python CLI |
| [`live2d-viewer/`](live2d-viewer/) | Cubism 浏览器预览与姿态渲染工具 |
| [`see-through/`](see-through/README.md) | 可选的单图拆层工具 |
| [`dependencies/`](dependencies/README.md) | 随仓依赖、安装入口和文件校验清单 |

环境配置见 [docs/environment.md](docs/environment.md)，开发计划见 [docs/PLAN.md](docs/PLAN.md)。使用 Agent 协助处理 PSD 或模型时，可从 [live2d-studio 技能说明](skills/live2d-studio/SKILL.md) 开始。

## 许可

本项目原创代码和文档采用 [GPL-3.0](LICENSE)。PSD2Live、See-through 和其他第三方组件保留各自的许可证。

Live2D Cubism SDK、Core 和 Framework 受 Live2D 的许可条款约束，不适用本仓的 GPL。第三方来源与许可见 [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md)。

Studio 的“部件设置”可修正图层类别和左右侧，并恢复自动识别；保存 IR 后重建才更新模型。原始 PSD 图层名不变，面板显示原生实际采用的组件/drawable 与自动识别值。修正支持撤销/重做和草稿恢复；旧构建需重建才显示身份映射。契约见 [Studio 草稿命令](docs/STUDIO_DRAFT_COMMANDS.md)。

“项目构建设置”可保存贴图尺寸、网格内部间距和头部转向强度，并按新设置重建。面板区分未保存、已保存待重建及实际采用值；不同编辑页的设置冲突保留输入。旧工作区默认行为保持，设置不修改美术像素。使用和 CLI 契约见 [Studio 项目构建设置](studio/README.md#项目构建设置)。
