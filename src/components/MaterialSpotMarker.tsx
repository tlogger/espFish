import React from 'react';
import { FishingMethod } from '../types';

interface MaterialSpotMarkerProps {
  methods: FishingMethod[];
  isSelected?: boolean;
  isFavorited?: boolean;
}

/**
 * [공통 요구사항 4, 5] 프리미엄 머티리얼 낚시 포인트 마커
 * - 캐스팅 반원의 중심(점)과 100% 정밀 정렬되는 정중앙 조준형 디자인
 * - 루어(Cyan), 원투(Amber), 찌낚시(Rose), 복합 콤보(Gradient) 전용 모던 벡터 심볼
 */
export const MaterialSpotMarker: React.FC<MaterialSpotMarkerProps> = ({
  methods = [],
  isSelected = false,
  isFavorited = false,
}) => {
  const hasLure = methods.includes('LURE');
  const hasFloat = methods.includes('FLOAT');
  const hasSurf = methods.includes('SURF');

  const methodCount = (hasLure ? 1 : 0) + (hasFloat ? 1 : 0) + (hasSurf ? 1 : 0);

  // 장르별 테마 색상 및 스타일 매핑
  let ringColor = '#06B6D4'; // cyan-500
  let glowColor = 'rgba(6, 182, 212, 0.4)';
  let bgGradient = 'from-cyan-950 via-slate-900 to-cyan-900';
  let primaryType: 'LURE' | 'FLOAT' | 'SURF' | 'COMBO' = 'LURE';

  if (methodCount >= 2) {
    primaryType = 'COMBO';
    ringColor = '#38BDF8';
    glowColor = 'rgba(56, 189, 248, 0.45)';
    bgGradient = 'from-slate-950 via-slate-900 to-slate-950';
  } else if (hasFloat) {
    primaryType = 'FLOAT';
    ringColor = '#F43F5E'; // rose-500
    glowColor = 'rgba(244, 63, 94, 0.45)';
    bgGradient = 'from-rose-950 via-slate-900 to-rose-900';
  } else if (hasSurf) {
    primaryType = 'SURF';
    ringColor = '#F59E0B'; // amber-500
    glowColor = 'rgba(245, 158, 11, 0.45)';
    bgGradient = 'from-amber-950 via-slate-900 to-amber-900';
  }

  return (
    <div className="relative flex items-center justify-center select-none pointer-events-auto">
      {/* 선택 시 외곽 펄스 파동 링 (선택 집중 효과) */}
      {isSelected && (
        <span
          className="absolute w-12 h-12 rounded-full animate-ping opacity-60"
          style={{ backgroundColor: ringColor }}
        />
      )}

      {/* 마커 본체: 캐스팅 반원의 중심점에 완벽히 맞닿는 정밀 원형 배지 */}
      <div
        className={`relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br ${bgGradient} border-2 shadow-xl transition-all duration-200 ${
          isSelected
            ? 'scale-110 ring-4 ring-cyan-400/80 shadow-2xl'
            : 'hover:scale-105 shadow-black/80'
        }`}
        style={{
          borderColor: isSelected ? '#FFFFFF' : ringColor,
          boxShadow: `0 4px 14px -1px rgba(0, 0, 0, 0.7), 0 0 12px ${glowColor}`,
        }}
      >
        {/* 장르별 세련된 미니멀 벡터 그래픽 */}
        {primaryType === 'LURE' && (
          // 루어: 유선형 미노우 + 시안 일렉트릭 지그 바늘
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none" stroke="currentColor">
            <path
              d="M4 12 C7 8.5 15 8.5 19 12 C15 15.5 7 15.5 4 12 Z"
              fill="#06B6D4"
              fillOpacity="0.85"
              stroke="#E0F2FE"
              strokeWidth="1.2"
            />
            <circle cx="7.5" cy="11.5" r="1.2" fill="#FFFFFF" />
            <path
              d="M17 12 C18.5 14 17.5 16 15 16.5"
              stroke="#38BDF8"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        )}

        {primaryType === 'SURF' && (
          // 원투: 스파이크 싱커 / 롱캐스팅 피라미드 추 심볼
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none" stroke="currentColor">
            <polygon
              points="12,4 6,18 18,18"
              fill="#F59E0B"
              fillOpacity="0.8"
              stroke="#FEF3C7"
              strokeWidth="1.2"
            />
            <circle cx="12" cy="11" r="1.5" fill="#FFFFFF" />
            <line x1="12" y1="2" x2="12" y2="4" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
            <line x1="6" y1="18" x2="4" y2="21" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="18" y1="18" x2="20" y2="21" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        )}

        {primaryType === 'FLOAT' && (
          // 찌낚시: 슬림 구멍찌 + 케미 형광 발광 팁
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none" stroke="currentColor">
            {/* 상단 케미 발광부 */}
            <circle cx="12" cy="4" r="2" fill="#4ADE80" stroke="#FFFFFF" strokeWidth="0.8" />
            {/* 찌 상단 (레드/로즈) */}
            <path
              d="M8.5 10 C8.5 7 15.5 7 15.5 10 L14.5 14 L9.5 14 Z"
              fill="#F43F5E"
              stroke="#FFE4E6"
              strokeWidth="1.1"
            />
            {/* 찌 하단 (화이트/블랙 투톤) */}
            <path
              d="M9.5 14 L11 19 L13 19 L14.5 14 Z"
              fill="#FFFFFF"
              stroke="#94A3B8"
              strokeWidth="1"
            />
          </svg>
        )}

        {primaryType === 'COMBO' && (
          // 2개 이상 복합 장르: 3색 미니 닷 콤보
          <div className="flex items-center justify-center gap-0.5">
            {hasLure && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-sm" />}
            {hasFloat && <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-sm" />}
            {hasSurf && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-sm" />}
          </div>
        )}

        {/* 찜(즐겨찾기) 황금 스타 미니 배지 */}
        {isFavorited && (
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 border border-slate-950 flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-slate-950 text-slate-950">
              <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
            </svg>
          </div>
        )}

        {/* 정중앙 정밀 타깃 도트 (캐스팅 반원 중심과 1:1 일치 표식) */}
        <div className="absolute w-1 h-1 rounded-full bg-white opacity-80" />
      </div>
    </div>
  );
};
