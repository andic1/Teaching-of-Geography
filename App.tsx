import React, { useState, useCallback } from 'react';
import HoloEarth from './components/HoloEarth';
import HoloUI from './components/HoloUI';
import HandPanel from './components/HandPanel';
import { getPlanetaryIntel } from './services/geminiService';
import { GeoFact, AppState, Controls, Coordinates, HoverData, HandControl } from './types';
import { AlertTriangle, Power, Globe, Orbit, MousePointer2 } from 'lucide-react';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.LOADING);
  const [controls, setControls] = useState<Controls>({ isDragging: false });
  const [currentFact, setCurrentFact] = useState<GeoFact | null>({
    title: "系统就绪",
    content: "全息核心已启动。请拖动地球调整视角，滑动鼠标扫描坐标，点击任意位置获取国家/地理详细情报。",
    coordinates: { lat: 0, lng: 0 }
  });
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [handControl, setHandControl] = useState<HandControl | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Optimized callback to reduce re-renders
  const handleControlsUpdate = useCallback((newControls: Controls) => {
    setControls(prev => {
        if (prev.isDragging === newControls.isDragging) return prev;
        return newControls;
    });
  }, []);

  const handleHover = useCallback((data: HoverData | null) => {
      setHoverData(data);
  }, []);

  const handleSystemReady = useCallback(() => {
    setAppState(AppState.READY);
  }, []);

  const handleLocationSelect = async (coords: Coordinates) => {
    if (isAnalyzing) return;
    setIsAnalyzing(true);
    
    // Clear previous fact momentarily or keep it? Keeping it prevents flicker.
    const fact = await getPlanetaryIntel(coords.lat, coords.lng);
    
    setCurrentFact(fact);
    setIsAnalyzing(false);
  };

  const handleStartSystem = () => {
    setIsStarted(true);
    // 首次进入主界面时弹出使用指引
    setShowHelp(true);
  };

  if (!isStarted) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-cyan-500 font-mono relative overflow-hidden">
        {/* 背景栅格 + 中央扫描线 */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.15),_transparent_60%),linear-gradient(rgba(8,145,178,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(8,145,178,0.12)_1px,transparent_1px)] bg-[size:100%_100%,40px_40px,40px_40px] opacity-70" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

        {/* 启动面板 */}
        <div className="relative z-10 max-w-3xl w-[90%] mx-auto bg-black/70 border border-cyan-500/40 rounded-3xl backdrop-blur-xl shadow-[0_0_80px_rgba(8,145,178,0.55)] overflow-hidden">
          <div className="absolute -top-6 -left-6 w-10 h-10 border-t-2 border-l-2 border-cyan-400/80" />
          <div className="absolute -bottom-6 -right-6 w-10 h-10 border-b-2 border-r-2 border-cyan-400/80" />

          <div className="flex flex-col md:flex-row">
            {/* 左侧：标题与版本信息 */}
            <div className="flex-1 px-10 py-10 border-b md:border-b-0 md:border-r border-cyan-900/60">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-cyan-500 blur-xl opacity-40 rounded-full" />
                  <Globe size={72} className="relative z-10 text-cyan-300" />
                </div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-[0.35em] text-white uppercase">
                    HOLO<span className="text-cyan-400">EARTH</span>
                  </h1>
                  <div className="mt-2 text-[11px] tracking-[0.32em] text-cyan-500/80 uppercase">
                    行 星 级 地 理 情 报 系 统
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-cyan-200/90 mb-6">
                <div>▪ 核心版本：V3.2 CLEAR-VIEW</div>
                <div>▪ 渲染单元：高精度三维地球 + 实时国界线投影</div>
                <div>▪ AI 模块：已接入外部大模型，用于区域环境分析</div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px] text-cyan-100">
                <div className="flex items-center gap-2 bg-cyan-950/40 px-3 py-2 rounded border border-cyan-900/70">
                  <Orbit size={14} className="text-cyan-300" />
                  <div>
                    <div className="font-semibold">3D 全息地球</div>
                    <div className="text-[10px] text-cyan-500">惯性旋转 / 轨道视角</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-cyan-950/40 px-3 py-2 rounded border border-cyan-900/70">
                  <MousePointer2 size={14} className="text-purple-300" />
                  <div>
                    <div className="font-semibold">精确坐标扫描</div>
                    <div className="text-[10px] text-cyan-500">点击任意地点获取情报</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-cyan-950/40 px-3 py-2 rounded border border-cyan-900/70 col-span-2 md:col-span-1">
                  <Power size={14} className="text-emerald-300" />
                  <div>
                    <div className="font-semibold">单手手势控制</div>
                    <div className="text-[10px] text-cyan-500">挥动旋转 / 张合缩放</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：操作提示 + 按钮 */}
            <div className="w-full md:w-80 px-8 py-8 flex flex-col justify-between bg-gradient-to-b from-slate-950/30 to-cyan-950/40">
              <div className="mb-6">
                <div className="text-xs text-cyan-500 mb-2 tracking-[0.2em] uppercase">启动前准备</div>
                <ol className="space-y-1 text-[11px] text-cyan-100 list-decimal list-inside">
                  <li>允许浏览器访问摄像头。</li>
                  <li>将单手置于画面中，确保完全可见。</li>
                  <li>左右挥动手掌以测试地球旋转响应。</li>
                  <li>手掌张开 / 收拢以测试缩放距离。</li>
                </ol>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setShowHelp(true)}
                  className="w-full text-xs border border-cyan-600/60 text-cyan-200 px-4 py-2 rounded flex items-center justify-center gap-2 hover:bg-cyan-900/40 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  查看操作指引
                </button>

                <button
                  onClick={handleStartSystem}
                  className="group relative w-full px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-full transition-all overflow-hidden tracking-[0.25em] uppercase text-xs"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Power size={16} />
                    启 动 系 统
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      
      {appState === AppState.ERROR && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 text-red-500 font-mono backdrop-blur-sm">
          <div className="text-center p-8 border border-red-900/50 rounded bg-red-950/10">
             <AlertTriangle size={48} className="mx-auto mb-4 animate-bounce" />
             <h2 className="text-2xl font-bold mb-2 tracking-wider">系统错误</h2>
             <p className="text-red-400/80 mb-6">{errorMessage || "核心初始化失败"}</p>
             <button onClick={() => window.location.reload()} className="border border-red-500 text-red-400 px-6 py-2 hover:bg-red-900/30 transition-colors uppercase text-sm tracking-widest">
               重启终端
             </button>
          </div>
        </div>
      )}

      {/* 3D Earth Layer */}
      <HoloEarth 
        onControlsUpdate={handleControlsUpdate}
        onLocationSelect={handleLocationSelect}
        onHover={handleHover}
        onReady={handleSystemReady}
        handControl={handControl}
      />

      {/* HUD Layer */}
      <HoloUI 
        fact={currentFact}
        loading={isAnalyzing}
        controls={controls}
        hoverData={hoverData}
      />

      {/* Hand Tracking Preview & Control */}
      <HandPanel onControlChange={setHandControl} />

      {/* 使用指引弹窗 */}
      {showHelp && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-[90%] max-w-xl bg-slate-950/95 border border-cyan-700/70 rounded-2xl shadow-[0_0_60px_rgba(8,145,178,0.6)] p-6 text-cyan-100 font-mono">
            <div className="absolute -top-3 -right-3 flex gap-2">
              <button
                onClick={() => setShowHelp(false)}
                className="w-8 h-8 rounded-full bg-cyan-900/80 hover:bg-cyan-800 text-xs text-cyan-100 border border-cyan-500/70 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <Globe size={28} className="text-cyan-300" />
              <div>
                <div className="text-sm tracking-[0.25em] uppercase text-cyan-500">使用指引</div>
                <div className="text-lg text-white font-semibold">HOLOEARTH 交互说明</div>
              </div>
            </div>

            <ol className="space-y-3 text-xs leading-relaxed">
              <li>
                <span className="font-semibold text-cyan-300">1. 启动与视角</span>
                <div className="text-cyan-200/90 mt-1">
                  点击界面中的「启动系统」按钮，等待地球加载完成。可以用鼠标拖拽地球进行基础旋转，用滚轮缩放远近。
                </div>
              </li>
              <li>
                <span className="font-semibold text-cyan-300">2. 单手挥动控制地球旋转</span>
                <div className="text-cyan-200/90 mt-1">
                  将<span className="text-cyan-300">一只手</span>完全置于右下角摄像头画面中，左右快速挥动手掌，地球会跟随方向旋转；上下挥动可微调俯仰角度。
                </div>
              </li>
              <li>
                <span className="font-semibold text-cyan-300">3. 手掌张开 / 收拢缩放</span>
                <div className="text-cyan-200/90 mt-1">
                  在手基本<span className="text-cyan-300">保持不动</span>的前提下，缓慢张开手掌来放大地球，握紧手掌来缩小。挥手时不会触发缩放，避免误操作。
                </div>
              </li>
              <li>
                <span className="font-semibold text-cyan-300">4. 点击地球获取区域情报</span>
                <div className="text-cyan-200/90 mt-1">
                  使用鼠标在地球表面点击任意位置，系统会锁定该点经纬度并请求外部大模型，对该区域的地理 / 气候 /地貌等信息生成简要说明，结果显示在左下信息面板中。
                </div>
              </li>
              <li>
                <span className="font-semibold text-cyan-300">5. 连通性与离线模式</span>
                <div className="text-cyan-200/90 mt-1">
                  如果 AI 服务暂时不可用，你仍然可以自由旋转和缩放地球，只是左下角不会返回新的分析结果。
                </div>
              </li>
            </ol>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowHelp(false)}
                className="px-4 py-2 text-xs rounded border border-cyan-600 text-cyan-200 hover:bg-cyan-900/60 transition-colors"
              >
                已了解，返回系统
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;