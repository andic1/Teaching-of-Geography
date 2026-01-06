# HoloEarth 全息地球交互系统设计报告（节选）

> 说明：本报告内容围绕当前 HoloEarth 项目撰写，结构与课程要求中的第 2～8 节对应，可直接拷贝到 Word 并按“宋体小四、两端对齐、固定行距 22 磅”排版。

---

## 2. 摘要与关键词

**摘要：**  
本项目实现了一个基于 Web 的全息地球交互系统 **HoloEarth**。系统采用 React + Vite 作为前端开发框架，利用 Three.js 渲染高精度 3D 地球模型，并结合 MediaPipe 手部关键点识别与外部大模型 API（OpenAI 兼容接口），构建了一个集三维可视化、智能问答与自然人机交互于一体的实验性应用。用户可以通过鼠标拖拽与滚轮操作，或通过单手手势来旋转与缩放地球；在地球表面点击任意经纬度时，系统会调用大模型，对该区域的地理位置、气候特征、地貌环境等进行简要科普分析，并以全息 HUD 面板的形式展示结果。项目重点解决了三维空间坐标与真实经纬度之间的映射问题、将手势特征稳定映射为视角控制指令的问题，以及在前端环境下与大模型服务进行安全、鲁棒交互的问题。实验结果表明，系统能够在普通浏览器中流畅运行，整体交互自然、反馈及时，基本达成了预期的功能与体验目标。

**关键词：**  
React；Vite；Three.js；手势识别；MediaPipe；大语言模型；数据可视化

---

## 3. 项目概述

### 3.1 项目背景与功能需求

**项目背景：**  
随着 WebGL 和大语言模型的发展，仅通过浏览器即可实现复杂的三维可视化与智能问答交互。传统地图产品更关注导航与基础地理信息，而面向学习与科普的“沉浸式地球界面”相对较少。本项目希望模拟科幻作品中的“全息行星控制台”，将三维地球展示、自然语言科普和非接触式手势交互结合起来，为用户提供一种新颖的地理知识探索方式。

**核心功能需求：**

- **三维地球展示与交互**：
  - 使用 Three.js 构建高精度地球球体，加载法线贴图、镜面贴图和国界线 GeoJSON 数据；
  - 支持鼠标拖拽旋转、滚轮缩放和国界高亮显示；
  - 根据点击位置计算经纬度，并在界面上展示。

- **AI 区域环境分析**：
  - 前端调用外部大模型 API（硅基流动 Qwen2-7B Instruct，OpenAI 接口协议）；
  - 根据点击的经纬度生成简要的地理、气候、地貌等科普说明；
  - 将结果封装为 `GeoFact` 对象并在左下角信息面板中展示。

- **单手手势控制**：
  - 使用 MediaPipe Tasks Vision 的 HandLandmarker 模型，实时检测手部 21 个关键点；
  - 将手掌移动速度映射为地球旋转指令（左右挥动控制水平旋转、上下微调俯仰）；
  - 将手掌张开程度变化映射为相机缩放指令（张开放大、握紧缩小）。

- **科幻风格 UI 与启动流程**：
  - 设计全屏启动界面，展示项目标题、版本信息与功能卡片；
  - 提供使用指引弹窗，说明鼠标和手势操作方式以及 AI 分析流程。

**非功能性需求分析：**

- **性能**：首屏初始化 Three.js 场景与纹理加载应在可接受时间内完成，保持 40–60 FPS 的渲染帧率；
- **兼容性**：优先兼容 Chromium 内核浏览器（Chrome、Edge），在开启摄像头权限与 WebGL 支持的前提下可正常运行；
- **体验与可用性**：手势控制需要具备一定的稳定性与容错能力，避免轻微抖动导致地球剧烈晃动；
- **代码质量**：前端 TypeScript 类型完整、核心模块职责清晰，便于后续扩展或替换大模型服务。

### 3.2 技术选型与架构设计

**技术栈说明：**

- **前端框架**：React 19 + Vite
  - React 负责组件化 UI 与状态管理，便于拆分启动界面、地球组件、手势面板和 HUD 面板；
  - Vite 提供快速开发与构建能力，适合现代前端实验项目。

- **三维渲染**：Three.js
  - 提供 WebGL 抽象层，简化相机、灯光、纹理与几何体管理；
  - 通过 `SphereGeometry` 与法线贴图实现较高质量的地球表面效果。

- **手势识别**：MediaPipe Tasks Vision
  - 使用 `HandLandmarker` 模型在浏览器中实时检测手部关键点；
  - 通过自定义 `mediaPipeHelper.ts` 封装模型加载与推理逻辑。

