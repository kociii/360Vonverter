let scene, camera, renderer, previewMesh, controls;
const container = document.getElementById('preview-container');
const fileInput = document.getElementById('fileInput');
const exportBtn = document.getElementById('exportBtn');
const exportPanoBtn = document.getElementById('exportPanoBtn');
const statusDiv = document.getElementById('status');
const batchFileInput = document.getElementById('batchFileInput');

// 自动计算的导出尺寸
let autoExportSize = 1024;

// Tab 元素
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const cubeInputs = document.querySelectorAll('.cube-file');
const cubeThumbs = document.querySelectorAll('.cube-thumb');

let currentTexture = null;
let currentPanoImage = null; // 保存当前全景图用于缩略图
let currentMode = 'pano2cube'; // 'pano2cube' or 'cube2pano'
let cubeImages = { px: null, nx: null, py: null, ny: null, pz: null, nz: null };
let cubeImageSrcs = { px: null, nx: null, py: null, ny: null, pz: null, nz: null }; // 保存图片 src 用于缩略图
let dragSourceFace = null; // 拖拽源

init();

function init() {
    // 1. 初始化场景
    scene = new THREE.Scene();

    // 2. 初始化相机 (预览用)
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 0.1); // 稍微偏离中心一点点，方便 OrbitControls 工作

    // 3. 初始化渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 4. 控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false; // 全景图通常不需要缩放，或者反向缩放(FOV)
    controls.enablePan = false;
    controls.rotateSpeed = -0.5; // 反转拖拽方向，使其符合全景图直觉

    // 5. 监听窗口大小变化
    window.addEventListener('resize', onWindowResize);

    // 6. 监听文件上传
    fileInput.addEventListener('change', handleFileUpload);
    
    // 监听六面图上传
    cubeInputs.forEach(input => {
        input.addEventListener('change', handleCubeUpload);
    });
    
    // 监听六面图缩略图点击
    cubeThumbs.forEach(thumb => {
        thumb.addEventListener('click', (e) => {
            // 如果正在拖拽，不触发点击
            if (thumb.classList.contains('dragging')) return;
            const face = thumb.dataset.face;
            const input = thumb.querySelector('.cube-file');
            input.click();
        });
        
        // 拖拽事件
        thumb.addEventListener('dragstart', handleDragStart);
        thumb.addEventListener('dragend', handleDragEnd);
        thumb.addEventListener('dragover', handleDragOver);
        thumb.addEventListener('dragleave', handleDragLeave);
        thumb.addEventListener('drop', handleDrop);
    });
    
    // 监听批量上传
    batchFileInput.addEventListener('change', handleBatchUpload);
    
    // 监听缩略图更换按钮
    document.querySelectorAll('.thumbnail-change').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = btn.dataset.target;
            document.getElementById(targetId).click();
        });
    });

    // 7. 监听导出按钮
    exportBtn.addEventListener('click', exportCubemap);
    exportPanoBtn.addEventListener('click', exportEquirectangular);

    // 监听 Tab 切换
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // 8. 渲染循环
    animate();
}

function switchTab(tabId) {
    currentMode = tabId;
    
    // 更新 UI
    tabBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === `${tabId}-panel`);
    });

    // 清空场景
    if (previewMesh) {
        scene.remove(previewMesh);
        if (previewMesh.geometry) previewMesh.geometry.dispose();
        if (previewMesh.material) {
            if (Array.isArray(previewMesh.material)) {
                previewMesh.material.forEach(m => m.dispose());
            } else {
                previewMesh.material.dispose();
            }
        }
        previewMesh = null;
    }
    currentTexture = null;
    currentPanoImage = null;
    statusDiv.textContent = "";
    exportBtn.disabled = true;
    exportPanoBtn.disabled = true;
    
    // 重置缩略图显示
    resetThumbnails();
}

