import React from 'react';
import { Compass, Sparkles, ShieldAlert, Award } from 'lucide-react';

interface SplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  durationMs = 2200,
}) => {
  const [isFadingOut, setIsFadingOut] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    // 2초 후 부드러운 페이드아웃 시작
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, durationMs - 400);

    // 400ms 페이드아웃 후 완전히 언마운트
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      if (onFinish) onFinish();
    }, durationMs);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [durationMs, onFinish]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between p-6 bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950 text-white select-none transition-opacity duration-400 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
      }}
    >
      {/* 배경 은은한 빛 효과 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      {/* 1. 상단: 브랜드 로고 & 슬로건 */}
      <div className="flex flex-col items-center text-center mt-6 relative z-10 animate-fade-in">
        {/* 심볼 아이콘 */}
        <div className="relative mb-3">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-500 p-0.5 shadow-2xl shadow-cyan-500/30">
            <div className="w-full h-full bg-slate-950/90 rounded-[22px] flex items-center justify-center backdrop-blur">
              <svg viewBox="0 0 100 100" className="w-14 h-14 sm:w-16 sm:h-16 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)]">
                <defs>
                  <linearGradient id="splashFish" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="50%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
                <path
                  d="M 50 15 C 28 15 15 32 15 50 C 15 68 28 85 50 85 C 68 85 82 72 88 56 C 76 60 65 52 65 40 C 65 28 76 20 88 24 C 82 18 68 15 50 15 Z"
                  fill="url(#splashFish)"
                />
                <circle cx="36" cy="38" r="4.5" fill="#ffffff" />
                <circle cx="37" cy="38" r="2.2" fill="#0f172a" />
                <path d="M 68 36 Q 74 44 86 42 Q 76 54 68 62" fill="none" stroke="#e0f2fe" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center text-[10px] font-black text-slate-950 shadow-md">
            ★
          </div>
        </div>

        {/* 타이틀 */}
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent drop-shadow-sm">
          ExFish
        </h1>

        {/* 사용자 지정 감성 슬로건 */}
        <p className="text-xs sm:text-sm font-semibold text-cyan-300/90 mt-1.5 italic tracking-wide">
          "ex-gf, ex-wife, and ex-fish."
        </p>
        <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
          떠나버린 물고기를 기리며...
        </p>
      </div>

      {/* 2. 중앙: 초보자를 위한 4대 핵심 가치 배지 카드 */}
      <div className="w-full max-w-xs relative z-10 my-auto py-2">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30 backdrop-blur-md shadow-2xl space-y-2.5">
          <div className="flex items-center gap-2.5 text-xs">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0 border border-cyan-500/40">
              <Compass size={16} />
            </div>
            <div>
              <div className="font-bold text-white">어디로 던질까?</div>
              <div className="text-[10px] text-slate-400">바람·비거리 부채꼴 자동 안내</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-500/40">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="font-bold text-white">언제 입질이 올까?</div>
              <div className="text-[10px] text-slate-400">쉬운 입질 점수 & 황금 피딩 타임</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/40">
              <Award size={16} />
            </div>
            <div>
              <div className="font-bold text-white">오늘 왜 꽝 쳤을까?</div>
              <div className="text-[10px] text-slate-400">바람·수온·조류 1초 복기 박제</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 text-xs">
            <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0 border border-rose-500/40">
              <ShieldAlert size={16} />
            </div>
            <div>
              <div className="font-bold text-white">바닷물 차오름 경보</div>
              <div className="text-[10px] text-slate-400">갯바위 들물 고립 방지 안전 알림</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 하단: 로딩 인디케이터 & 시작 안내 */}
      <div className="flex flex-col items-center relative z-10 mb-2">
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-[11px] font-medium text-cyan-200">
            실시간 해양 기상 및 포인트 로딩 중...
          </span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          v4.0 · Pro Marine Intelligence
        </div>
      </div>
    </div>
  );
};
