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
        {/* [요구사항 3] 모바일app에서 스플래시 화면 가로를 약 5% 축소하여 그림의 숨겨진 부분이 더 보이도록 처리 */}
        <img
          src={bgUrl}
          alt="떠난 물고기를 기리며..."
          onLoad={() => setImageLoaded(true)}
          className="w-full h-full sm:max-w-md sm:h-[90vh] sm:rounded-3xl sm:border sm:border-cyan-500/20 sm:shadow-[0_0_50px_rgba(6,182,212,0.25)] object-cover object-center filter brightness-95 transition-transform duration-1000 ease-out scale-x-[0.95] sm:scale-x-100"
        />

        {/* 3. 모바일/PC 비네팅 오버레이 (상단은 투명하게 하여 배경이 비쳐보이게 처리) */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-slate-950/85 pointer-events-none" />

        {/* 4. 상단 브랜드 헤더 (아이콘 제거, 가로 화면폭의 70%에 맞춤) */}
        <div
          className="absolute top-0 inset-x-0 z-10 flex flex-col items-center pt-8 sm:pt-14 px-6 text-center animate-fade-in"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}
        >
          <div className="w-[70vw] max-w-sm flex items-center justify-center">
            <span
              className="text-5xl sm:text-6xl font-black tracking-widest font-sans inline-block transform scale-y-150 origin-center select-none w-full text-center"
              style={{
                WebkitTextStroke: '2.5px #000000',
                WebkitTextFillColor: 'transparent',
                color: 'transparent',
              }}
            >
              EXFISH
            </span>
          </div>
        </div>

        {/* 5. 하단: 슬로건 "떠난 물고기를 기리며..." ([요구사항 1] 백그라운드 제거) */}
        <div
          className="absolute bottom-0 inset-x-0 z-10 flex flex-col items-center pb-10 sm:pb-16 px-6 text-center animate-fade-in"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)' }}
        >
          <p className="text-sm sm:text-base font-bold tracking-wider text-cyan-200 drop-shadow-[0_2px_12px_rgba(0,0,0,0.98)] font-sans">
            떠난 물고기를 기리며...
          </p>
        </div>
      </div>
    </div>
  );
};
