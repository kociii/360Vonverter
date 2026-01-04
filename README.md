# 全景图转换工具 (360 Panorama Converter)

这是一个基于 Web 的全景图格式转换工具，支持在 **Equirectangular (2:1 全景图)** 和 **Cubemap (六面体贴图)** 之间进行相互转换，并提供实时的 3D 预览功能。

## ✨ 功能特性

*   **2:1 转 六面 (Pano to Cube)**
    *   将一张 2:1 比例的 Equirectangular 全景图转换为 6 张独立的 Cubemap 贴图（上、下、左、右、前、后）。
    *   支持导出为 ZIP 压缩包。
*   **六面 转 2:1 (Cube to Pano)**
    *   将 6 张 Cubemap 贴图合并转换为一张 2:1 的 Equirectangular 全景图。
    *   支持分别上传 PX, NX, PY, NY, PZ, NZ 六个面的图片。
*   **实时预览**
    *   利用 Three.js 提供流畅的 3D 全景预览。
    *   支持鼠标拖拽查看全景效果。
*   **自定义导出尺寸**
    *   支持选择 512px 到 8192px 的导出分辨率。
*   **纯前端运行**
    *   所有处理均在浏览器本地完成，无需上传图片到服务器，保护隐私且速度快。

## 🚀 如何使用

### 方式一：直接打开
由于项目是纯静态网页，您可以直接双击 `index.html` 在浏览器中打开（部分浏览器可能因 CORS 策略限制本地文件访问，建议使用方式二）。

### 方式二：本地服务器（推荐）
为了获得最佳体验并避免跨域问题，建议使用本地服务器运行。

如果您安装了 Python：
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```
然后在浏览器访问 `http://localhost:8000`。

或者使用 VS Code 的 **Live Server** 插件右键打开 `index.html`。

## 🛠 技术栈

*   **HTML5 / CSS3**: 界面布局与样式。
*   **JavaScript (ES6+)**: 核心逻辑。
*   **[Three.js](https://threejs.org/)**: 用于 3D 场景渲染和全景图预览。
*   **[JSZip](https://stuk.github.io/jszip/)**: 用于打包下载转换后的六面图。
*   **[FileSaver.js](https://github.com/eligrey/FileSaver.js)**: 用于文件保存。

## 📂 项目结构

```
.
├── index.html      # 主页面结构
├── script.js       # 核心逻辑与 Three.js 渲染代码
├── style.css       # 样式文件
└── README.md       # 项目说明文档
```

## 📝 注意事项

*   **性能**: 处理高分辨率（如 8K）全景图时，可能会占用较多内存和 CPU，请耐心等待处理完成。
*   **浏览器兼容性**: 建议使用最新版本的 Chrome, Firefox, Edge 或 Safari 浏览器以获得最佳 WebGL 支持。

## 📄 License

MIT License