function resetThumbnails() {
    // 重置全景图缩略图
    const panoPreview = document.getElementById('pano-preview');
    const panoUpload = document.getElementById('panoUploadArea');
    if (panoPreview) panoPreview.style.display = 'none';
    if (panoUpload) panoUpload.style.display = 'flex';
    
    // 重置六面图缩略图
    cubeThumbs.forEach(thumb => {
        const placeholder = thumb.querySelector('.cube-thumb-placeholder');
        const preview = thumb.querySelector('.cube-thumb-preview');
        if (placeholder) placeholder.style.display = 'block';
        if (preview) {
            preview.style.display = 'none';
            preview.src = '';
        }
        thumb.classList.remove('loaded');
    });
    
    // 重置 cubeImages
    cubeImages = { px: null, nx: null, py: null, ny: null, pz: null, nz: null };
    cubeImageSrcs = { px: null, nx: null, py: null, ny: null, pz: null, nz: null };
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            currentPanoImage = img;
            loadTexture(img);
            updatePanoThumbnail(e.target.result, img.width, img.height, file.name);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function updatePanoThumbnail(src, width, height, filename) {
    const previewDiv = document.getElementById('pano-preview');
    const thumbImg = document.getElementById('pano-thumb');
    const infoDiv = document.getElementById('pano-info');
    const uploadArea = document.getElementById('panoUploadArea');
    
    thumbImg.src = src;
    infoDiv.textContent = `${filename} (${width}×${height})`;
    previewDiv.style.display = 'block';
    uploadArea.style.display = 'none';
}

function handleCubeUpload(event) {
    const file = event.target.files[0];
    const face = event.target.dataset.face;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            cubeImages[face] = img;
            cubeImageSrcs[face] = e.target.result;
            updateCubeThumbnail(face, e.target.result);
            checkCubeReady();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function updateCubeThumbnail(face, src) {
    const thumb = document.querySelector(`.cube-thumb[data-face="${face}"]`);
    if (!thumb) return;
    
    const placeholder = thumb.querySelector('.cube-thumb-placeholder');
    const preview = thumb.querySelector('.cube-thumb-preview');
    
    if (src) {
        placeholder.style.display = 'none';
        preview.src = src;
        preview.style.display = 'block';
        thumb.classList.add('loaded');
    } else {
        placeholder.style.display = 'block';
        preview.src = '';
        preview.style.display = 'none';
        thumb.classList.remove('loaded');
    }
}

// 拖拽相关函数
function handleDragStart(e) {
    const face = this.dataset.face;
    // 只有已加载图片的才能拖拽
    if (!cubeImages[face]) {
        e.preventDefault();
        return;
    }
    
    dragSourceFace = face;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', face);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    // 移除所有 drag-over 状态
    cubeThumbs.forEach(thumb => thumb.classList.remove('drag-over'));
    dragSourceFace = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const targetFace = this.dataset.face;
    // 不能拖到自己身上
    if (targetFace !== dragSourceFace) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    this.classList.remove('drag-over');
    
    const sourceFace = e.dataTransfer.getData('text/plain');
    const targetFace = this.dataset.face;
    
    if (sourceFace === targetFace) return;
    
    // 交换图片数据
    swapCubeFaces(sourceFace, targetFace);
}

function swapCubeFaces(face1, face2) {
    // 交换 cubeImages
    const tempImg = cubeImages[face1];
    cubeImages[face1] = cubeImages[face2];
    cubeImages[face2] = tempImg;
    
    // 交换 cubeImageSrcs
    const tempSrc = cubeImageSrcs[face1];
    cubeImageSrcs[face1] = cubeImageSrcs[face2];
    cubeImageSrcs[face2] = tempSrc;
    
    // 更新缩略图显示
    updateCubeThumbnail(face1, cubeImageSrcs[face1]);
    updateCubeThumbnail(face2, cubeImageSrcs[face2]);
    
    // 如果六面图都加载完成，实时更新预览
    const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    const ready = faces.every(f => cubeImages[f]);
    if (ready) {
        loadCubeTexture();
        statusDiv.textContent = `已交换 ${getFaceName(face1)} 和 ${getFaceName(face2)}`;
    }
}

function getFaceName(face) {
    const names = {
        px: 'Right',
        nx: 'Left', 
        py: 'Top',
        ny: 'Bottom',
        pz: 'Front',
        nz: 'Back'
    };
    return names[face] || face;
}

function handleBatchUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // 文件名匹配规则
    const facePatterns = {
        px: /(?:right|px|posx|pos_x|_r\.|_right\.)/i,
        nx: /(?:left|nx|negx|neg_x|_l\.|_left\.)/i,
        py: /(?:top|up|py|posy|pos_y|_u\.|_top\.|_up\.)/i,
        ny: /(?:bottom|down|ny|negy|neg_y|_d\.|_bottom\.|_down\.)/i,
        pz: /(?:front|pz|posz|pos_z|_f\.|_front\.)/i,
        nz: /(?:back|nz|negz|neg_z|_b\.|_back\.)/i
    };
    
    let matchedCount = 0;
    const matchedFaces = [];
    
    Array.from(files).forEach(file => {
        const filename = file.name.toLowerCase();
        
        for (const [face, pattern] of Object.entries(facePatterns)) {
            if (pattern.test(filename)) {
                matchedFaces.push({ face, file });
                matchedCount++;
                break;
            }
        }
    });
    
    // 按顺序处理匹配的文件
    matchedFaces.forEach(({ face, file }) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                cubeImages[face] = img;
                cubeImageSrcs[face] = e.target.result;
                updateCubeThumbnail(face, e.target.result);
                checkCubeReady();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
    
    if (matchedCount > 0) {
        statusDiv.textContent = `已自动匹配 ${matchedCount} 张图片`;
    } else {
        statusDiv.textContent = '未能自动匹配文件，请检查文件名包含: right/left/top/bottom/front/back';
    }
}

function checkCubeReady() {
    const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    const ready = faces.every(f => cubeImages[f]);
    
    if (ready) {
        loadCubeTexture();
    } else {
        const count = faces.filter(f => cubeImages[f]).length;
        statusDiv.textContent = `已加载 ${count}/6 张图片...`;
    }
}

function loadCubeTexture() {
    // 创建 6 个材质
    const materials = [];
    const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    
    faces.forEach(face => {
        const texture = new THREE.Texture(cubeImages[face]);
        texture.needsUpdate = true;
        materials.push(new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide }));
    });

    // 如果已有 Mesh，移除
    if (previewMesh) {
        scene.remove(previewMesh);
    }

    // 创建 Box
    const geometry = new THREE.BoxGeometry(500, 500, 500);
    // 注意：BoxGeometry 的面顺序是 +x, -x, +y, -y, +z, -z
    // 对应 px, nx, py, ny, pz, nz
    // 我们使用 BackSide，所以不需要 scale(-1, 1, 1)，但需要注意贴图方向
    // 通常 Cubemap 贴在内部时，左右可能需要镜像，或者 UV 需要调整
    // Three.js 的 BoxGeometry UV 默认适合外部观看。
    // 当使用 BackSide 时，从内部看，+X 面 (Right) 的纹理如果是正常的，那么它应该是被水平翻转的吗？
    // 让我们先按默认顺序贴上去，看看效果。
    // 修正：为了让内部观看正常，通常需要把 geometry.scale(-1, 1, 1) 
    // 并且使用 FrontSide (默认)。
    // 如果 scale(-1, 1, 1)，那么 +x 变成了 -x 位置，这会乱。
    // 更好的方式：保持 Box 不变，使用 BackSide。
    // 但是 BackSide 会导致纹理镜像。
    // 让我们使用 scale(-1, 1, 1) 且材质顺序调整？
    // 简单方案：Geometry scale(-1, 1, 1)。
    // 此时：
    // 原 +x 面 (Right) 到了 -x 位置 (Left)。这不对。
    // 
    // 正确做法：
    // 使用 BoxGeometry(500, 500, 500)。
    // 材质使用 BackSide。
    // 此时从内部看，所有图像是左右镜像的。
    // 所以我们需要在创建 Texture 时设置 texture.center = new THREE.Vector2(0.5, 0.5); texture.repeat.x = -1;
    
    materials.forEach(mat => {
        mat.map.center.set(0.5, 0.5);
        mat.map.repeat.x = -1;
    });

    previewMesh = new THREE.Mesh(geometry, materials);
    scene.add(previewMesh);

    exportPanoBtn.disabled = false;
    
    // 自动计算导出尺寸 (基于第一张图的宽度)
    autoExportSize = calculateOptimalSize(cubeImages.px.width);
    statusDiv.textContent = `六面图加载完成，导出尺寸: ${autoExportSize * 2}x${autoExportSize}`;
}

