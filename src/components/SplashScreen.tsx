import React from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  durationMs = 1500,
}) => {
  const [isFadingOut, setIsFadingOut] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    // 1.5초 기준: 약 1.15초에 부드러운 페이드아웃 시작
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, Math.max(800, durationMs - 350));

    // 1.5초 정각에 언마운트
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
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between overflow-hidden select-none transition-opacity duration-350 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* 1. 사용자가 제공한 갯바위 UFO 물고기 스플래시 배경 이미지 */}
      <img
        src={`${import.meta.env.BASE_URL}splash-bg.jpg`}
        alt="떠난 물고기를 기리며..."
        className="absolute inset-0 w-full h-full object-cover object-center filter brightness-95"
      />

      {/* 2. 감성적인 비네팅 & 은은한 앰비언트 오버레이 */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-transparent to-slate-950/80 pointer-events-none" />

      {/* 3. 상단 헤더: 깔끔한 브랜드 타이틀 */}
      <div
        className="relative z-10 w-full flex items-center justify-center pt-8 sm:pt-12 px-6 text-center animate-fade-in"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}
      >
        <span className="text-2xl sm:text-3xl font-black tracking-widest text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] font-sans">
          ExFish
        </span>
      </div>

      {/* 4. 하단: 사용자 요청 단 한 줄 슬로건 "떠난 물고기를 기리며..." */}
      <div
        className="relative z-10 w-full flex flex-col items-center pb-10 sm:pb-14 px-6 text-center animate-fade-in"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)' }}
      >
        <div className="px-5 py-2 rounded-full bg-slate-950/70 backdrop-blur-md border border-cyan-400/40 shadow-2xl">
          <p className="text-sm sm:text-base font-semibold tracking-wider text-cyan-200 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            떠난 물고기를 기리며...
          </p>
        </div>
      </div>
    </div>
  );
};
