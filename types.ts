export type LessonMode = 'free' | 'plate' | 'climate' | 'human';
export type ExplainLevel = 'simple' | 'detailed';

export interface GeoFact {
  title: string;
  content: string;
  coordinates?: { lat: number; lng: number };
  // 可选：记录产生这条情报时所处的课堂模式
  lessonMode?: LessonMode;
  // 可选：生成时间戳，用于课堂回放/学习记录
  timestamp?: string;
}

export enum AppState {
  LOADING = 'LOADING',
  READY = 'READY',
  ERROR = 'ERROR',
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface HoverData {
  coords: Coordinates;
  country?: string;
}

export interface Controls {
  isDragging: boolean;
}

export interface HandControl {
  rotX: number;
  rotY: number;
  zoomDelta?: number;
}


