# 第三方来源与许可

本项目原创代码和文档采用根目录 [GPL-3.0](../LICENSE)。第三方代码、运行时、SDK、示例和模型保留各自许可。安装包版本和 SHA-256以 [dependencies/manifest.json](../dependencies/manifest.json) 为准。

## PSD2Live / Umamo

上游：[tsunehimatoi/psd2live](https://github.com/tsunehimatoi/psd2live)。本仓源码在 `psd2live/`，保留 [GPL-3.0](../psd2live/LICENSE)、[第三方说明](../psd2live/THIRD_PARTY_NOTICES.md) 与组件许可证。

`psd2live-runtime.zip.*` 重新压缩上游 v0.7.1 portable，保留 JVM legal 信息和依赖 JAR 声明，并补入上游许可文件。随仓应用 JAR 由本仓源码构建；它不嵌入 Native SDK，原生资源由独立 JAR 提供。后续 Gradle 构建会嵌入该资源 JAR 中的内容。

portable 的 OpenJDK 21.0.9 使用 GPL-2.0/Classpath 相关许可，对应源代码：[jdk21u jdk-21.0.9+10](https://github.com/openjdk/jdk21u/tree/jdk-21.0.9%2B10)。其他库以各自随包声明为准。

## Eclipse Temurin JDK

版本为 21.0.12.1+1，Windows x64 HotSpot，采用 GPL-2.0 WITH Classpath-exception-2.0。

- [官方二进制](https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.12.1%2B1)
- [对应源码](https://github.com/adoptium/jdk21u/tree/jdk-21.0.12.1%2B1) 与 [构建源码](https://github.com/adoptium/temurin-build)
- [官方许可说明](https://adoptium.net/docs/faq)

重新压缩时保留完整 legal、NOTICE 和 src.zip。NOTICE 另存于 `dependencies/licenses/`，程序代码未改。

## Gradle

版本为 9.6.1，保留完整 bin 分发。Gradle Build Tool 采用 Apache-2.0，包内其他库保留自己的许可证。

- [官方分发](https://services.gradle.org/distributions/gradle-9.6.1-bin.zip)
- [对应源码](https://github.com/gradle/gradle/tree/v9.6.1)
- [官方许可说明](https://docs.gradle.org/current/userguide/licenses.html)

LICENSE/NOTICE 随包保留，并另存于 `dependencies/licenses/`。

## Live2D Cubism

仓库随附官方完整 Native 5-r.5 ZIP，未改内容，保留 Core、Framework、Samples 及内置许可：

- [原始 SDK ZIP](https://cubism.live2d.com/sdk-native/bin/CubismSdkForNative-5-r.5.zip)
- [官方 Native 下载页](https://www.live2d.com/en/sdk/download/native/)
- [Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html)
- [Open Software License](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html)

Core 使用专有许可，Framework 和着色器使用 Live2D Open Software License，不按本仓 GPL再许可。Core 随派生应用分发与完整 SDK镜像的条件不同，保留许可文件本身不授予额外分发权利。

`live2d_renderer.dll` 取自 [PSD2Live 历史提交 0b13a818](https://github.com/tsunehimatoi/psd2live/blob/0b13a8184791733ff30584bd1243222c8ad1bd43/src/main/resources/cubism/windows-x86_64/live2d_renderer.dll)，原始 blob为 `8aad05ebcaa7c8afb42faefc404d495be2279ca9`，二进制未改。该提交没有桥接 C++ 源码，不能保证可复现编译；DLL 包含官方 Core/Framework，随附对应许可。22 个着色器来自官方 Native 5-r.5 ZIP。`cubism-runtime.jar` 只打包这些资源与许可，没有Java 程序代码。

Web Core/Framework 来源、精确版本和打包方式见 [Web runtime 说明](../live2d-viewer/public/vendor/cubism/README.md)。PSD2Live 上游的“不随附 SDK”政策描述其独立仓库；本集成仓库另外提供 SDK 和桥接资源。本项目与 Live2D Inc. 无隶属或背书关系。

## See-through

上游：[shitagaki-lab/see-through](https://github.com/shitagaki-lab/see-through)，固定基线 `7f139bb25c46a0c8ac720d95ddab185fcda5451c`，采用 [Apache-2.0](../see-through/LICENSE)。

模型权重不随仓分发，显式使用 `setup-windows.bat -WithModels` 才下载，受各模型页面条款约束。来源与推理环境见 [environment.md](environment.md)。

## Studio 与技能

Studio 依赖由 `studio/package-lock.json` 固定，各包保留自己的许可证。`skills/live2d-studio/` 的迁入资料来源与许可单独记在 [vendor-manifest.md](../skills/live2d-studio/references/vendor-manifest.md)。外部技能注册表仅包含指针，不随仓复制外部技能正文。
