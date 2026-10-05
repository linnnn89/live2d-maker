# 随仓依赖（Windows x64）

运行 `install.bat` 即可校验 SHA-256 并解压；不下载运行时、不安装全局环境。根目录 `setup-windows.bat` 默认调用同一入口，再安装 Python requirements 和 Studio npm lockfile。

| 包 | 安装目录 | 内容 |
|---|---|---|
| PSD2Live v0.7.1 portable | `portable/PSD2Live/` | 原始 JVM、桌面启动器及依赖 JAR；追加上游许可证 |
| 当前 PSD2Live 应用 | `dependencies/native/psd2live-0.7.1.jar` | 本仓源码构建，供工具 CLI/Studio 使用，不替换本机原始 portable |
| Eclipse Temurin 21.0.12.1+1 | `portable/build-tools/jdk-21.0.12.1+1/` | 完整 JDK，保留 legal、NOTICE、src.zip |
| Gradle 9.6.1 | `portable/build-tools/gradle-9.6.1/` | 完整 bin 分发，保留 LICENSE/NOTICE 与插件库 |
| Cubism 原生桥接运行时 | `dependencies/native/cubism/`、`cubism-runtime.jar` | 上游 Windows x64 DLL、22 个官方着色器及 Core/Framework 许可；安装器自动注册桌面 classpath |
| Cubism Native SDK 5-r.5 | `dependencies/sdk/CubismSdkForNative-5-r.5/` | 官方原始完整 ZIP，含 Core、Framework、Samples、许可；原包不改动 |

`manifest.json` 固定各包来源、体积、整包及每卷 SHA-256。PSD2Live/JDK/Gradle 从当前已验证分发重新压缩，分卷大小不超过 48 MiB（普通 Git 文件，无需 Git LFS）；这些重新压缩包的哈希与上游下载 ZIP 不同。安装器按清单顺序合并、校验再解压。SDK 原始 ZIP 为 27,566,034 字节，SHA-256 `7ff3a4bbc19c0a8728965aa522ab77eb11b252916453e68a8a78d3b71188bb12`。

现有目录会保留；缺失关键文件或安装标记版本不一致时明确报错，由使用者移开旧目录后重装。解压后的目录、Gradle 工作缓存、Python venv 与 node_modules 不再重复提交。源码构建的 Maven 库、Python 和 npm 包仍通过固定版本配置下载；不包含 See-through 模型权重。

仅检查包与计划，不安装：

```bat
dependencies\install.bat -DryRun
```

安装到另一个完整仓库/临时目录：

```bat
dependencies\install.bat -DestinationRoot "D:\work\live2d-maker"
```

此参数只指定解压目标，不复制源码或 native JAR；应用运行须使用完整仓库。默认目标为本仓根目录，与现有工具路径一致。`build-psd2live.bat [Gradle tasks...]` 使用随仓 JDK/Gradle，不修改系统 JAVA_HOME；默认任务为 `jar`。

`live2d_renderer.dll` 直接随仓提供，来源为 PSD2Live 上游历史提交 `0b13a8184791733ff30584bd1243222c8ad1bd43`，未修改，930,304 字节，SHA-256 `8c855be34ea39139149d56c0da8cd5950d763d9bb5e240b3398ab484d9e656bf`。`manifest.json` 也记录全部着色器、许可和资源 JAR 的哈希。DLL 仅依赖 Windows 自带 OpenGL/Kernel/User/GDI 系统库。

安装器向 `portable/PSD2Live/app/` 添加资源 JAR，并在 `PSD2Live.cfg` 的 `[Application]` 节注册 classpath，首次修改前保留 `.before-cubism` 备份；原始应用 JAR/JVM 保留。CLI/Studio 直接加载同一资源 JAR；源码 Gradle 构建将资源嵌入应用 JAR。不需要手动设置全局环境变量或另装 C++ 运行库。Windows 原生预览仍需要可用的 OpenGL 图形环境。

原生预览集成验证（生成隔离模型，实际加载、渲染两组参数并读回）：

```bat
build-psd2live.bat test --tests io.github.psd2live.core.CubismNativeRuntimeTest "-Dpsd2live.cubism.smoke=true"
```

第三方许可与对应源码位置见 [来源与许可](../docs/THIRD_PARTY.md)。本目录中的 Live2D 内容受其专有/Open Software 条款约束，不属于根 GPL 许可。
