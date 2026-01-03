import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createHandLandmarker } from '../utils/mediaPipeHelper';
import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { HandControl } from '../types';

interface HandPanelProps {
  onControlChange?: (control: HandControl | null) => void;
}

const HandPanel: React.FC<HandPanelProps> = ({ onControlChange }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [gestureInfo, setGestureInfo] = useState<string>('等待手势...');
  
  // 状态追踪
  const lastPalmPos = useRef<{ x: number; y: number } | null>(null);
  const lastOpenness = useRef<number | null>(null);
  const noHandFrames = useRef(0);
  
  // 挥动方向锁定
  const swipeStartPos = useRef<{ x: number; y: number } | null>(null);
  const swipeDirLocked = useRef<{ x: number; y: number } | null>(null);
  const isReturning = useRef(false);
  
  // 计算手掌中心
  const getPalmCenter = (landmarks: any[]) => {
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    return {
      x: (wrist.x + middleMcp.x) / 2,
      y: (wrist.y + middleMcp.y) / 2
    };
  };
  
  // 计算手掌张开程度
  const getOpenness = (landmarks: any[]) => {
    const wrist = landmarks[0];
    const tips = [4, 8, 12, 16, 20];
    let total = 0;
    for (const i of tips) {
      const tip = landmarks[i];
      total += Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
    }
    return total / 5;
  };

  const processHand = useCallback((landmarks: any[]) => {
    const palm = getPalmCenter(landmarks);
    const openness = getOpenness(landmarks);
    
    let control: HandControl | null = null;
    let info = '🖐️ 就绪';
    
    if (lastPalmPos.current) {
      const dx = palm.x - lastPalmPos.current.x;
      const dy = palm.y - lastPalmPos.current.y;
      const dist = Math.hypot(dx, dy);

      // 只要手掌移动达到一定速度，就直接用于旋转地球
      const moveThreshold = 0.003; // 越小越敏感
      if (dist > moveThreshold) {
        const sensitivity = 4.0; // 提高一点旋转灵敏度
        control = {
          rotX: dy * sensitivity,
          rotY: dx * sensitivity,
        };
        info = `挥动 ${dx > 0 ? '→' : '←'}`;
      } else {
        // 手基本不动时，才用张合做缩放
        if (lastOpenness.current !== null) {
          const dOpen = openness - lastOpenness.current;
          const zoomThreshold = 0.005;
          if (Math.abs(dOpen) > zoomThreshold) {
            control = {
              rotX: 0,
              rotY: 0,
              zoomDelta: -dOpen * 15,
            };
            info = dOpen > 0 ? '🔍 放大' : '🔍 缩小';
          }
        }
      }
    }
    
    lastPalmPos.current = palm;
    lastOpenness.current = openness;
    setGestureInfo(info);
    
    return control;
  }, []);

  const resetState = useCallback(() => {
    lastPalmPos.current = null;
    lastOpenness.current = null;
    swipeStartPos.current = null;
    swipeDirLocked.current = null;
    isReturning.current = false;
    setGestureInfo('等待手势...');
  }, []);

  const drawHand = useCallback((ctx: CanvasRenderingContext2D, hand: any[], w: number, h: number) => {
    const conns = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17]
    ];
    
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    for (const [i,j] of conns) {
      ctx.beginPath();
      ctx.moveTo((1-hand[i].x)*w, hand[i].y*h);
      ctx.lineTo((1-hand[j].x)*w, hand[j].y*h);
      ctx.stroke();
    }
    
    for (let i = 0; i < hand.length; i++) {
      const p = hand[i];
      ctx.fillStyle = [4,8,12,16,20].includes(i) ? '#f472b6' : '#22d3ee';
      ctx.beginPath();
      ctx.arc((1-p.x)*w, p.y*h, 3, 0, Math.PI*2);
      ctx.fill();
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      // 检查是否支持 getUserMedia
      if (!navigator.mediaDevices?.getUserMedia) {
        // 尝试旧版 API
        const getUserMedia = (navigator as any).getUserMedia || 
                            (navigator as any).webkitGetUserMedia || 
                            (navigator as any).mozGetUserMedia;
        if (!getUserMedia) {
          setError('浏览器不支持摄像头');
          return;
        }
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 320 }, 
            height: { ideal: 240 },
            facingMode: 'user'
          } 
        });
        
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        streamRef.current = stream;
        
        if (!videoRef.current || !canvasRef.current) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const handLandmarker = await createHandLandmarker();
        if (!mounted) {
          handLandmarker.close();
          return;
        }
        landmarkerRef.current = handLandmarker;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        canvas.width = 320;
        canvas.height = 240;

        const loop = () => {
          if (!mounted || !videoRef.current || !landmarkerRef.current) return;

          ctx.clearRect(0, 0, 320, 240);
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-320, 0);
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          ctx.restore();

          const result: HandLandmarkerResult = landmarkerRef.current.detectForVideo(
            videoRef.current, performance.now()
          );

          if (result.landmarks && result.landmarks.length > 0) {
            noHandFrames.current = 0;
            const hand = result.landmarks[0];
            drawHand(ctx, hand, 320, 240);
            const ctrl = processHand(hand);
            onControlChange?.(ctrl);
          } else {
            noHandFrames.current++;
            if (noHandFrames.current > 3) {
              onControlChange?.(null);
              resetState();
            }
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        setReady(true);
        loop();
      } catch (err: any) {
        console.error('Hand tracking error:', err);
        if (err.name === 'NotAllowedError') {
          setError('请允许摄像头权限');
        } else if (err.name === 'NotFoundError') {
          setError('未找到摄像头');
        } else {
          setError('无法访问摄像头');
        }
      }
    };

    setup();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [processHand, resetState, onControlChange, drawHand]);

  return (
    <div className="absolute bottom-4 right-4 w-72 bg-black/80 border border-cyan-700 rounded-lg overflow-hidden">
      <div className="text-xs text-cyan-400 font-mono px-2 py-1 border-b border-cyan-800 flex justify-between">
        <span>手势控制</span>
        <span className={ready ? 'text-green-400' : 'text-yellow-400'}>
          {ready ? '在线' : '初始化'}
        </span>
      </div>
      <div className="relative h-44">
        <canvas ref={canvasRef} className="w-full h-full" />
        <video ref={videoRef} className="hidden" playsInline muted />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 text-red-400 text-xs text-center px-4">
            {error}
          </div>
        )}
      </div>
      <div className="px-2 py-1 border-t border-cyan-800 text-center">
        <div className="text-sm text-cyan-300">{gestureInfo}</div>
        <div className="text-[10px] text-cyan-600 mt-0.5">
          挥动旋转 | 静止张合缩放
        </div>
      </div>
    </div>
  );
};

export default HandPanel;
