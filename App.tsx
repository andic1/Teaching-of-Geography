import React, { useState, useCallback, useEffect, useRef } from 'react';
import HoloEarth from './components/HoloEarth';
import HoloUI from './components/HoloUI';
import HandPanel from './components/HandPanel';
import { getPlanetaryIntel } from './services/geminiService';
import { GeoFact, AppState, Controls, Coordinates, HoverData, HandControl, LessonMode, ExplainLevel } from './types';
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
  const [intelCache, setIntelCache] = useState<Record<string, GeoFact>>({});
  const [isFromCache, setIsFromCache] = useState(false);
  const [favorites, setFavorites] = useState<GeoFact[]>([]);
  const [viewLayer, setViewLayer] = useState<'surface' | 'data'>('surface');
  const [lessonMode, setLessonMode] = useState<LessonMode>('free');
  const [explainLevel, setExplainLevel] = useState<ExplainLevel>('simple');
  const [lessonTasks, setLessonTasks] = useState<{ id: string; title: string; keywords: string[]; done: boolean; points: number }[]>([]);
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [reward, setReward] = useState<{ open: boolean; title: string; message: string; points: number } | null>(null);
  const [focusCoords, setFocusCoords] = useState<Coordinates | null>(null);
  const suppressModeHintRef = useRef(false);
  const activeTaskIndexRef = useRef(0);

  useEffect(() => {
    activeTaskIndexRef.current = activeTaskIndex;
  }, [activeTaskIndex]);

  // 初始化时从本地存储加载缓存与收藏
  useEffect(() => {
    try {
      const cached = localStorage.getItem('holoearth_intel_cache_v1');
      if (cached) {
        const parsed = JSON.parse(cached) as Record<string, GeoFact>;
        setIntelCache(parsed);
      }
    } catch (e) {
      console.warn('加载本地情报缓存失败', e);
    }

    try {
      const favRaw = localStorage.getItem('holoearth_favorites_v1');
      if (favRaw) {
        const parsedFav = JSON.parse(favRaw) as GeoFact[];
        setFavorites(parsedFav);
      }
    } catch (e) {
      console.warn('加载收藏列表失败', e);
    }
  }, []);

  // 情报缓存持久化
  useEffect(() => {
    try {
      localStorage.setItem('holoearth_intel_cache_v1', JSON.stringify(intelCache));
    } catch (e) {
      console.warn('保存本地情报缓存失败', e);
    }
  }, [intelCache]);

  // 收藏持久化
  useEffect(() => {
    try {
      localStorage.setItem('holoearth_favorites_v1', JSON.stringify(favorites));
    } catch (e) {
      console.warn('保存收藏列表失败', e);
    }
  }, [favorites]);

  const tasksByMode: Record<LessonMode, { id: string; title: string; keywords: string[]; points: number }[]> = {
    free: [
      { id: 'free-1', title: '找到一处明显的地貌特征（山脉/高原/沙漠等）并总结原因', keywords: ['山', '高原', '沙漠', '盆地', '地貌'], points: 10 },
      { id: 'free-2', title: '找到一个海洋区域并说明它的洋流或海域特征', keywords: ['洋流', '海域', '海沟', '海盆'], points: 10 },
      { id: 'free-3', title: '找到一处“气候特征明显”的区域并说明原因', keywords: ['气候', '降水', '温度', '干旱', '季风'], points: 15 },
      { id: 'free-4', title: '找到一条河流/三角洲/湖泊并说出它的形成或作用', keywords: ['河', '三角洲', '湖', '水系', '冲积'], points: 10 },
      { id: 'free-5', title: '找到一处海岸线曲折区域并解释成因（海湾/半岛/海峡）', keywords: ['海湾', '半岛', '海峡', '海岸线'], points: 10 },
      { id: 'free-6', title: '找到一处高纬地区并说明其自然环境特征', keywords: ['高纬', '寒冷', '冰', '冻土', '极地'], points: 15 },
      { id: 'free-7', title: '找到一处干旱区并解释干旱成因', keywords: ['干旱', '沙漠', '降水少', '副热带高压'], points: 15 },
      { id: 'free-8', title: '找到一处热带地区并说明典型气候/植被', keywords: ['热带', '雨林', '季雨林', '高温'], points: 15 },
      { id: 'free-9', title: '找到一处岛屿或群岛并解释它的地理意义', keywords: ['岛', '群岛', '海峡', '航线'], points: 10 },
      { id: 'free-10', title: '找到一处平原并解释其农业/人口意义', keywords: ['平原', '农业', '人口', '肥沃'], points: 10 },
    ],
    plate: [
      { id: 'plate-1', title: '找出一处地震或火山高风险区，并说明板块作用', keywords: ['板块', '地震', '火山', '俯冲', '张裂', '断层'], points: 15 },
      { id: 'plate-2', title: '找出一条山脉/岛弧，并解释其形成机制', keywords: ['山脉', '岛弧', '造山', '挤压', '隆起'], points: 15 },
      { id: 'plate-3', title: '找一个海沟/俯冲带，并说明对应的地质灾害风险', keywords: ['海沟', '俯冲', '地震', '海啸', '火山'], points: 20 },
      { id: 'plate-4', title: '找一个裂谷或张裂区，并说明它的地质过程', keywords: ['裂谷', '张裂', '地壳', '岩浆'], points: 20 },
      { id: 'plate-5', title: '找一个热点火山（非板块边界）并解释成因', keywords: ['热点', '地幔柱', '火山'], points: 20 },
      { id: 'plate-6', title: '找一处断层密集区并解释地震风险', keywords: ['断层', '地震', '构造'], points: 15 },
      { id: 'plate-7', title: '找一个碰撞造山带并解释板块碰撞', keywords: ['碰撞', '造山', '隆起', '褶皱'], points: 20 },
      { id: 'plate-8', title: '找一个板块边界附近的海岛链并解释成因', keywords: ['板块', '岛链', '俯冲', '火山'], points: 15 },
      { id: 'plate-9', title: '找一个地震带并说出它可能分布的原因', keywords: ['地震带', '板块', '断层'], points: 15 },
      { id: 'plate-10', title: '找一个火山带并说明它的典型灾害', keywords: ['火山带', '喷发', '火山灰', '熔岩'], points: 15 },
    ],
    climate: [
      { id: 'climate-1', title: '找出一种气候类型（热带/温带/寒带/干旱等）并描述特征', keywords: ['气候', '降水', '温度', '干旱', '热带', '温带', '寒带'], points: 15 },
      { id: 'climate-2', title: '找出洋流或季风影响明显的区域，并说明影响链条', keywords: ['洋流', '季风', '信风', '西风', '暖流', '寒流'], points: 20 },
      { id: 'climate-3', title: '找一个沿海地区，说明海洋对气候的调节作用', keywords: ['沿海', '海洋', '湿润', '温差', '调节'], points: 15 },
      { id: 'climate-4', title: '找一个内陆地区并说明年温差/降水差异原因', keywords: ['内陆', '年温差', '降水', '大陆性'], points: 15 },
      { id: 'climate-5', title: '找一个暖流影响区并说明对气候的作用', keywords: ['暖流', '增温', '湿润'], points: 15 },
      { id: 'climate-6', title: '找一个寒流影响区并说明对气候的作用', keywords: ['寒流', '降温', '干旱'], points: 15 },
      { id: 'climate-7', title: '找一个季风区并解释雨季/旱季', keywords: ['季风', '雨季', '旱季', '风向'], points: 20 },
      { id: 'climate-8', title: '找一个地形雨显著的地区并解释原因', keywords: ['地形雨', '迎风坡', '背风坡'], points: 20 },
      { id: 'climate-9', title: '找一个高原并说明其对气候的影响', keywords: ['高原', '气温低', '垂直带'], points: 15 },
      { id: 'climate-10', title: '找一个赤道附近地区并说明对流降水特征', keywords: ['赤道', '对流', '降水多', '高温'], points: 15 },
    ],
    human: [
      { id: 'human-1', title: '找出一座大城市/都市圈，并说出其区位优势', keywords: ['城市', '港口', '交通', '区位', '人口', '经济'], points: 15 },
      { id: 'human-2', title: '找出一条与贸易/航线相关的区域联系，并描述人类活动影响', keywords: ['贸易', '航线', '通道', '港口', '资源', '产业'], points: 20 },
      { id: 'human-3', title: '找一个资源型区域，说明资源与产业/人口的关系', keywords: ['资源', '矿', '油', '产业', '人口'], points: 15 },
      { id: 'human-4', title: '找一个沿海港口区并说明其对经济的带动作用', keywords: ['港口', '沿海', '贸易', '物流'], points: 20 },
      { id: 'human-5', title: '找一个交通枢纽并说明形成原因', keywords: ['交通', '枢纽', '通道', '区位'], points: 15 },
      { id: 'human-6', title: '找一个人口稠密区并解释原因', keywords: ['人口', '稠密', '平原', '农业'], points: 15 },
      { id: 'human-7', title: '找一个人口稀疏区并解释原因', keywords: ['人口', '稀疏', '荒漠', '高寒'], points: 15 },
      { id: 'human-8', title: '找一个农牧业区并说明自然条件与人类活动关系', keywords: ['农业', '牧业', '降水', '土地'], points: 20 },
      { id: 'human-9', title: '找一个工业/资源开发区并说明环境影响', keywords: ['工业', '矿', '污染', '环境'], points: 20 },
      { id: 'human-10', title: '找一个旅游/文化区域并说明人文特色', keywords: ['文化', '旅游', '历史', '遗产'], points: 15 },
    ],
  };

  const pickRandomTasks = useCallback((mode: LessonMode, count: number) => {
    const pool = tasksByMode[mode];
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length)).map(t => ({ ...t, done: false }));
  }, []);

  // 切换课堂模式时重置任务（形成明确课堂流程）
  useEffect(() => {
    const base = pickRandomTasks(lessonMode, 6);
    setLessonTasks(base);
    setActiveTaskIndex(0);
    if (!suppressModeHintRef.current) {
      setCurrentFact(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          title: '课堂模式已切换',
          content: `当前课程：${lessonMode === 'free' ? '自由探索' : lessonMode === 'plate' ? '板块构造课' : lessonMode === 'climate' ? '世界气候课' : '人文地理课'}。请点击地球选点，系统会给出与课程主题匹配的讲解，并自动判定任务进度。`,
        };
      });
    }
    suppressModeHintRef.current = false;
    setFocusCoords(null);
    setIsFromCache(false);
  }, [lessonMode]);

  const evaluateTasks = useCallback((text: string) => {
    setLessonTasks(prev => {
      if (prev.length === 0) return prev;
      const idx = activeTaskIndexRef.current;
      const cur = prev[idx];
      if (!cur || cur.done) return prev;
      const hit = cur.keywords.some(k => text.includes(k));
      if (!hit) return prev;

      const next = prev.map((t, i) => (i === idx ? { ...t, done: true } : t));
      setScore(s => s + cur.points);
      setReward({
        open: true,
        title: '任务完成',
        message: `完成「${cur.title}」`,
        points: cur.points,
      });

      // 自动切到下一任务
      const nextIndex = Math.min(idx + 1, next.length - 1);
      setActiveTaskIndex(nextIndex);
      activeTaskIndexRef.current = nextIndex;
      return next;
    });
  }, []);

  const resetTasks = useCallback(() => {
    setLessonTasks(pickRandomTasks(lessonMode, 6));
    setActiveTaskIndex(0);
    activeTaskIndexRef.current = 0;
    setScore(0);
  }, [lessonMode, pickRandomTasks]);

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
    const key = `${lessonMode}_${explainLevel}_${coords.lat.toFixed(1)}_${coords.lng.toFixed(1)}`;

    // 先查前端边缘缓存
    const cached = intelCache[key];
    if (cached) {
      setIsFromCache(true);
      // 标记一下来源，避免误以为是新请求
      setCurrentFact({ ...cached, title: cached.title.includes('（缓存）') ? cached.title : `${cached.title}（缓存）` });
      setFocusCoords(coords);
      evaluateTasks(cached.content);
      return;
    }

    setIsFromCache(false);
    setIsAnalyzing(true);

    try {
      const fact = await getPlanetaryIntel(coords.lat, coords.lng, lessonMode, explainLevel);
      setCurrentFact(fact);
      setIntelCache(prev => ({ ...prev, [key]: fact }));
      setFocusCoords(coords);
      evaluateTasks(fact.content);
    } catch (err: any) {
      console.error('getPlanetaryIntel error:', err);
      setErrorMessage(err?.message || '行星情报拉取失败');
      setAppState(AppState.ERROR);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddFavorite = useCallback(() => {
    setFavorites(prev => {
      if (!currentFact) return prev;
      const enriched: GeoFact = {
        ...currentFact,
        lessonMode: currentFact.lessonMode ?? lessonMode,
        timestamp: currentFact.timestamp ?? new Date().toISOString(),
      };
      // 根据坐标和内容去重
      const exists = prev.some(f => {
        if (!f.coordinates || !enriched.coordinates) return false;
        return (
          f.coordinates.lat === enriched.coordinates.lat &&
          f.coordinates.lng === enriched.coordinates.lng &&
          f.content === enriched.content
        );
      });
      if (exists) return prev;
      return [...prev, enriched];
    });
  }, [currentFact]);

  const handleSelectFavorite = useCallback((fact: GeoFact) => {
    setCurrentFact(fact);
    setIsAnalyzing(false);
    setIsFromCache(true);
    if (fact.lessonMode) {
      suppressModeHintRef.current = true;
      setLessonMode(fact.lessonMode);
    }
    if (fact.coordinates) {
      setFocusCoords({ lat: fact.coordinates.lat, lng: fact.coordinates.lng });
    }
    if (fact.content) evaluateTasks(fact.content);
  }, [evaluateTasks]);

  const dismissReward = useCallback(() => {
    setReward(null);
  }, []);

  const handlePrevTask = useCallback(() => {
    setActiveTaskIndex(prev => {
      const next = Math.max(0, prev - 1);
      activeTaskIndexRef.current = next;
      return next;
    });
  }, []);

  const handleNextTask = useCallback(() => {
    setActiveTaskIndex(prev => {
      const next = Math.min(lessonTasks.length - 1, prev + 1);
      activeTaskIndexRef.current = next;
      return next;
    });
  }, [lessonTasks.length]);

  const handleStartSystem = () => {
    setIsStarted(true);
    // 首次进入主界面时弹出使用指引
    setShowHelp(true);
  };

  if (!isStarted) {
    return (
      <div className="w-full h-screen bg-slate-50 flex items-center justify-center text-slate-900 font-sans relative overflow-hidden">
        {/* 背景栅格 + 中央扫描线 */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.22),_transparent_65%),linear-gradient(rgba(148,163,184,0.20)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.20)_1px,transparent_1px)] bg-[size:100%_100%,44px_44px,44px_44px] opacity-100" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-sky-400/30 to-transparent" />

        {/* 启动面板 */}
        <div className="relative z-10 max-w-3xl w-[92%] mx-auto bg-white/80 border border-slate-200 rounded-3xl backdrop-blur-xl shadow-[0_30px_120px_rgba(2,6,23,0.12)] overflow-hidden">
          <div className="absolute -top-6 -left-6 w-10 h-10 border-t-2 border-l-2 border-slate-200" />
          <div className="absolute -bottom-6 -right-6 w-10 h-10 border-b-2 border-r-2 border-slate-200" />

          <div className="flex flex-col md:flex-row">
            {/* 左侧：标题与版本信息 */}
            <div className="flex-1 px-10 py-10 border-b md:border-b-0 md:border-r border-slate-200">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-sky-400 blur-xl opacity-20 rounded-full" />
                  <Globe size={72} className="relative z-10 text-sky-600" />
                </div>
                <div>
                  <h1 className="text-4xl md:text-5xl font-extrabold tracking-[0.22em] text-slate-900 uppercase">
                    HOLO<span className="text-sky-600">EARTH</span>
                  </h1>
                  <div className="mt-2 text-[11px] tracking-[0.26em] text-slate-400 uppercase">
                    地理课堂教学工具 · 交互式地球 · AI 课堂讲解
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-700 mb-6">
                <div>▪ 用途：课堂演示 / 学生探索 / 课后复习</div>
                <div>▪ 能力：课程模式 · 任务链 · 积分激励 · 笔记回放</div>
                <div>▪ AI：按课程主题输出“简要/详细”讲解</div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px] text-slate-800">
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded border border-slate-200">
                  <Orbit size={14} className="text-sky-600" />
                  <div>
                    <div className="font-semibold">真实卫星地球</div>
                    <div className="text-[10px] text-slate-500">旋转 / 缩放 / 选点</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded border border-slate-200">
                  <MousePointer2 size={14} className="text-purple-300" />
                  <div>
                    <div className="font-semibold">课堂讲解与任务</div>
                    <div className="text-[10px] text-slate-500">自动判题 / 完成加分</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded border border-slate-200 col-span-2 md:col-span-1">
                  <Power size={14} className="text-emerald-600" />
                  <div>
                    <div className="font-semibold">手势辅助控制</div>
                    <div className="text-[10px] text-slate-500">可降级为鼠标模式</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 右侧：操作提示 + 按钮 */}
            <div className="w-full md:w-80 px-8 py-8 flex flex-col justify-between bg-gradient-to-b from-white/50 to-slate-50/40">
              <div className="mb-6">
                <div className="text-xs text-slate-300 mb-2 tracking-[0.2em] uppercase">快速上手</div>
                <ol className="space-y-1 text-[11px] text-slate-700 list-decimal list-inside">
                  <li>选择课程模式（板块/气候/人文/自由）。</li>
                  <li>点击地球选点，获取课程主题讲解。</li>
                  <li>按任务链完成目标，获得积分鼓励。</li>
                  <li>收藏讲解卡片，支持课堂回放定位。</li>
                </ol>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => setShowHelp(true)}
                  className="w-full text-xs border border-slate-300 text-slate-700 px-4 py-2 rounded flex items-center justify-center gap-2 hover:bg-slate-100 transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500/70" />
                  查看操作指引
                </button>

                <button
                  onClick={handleStartSystem}
                  className="group relative w-full px-8 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-full transition-all overflow-hidden tracking-[0.25em] uppercase text-xs"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    <Power size={16} />
                    进 入 课 堂
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-sky-400 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 启动页也共享同一套使用指引弹窗 */}
        {showHelp && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="relative w-[92%] max-w-3xl bg-white/95 border border-slate-200 rounded-2xl shadow-[0_30px_120px_rgba(15,23,42,0.30)] p-6 text-slate-800 text-sm">
              <div className="absolute -top-3 -right-3 flex gap-2">
                <button
                  onClick={() => setShowHelp(false)}
                  className="w-8 h-8 rounded-full bg-white shadow border border-slate-300 hover:bg-slate-100 text-xs text-slate-600 flex items-center justify-center"
                >
                  ✕
                </button>
              </div>

              <div className="flex items-start gap-4 mb-4">
                <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-sky-100 text-sky-600">
                  <Globe size={22} />
                </div>
                <div>
                  <div className="text-xs tracking-[0.22em] uppercase text-slate-500 mb-1">使用指引</div>
                  <div className="text-lg font-semibold text-slate-900">地理课堂 · 操作说明</div>
                  <div className="text-xs text-slate-500 mt-1">建议老师在课前用 1 分钟带着学生一起看一遍。</div>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs font-semibold text-slate-700 mb-2">一、基础操作（鼠标）</h3>
                  <ul className="space-y-1.5 text-xs list-disc list-inside text-slate-700">
                    <li>按住地球拖动：旋转视角，查看不同区域。</li>
                    <li>滚轮上下：拉近 / 推远镜头。</li>
                    <li>单击地球：锁定一个地点，请求 AI 生成「课堂讲解」。</li>
                    <li>再次点击其他位置：更新讲解内容。</li>
                  </ul>

                  <h3 className="text-xs font-semibold text-slate-700 mt-4 mb-2">二、课程模式与讲解深度</h3>
                  <ul className="space-y-1.5 text-xs list-disc list-inside text-slate-700">
                    <li>左上选择课程：<span className="font-semibold">自由 / 板块构造 / 世界气候 / 人文地理</span>。</li>
                    <li>切换「简要 / 详细」：控制 AI 讲解的深度，适配不同年级。</li>
                    <li>当前课程会影响 AI 的讲解角度与课堂任务内容。</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-700 mb-2">三、课堂任务与积分</h3>
                  <ul className="space-y-1.5 text-xs list-disc list-inside text-slate-700">
                    <li>右侧「课堂任务」列出本节课 6 条任务，系统会标记当前任务。</li>
                    <li>根据任务提示在地球上选点，完成后会自动加分并弹出奖励提示。</li>
                    <li>教师可引导学生复述 AI 讲解内容，再切换到下一条任务。</li>
                  </ul>

                  <h3 className="text-xs font-semibold text-slate-700 mt-4 mb-2">四、收藏笔记与回放</h3>
                  <ul className="space-y-1.5 text-xs list-disc list-inside text-slate-700">
                    <li>左下讲解卡片右上角点击「收藏」，将当前地点与讲解加入课堂笔记。</li>
                    <li>右侧「课堂笔记」列表中点击任一条，地球会自动转到对应位置并回放讲解。</li>
                    <li>适合课后复习或考试前快速回顾重点区域。</li>
                  </ul>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="text-[11px] text-slate-500">
                  <div className="font-semibold mb-0.5">五、手势控制（可选）</div>
                  <div>
                    右下摄像头就绪时，可用<span className="font-semibold">单手</span>左右挥动控制旋转，缓慢张开 / 握拳控制缩放；如课堂设备条件有限，可完全使用鼠标完成所有操作。
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowHelp(false)}
                    className="px-4 py-2 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
        viewLayer={viewLayer}
        focusCoords={focusCoords}
      />

      {/* HUD Layer */}
      <HoloUI 
        fact={currentFact}
        loading={isAnalyzing}
        controls={controls}
        hoverData={hoverData}
        onAddFavorite={handleAddFavorite}
        favorites={favorites}
        onSelectFavorite={handleSelectFavorite}
        isFromCache={isFromCache}
        viewLayer={viewLayer}
        onViewLayerChange={setViewLayer}
        lessonMode={lessonMode}
        onLessonModeChange={setLessonMode}
        lessonTasks={lessonTasks.map(({ id, title, done }, idx) => ({ id, title, done, active: idx === activeTaskIndex }))}
        onResetTasks={resetTasks}
        explainLevel={explainLevel}
        onExplainLevelChange={setExplainLevel}
        score={score}
        reward={reward}
        onDismissReward={dismissReward}
        onPrevTask={handlePrevTask}
        onNextTask={handleNextTask}
      />

      {/* Hand Tracking Preview & Control */}
      <HandPanel onControlChange={setHandControl} />

      {/* 使用指引弹窗（课堂版） */}
      {showHelp && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-[92%] max-w-3xl bg-white/95 border border-slate-200 rounded-2xl shadow-[0_30px_120px_rgba(15,23,42,0.30)] p-6 text-slate-800 text-sm">
            <div className="absolute -top-3 -right-3 flex gap-2">
              <button
                onClick={() => setShowHelp(false)}
                className="w-8 h-8 rounded-full bg-white shadow border border-slate-300 hover:bg-slate-100 text-xs text-slate-600 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="flex items-start gap-4 mb-4">
              <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-sky-100 text-sky-600">
                <Globe size={22} />
              </div>
              <div>
                <div className="text-xs tracking-[0.22em] uppercase text-slate-500 mb-1">使用指引</div>
                <div className="text-lg font-semibold text-slate-900">地理课堂 · 操作说明</div>
                <div className="text-xs text-slate-500 mt-1">建议老师在课前用 1 分钟带着学生一起看一遍。</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-2">一、基础操作（鼠标）</h3>
                <ul className="space-y-1.5 text-xs list-disc list-inside text-slate-700">
                  <li>按住地球拖动：旋转视角，查看不同区域。</li>
                  <li>滚轮上下：拉近 / 推远镜头。</li>
                  <li>单击地球：锁定一个地点，请求 AI 生成「课堂讲解」。</li>
                  <li>再次点击其他位置：更新讲解内容。</li>
                </ul>

                <h3 className="text-xs font-semibold text-slate-700 mt-4 mb-2">二、课程模式与讲解深度</h3>
                <ul className="space-y-1.5 text-xs list-disc list-inside text-slate-700">
                  <li>左上选择课程：<span className="font-semibold">自由 / 板块构造 / 世界气候 / 人文地理</span>。</li>
                  <li>切换「简要 / 详细」：控制 AI 讲解的深度，适配不同年级。</li>
                  <li>当前课程会影响 AI 的讲解角度与课堂任务内容。</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-700 mb-2">三、课堂任务与积分</h3>
                <ul className="space-y-1.5 text-xs list-disc list-inside text-slate-700">
                  <li>右侧「课堂任务」列出本节课 6 条任务，系统会标记当前任务。</li>
                  <li>根据任务提示在地球上选点，完成后会自动加分并弹出奖励提示。</li>
                  <li>教师可引导学生复述 AI 讲解内容，再切换到下一条任务。</li>
                </ul>

                <h3 className="text-xs font-semibold text-slate-700 mt-4 mb-2">四、收藏笔记与回放</h3>
                <ul className="space-y-1.5 text-xs list-disc list-inside text-slate-700">
                  <li>左下讲解卡片右上角点击「收藏」，将当前地点与讲解加入课堂笔记。</li>
                  <li>右侧「课堂笔记」列表中点击任一条，地球会自动转到对应位置并回放讲解。</li>
                  <li>适合课后复习或考试前快速回顾重点区域。</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                <div className="font-semibold mb-0.5">五、手势控制（可选）</div>
                <div>
                  右下摄像头就绪时，可用<span className="font-semibold">单手</span>左右挥动控制旋转，缓慢张开 / 握拳控制缩放；如课堂设备条件有限，可完全使用鼠标完成所有操作。
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowHelp(false)}
                  className="px-4 py-2 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;