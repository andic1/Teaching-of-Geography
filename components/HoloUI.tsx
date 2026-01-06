import React from 'react';
import { Scan, Activity, Loader2, MousePointer2, MapPin, Globe, Target, Star, Layers, BookOpenCheck, CheckCircle2, RotateCcw, ListChecks, Trophy } from 'lucide-react';
import { GeoFact, Controls, HoverData, LessonMode, ExplainLevel } from '../types';

interface HoloUIProps {
  fact: GeoFact | null;
  loading: boolean;
  controls: Controls;
  hoverData: HoverData | null;
  onAddFavorite?: () => void;
  favorites?: GeoFact[];
  onSelectFavorite?: (fact: GeoFact) => void;
  isFromCache?: boolean;
  viewLayer?: 'surface' | 'data';
  onViewLayerChange?: (layer: 'surface' | 'data') => void;
  lessonMode?: LessonMode;
  onLessonModeChange?: (mode: LessonMode) => void;
  lessonTasks?: { id: string; title: string; done: boolean; active?: boolean }[];
  onResetTasks?: () => void;
  explainLevel?: ExplainLevel;
  onExplainLevelChange?: (level: ExplainLevel) => void;
  score?: number;
  reward?: { open: boolean; title: string; message: string; points: number } | null;
  onDismissReward?: () => void;
  onPrevTask?: () => void;
  onNextTask?: () => void;
}

