# 第三方来源与许可

本集成仓库原创代码与文档采用根目录 GPL-3.0。第三方代码、运行时、SDK、示例和权重始终保留各自许可；根目录许可证不覆盖下面的专有内容。

## PSD2Live / Umamo

- 上游：https://github.com/tsunehimatoi/psd2live ，本仓 `psd2live/` 保留 GPL-3.0 与 `THIRD_PARTY_NOTICES.md`。
- `dependencies/archives/psd2live-runtime.zip.*` 重新压缩上游 v0.7.1 portable，保留 JVM legal 信息、依赖 JAR 内的声明，并追加 GPL 与上游第三方说明；对应应用源代码在 `psd2live/`。
- `dependencies/native/psd2live-0.7.1.jar` 是本仓当前源码构建，用于 CLI/Studio；不嵌入官方 Native SDK。
- portable 的 OpenJDK 21.0.9 自带 GPL-2.0/ClassPath 相关许可；对应版本源代码：https://github.com/openjdk/jdk21u/tree/jdk-21.0.9%2B10 。各依赖仍受其随包声明约束。

## Eclipse Temurin JDK

- 版本：21.0.12.1+1，Windows x64 HotSpot。
- 官方二进制：https://github.com/adoptium/temurin21-binaries/releases/tag/jdk-21.0.12.1%2B1 。
- 对应源代码：https://github.com/adoptium/jdk21u/tree/jdk-21.0.12.1%2B1 ，构建源：https://github.com/adoptium/temurin-build 。
- GPL-2.0 WITH Classpath-exception-2.0；完整 `legal/`、`NOTICE`、`src.zip` 均在压缩包中，NOTICE 另置于 `dependencies/licenses/`。重新压缩但未改程序代码。
- 官方许可说明：https://adoptium.net/docs/faq 。

## Gradle

- 版本：9.6.1，完整 bin 分发：https://services.gradle.org/distributions/gradle-9.6.1-bin.zip 。
- 对应源代码：https://github.com/gradle/gradle/tree/v9.6.1 。
- Gradle Build Tool 采用 Apache-2.0；包内库各受自己的许可证约束，完整 LICENSE/NOTICE 保留并额外放在 `dependencies/licenses/`。
- 官方许可说明：https://docs.gradle.org/current/userguide/licenses.html 。

## Live2D Cubism SDK / Web runtime

- 应项目所有者要求，本集成仓库单独随附官方完整 Native 5-r.5 ZIP：`dependencies/archives/CubismSdkForNative-5-r.5.zip`，不改内容，保留 Core、Framework、Samples 与所有内置许可。
- 官方来源：https://cubism.live2d.com/sdk-native/bin/CubismSdkForNative-5-r.5.zip 。
- 官方下载页：https://www.live2d.com/en/sdk/download/native/ 。
- Core 为专有软件；Framework 使用 Live2D Open Software License。完整 SDK 不采用 GPL，也不能根据本仓 GPL 任意再许可。
- 官方条款：https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html 和 https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html 。Core 随派生应用分发的条款与整个 SDK 的镜像分发不同；保留许可文件本身并不授予额外分发权利。完整 SDK 的上传由项目所有者明确要求。
- 原生桥接 DLL 在 `dependencies/native/cubism/windows-x86_64/live2d_renderer.dll`，取回自 PSD2Live 历史提交 `0b13a8184791733ff30584bd1243222c8ad1bd43` 的原始 Git blob `8aad05ebcaa7c8afb42faefc404d495be2279ca9`，未改二进制；上游未在该提交提供桥接 C++ 源码，不能声称可复现编译该 DLL。它包含官方 Core/Framework，随附对应许可，不按根 GPL 再许可。22 个着色器来自随仓官方 Native 5-r.5 ZIP；`cubism-runtime.jar` 仅打包这些资源与许可，无 Java 程序代码。
- 已有 Web runtime 在 `live2d-viewer/public/vendor/cubism/`，精确 Core/Framework 版本、来源和生成方式见该目录 README。
- PSD2Live 上游文档中的“不随附官方 SDK”描述其自身组件政策；本集成仓库的独立 SDK 压缩包不属于 PSD2Live 应用 JAR。
- 本项目与 Live2D Inc. 无隶属、背书或赞助关系。

## See-through 与模型权重

- 上游：https://github.com/shitagaki-lab/see-through ，固定基线 `7f139bb25c46a0c8ac720d95ddab185fcda5451c`，Apache-2.0，见 `see-through/LICENSE`。
- 模型权重不在本仓上传物中；仅显式 `setup-windows.bat -WithModels` 下载，受各模型页面条款约束。来源与环境见 [环境说明](environment.md)。

## Studio 与技能包

Studio 的 npm 依赖按精确 `studio/package-lock.json` 安装，保留包内许可证。`skills/live2d-studio/` 是项目自有路由、手册与验证脚本；未替换本机已安装技能。
