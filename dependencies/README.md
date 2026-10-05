# 随仓依赖（Windows x64）

运行 `install.bat` 即可校验 SHA-256 并解压；不下载运行时、不安装全局环境。根目录 `setup-windows.bat` 默认调用同一入口，再安装 Python requirements 和 Studio npm lockfile。

| 包 | 安装目录 | 内容 |
|---|---|---|
| PSD2Live v0.7.1 portable | `portable/PSD2Live/` | 原始 JVM、桌面启动器及依赖 JAR；追加上游许可证 |
| 当前 PSD2Live 应用 | `dependencies/native/psd2live-0.7.1.jar` | 本仓源码构建，供工具 CLI/Studio 使用，不替换本机原始 portable |
| Eclipse Temurin 21.0.12.1+1 | `portable/build-tools/jdk-21.0.12.1+1/` | 完整 JDK，保留 legal、NOTICE、src.zip |
| Gradle 9.6.1 | `portable/build-tools/gradle-9.6.1/` | 完整 bin 分发，保留 LICENSE/NOTICE 与插件库 |
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

完整官方 SDK 不包含 PSD2Live 专用的 `live2d_renderer.dll` 桥接库。Studio 的 Web Core 验证独立可用；可选桌面 Native SDK 预览仍按 `psd2live/docs/zh/guide/CUBISM_SDK_SETUP.md` 配置桥接库，不将“已解压 SDK”当作桌面预览通过。

第三方许可与对应源码位置见 [来源与许可](../docs/THIRD_PARTY.md)。本目录中的 Live2D 内容受其专有/Open Software 条款约束，不属于根 GPL 许可。