const HoloUI: React.FC<HoloUIProps> = ({
  fact,
  loading,
  controls,
  hoverData,
  onAddFavorite,
  favorites = [],
  onSelectFavorite,
  isFromCache,
  viewLayer = 'surface',
  onViewLayerChange,
  lessonMode = 'free',
  onLessonModeChange,
  lessonTasks = [],
  onResetTasks,
  explainLevel = 'simple',
  onExplainLevelChange,
  score = 0,
  reward,
  onDismissReward,
  onPrevTask,
  onNextTask,
}) => {
  return (
    <div className="absolute inset-0 pointer-events-none p-4 md:p-8 flex flex-col justify-between overflow-hidden">
      {reward?.open && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-auto">
          <div className="w-[92%] max-w-md bg-white/90 border border-emerald-200 rounded-2xl p-6 shadow-[0_30px_120px_rgba(2,6,23,0.18)]">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 text-emerald-700 font-mono">
                <Trophy size={18} className="text-emerald-600" />
                <span className="tracking-[0.25em] uppercase text-xs">奖励提示</span>
              </div>
              <button
                className="text-xs text-emerald-700 border border-emerald-200 px-3 py-1 rounded hover:bg-emerald-50"
                onClick={() => onDismissReward && onDismissReward()}
              >
                继续
              </button>
            </div>
            <div className="text-slate-900 text-lg font-semibold mb-1">{reward.title}</div>
            <div className="text-slate-700 text-sm mb-3">{reward.message}</div>
            <div className="flex items-center justify-between text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded">
              <span>本次加分</span>
              <span className="text-emerald-700 font-bold">+{reward.points}</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Top Header */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
             <Globe className="text-sky-700" size={32} />
             <h1 className="text-3xl font-bold text-slate-900 tracking-widest uppercase" style={{ textShadow: '0 0 10px rgba(148,163,184,0.35)' }}>
                地理课堂
             </h1>
          </div>
          <div className="text-slate-500 text-xs font-mono mt-1 tracking-wider">
             GEOGRAPHY TEACHING TOOL // V3.2
          </div>

          <div className="mt-3 flex flex-wrap gap-2 pointer-events-auto">
            <button
              className={`px-3 py-1 rounded-full border text-[11px] font-mono flex items-center gap-1 ${
                lessonMode === 'free' ? 'bg-sky-100 border-sky-200 text-slate-900' : 'bg-white/70 border-slate-200 text-slate-700'
              }`}
              onClick={() => onLessonModeChange && onLessonModeChange('free')}
            >
              <BookOpenCheck size={12} />
              自由探索
            </button>
            <button
              className={`px-3 py-1 rounded-full border text-[11px] font-mono flex items-center gap-1 ${
                lessonMode === 'plate' ? 'bg-amber-100 border-amber-200 text-slate-900' : 'bg-white/70 border-slate-200 text-slate-700'
              }`}
              onClick={() => onLessonModeChange && onLessonModeChange('plate')}
            >
              <BookOpenCheck size={12} />
              板块构造课
            </button>
            <button
              className={`px-3 py-1 rounded-full border text-[11px] font-mono flex items-center gap-1 ${
                lessonMode === 'climate' ? 'bg-cyan-100 border-cyan-200 text-slate-900' : 'bg-white/70 border-slate-200 text-slate-700'
              }`}
              onClick={() => onLessonModeChange && onLessonModeChange('climate')}
            >
              <BookOpenCheck size={12} />
              世界气候课
            </button>
            <button
              className={`px-3 py-1 rounded-full border text-[11px] font-mono flex items-center gap-1 ${
                lessonMode === 'human' ? 'bg-purple-100 border-purple-200 text-slate-900' : 'bg-white/70 border-slate-200 text-slate-700'
              }`}
              onClick={() => onLessonModeChange && onLessonModeChange('human')}
            >
              <BookOpenCheck size={12} />
              人文地理课
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2 pointer-events-auto">
            <div className="text-[11px] font-mono text-slate-700 border border-slate-200 bg-white/70 px-2 py-1 rounded-full flex items-center gap-2">
              <ListChecks size={12} className="text-sky-600" />
              <span>讲解深度</span>
            </div>
            <button
              className={`px-3 py-1 rounded-full border text-[11px] font-mono ${
                explainLevel === 'simple'
                  ? 'bg-sky-100 border-sky-200 text-slate-900'
                  : 'bg-white/70 border-slate-200 text-slate-700'
              }`}
              onClick={() => onExplainLevelChange && onExplainLevelChange('simple')}
            >
              简要
            </button>
            <button
              className={`px-3 py-1 rounded-full border text-[11px] font-mono ${
                explainLevel === 'detailed'
                  ? 'bg-sky-100 border-sky-200 text-slate-900'
                  : 'bg-white/70 border-slate-200 text-slate-700'
              }`}
              onClick={() => onExplainLevelChange && onExplainLevelChange('detailed')}
            >
              详细
            </button>
            <div className="ml-2 text-[11px] font-mono text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-1 rounded-full">
              总分：<span className="font-bold">{score}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
            <div className={`px-3 py-1 rounded border backdrop-blur-sm transition-colors duration-300 font-mono text-xs flex items-center gap-2 ${
                controls.isDragging 
                ? "bg-sky-100 border-sky-200 text-slate-900" 
                : "bg-white/70 border-slate-200 text-slate-600"
            }`}>
                <Activity size={12} className={controls.isDragging ? "animate-spin" : ""} />
                <span>{controls.isDragging ? "姿态调整中..." : "系统待机"}</span>
            </div>
            
            {/* Real-time Hover Coords & Country */}
            <div className={`transition-opacity duration-300 ${hoverData ? 'opacity-100' : 'opacity-0'}`}>
                <div className="bg-white/75 border border-slate-200 px-3 py-2 rounded text-xs font-mono text-slate-800 flex flex-col gap-1 w-48 shadow-[0_20px_60px_rgba(2,6,23,0.10)]">
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-1">
                        <Target size={12} />
                        <span className="font-bold">扫描中...</span>
                    </div>
                    {hoverData?.country && (
                        <div className="mb-1 pb-1 border-b border-slate-200 text-slate-900 font-bold tracking-wider uppercase text-center">
                            {hoverData.country}
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-slate-500">LAT:</span>
                        <span>{hoverData?.coords.lat.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-500">LNG:</span>
                        <span>{hoverData?.coords.lng.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* 视图图层切换 */}
            <div className="flex items-center gap-2 mt-2 pointer-events-auto">
              <button
                className={`flex items-center gap-1 px-3 py-1 rounded-full border text-[11px] font-mono ${
                  viewLayer === 'surface'
                    ? 'bg-sky-100 border-sky-200 text-slate-900'
                    : 'bg-white/70 border-slate-200 text-slate-700'
                }`}
                onClick={() => onViewLayerChange && onViewLayerChange('surface')}
              >
                <Layers size={12} />
                地表视图
              </button>
              <button
                className={`flex items-center gap-1 px-3 py-1 rounded-full border text-[11px] font-mono ${
                  viewLayer === 'data'
                    ? 'bg-emerald-50 border-emerald-200 text-slate-900'
                    : 'bg-white/70 border-slate-200 text-slate-700'
                }`}
                onClick={() => onViewLayerChange && onViewLayerChange('data')}
              >
                <Layers size={12} />
                数据视图
              </button>
            </div>

            {lessonTasks.length > 0 && (
              <div className="mt-3 w-64 bg-white/80 border border-slate-200 rounded-lg pointer-events-auto shadow-[0_20px_60px_rgba(2,6,23,0.10)]">
                <div className="flex items-center justify-between px-3 py-1 border-b border-slate-200 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-600" />课堂任务</span>
                  <div className="flex items-center gap-2">
                    {onPrevTask && (
                      <button className="text-slate-500 hover:text-slate-900" onClick={onPrevTask}>◀</button>
                    )}
                    {onNextTask && (
                      <button className="text-slate-500 hover:text-slate-900" onClick={onNextTask}>▶</button>
                    )}
                    {onResetTasks && (
                      <button className="text-slate-500 hover:text-slate-900 flex items-center gap-1" onClick={onResetTasks}>
                        <RotateCcw size={12} />
                        重置
                      </button>
                    )}
                  </div>
                </div>
                <ul className="text-[11px] text-slate-800 divide-y divide-slate-200 max-h-44 overflow-y-auto">
                  {lessonTasks.map(t => (
                    <li key={t.id} className={`px-3 py-1.5 flex items-start gap-2 ${t.active ? 'bg-sky-50' : ''}`}>
                      <span className={`mt-0.5 ${t.done ? 'text-emerald-600' : 'text-slate-400'}`}>{t.done ? '✓' : '○'}</span>
                      <span className={`${t.done ? 'text-slate-900' : 'text-slate-700'} whitespace-normal leading-snug`}>{t.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      </div>

      {/* Center Reticle - Cosmetic */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] pointer-events-none opacity-10">
         <div className="absolute inset-0 border border-cyan-500/20 rounded-full" />
         <div className="absolute left-0 top-1/2 w-full h-[1px] bg-cyan-500/20" />
         <div className="absolute top-0 left-1/2 h-full w-[1px] bg-cyan-500/20" />
      </div>

      {/* Bottom Information Panel */}
      <div className="flex flex-col md:flex-row items-end justify-between gap-6 w-full">
        
        {/* Detail Card */}
        <div className="w-full md:max-w-md pointer-events-auto">
            <div className="bg-white/80 backdrop-blur-md border-t-2 border-sky-400 p-6 rounded-b-lg shadow-[0_20px_80px_rgba(2,6,23,0.10)] relative overflow-hidden group">
                
                {/* Scan Light Effect */}
                {loading && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-400/10 to-transparent w-full h-full animate-[shimmer_2s_infinite]" />
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-6 text-slate-600 gap-3">
                        <Loader2 className="animate-spin" size={32} />
                        <span className="font-mono text-sm tracking-wider">正在解析地理数据...</span>
                    </div>
                ) : fact ? (
                    <div className="relative z-10 animate-[fadeIn_0.5s_ease-out]">
                        <div className="flex items-center justify-between gap-2 mb-3 border-b border-slate-200 pb-2">
                            <div className="flex items-center gap-2">
                              <Scan size={18} className="text-sky-600" />
                              <h2 className="text-xl text-slate-900 font-bold tracking-wide">{fact.title}</h2>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-mono">
                              {typeof isFromCache === 'boolean' && (
                                <span className={`px-2 py-0.5 rounded-full border ${
                                  isFromCache
                                    ? 'border-amber-200 text-amber-700 bg-amber-50'
                                    : 'border-emerald-200 text-emerald-700 bg-emerald-50'
                                }`}>
                                  {isFromCache ? '边缘缓存命中' : '实时分析'}
                                </span>
                              )}
                              {onAddFavorite && (
                                <button
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 text-slate-800 hover:bg-slate-50 pointer-events-auto"
                                  onClick={onAddFavorite}
                                >
                                  <Star size={12} className="text-yellow-300" />
                                  收藏
                                </button>
                              )}
                            </div>
                        </div>
                        <div className="text-slate-800 text-sm leading-relaxed text-justify mb-4 min-h-[60px] max-h-64 overflow-y-auto whitespace-pre-wrap pr-1">
                          {fact.content}
                        </div>
                        {fact.coordinates && (
                            <div className="flex items-center justify-between text-xs font-mono text-slate-600 bg-slate-50 p-2 rounded border border-slate-200">
                                <div className="flex items-center gap-1">
                                    <MapPin size={12} />
                                    <span>定位确认</span>
                                </div>
                                <span>LAT: {fact.coordinates.lat.toFixed(2)} / LNG: {fact.coordinates.lng.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="py-4 text-center text-slate-500 font-mono text-sm">
                        点击地球表面任意位置进行分析
                    </div>
                )}
            </div>
        </div>

        {/* Controls Hint + 收藏列表 */}
        <div className="hidden md:flex flex-col items-end gap-3 text-slate-600 font-mono text-xs pointer-events-auto">
            <div className="flex items-center gap-2 bg-white/70 px-3 py-1 rounded-full border border-slate-200 shadow-[0_12px_40px_rgba(2,6,23,0.10)]">
                <span>旋转视角</span>
                <MousePointer2 size={12} />
            </div>
            <div className="flex items-center gap-2 bg-white/70 px-3 py-1 rounded-full border border-slate-200 shadow-[0_12px_40px_rgba(2,6,23,0.10)]">
                <span>选择区域</span>
                <div className="w-2 h-2 bg-sky-500 rounded-full" />
            </div>

            {/* 收藏的知识卡片简表 */}
            {favorites.length > 0 && (
              <div className="mt-2 w-64 bg-white/80 border border-slate-200 rounded-lg max-h-40 overflow-y-auto shadow-[0_20px_60px_rgba(2,6,23,0.10)]">
                <div className="flex items-center justify-between px-3 py-1 border-b border-slate-200 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1"><Star size={12} className="text-yellow-400" />课堂笔记</span>
                  <span>{favorites.length}</span>
                </div>
                <ul className="text-[11px] text-slate-800 divide-y divide-slate-200">
                  {favorites.map((f, idx) => (
                    <li
                      key={idx}
                      className="px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
                      onClick={() => onSelectFavorite && onSelectFavorite(f)}
                    >
                      <div className="truncate font-semibold mb-0.5">{f.title || '课堂笔记'}</div>
                      {f.lessonMode && (
                        <div className="text-slate-500">
                          [{f.lessonMode === 'free' ? '自由' : f.lessonMode === 'plate' ? '板块' : f.lessonMode === 'climate' ? '气候' : '人文'}]
                          {f.timestamp ? ` ${new Date(f.timestamp).toLocaleString()}` : ''}
                        </div>
                      )}
                      {f.coordinates && (
                        <div className="text-slate-500">LAT {f.coordinates.lat.toFixed(1)} / LNG {f.coordinates.lng.toFixed(1)}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default HoloUI;