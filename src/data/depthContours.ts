// ExFish KHOA 국가해양격자 기반 연안 수심 등심선 (Bathymetric Contours) 데이터
// 5m (여밭/암초대), 10m (주요 브레이크라인), 20m (본류대 갯골), 50m (외해 심해선)

import type { SpotType } from '../types';

export interface DepthContourLine {
  id: string;
  depthMeters: number; // -5, -10, -20, -50
  color: string;
  name: string;
  region: 'WEST' | 'SOUTH' | 'EAST' | 'JEJU';
  path: { lat: number; lng: number }[];
  labelPos: { lat: number; lng: number };
}

// 대한민국 주요 연안 4대 권역 벡터 수심 등심선 데이터셋
export const KOREA_DEPTH_CONTOURS: DepthContourLine[] = [
  // --- [서해안권: 시화·화성·태안·보령·군산] ---
  {
    id: 'west-5m-incheon',
    depthMeters: 5,
    color: '#38bdf8', // 하늘색 (5m)
    name: '서해 영흥·시화 5m 등심선',
    region: 'WEST',
    labelPos: { lat: 37.265, lng: 126.475 },
    path: [
      { lat: 37.385, lng: 126.545 },
      { lat: 37.315, lng: 126.512 },
      { lat: 37.255, lng: 126.465 },
      { lat: 37.195, lng: 126.442 },
      { lat: 37.125, lng: 126.415 },
    ],
  },
  {
    id: 'west-10m-incheon',
    depthMeters: 10,
    color: '#2563eb', // 파란색 (10m)
    name: '서해 10m 주공략 브레이크라인',
    region: 'WEST',
    labelPos: { lat: 37.258, lng: 126.425 },
    path: [
      { lat: 37.412, lng: 126.485 },
      { lat: 37.332, lng: 126.452 },
      { lat: 37.262, lng: 126.415 },
      { lat: 37.185, lng: 126.385 },
      { lat: 37.102, lng: 126.352 },
    ],
  },
  {
    id: 'west-20m-incheon',
    depthMeters: 20,
    color: '#4f46e5', // 인디고 (20m 갯골)
    name: '서해 20m 본류대 갯골 수심선',
    region: 'WEST',
    labelPos: { lat: 37.245, lng: 126.345 },
    path: [
      { lat: 37.435, lng: 126.395 },
      { lat: 37.345, lng: 126.372 },
      { lat: 37.252, lng: 126.335 },
      { lat: 37.165, lng: 126.305 },
      { lat: 37.085, lng: 126.265 },
    ],
  },
  // 태안/안흥 연안
  {
    id: 'west-5m-taean',
    depthMeters: 5,
    color: '#38bdf8',
    name: '태안 안흥 5m 여밭선',
    region: 'WEST',
    labelPos: { lat: 36.685, lng: 126.115 },
    path: [
      { lat: 36.782, lng: 126.152 },
      { lat: 36.715, lng: 126.125 },
      { lat: 36.662, lng: 126.105 },
      { lat: 36.592, lng: 126.142 },
      { lat: 36.525, lng: 126.175 },
    ],
  },
  {
    id: 'west-15m-taean',
    depthMeters: 15,
    color: '#2563eb',
    name: '태안 15m 어도선',
    region: 'WEST',
    labelPos: { lat: 36.672, lng: 126.065 },
    path: [
      { lat: 36.812, lng: 126.095 },
      { lat: 36.735, lng: 126.072 },
      { lat: 36.665, lng: 126.052 },
      { lat: 36.582, lng: 126.085 },
      { lat: 36.505, lng: 126.115 },
    ],
  },

  // --- [남해안권: 여수·통영·거제·남해] ---
  {
    id: 'south-10m-yeosu',
    depthMeters: 10,
    color: '#2563eb',
    name: '여수 연안 10m 등심선',
    region: 'SOUTH',
    labelPos: { lat: 34.732, lng: 127.785 },
    path: [
      { lat: 34.815, lng: 127.732 },
      { lat: 34.752, lng: 127.775 },
      { lat: 34.695, lng: 127.812 },
      { lat: 34.632, lng: 127.795 },
    ],
  },
  {
    id: 'south-25m-yeosu',
    depthMeters: 25,
    color: '#4f46e5',
    name: '여수 돌산 25m 물골선',
    region: 'SOUTH',
    labelPos: { lat: 34.665, lng: 127.855 },
    path: [
      { lat: 34.792, lng: 127.825 },
      { lat: 34.722, lng: 127.852 },
      { lat: 34.645, lng: 127.875 },
      { lat: 34.572, lng: 127.835 },
    ],
  },
  {
    id: 'south-10m-tongyeong',
    depthMeters: 10,
    color: '#2563eb',
    name: '통영 산양 10m 브레이크라인',
    region: 'SOUTH',
    labelPos: { lat: 34.805, lng: 128.415 },
    path: [
      { lat: 34.872, lng: 128.375 },
      { lat: 34.821, lng: 128.405 },
      { lat: 34.775, lng: 128.442 },
      { lat: 34.712, lng: 128.485 },
    ],
  },
  {
    id: 'south-30m-tongyeong',
    depthMeters: 30,
    color: '#7c3aed', // 보라색 (30m+)
    name: '통영 외해 30m 회유로',
    region: 'SOUTH',
    labelPos: { lat: 34.732, lng: 128.495 },
    path: [
      { lat: 34.842, lng: 128.455 },
      { lat: 34.785, lng: 128.482 },
      { lat: 34.715, lng: 128.525 },
      { lat: 34.645, lng: 128.562 },
    ],
  },

  // --- [동해안권: 포항·영덕·울산] ---
  {
    id: 'east-10m-pohang',
    depthMeters: 10,
    color: '#2563eb',
    name: '포항 영일만 10m 등심선',
    region: 'EAST',
    labelPos: { lat: 36.055, lng: 129.415 },
    path: [
      { lat: 36.182, lng: 129.395 },
      { lat: 36.115, lng: 129.412 },
      { lat: 36.042, lng: 129.425 },
      { lat: 35.965, lng: 129.462 },
    ],
  },
  {
    id: 'east-30m-pohang',
    depthMeters: 30,
    color: '#7c3aed',
    name: '동해 30m 급심 절벽선',
    region: 'EAST',
    labelPos: { lat: 36.065, lng: 129.475 },
    path: [
      { lat: 36.195, lng: 129.445 },
      { lat: 36.125, lng: 129.465 },
      { lat: 36.052, lng: 129.485 },
      { lat: 35.972, lng: 129.512 },
    ],
  },

  // --- [제주도권] ---
  {
    id: 'jeju-10m-north',
    depthMeters: 10,
    color: '#2563eb',
    name: '제주 북부 10m 먹이자생지',
    region: 'JEJU',
    labelPos: { lat: 33.535, lng: 126.565 },
    path: [
      { lat: 33.515, lng: 126.465 },
      { lat: 33.532, lng: 126.552 },
      { lat: 33.545, lng: 126.655 },
      { lat: 33.525, lng: 126.765 },
    ],
  },
  {
    id: 'jeju-20m-south',
    depthMeters: 20,
    color: '#4f46e5',
    name: '서귀포 20m 벵에돔 서식대',
    region: 'JEJU',
    labelPos: { lat: 33.225, lng: 126.585 },
    path: [
      { lat: 33.235, lng: 126.455 },
      { lat: 33.222, lng: 126.572 },
      { lat: 33.215, lng: 126.685 },
    ],
  },
];