- **大模型调用**：OpenAI 兼容接口（硅基流动 Qwen2-7B-Instruct）
  - 前端使用 `fetch` 调用 `/chat/completions` 接口；
  - 通过环境变量 `VITE_QWEN_BASE_URL`、`VITE_QWEN_API_KEY`、`VITE_QWEN_MODEL` 配置。

**系统架构思路：**

整体结构可概括为“前端单页 + 三个核心可视组件 + 一个服务层”：

- **App 根组件**：负责应用状态统筹（系统状态、当前情报、Hover 信息、手势控制）、启动界面与使用指引弹窗。
- **HoloEarth 组件**：封装 Three.js 场景，负责地球渲染、国界绘制、射线拾取与鼠标交互；
- **HandPanel 组件**：负责摄像头视频采集、MediaPipe 推理与手势到 `HandControl` 的映射；
- **HoloUI 组件**：负责左下角 HUD 信息面板与界面文字反馈；
- **geminiService（现为大模型服务）**：对接外部 LLM，将经纬度转换为自然语言描述。

**目录结构说明：**

- `src/App.tsx`：入口组件，管理全局状态与布局；
- `src/components/HoloEarth.tsx`：三维地球与 Three.js 逻辑；
- `src/components/HandPanel.tsx`：手势识别与控制面板；
- `src/components/HoloUI.tsx`：HUD 信息展示与状态指示；
- `src/services/geminiService.ts`：封装对硅基流动 Qwen 模型的调用；
- `src/utils/mediaPipeHelper.ts`：封装 HandLandmarker 的加载与初始化；
- `public/textures/`：地球纹理资源；
- `public/data/countries.geojson`：世界国界 GeoJSON 数据。

---

## 5. 核心功能模块详细设计与实现

本节选择与本项目高度相关的三个功能模块，结合关键代码片段进行说明。

### 模块一：三维地球渲染与经纬度映射

**设计思路：**  
地球渲染模块需要解决两个问题：一是如何在 Three.js 中构建视觉效果良好的地球场景；二是如何在用户点击地球表面时，将三维空间坐标准确反推出经纬度。为此项目采用了“固定几何体 + 坐标变换函数”的方案：

1. 使用 `SphereGeometry` 创建单位球体并旋转固定角度，使纹理经线与 Three.js 坐标系对齐；
2. 在绘制国界和高亮轮廓时，统一使用 `latLngToVector3` 函数，将 GeoJSON 中的经纬度映射到球面上，确保地理边界与纹理对齐；
3. 在鼠标点击或手势控制驱动旋转后，通过 `worldToLocal` 和反三角函数逆变换，将点坐标还原为经纬度。

**关键代码与解释：**

```ts
// 经纬度 -> 球面坐标
const latLngToVector3 = (lat: number, lng: number, radius: number) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 90) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
};
```

该函数用于将 GeoJSON 的经纬度映射到半径为 `radius` 的球体表面。通过固定 `+90` 度偏移以及在几何体上预旋转 `-Math.PI / 2`，保证经线和纹理一致。反向转换时使用 `asin` 和 `atan2` 计算纬度与经度，保证点击点与国界高亮逻辑一致。

```ts
// 反向：球面坐标 -> 经纬度
const calculateCoords = (point: THREE.Vector3) => {
  const localPoint = earthGroupRef.current.worldToLocal(point.clone()).normalize();
  const lat = Math.asin(localPoint.y) * (180 / Math.PI);
  let lng = (Math.atan2(localPoint.z, -localPoint.x) * (180 / Math.PI)) - 90;
  if (lng < -180) lng += 360;
  if (lng > 180) lng -= 360;
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
};
```

**难点与解决方案：**

- 难点在于 Three.js 局部坐标、纹理 UV 与真实经纬度之间的角度偏移容易出错，导致国界线与纹理错位。通过固定几何体预旋转、在绘制国界与计算经纬度时统一使用相同转换公式，最终实现了视觉与数据的一致性。

### 模块二：单手手势识别与视角控制

**设计思路：**  
手势模块需要在浏览器端实时获取摄像头图像，并将 MediaPipe 检测到的 21 个手部关键点转换为简洁的控制信号。本项目定义了一个轻量级的 `HandControl` 接口：

```ts
export interface HandControl {
  rotX?: number; // 上下旋转量
  rotY?: number; // 左右旋转量
  zoomDelta?: number; // 缩放增量
}
```