function loadTexture(image) {
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    
    // 如果已有球体，移除
    if (previewMesh) {
        scene.remove(previewMesh);
        previewMesh.geometry.dispose();
        if (Array.isArray(previewMesh.material)) {
            previewMesh.material.forEach(m => m.dispose());
        } else {
            previewMesh.material.dispose();
        }
    }
    
    // 创建球体 - 增加细分数以减少极点变形
    // widthSegments: 128, heightSegments: 64 提供更好的极点渲染质量
    const geometry = new THREE.SphereGeometry(500, 128, 64);
    // 翻转 X 轴，使纹理在内部正确显示
    geometry.scale(-1, 1, 1);
    
    // 使用各向异性过滤提升纹理质量
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    
    const material = new THREE.MeshBasicMaterial({ map: texture });
    previewMesh = new THREE.Mesh(geometry, material);
    scene.add(previewMesh);

    currentTexture = texture;
    
    // 自动计算最佳导出尺寸
    autoExportSize = calculateOptimalSize(image.width / 4);

    exportBtn.disabled = false;
    statusDiv.textContent = `图片加载完成 (${image.width}x${image.height})，导出尺寸: ${autoExportSize}x${autoExportSize}`;
}

function calculateOptimalSize(baseSize) {
    // 找最近的 2 的幂次方
    let optimalSize = Math.pow(2, Math.round(Math.log2(baseSize)));
    
    // 限制在 512 到 8192 之间
    optimalSize = Math.max(512, Math.min(8192, optimalSize));
    
    return optimalSize;
}

