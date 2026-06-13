# 图片长图拼接工具 Tauri 版

这是一个更轻量的桌面版方案：界面用 HTML/CSS/JavaScript，桌面壳用 Tauri，最终高清拼接保存由 Rust 后端完成。

当前版本保留了这些核心能力：

- 拖入图片或文件夹导入
- 首次导入自然排序，后续导入追加
- 左侧长图实时预览，支持滚动和缩放
- 右侧列表点击定位、拖动改顺序、Delete 删除、Ctrl+A 全选
- 间距与间距颜色设置
- 保存为 JPG 长图，并记住上一次保存目录
- 顶部提示词功能
  - 单张生成
  - 批量生成 / 停止
  - 复制全部
  - API 设置
  - 未配置 API Key 时输出统一模板提示词

## 环境要求

需要先安装：

- Node.js 18+
- Rust
- Windows WebView2

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
npm run tauri dev
```

## 打包

```bash
npm run tauri build -- --no-bundle
```

也可以直接双击：

```bat
build_tauri.bat
```

脚本会自动检查 Node.js、npm、Rust、cargo，环境齐全后再安装依赖并打包。默认只生成 exe，不额外打 MSI 安装包，避免 WiX 下载超时。

## 项目结构

```text
图片长图拼接工具-Tauri版
├─ index.html
├─ package.json
├─ src
│  ├─ main.js
│  └─ styles.css
└─ src-tauri
   ├─ Cargo.toml
   ├─ tauri.conf.json
   └─ src
      ├─ lib.rs
      └─ main.rs
```

## 说明

- 前端负责预览、排序、提示词交互。
- Rust 后端负责读取本地文件、递归文件夹、保存高清 JPG、读写配置。
- 配置文件会保存到当前用户目录下的应用配置目录，不写死到程序安装目录。