整体数据流为：

1. `HandPanel` 组件通过 `navigator.mediaDevices.getUserMedia` 获取视频流；
2. 使用 `HandLandmarker.detectForVideo` 识别关键点坐标；
3. 计算手掌中心位置与张开程度，将其差分量映射为旋转和缩放控制量；
4. 通过 `onControlChange` 回调将 `HandControl` 传回 `App`，再下发给 `HoloEarth`；
5. `HoloEarth` 在渲染循环中读取最新的 `HandControl`，叠加到地球旋转和相机距离上。

**关键代码与解释：**

```ts
// HandPanel 中：根据关键点计算控制量
const palm = getPalmCenter(landmarks);
const openness = getOpenness(landmarks);

let control: HandControl | null = null;
...
const dx = palm.x - lastPalmPos.current.x;
const dy = palm.y - lastPalmPos.current.y;
const dist = Math.hypot(dx, dy);

const moveThreshold = 0.003;
if (dist > moveThreshold) {
  const sensitivity = 4.0;
  control = { rotX: dy * sensitivity, rotY: dx * sensitivity };
  info = `挥动 ${dx > 0 ? '→' : '←'}`;
} else {
  const dOpen = openness - lastOpenness.current;
  const zoomThreshold = 0.005;
  if (Math.abs(dOpen) > zoomThreshold) {
    control = { zoomDelta: -dOpen * 15 };
    info = dOpen > 0 ? '🔍 放大' : '🔍 缩小';
  }
}

onControlChange?.(control);
```

在 `HoloEarth` 中，每一帧从 `handControlRef` 读取控制量：

```ts
const ctrl = handControlRef.current;
if (ctrl) {
  const rotFactor = 0.08;
  earthGroupRef.current.rotation.y += (ctrl.rotY ?? 0) * rotFactor;
  earthGroupRef.current.rotation.x += (ctrl.rotX ?? 0) * rotFactor;

  if (cameraRef.current && typeof ctrl.zoomDelta === 'number') {
    let newZ = cameraRef.current.position.z + ctrl.zoomDelta;
    newZ = THREE.MathUtils.clamp(newZ, 1.1, 5.0);
    cameraRef.current.position.z = newZ;
  }
}
```

**难点与解决方案：**

- **抖动与误触发**：原始关键点会有轻微抖动，直接映射会导致地球晃动。通过设置 `moveThreshold` 和 `zoomThreshold`，只有当移动或张合超过阈值时才触发控制；
- **方向与灵敏度**：需要在“跟手”和“稳定”之间平衡。通过引入 `sensitivity` 与 `rotFactor` 双重系数，反复调试后得到较为舒适的旋转幅度。

### 模块三：大模型区域分析服务

**设计思路：**  
为了使项目不绑定单一厂商，服务层采用了基于 OpenAI `/chat/completions` 协议的实现方式，只要模型服务兼容该协议即可切换。当前使用的是硅基流动平台提供的 `Qwen/Qwen2-7B-Instruct` 模型。服务函数 `getPlanetaryIntel` 接收经纬度，构造中文提示词，通过 `fetch` 调用接口，并将返回的文本封装为 `GeoFact`：

```ts
const API_BASE = import.meta.env.VITE_QWEN_BASE_URL || "https://api.siliconflow.cn/v1";
const API_KEY = import.meta.env.VITE_QWEN_API_KEY;
const MODEL = import.meta.env.VITE_QWEN_MODEL || "Qwen/Qwen2-7B-Instruct";

export const getPlanetaryIntel = async (lat: number, lng: number): Promise<GeoFact> => {
  const url = `${API_BASE.replace(/\/$/, "")}/chat/completions`;
  const userPrompt = `分析目标坐标: 纬度 ${lat.toFixed(2)}, 经度 ${lng.toFixed(2)}。...`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const json: any = await res.json();
  const rawContent = json?.choices?.[0]?.message?.content;
  const contentText = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

  return {
    title: "行星情报",
    content: contentText,
    coordinates: { lat, lng },
  };
};
```

**难点与解决方案：**

- 接口返回的 `content` 可能是字符串、对象或分段数组，早期版本直接 `JSON.parse` 导致 React 渲染崩溃。最终采用“统一转字符串”的策略，再将其作为纯文本展示，彻底避免了 `[object Object]` 与运行时错误。

---

## 6. 测试、构建与部署

### 6.1 测试策略

本项目主要通过以下方式进行功能验证：