async function exportCubemap() {
    if (!currentTexture) return;

    const size = autoExportSize;
    statusDiv.textContent = `正在生成 ${size}x${size} 六面图...`;
    exportBtn.disabled = true;

    // 保存当前渲染器大小
    const originalPixelRatio = renderer.getPixelRatio();
    const originalWidth = container.clientWidth;
    const originalHeight = container.clientHeight;

    // 设置为导出尺寸，但不改变 canvas 的 CSS 样式大小，防止页面抖动
    renderer.setPixelRatio(1); // 导出时不需要设备像素比，直接按像素
    renderer.setSize(size, size, false);

    // 创建导出用的相机
    const exportCamera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
    exportCamera.position.set(0, 0, 0);

    // 定义 6 个面的参数
    // 命名习惯：px (pos-x), nx (neg-x), py, ny, pz, nz
    // 对应：Right, Left, Top, Bottom, Front, Back
    const views = [
        { name: 'right',  target: new THREE.Vector3(1, 0, 0),  up: new THREE.Vector3(0, 1, 0) },
        { name: 'left',   target: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
        { name: 'top',    target: new THREE.Vector3(0, 1, 0),  up: new THREE.Vector3(0, 0, -1) }, // Up 指向 Back
        { name: 'bottom', target: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },  // Up 指向 Front
        { name: 'front',  target: new THREE.Vector3(0, 0, 1),  up: new THREE.Vector3(0, 1, 0) },
        { name: 'back',   target: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) }
    ];

    const zip = new JSZip();
    const folder = zip.folder("cubemap");

    try {
        for (const view of views) {
            exportCamera.up.copy(view.up);
            exportCamera.lookAt(view.target);
            
            // 渲染
            renderer.render(scene, exportCamera);
            
            // 获取 Blob
            const blob = await new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png'));
            folder.file(`${view.name}.png`, blob);
        }

        statusDiv.textContent = "正在打包下载...";
        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, "cubemap.zip");
        statusDiv.textContent = "导出完成！";

    } catch (err) {
        console.error(err);
        statusDiv.textContent = "导出出错：" + err.message;
    } finally {
        // 恢复渲染器状态
        renderer.setPixelRatio(originalPixelRatio);
        renderer.setSize(originalWidth, originalHeight);
        
        // 恢复预览相机的渲染
        renderer.render(scene, camera);
        
        exportBtn.disabled = false;
    }
}

