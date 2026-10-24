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
  const [imageLoaded, setImageLoaded] = React.useState(false);

  React.useEffect(() => {
    // 이미지가 로드되거나, 또는 최대 1.5초 후 타이머 작동 시작 (네트워크 지연 방지)
    const startTimer = () => {
      const fadeTimer = setTimeout(() => {
        setIsFadingOut(true);
      }, Math.max(1000, durationMs - 400));

      const hideTimer = setTimeout(() => {
        setIsVisible(false);
        if (onFinish) onFinish();
      }, durationMs);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(hideTimer);
      };
    };

    if (imageLoaded) {
      return startTimer();
    } else {
      // 이미지가 너무 늦게 로드되더라도 3초 후에는 반드시 타이머 시작
      const fallbackTimer = setTimeout(() => {
        startTimer();
      }, 1000);
      return () => clearTimeout(fallbackTimer);
    }
  }, [imageLoaded, durationMs, onFinish]);

  if (!isVisible) return null;

  const bgUrl = `${import.meta.env.BASE_URL}splash-bg.jpg`;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between overflow-hidden select-none bg-slate-950 transition-opacity duration-400 ease-out ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* 1. PC 와이드 화면용 앰비언트 블러 배경 (전체 화면 가득 채움) */}
      <img
        src={bgUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover filter blur-2xl brightness-50 scale-110 pointer-events-none"
      />

      {/* 2. 메인 스플래시 아트워크 (모바일 & PC 반응형 고화질 렌더링) */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <img
          src={bgUrl}
          alt="떠난 물고기를 기리며..."
          onLoad={() => setImageLoaded(true)}
          className="w-full h-full sm:max-w-md sm:h-[90vh] sm:rounded-3xl sm:border sm:border-cyan-500/20 sm:shadow-[0_0_50px_rgba(6,182,212,0.25)] object-cover object-center filter brightness-95 transition-transform duration-1000 ease-out scale-100"
        />

        {/* 3. 모바일/PC 비네팅 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-transparent to-slate-950/85 pointer-events-none" />

        {/* 4. 상단 브랜드 헤더 */}
        <div
          className="absolute top-0 inset-x-0 z-10 flex flex-col items-center pt-8 sm:pt-14 px-6 text-center animate-fade-in"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}
        >
          <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-950/60 backdrop-blur-md border border-cyan-500/30 shadow-lg">
            <img
              src={`${import.meta.env.BASE_URL}user-icon.png`}
              alt="ExFish Logo"
              className="w-6 h-6 rounded-md object-contain"
            />
            <span className="text-xl sm:text-2xl font-black tracking-widest text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] font-sans">
              ExFish
            </span>
          </div>
        </div>

        {/* 5. 하단: 슬로건 "떠난 물고기를 기리며..." */}
        <div
          className="absolute bottom-0 inset-x-0 z-10 flex flex-col items-center pb-10 sm:pb-16 px-6 text-center animate-fade-in"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)' }}
        >
          <div className="px-6 py-2.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-cyan-400/40 shadow-2xl">
            <p className="text-sm sm:text-base font-bold tracking-wider text-cyan-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
              떠난 물고기를 기리며...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
