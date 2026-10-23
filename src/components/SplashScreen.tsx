import React from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  durationMs = 2000,
}) => {
  const [isFadingOut, setIsFadingOut] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    // 2초 후 부드러운 페이드아웃 시작
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, durationMs - 400);

    // 400ms 페이드아웃 완료 후 언마운트
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
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between overflow-hidden select-none transition-opacity duration-400 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* 1. AI 생성 시네마틱 감성 배경 이미지 */}
      <img
        src={`${import.meta.env.BASE_URL}splash-bg.jpg`}
        alt="떠난 물고기를 기리며..."
        className="absolute inset-0 w-full h-full object-cover object-center scale-105 filter brightness-95"
      />

      {/* 2. 감성적인 비네팅 & 앰비언트 그라데이션 오버레이 */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-transparent to-slate-950/85 pointer-events-none" />

      {/* 3. 상단 헤더: 브랜드 로고 */}
      <div
        className="relative z-10 w-full flex items-center justify-center pt-10 sm:pt-14 px-6 text-center animate-fade-in"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)' }}
      >
        <span className="text-3xl sm:text-4xl font-black tracking-wider text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] font-sans">
          ExFish
        </span>
      </div>

      {/* 4. 하단: 사용자 요청 단 한 줄 슬로건 "떠난 물고기를 기리며..." */}
      <div
        className="relative z-10 w-full flex flex-col items-center pb-12 sm:pb-16 px-6 text-center animate-fade-in"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 3rem)' }}
      >
        <div className="px-5 py-2.5 rounded-full bg-slate-950/60 backdrop-blur-md border border-cyan-400/30 shadow-2xl">
          <p className="text-sm sm:text-base font-medium tracking-widest text-cyan-200 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
            떠난 물고기를 기리며...
          </p>
        </div>
      </div>
    </div>
  );
};
