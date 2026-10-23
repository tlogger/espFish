import React from 'react';
import { FishingMethod } from '../types';

interface MaterialSpotMarkerProps {
  methods: FishingMethod[];
  isSelected?: boolean;
  isFavorited?: boolean;
}

/**
 * Material Design 낚시 포인트 커스텀 마커 핀
 * - 찌낚시(FLOAT: Rose), 루어낚시(LURE: Cyan), 원투낚시(SURF: Amber) 및 복합 조합 완벽 지원
 * - 이모지 대신 정밀한 머티리얼 벡터 SVG 심볼 및 듀얼톤 엘리베이션 배지 적용
 */
export const MaterialSpotMarker: React.FC<MaterialSpotMarkerProps> = ({
  methods = [],
  isSelected = false,
  isFavorited = false,
}) => {
  const hasLure = methods.includes('LURE');
  const hasFloat = methods.includes('FLOAT');
  const hasSurf = methods.includes('SURF');

  // 배경 그라데이션 및 테두리 컬러 결정
  let pinGradient = 'from-cyan-500 to-blue-600';
  let pinBorder = 'border-cyan-300';
  let primaryType: 'LURE' | 'FLOAT' | 'SURF' | 'COMBO' = 'LURE';

  const methodCount = (hasLure ? 1 : 0) + (hasFloat ? 1 : 0) + (hasSurf ? 1 : 0);

  if (methodCount >= 2) {
    primaryType = 'COMBO';
    if (hasLure && hasFloat && hasSurf) {
      pinGradient = 'from-cyan-500 via-amber-500 to-rose-500';
      pinBorder = 'border-white';
    } else if (hasLure && hasFloat) {
      pinGradient = 'from-cyan-500 to-rose-500';
      pinBorder = 'border-cyan-200';
    } else if (hasLure && hasSurf) {
      pinGradient = 'from-cyan-500 to-amber-500';
      pinBorder = 'border-amber-200';
    } else if (hasFloat && hasSurf) {
      pinGradient = 'from-rose-500 to-amber-500';
      pinBorder = 'border-rose-200';
    }
  } else if (hasFloat) {
    primaryType = 'FLOAT';
    pinGradient = 'from-rose-500 to-red-600';
    pinBorder = 'border-rose-300';
  } else if (hasSurf) {
    primaryType = 'SURF';
    pinGradient = 'from-amber-500 to-orange-600';
    pinBorder = 'border-amber-300';
  } else {
    primaryType = 'LURE';
    pinGradient = 'from-cyan-500 to-blue-600';
    pinBorder = 'border-cyan-300';
  }

  return (
    <div className="relative flex flex-col items-center group select-none pointer-events-auto">
      {/* 마커 본체 핀 */}
      <div
        className={`relative flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br ${pinGradient} shadow-2xl transition-all duration-200 ${
          isSelected
            ? 'scale-115 ring-4 ring-cyan-400 border-[2.5px] border-white shadow-cyan-500/40'
            : 'group-hover:scale-110 border-2 border-white/90 shadow-black/60'
        }`}
      >
        {/* 내부 화이트 원형 플레이트 (Material Elevation) */}
        <div className="w-7 h-7 rounded-full bg-slate-950/90 flex items-center justify-center shadow-inner">
          {primaryType === 'FLOAT' && (
            // 찌낚시: 구멍찌/막대찌 심볼 (레드/화이트 듀얼톤)
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="2" x2="12" y2="7" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
              <ellipse cx="12" cy="12" rx="4.5" ry="5.5" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1.2" />
              <path d="M7.5 12 Q12 14 16.5 12" stroke="#FFFFFF" strokeWidth="1.2" />
              <line x1="12" y1="17.5" x2="12" y2="22" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}

          {primaryType === 'SURF' && (
            // 원투낚시: 서프 봉돌/싱커 앵커 심볼 (골드/앰버 톤)
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none" stroke="currentColor">
              <circle cx="12" cy="5" r="2.5" stroke="#F59E0B" strokeWidth="2" />
              <path d="M12 7.5 L12 19" stroke="#F59E0B" strokeWidth="2" />
              <path d="M7 16 C9 19.5 15 19.5 17 16" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
              <polygon points="12,10 8,17 16,17" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="1" />
            </svg>
          )}

          {primaryType === 'LURE' && (
            // 루어낚시: 슬릭 미노우 / 지그헤드 바늘 심볼 (시안/일렉트릭 톤)
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none" stroke="currentColor">
              <path
                d="M4 12 C8 8 16 8 20 12 C16 16 8 16 4 12 Z"
                fill="#06B6D4"
                stroke="#FFFFFF"
                strokeWidth="1.2"
              />
              <circle cx="7" cy="11.5" r="1.5" fill="#FFFFFF" />
              <path d="M18 12 Q20 15 18 17 Q16 19 14 17" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}

          {primaryType === 'COMBO' && (
            // 2개 이상 복합 장르: Material 다중 장르 콤보 심볼
            <div className="flex items-center justify-center gap-0.5">
              {hasLure && <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-sm" title="루어" />}
              {hasFloat && <div className="w-2 h-2 rounded-full bg-rose-500 shadow-sm" title="찌낚시" />}
              {hasSurf && <div className="w-2 h-2 rounded-full bg-amber-400 shadow-sm" title="원투" />}
            </div>
          )}
        </div>

        {/* 찜(즐겨찾기) 황금 스타 배지 */}
        {isFavorited && (
          <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-400 border border-white flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-slate-950 text-slate-950">
              <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
            </svg>
          </div>
        )}
      </div>

      {/* 마커 하단 핀 침 (Needle Tip) */}
      <div
        className={`w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] mx-auto -mt-0.5 ${
          hasFloat && !hasLure && !hasSurf
            ? 'border-t-red-600'
            : hasSurf && !hasLure && !hasFloat
            ? 'border-t-orange-600'
            : hasLure && !hasFloat && !hasSurf
            ? 'border-t-blue-600'
            : 'border-t-purple-600'
        }`}
      />
    </div>
  );
};
