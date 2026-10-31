import React from 'react';
import { Fish, Anchor, Waves } from 'lucide-react';
import { FishingMethod } from '../types';

interface MaterialSpotMarkerProps {
  methods: FishingMethod[];
  isSelected?: boolean;
  isFavorited?: boolean;
}

/**
 * 모던 머티리얼 낚시 포인트 마커
 * - 이전 크기(32~36px)의 2/3 수준인 컴팩트 22~24px 사이즈
 * - 캐스팅 반원의 중심 좌표에 정밀 정렬
 * - 시인성이 뛰어난 모던 비비드 그라디언트 + 화이트 아웃라인
 * - 루어(Sky Fish), 원투(Amber Anchor), 찌낚시(Rose Waves), 복합(Indigo/Teal Fish)
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

  let ringColor = '#0284C7';
  let bgGradient = 'from-sky-500 to-blue-600';
  let primaryType: 'LURE' | 'FLOAT' | 'SURF' | 'COMBO' = 'LURE';

  if (methodCount >= 2) {
    primaryType = 'COMBO';
    ringColor = '#4F46E5';
    bgGradient = 'from-indigo-500 via-teal-500 to-cyan-500';
  } else if (hasFloat) {
    primaryType = 'FLOAT';
    ringColor = '#E11D48';
    bgGradient = 'from-rose-500 to-pink-600';
  } else if (hasSurf) {
    primaryType = 'SURF';
    ringColor = '#D97706';
    bgGradient = 'from-amber-500 to-orange-600';
  }

  return (
    <div className="relative flex items-center justify-center select-none pointer-events-auto">
      {/* 선택 시 외곽 펄스 파동 링 */}
      {isSelected && (
        <span
          className="absolute w-8 h-8 rounded-full animate-ping opacity-60"
          style={{ backgroundColor: ringColor }}
        />
      )}

      {/* 마커 본체: 2/3 축소 크기 (22px~24px), 모던 머티리얼 디자인 */}
      <div
        className={`relative flex items-center justify-center w-[22px] h-[22px] sm:w-[24px] sm:h-[24px] rounded-full bg-gradient-to-tr ${bgGradient} border-[1.5px] border-white shadow-md transition-all duration-200 ${
          isSelected
            ? 'scale-115 ring-2 ring-cyan-300 ring-offset-2 ring-offset-slate-900 shadow-cyan-500/60 shadow-lg'
            : 'hover:scale-110 shadow-black/50'
        }`}
        style={{
          boxShadow: isSelected
            ? `0 0 12px ${ringColor}, 0 2px 6px rgba(0,0,0,0.6)`
            : '0 2px 5px rgba(0,0,0,0.45)',
        }}
      >
        {primaryType === 'LURE' && (
          <Fish size={12} className="text-white" strokeWidth={2.4} />
        )}

        {primaryType === 'SURF' && (
          <Anchor size={11} className="text-white" strokeWidth={2.4} />
        )}

        {primaryType === 'FLOAT' && (
          <Waves size={11} className="text-white" strokeWidth={2.4} />
        )}

        {primaryType === 'COMBO' && (
          <Fish size={12} className="text-white" strokeWidth={2.4} />
        )}

        {/* 즐겨찾기(찜) 황금 스타 미니 배지 */}
        {isFavorited && (
          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border border-slate-900 flex items-center justify-center shadow">
            <svg viewBox="0 0 24 24" className="w-2 h-2 fill-slate-950 text-slate-950">
              <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
