# 基于 React + Three.js + 大模型的全息地球 Web 项目实战

> 一篇偏工程向的实践记录，重点放在：这个项目在 **架构拆分、坐标与手势算法、与大模型服务对接以及部署** 过程中遇到的问题和取舍，而不是效果展示。

---

## 目录

- [一、项目概览](#一项目概览)
- [二、技术栈与项目结构](#二技术栈与项目结构)
- [三、系统架构设计](#三系统架构设计)
  - [3.1 前端整体架构](#31-前端整体架构)
  - [3.2 手势控制数据流](#32-手势控制数据流)
- [四、关键模块实现思路](#四关键模块实现思路)
  - [4.1 HoloEarth：Threejs-3D-地球](#41-holoearththreejs-3d-地球)
  - [4.2 HandPanelmediapipe-手势识别](#42-handpanelmediapipe-手势识别)
  - [4.3 geminiserviceqwen-地理分析服务](#43-geminiserviceqwen-地理分析服务)
- [五、开发与调试流程](#五开发与调试流程)
- [六、适合复用与扩展的点](#六适合复用与扩展的点)
- [七、总结](#七总结)

## 一、项目概览

这个项目要解决的实际问题是：

> 在只依赖前端静态资源的前提下，做一套可以 **实时手势控制 3D 地球，并按经纬度调用大模型做地理解读** 的 Web 应用。

因为没有后端，所有逻辑（Three.js 渲染、MediaPipe 手势识别、HTTP 调用大模型）都堆在浏览器里，这带来了一些典型的工程问题：

- 如何在 React 的声明式 world 里，和 Three.js / MediaPipe 这种命令式、长生命周期对象和平相处；
- 手势本身噪声很大，如何在不引入复杂 ML 推理的前提下，做出 **可控、不眩晕** 的旋转 / 缩放体验；
- 不同大模型服务商都号称 "OpenAI 兼容"，但 `message.content` 结构各不相同，前端怎么写得足够健壮；
- 资源全部改为本地化之后，如何保证可以一键部署到 GitHub Pages、阿里云等静态环境里正常运行。

后面的章节更多是围绕这些点展开，而不是单纯做项目展示。

---

## 二、技术栈与项目结构

### 2.1 技术栈选择（附一点取舍）

- **框架与构建**：
  - `React 19`：主要是用函数组件 + hooks 管理状态和生命周期。Three.js / MediaPipe 这种自己有主循环的库如果和“裸 DOM”混用，状态会比较散；交给 React 至少能做到数据流清晰。
  - `Vite`：天然支持 ESM，对 Three.js 这类模块友好；重型场景下冷启动和热更新时间都比 webpack 系列舒服，调试密集循环时尤为重要。
  - `TypeScript`：价值在于把 `GeoFact`、`HandControl`、`HoverData` 等跨组件结构抽象成显式类型，避免用 "约定字段名" 的方式在组件之间传数据。

- **3D 渲染**：
  - `Three.js`：在“想重点放在交互和集成，而不是渲染管线细节”的前提下，Three.js 几乎是默认选择。
  - **本地化纹理和 GeoJSON 数据**：一开始偷懒直接引用 GitHub Raw 的纹理，在某些云环境下被防火墙 / 代理卡住，后面全部改为打进 `public`，构建产物不再依赖外部静态资源。

- **手势识别**：
  - `@mediapipe/tasks-vision` HandLandmarker：浏览器端跑，延迟和易用性都在可接受区间，比自己训模型现实；同时避免了 WebAssembly / WebGPU 这类额外复杂度。
  - 没有使用官方给的“比心 / OK 手势分类”，而是直接对关键点做几何计算，得到一个连续的 `rotX / rotY / zoomDelta`，更适合驱动 3D 场景。

- **大模型服务**：
  - 选 **Qwen/Qwen2-7B-Instruct** 主要是看中中文效果和成本，接口是 OpenAI 兼容的 `/chat/completions`。
  - 做了一层“防御式封装”：不信任返回结构一定是字符串，统一把 `message.content` 的各种形态（字符串 / 数组 / 对象）压成一个字符串再给 UI，用简单换取稳健。

### 2.2 目录结构概览

> 以下只列和本篇文章相关的关键文件，实际项目中还有样式等其他资源。

```bash
HoloEarth/
├─ components/
│  ├─ HoloEarth.tsx        # Three.js 3D 地球渲染与交互
│  ├─ HandPanel.tsx        # 摄像头 + 手势识别 + 手势控制量计算
│  ├─ HoloUI.tsx           # 全息风格 HUD / 信息面板
├─ services/
│  └─ geminiService.ts     # 已重写为 Qwen 模型的 AI 地理分析服务
├─ utils/
│  └─ mediaPipeHelper.ts   # MediaPipe HandLandmarker 初始化封装
├─ public/
│  ├─ textures/            # 地球纹理
│  ├─ data/                # 边界 GeoJSON
│  └─ favicon.svg          # 自定义图标
├─ App.tsx                 # 全局状态与组件编排
├─ types.ts                # 统一的 TypeScript 类型定义
├─ HoloEarth-report.md     # 项目报告（课堂作业用）
└─ HoloEarth-csdn-blog.md  # 本文对应的 CSDN 博客草稿
```

---

## 三、系统架构设计

### 3.1 前端整体架构

这里没有引入 Redux / Zustand 等专门的状态管理库，而是让 `App.tsx` 做一个“轻量 Store”。主要考虑：

- 状态种类有限：app 状态、当前 fact、hover 信息、手势控制量等等；
- 消费这些状态的组件也就 HoloEarth / HoloUI / HandPanel 几个。

因此数据流可以简化为：

> 用户输入（鼠标 / 摄像头） → React 组件 → 业务 Actions → State（React 状态） → 组件重新渲染

后续如果要演进成多页面、多场景应用，再把这一层替换成 Zustand/Redux 也不难。

- **用户交互层**
  - 鼠标：拖拽旋转地球、滚轮缩放、点击选点；
  - 摄像头：MediaPipe 识别手掌位置和张开程度，转换为旋转/缩放信号。

- **组件层（View + Controller）**
  - `App.tsx`：
    - 管理全局状态：当前分析事实 `currentFact`、手势控制 `handControl`、hover 信息等；
    - 负责把状态分发给 `HoloEarth` 和 `HoloUI`；
    - 响应 `HoloEarth` 的选点回调，调用大模型服务。
  - `HoloEarth.tsx`：
    - Three.js 场景、相机、光照、纹理加载；
    - 鼠标交互：拖拽、缩放、拾取坐标；
    - 在渲染循环中应用 `handControl` 进行额外旋转和缩放。
  - `HandPanel.tsx`：
    - 访问摄像头，调用 MediaPipe HandLandmarker；
    - 把识别到的手掌运动和张合程度转换为 `HandControl`；
    - 实时通过 `onControlChange` 回调把控制量传给 `App`。
  - `HoloUI.tsx`：
    - HUD 风格 UI：状态指示、坐标显示、AI 文本面板、帮助说明等。

- **业务 Actions / Service 层**
  - `getPlanetaryIntel(lat, lng)`：
    - 根据点击坐标构建 prompt；
    - 调用 Qwen `/chat/completions` 接口；
    - 对返回内容做容错处理，统一为简单的中文说明文本。

- **State 层**
  - 统一由 `App.tsx` 通过 `useState` 管理：
    - `appState`：启动中 / 待机 / 分析中；
    - `controls`：是否正在拖拽、当前缩放等；
    - `currentFact`：当前区域的 AI 地理说明；
    - `hoverData`：当前 hover 国家/坐标信息；
    - `handControl`：来自 `HandPanel` 的手势控制量（`rotX`, `rotY`, `zoomDelta`）。

### 3.2 手势控制数据流

重点看一下「手势 → 地球旋转/缩放」这条链路：

1. 浏览器通过 `navigator.mediaDevices.getUserMedia` 打开摄像头；
2. Video 帧流经 MediaPipe HandLandmarker，输出 3D 手部关键点；
3. 在 `HandPanel.tsx` 中：
   - 计算手掌中心点移动速度（Δx, Δy）和方向；
   - 计算手指张开程度用于识别张手/握拳，映射为 `zoomDelta`；
   - 把结果封装为 `HandControl` 对象：
     ```ts
     interface HandControl {
       rotX: number;      // 绕 X 轴旋转增量
       rotY: number;      // 绕 Y 轴旋转增量
       zoomDelta: number; // 相机距离增量
     }
     ```
   - 通过 `onControlChange(handControl)` 抛给 `App`。
4. `App` 把当前 `handControl` 作为 props 传给 `HoloEarth`；
5. `HoloEarth` 的渲染循环中，每一帧读取 `handControlRef.current`，在基础旋转的基础上叠加增量，实现「边挥手边转动地球」。

这一套链路的好处是：

- 手势识别和 3D 渲染是解耦的，只通过简单的 `HandControl` 接口通讯；
- 未来想替换手势算法（比如用别的模型）时，只要改 `HandPanel` 内部实现即可。

---

## 四、关键模块实现思路

### 4.1 HoloEarth：Three.js 3D 地球

核心职责：

- 初始化 Three.js 场景、相机、渲染器；
- 加载本地纹理（地球表面、夜光、法线贴图等）和边界 GeoJSON 数据；
- 处理鼠标交互（拖拽旋转、滚轮缩放、点击拾取经纬度）；
- 根据 `handControl` 增加旋转与缩放；
- 把 hover 信息、点击选点等事件通过回调抛给上层。

实现要点（和踩过的坑）：

- **初始化时机 / ResizeObserver**：
  - 如果在 React 首次 render 时就初始化 Three.js，容器很可能还是 0×0：
    - 渲染器用 0 尺寸创建，后续 resize 会导致画面模糊或比例异常；
    - 某些浏览器上直接黑屏，需要手动调整窗口大小才恢复。
  - 实际做法是用 `ResizeObserver` 监听容器尺寸，一旦宽高大于 0 再初始化场景和 renderer，后续再根据 resize 更新相机宽高比和 renderer 大小。

- **GeoJSON 边界渲染**：
  - 读取本地 `public/data/*.json`；
  - 把经纬度转换为球面坐标（lat/lng → 球坐标 → Three.js Vector3），核心代码类似：
    ```ts
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);
    ```
  - 绘制线框或轮廓作为国家 / 区域边界，渲染量大时需要适度降采样，否则边界线本身就能吃掉不少 fillrate。

- **拾取与标记**：
  - 使用 `Raycaster` 从鼠标位置发射射线与地球 mesh 相交；
  - 对交点向量 `v` 做 `normalize` 后就可以反推经纬度（基于 `atan2` 和 `asin`），然后走同一套大模型调用逻辑；
  - 选中点在地表放一个小 mesh 做标记，在后续帧中做轻微 scale 动画，避免“点完没反应”的体验。

- **手势控制融合**：
  - 渲染循环中：
    - 先应用一个较小的基础自转（即使没有输入，地球也缓慢旋转）；
    - 再根据 `handControl.rotX / rotY` 叠加更明显的旋转；
    - 按 `handControl.zoomDelta` 调整相机距离，控制放大 / 缩小，并在一定范围内 clamp，防止穿模。

### 4.2 HandPanel：MediaPipe 手势识别

核心职责：

- 打开摄像头视频流；
- 使用 HandLandmarker 检测手部关键点；
- 计算手势对应的旋转 / 缩放控制量；
- 把控制量通过回调给上层。

实现要点（基本上是靠调参堆出来的经验）：

- **MediaPipe 初始化封装**：
  - 在 `utils/mediaPipeHelper.ts` 中封装 `createHandLandmarker`，集中配置模型路径、运行模式（VIDEO）、GPU delegate 等；
  - 避免在组件里散落大量初始化细节，后续更换模型或切换 CPU/GPU 只改一处即可。

- **性能与节流**：
  - 一开始直接在 `requestAnimationFrame` 里每帧跑手势识别，和 Three.js 渲染抢主线程，体感明显掉帧；
  - 调整后的做法是：
    - 控制识别频率在一个固定的上限（例如 20 FPS 左右）；
    - 渲染循环照常跑 60 FPS，手势量在两帧之间做插值，用户主观上看不到卡顿。

- **手势 → 控制量映射**：
  - 用手掌中心点在 x / y 方向的**速度**而不是位移控制旋转，只在速度超过阈值时才触发，减少静止抖动；
  - 用指尖到掌心的平均距离估算张手 / 握拳，把它线性映射到 `zoomDelta`，再叠加限速和死区：
    - 张开 → 放大；
    - 合拢 → 缩小；
    - 手在快速移动时暂时关闭缩放通道，优先保证旋转可控；
  - 整套逻辑的目标不是“识别出具体手势类别”，而是给 Three.js 一个**连续、可预期**的控制信号。

### 4.3 geminiService（Qwen 地理分析服务）

虽然文件名还是 `geminiService.ts`，内部已经完全切到 Qwen 模型：

- 通过环境变量配置：
  - `VITE_QWEN_BASE_URL`
  - `VITE_QWEN_API_KEY`
  - `VITE_QWEN_MODEL`（如 `Qwen/Qwen2-7B-Instruct`）

- `getPlanetaryIntel(lat, lng)` 的逻辑：

  ```ts
  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });
  ```

- 为了兼容不同服务商的返回格式，对 `choices[0].message.content` 做了兼容处理，统一转成纯字符串，再包成 `GeoFact`：

  ```ts
  const fact: GeoFact = {
    title: "行星情报",
    content: contentText,
    coordinates: { lat, lng },
  };
  ```

这样前端 UI 始终只需要展示一个简单的 `title + content`，不受模型输出格式变动的影响。

---

## 五、开发与调试流程

### 5.1 本地开发

```bash
# 安装依赖
npm install

# 本地开发
npm run dev

# 生产构建
npm run build

# 本地预览构建结果
npm run preview
```

开发过程中推荐的几个调试点：

- **Three.js 场景调试**：
  - 打开浏览器 devtools，观察 canvas 尺寸是否正确；
  - 如果看到黑屏，先确认 ResizeObserver 是否正常触发。

- **MediaPipe 调试**：
  - 在 `HandPanel` 里绘制关键点到 overlay canvas，确保检测到手；
  - 打日志观察计算出的 `HandControl` 数值是否随手势变化。

- **大模型 API 调试**：
  - 先用 curl / Postman 本地验证 Qwen 接口是否配置正确；
  - 前端对 `res.ok` 做错误分支处理，日志详细打印 status 和 body，方便排查。

### 5.2 部署经验（以阿里云为例）

- 构建命令：`npm run build`
- 静态资源目录：`dist`
- 不需要 Node 函数入口，可为空；
- 注意浏览器摄像头要求 HTTPS：
  - 本地 `localhost` 可以直接调试摄像头；
  - 云端需给域名配置 HTTPS 证书，否则会被浏览器拦截。

---

## 六、适合复用与扩展的点

如果你打算在自己的项目上复用/扩展这个 Demo，可以考虑：

1. **直接拿 Three.js 地球 + 手势控制**
   - 把 `HoloEarth.tsx` 和 `HandPanel.tsx` 拿走，改一下纹理和 UI，就能快速搭出一个 3D 地球控制面板。

2. **替换 AI 模型或后端服务**
   - 统一的 `getPlanetaryIntel` 封装，可以很方便地切到别的 OpenAI 兼容模型；
   - 也可以改为调用你自建的后端 REST 接口。

3. **改造成多场景应用**
   - 地理科普 / 星球科普；
   - 航线规划展示（在球面上画线）；
   - 数据可视化（在球面叠加热力图、柱状体等）。

---

## 七、总结

这套 HoloEarth 项目本质上是一个「**Web 端多模态交互实验场**」：

- 从 **交互方式** 上，把鼠标 + 手势 + AI 文本结合到一个场景里；
- 从 **技术组合** 上，串起了 React、Three.js、MediaPipe、大模型 API 这几条链路；
- 从 **工程实践** 上，也经历了从远程纹理 → 本地静态资源、从 Gemini → Qwen 的一系列迭代优化。

希望这篇文章能帮你快速理解项目的整体设计思路，如果你在实际复用或二次开发中遇到更多细节问题，也可以在此基础上继续拆分模块、引入状态管理（如 Redux/Zustand）、加入路由、多页面等更复杂的前端架构能力。