- **组件级手动测试**：
  - 针对 `HoloEarth`，测试鼠标拖拽、滚轮缩放和点击经纬度是否正确展示；
  - 针对 `HandPanel`，测试不同光照、距离下手势识别的稳定性；
  - 针对服务层，验证在网络异常或 API Key 缺失时是否给出友好的错误提示。

- **集成场景测试**：
  - 从启动页进入系统，依次测试：允许摄像头 → 挥手旋转地球 → 张合缩放 → 点击地点触发 AI 分析 → 查看左下信息面板更新；
  - 在低网速环境下模拟大模型响应延迟，检查加载状态与 UI 反馈是否合理。

（如需课程中严格的单元测试 / E2E 测试，可在后续使用 Vitest + Playwright 补充。）

### 6.2 项目构建与优化

- 使用 Vite 进行生产环境打包，默认开启 Tree Shaking 与代码分割；
- 静态资源（地球纹理、GeoJSON）放置在 `public/` 目录，由构建产物直接引用，减小运行时请求复杂度；
- 在 Three.js 中限制渲染器像素比 `setPixelRatio(Math.min(window.devicePixelRatio, 2))`，兼顾清晰度与性能；
- 使用 `ResizeObserver` 延迟 Three.js 场景初始化，避免挂载元素尺寸为 0 导致的黑屏或多次重建。

### 6.3 部署方案

项目可以部署在支持静态站点的任意平台上，例如 GitHub Pages、Vercel、或国内托管平台。当前部署方案示例：

- **构建命令**：`npm install` 后执行 `npm run build`，生成 `dist/` 目录；
- **静态部署**：将 `dist/` 作为站点根目录进行托管；
- **环境变量配置**：在平台后台配置
  - `VITE_QWEN_BASE_URL=https://api.siliconflow.cn/v1`
  - `VITE_QWEN_API_KEY=...`（个人密钥）
  - `VITE_QWEN_MODEL=Qwen/Qwen2-7B-Instruct`

在部署完成后，通过平台分配的域名访问，例如：`https://your-domain.example/holoearth`，即可在浏览器中体验全息地球界面与手势控制。

---

## 7. 项目总结与展望

### 7.1 成果总结

总体来看，本项目基本实现了预期目标：

- 完成了一个具有科幻感的全屏 3D 地球界面，支持顺畅的旋转与缩放；
- 实现了基于 MediaPipe 的单手手势识别，并成功将手势与地球视角控制关联；
- 对接了外部大模型服务，能够根据点击经纬度生成区域科普说明；
- 提供了启动界面与使用指引弹窗，完整呈现从“进入系统”到“交互探索”的流程。

### 7.2 心得体会

在本项目中，主要的收获体现在以下几个方面：

- 在技术上，深入理解了 Three.js 中坐标系、相机和纹理映射的关系，掌握了从经纬度到球面坐标的转换方法；
- 在人机交互方面，体会到手势识别的噪声与抖动问题，需要通过阈值与缓动等手段进行平滑处理；
- 在工程实践上，尝试将前端应用与大模型服务解耦，通过环境变量与通用接口协议，保留了后续更换模型平台的灵活性。

### 7.3 不足与改进方向

- 当前手势识别只支持单手，且主要控制旋转与缩放，尚未扩展到更多手势命令（如抓取标记点、切换信息层等）；
- 大模型调用完全在前端完成，API Key 存在泄露风险，适合作为课程与 Demo 使用，但不适合作为正式线上产品；
- 未对移动端浏览器进行系统适配，触屏交互与摄像头权限在部分机型上可能存在兼容性问题。

### 7.4 未来展望

如果有更充裕的时间与算力支持，可以从以下几个方向继续扩展：

- 增加多种信息图层，如人口密度、温度等气候数据的可视化叠加；
- 引入双手或更多手势语义，比如通过捏合手势放置标记、通过手势菜单切换模式；
- 在后端增加代理服务，将大模型调用从前端迁移到服务器，支持用户登录与访问配额控制；
- 结合 VR/AR 设备，将全息地球界面扩展到沉浸式环境中。

---

## 8. 参考文献

1. Three.js 官方文档：https://threejs.org/docs/
2. MediaPipe Tasks Vision – Hand Landmarker：https://developers.google.com/mediapipe
3. React 官方文档：https://react.dev/
4. Vite 官方文档：https://vitejs.dev/
5. 硅基流动 API 文档（Chat Completions）：https://api.siliconflow.cn
6. 世界国界 GeoJSON 数据集（Natural Earth）：https://www.naturalearthdata.com/
