# Environment setup

The complete installation and workspace-rebuild guide is maintained in Chinese:

- [环境安装与完整工作区复现](环境.md)

Quick start on Windows:

```bat
setup-windows.bat
```

Full See-through environment and model download:

```bat
setup-windows.bat -WithSeeThrough -WithModels
```

The repository includes the `psd2live/` and `see-through/` source trees. Downloadable Python environments, portable runtimes, model weights, caches, and generated outputs are intentionally excluded from Git and rebuilt by the setup command above.