/**
 * 특정 캐스팅 착수 지점(lat, lng)의 지형적 예상 수심(미터) 선형 추정
 */
export function estimateDepthAtPoint(
  spotLat: number,
  spotLng: number,
  targetLat: number,
  targetLng: number,
  spotType: SpotType = 'ROCK'
): number {
  // 발판(포인트)으로부터 캐스팅 착수점까지의 거리(m)
  const distMeters = Math.hypot((targetLat - spotLat) * 111000, (targetLng - spotLng) * 88800);

  // 지형별 수심 경사도 모델 (Slope Gradient)
  let baseDepth = 2.5; // 발밑 수심
  let slope = 0.08; // 10m당 0.8m 깊어짐

  if (spotType === 'ROCK') {
    baseDepth = 3.5;
    slope = 0.12; // 갯바위는 급심 (10m당 1.2m)
  } else if (spotType === 'SEAWALL') {
    baseDepth = 3.0;
    slope = 0.10; // 석축 경사면
  } else if (spotType === 'BREAKWATER') {
    baseDepth = 4.0;
    slope = 0.09; // 방파제 테트라포드 외항
  } else if (spotType === 'BEACH') {
    baseDepth = 1.0;
    slope = 0.04; // 백사장은 완경사 (10m당 0.4m)
  } else if (spotType === 'PIER') {
    baseDepth = 3.0;
    slope = 0.05;
  }

  // 동해안 및 제주는 기본 수심 1.5배 가산
  if (spotLng > 129.0 || spotLat < 33.8) {
    slope *= 1.4;
    baseDepth += 1.5;
  }

  const estimated = baseDepth + distMeters * slope;
  return Math.round(Math.min(45, Math.max(1.5, estimated)) * 10) / 10;
}