async function exportEquirectangular() {
    if (!previewMesh) return;

    const height = autoExportSize;
    const width = height * 2;
    
    statusDiv.textContent = `正在生成 ${width}x${height} 全景图...`;
    exportPanoBtn.disabled = true;

    // 创建离屏渲染目标
    const renderTarget = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat
    });

    // 创建一个用于渲染全景图的场景
    const panoScene = new THREE.Scene();
    const panoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // 创建 ShaderMaterial
    // 我们需要将当前的 Cubemap (previewMesh 的材质) 传递给 Shader
    // 但 previewMesh 是 6 个 MeshBasicMaterial，不是一个 CubeTexture。
    // 所以我们需要在 Shader 中根据方向手动采样 6 个纹理，或者先渲染成 CubeTexture。
    // 简单的做法：在 Shader 中根据方向判断采样哪个纹理。
    
    // 准备 6 个纹理 uniform
    const uniforms = {
        texPX: { value: previewMesh.material[0].map },
        texNX: { value: previewMesh.material[1].map },
        texPY: { value: previewMesh.material[2].map },
        texNY: { value: previewMesh.material[3].map },
        texPZ: { value: previewMesh.material[4].map },
        texNZ: { value: previewMesh.material[5].map }
    };

    const vertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const fragmentShader = `
        uniform sampler2D texPX;
        uniform sampler2D texNX;
        uniform sampler2D texPY;
        uniform sampler2D texNY;
        uniform sampler2D texPZ;
        uniform sampler2D texNZ;
        varying vec2 vUv;

        const float PI = 3.14159265359;

        void main() {
            // 将 UV 转换为经纬度
            // vUv.x: 0 -> 1 => -PI -> PI
            // vUv.y: 0 -> 1 => -PI/2 -> PI/2
            
            float longitude = (vUv.x - 0.5) * 2.0 * PI;
            float latitude = (vUv.y - 0.5) * PI;

            // 转换为方向向量
            // Three.js 坐标系: Y Up, -Z Forward
            // Center (0.5, 0.5) -> -Z
            
            vec3 dir;
            dir.y = sin(latitude);
            float c = cos(latitude);
            dir.x = -c * sin(longitude); // 修正方向
            dir.z = -c * cos(longitude);

            // 根据方向向量采样对应的面
            vec3 absDir = abs(dir);
            vec4 color;
            vec2 uv;

            // 判断最大分量
            if (absDir.x >= absDir.y && absDir.x >= absDir.z) {
                // X 轴主导
                if (dir.x > 0.0) {
                    // PX (Right)
                    // u = -z / x, v = -y / x (project to plane x=1)
                    // map to 0..1
                    uv.x = (dir.z / absDir.x + 1.0) * 0.5; // z goes back to front?
                    uv.x = 1.0 - uv.x; // Flip X
                    uv.y = (dir.y / absDir.x + 1.0) * 0.5;
                    color = texture2D(texPX, uv);
                } else {
                    // NX (Left)
                    uv.x = (dir.z / absDir.x + 1.0) * 0.5;
                    uv.y = (dir.y / absDir.x + 1.0) * 0.5;
                    color = texture2D(texNX, uv);
                }
            } else if (absDir.y >= absDir.x && absDir.y >= absDir.z) {
                // Y 轴主导
                if (dir.y > 0.0) {
                    // PY (Top)
                    uv.x = (dir.x / absDir.y + 1.0) * 0.5;
                    uv.y = (dir.z / absDir.y + 1.0) * 0.5;
                    uv.y = 1.0 - uv.y; // Flip Y
                    color = texture2D(texPY, uv);
                } else {
                    // NY (Bottom)
                    uv.x = (dir.x / absDir.y + 1.0) * 0.5;
                    uv.y = (dir.z / absDir.y + 1.0) * 0.5;
                    color = texture2D(texNY, uv);
                }
            } else {
                // Z 轴主导
                if (dir.z > 0.0) {
                    // PZ (Front? No, +Z is Back in Three.js default lookAt -Z)
                    // Wait, our cubemap naming:
                    // px, nx, py, ny, pz, nz
                    // Usually pz is Front in some conventions, but Back in OpenGL/Three.js view space if camera is at origin looking -Z.
                    // Let's assume standard Cubemap layout:
                    // +Z is Back. -Z is Front.
                    
                    // PZ (Back)
                    uv.x = (dir.x / absDir.z + 1.0) * 0.5;
                    uv.y = (dir.y / absDir.z + 1.0) * 0.5;
                    color = texture2D(texPZ, uv); // 这里的 PZ 对应我们加载的 Front 还是 Back?
                    // 我们加载时：
                    // px, nx, py, ny, pz, nz
                    // 对应 Right, Left, Top, Bottom, Front, Back
                    // 这里的 Front/Back 命名可能与轴向不一致，取决于用户上传。
                    // 假设用户上传的 Front 是 -Z, Back 是 +Z.
                    // 那么 PZ 对应 Back (+Z).
                    // NZ 对应 Front (-Z).
                    
                    // 修正 UV 映射以匹配 Three.js 的 CubeRefractionMapping
                    // +Z
                    uv.x = (dir.x / absDir.z + 1.0) * 0.5;
                    uv.y = (dir.y / absDir.z + 1.0) * 0.5;
                    color = texture2D(texPZ, uv); // Back
                } else {
                    // NZ (Front)
                    uv.x = (dir.x / absDir.z + 1.0) * 0.5;
                    uv.x = 1.0 - uv.x; // Flip X
                    uv.y = (dir.y / absDir.z + 1.0) * 0.5;
                    color = texture2D(texNZ, uv); // Front
                }
            }
            
            gl_FragColor = color;
        }
    `;

    // 修正 Shader 中的 UV 映射逻辑
    // 上面的逻辑是手写的，可能容易出错。
    // 更好的方式是利用 Three.js 内置的 equirectangular_to_cube 的逆过程，但没有现成的 Shader。
    // 我们可以简化：
    // 既然我们已经有了 previewMesh (Box)，我们可以把相机放在 Box 中心，然后渲染到一个 Equirectangular 的 Mesh 上？
    // 不行，渲染到 Equirectangular 需要非线性投影。
    // 
    // 重新思考 Shader 采样逻辑：
    // 我们在 JS 中加载时：
    // px (Right), nx (Left), py (Top), ny (Bottom), pz (Front), nz (Back)
    // 注意：Three.js BoxGeometry 默认 UV 映射：
    // +x (Right): x goes -z to +z (left to right on face) -> u 0..1
    // -x (Left): x goes +z to -z
    // ...
    // 
    // 让我们使用更稳健的方法：
    // 1. 创建一个 CubeCamera 在 (0,0,0)。
    // 2. 渲染 previewMesh 到 CubeRenderTarget (生成真正的 CubeTexture)。
    // 3. 使用 PMREMGenerator 或者直接用 Shader 从 CubeTexture 采样生成 Equirectangular。
    // 
    // 方案 B (更简单):
    // 既然我们已经有 6 张图，我们可以直接在 Shader 中采样。
    // 关键是 UV 坐标对齐。
    // 
    // 假设用户上传的图片是标准的 Cubemap 面。
    // Right (+X), Left (-X), Top (+Y), Bottom (-Y), Front (-Z), Back (+Z)
    // (注意：通常 Front 是 -Z)
    // 
    // Shader 逻辑修正：
    // dir 向量归一化后。
    // if |x| max:
    //   if x > 0 (+X Right): u = -z/|x|, v = -y/|x| (center 0,0) -> map to 0..1
    //   ...
    // 
    // 鉴于手动写 Shader 容易出错，我们可以尝试用 Three.js 的 `WebGLCubeRenderTarget` + `fromEquirectangularTexture` 的逆操作。
    // 但 Three.js 没有直接的 `toEquirectangular`。
    // 
    // 让我们坚持 Shader 方法，并微调。
    // 
    // 修正 Shader 代码：
    // 我们需要处理 texture 的翻转问题。
    // 我们在 loadCubeTexture 时设置了 repeat.x = -1。这会影响 Shader 采样吗？
    // Shader 采样的是原始 Texture 数据，repeat 属性是在 Mesh 渲染时生效的 (UV transform)。
    // 在 Shader 中直接 texture2D(tex, uv) 是采样原始数据。
    // 所以我们需要在 Shader 中手动处理翻转。
    
    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: `
            uniform sampler2D texPX; // Right
            uniform sampler2D texNX; // Left
            uniform sampler2D texPY; // Top
            uniform sampler2D texNY; // Bottom
            uniform sampler2D texPZ; // Front (User Input PZ) -> Let's assume this is +Z (Back) or -Z (Front)?
            // User Input:
            // px: Right, nx: Left, py: Top, ny: Bottom, pz: Front, nz: Back
            // Standard OpenGL/Three:
            // +X: Right, -X: Left, +Y: Top, -Y: Bottom, +Z: Back, -Z: Front
            // So User PZ (Front) -> -Z
            // User NZ (Back) -> +Z
            
            uniform sampler2D texNZ; 
            
            varying vec2 vUv;
            const float PI = 3.14159265359;

            void main() {
                float longitude = (vUv.x - 0.5) * 2.0 * PI;
                float latitude = (vUv.y - 0.5) * PI;

                vec3 dir;
                dir.y = sin(latitude);
                float c = cos(latitude);
                dir.x = -c * sin(longitude);
                dir.z = -c * cos(longitude);
                
                // dir is the direction from center to sphere surface
                
                vec3 absDir = abs(dir);
                vec2 uv;
                vec4 color;
                
                // Convert direction to cubemap UV
                // Standard Cubemap UV mapping
                
                if (absDir.x >= absDir.y && absDir.x >= absDir.z) {
                    // X axis
                    if (dir.x > 0.0) {
                        // +X (Right)
                        uv.x = -dir.z / absDir.x;
                        uv.y = dir.y / absDir.x;
                        uv = uv * 0.5 + 0.5;
                        // Mirror X because we are looking from inside? 
                        // No, standard cubemap texture is viewed from center.
                        // If we look at Right face, left side of image is +Z, right side is -Z.
                        // dir.z goes negative -> positive?
                        // Let's just try standard mapping.
                        uv.x = 1.0 - uv.x; 
                        color = texture2D(texPX, uv);
                    } else {
                        // -X (Left)
                        uv.x = dir.z / absDir.x;
                        uv.y = dir.y / absDir.x;
                        uv = uv * 0.5 + 0.5;
                        uv.x = 1.0 - uv.x;
                        color = texture2D(texNX, uv);
                    }
                } else if (absDir.y >= absDir.x && absDir.y >= absDir.z) {
                    // Y axis
                    if (dir.y > 0.0) {
                        // +Y (Top)
                        uv.x = dir.x / absDir.y;
                        uv.y = -dir.z / absDir.y; // Top usually has -Z as up in UV space?
                        uv = uv * 0.5 + 0.5;
                        color = texture2D(texPY, uv);
                    } else {
                        // -Y (Bottom)
                        uv.x = dir.x / absDir.y;
                        uv.y = dir.z / absDir.y;
                        uv = uv * 0.5 + 0.5;
                        color = texture2D(texNY, uv);
                    }
                } else {
                    // Z axis
                    if (dir.z > 0.0) {
                        // +Z (Back) -> User NZ
                        uv.x = dir.x / absDir.z;
                        uv.y = dir.y / absDir.z;
                        uv = uv * 0.5 + 0.5;
                        uv.x = 1.0 - uv.x;
                        color = texture2D(texNZ, uv);
                    } else {
                        // -Z (Front) -> User PZ
                        uv.x = -dir.x / absDir.z;
                        uv.y = dir.y / absDir.z;
                        uv = uv * 0.5 + 0.5;
                        uv.x = 1.0 - uv.x;
                        color = texture2D(texPZ, uv);
                    }
                }
                
                gl_FragColor = color;
            }
        `
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    panoScene.add(plane);

    // 渲染
    renderer.setRenderTarget(renderTarget);
    renderer.render(panoScene, panoCamera);
    renderer.setRenderTarget(null);

    // 导出
    // 读取 RenderTarget 像素
    const buffer = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);

    // 创建 Canvas 转换
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    
    // WebGL 读取的像素是上下颠倒的吗？通常是的。
    // 我们需要翻转 Y
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4;
            const dstIdx = ((height - 1 - y) * width + x) * 4;
            imageData.data[dstIdx] = buffer[srcIdx];
            imageData.data[dstIdx + 1] = buffer[srcIdx + 1];
            imageData.data[dstIdx + 2] = buffer[srcIdx + 2];
            imageData.data[dstIdx + 3] = buffer[srcIdx + 3];
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    canvas.toBlob(function(blob) {
        saveAs(blob, "panorama_2_1.png");
        statusDiv.textContent = "导出完成！";
        exportPanoBtn.disabled = false;
        
        // 清理
        renderTarget.dispose();
        material.dispose();
        plane.geometry.dispose();
    }, 'image/png');
}
