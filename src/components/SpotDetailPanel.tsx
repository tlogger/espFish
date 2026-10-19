import React from 'react';
import {
  ChevronDown,
  Compass,
  Edit,
  ExternalLink,
  Fish,
  MapPin,
  Navigation,
  PlusCircle,
  Share2,
  Thermometer,
  Trash2,
  Waves,
  Wind
} from 'lucide-react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  BiteScoreBreakdown,
  CatchLog,
  CurrentUnit,
  FishingSpot,
  MarineData,
  TideDayInfo,
  WeatherData,
  WindUnit
} from '../types';
import { formatCurrentVelocity, formatWindSpeed, getCompassDirection, getWindyWebUrl } from '../utils/weatherApi';

interface SpotDetailPanelProps {
  spot: FishingSpot;
  weather: WeatherData | null;
  marine: MarineData | null;
  tide: TideDayInfo | null;
  biteScore: BiteScoreBreakdown | null;
  catchLogs: CatchLog[];
  windUnit: WindUnit;
  currentUnit: CurrentUnit;
  onOpenCatchLogModal: () => void;
  onEditLog: (log: CatchLog) => void;
  onDeleteLog: (logId: string) => void;
  onEditSpot: (spot: FishingSpot) => void;
  onDeleteSpot: (spotId: string) => void;
  onClose: () => void;
  onMinimize?: () => void;
}

export const SpotDetailPanel: React.FC<SpotDetailPanelProps> = ({
  spot,
  weather,
  marine,
  tide,
  biteScore,
  catchLogs,
  windUnit,
  currentUnit,
  onOpenCatchLogModal,
  onEditLog,
  onDeleteLog,
  onEditSpot,
  onDeleteSpot,
  onClose,
  onMinimize,
}) => {
  const [activeTab, setActiveTab] = React.useState<'CONDITIONS' | 'TIDE' | 'LOGS' | 'DIRECTIONS'>('CONDITIONS');
  const [activePhotoIndex, setActivePhotoIndex] = React.useState(0);

  const windyUrl = getWindyWebUrl(spot.lat, spot.lng);

  // 네비 목적지 명칭: 사용자가 지정한 navi_name이 있으면 그것을 우선 사용, 없으면 spot.name
  const destinationName = spot.navi_name && spot.navi_name.trim().length > 0 ? spot.navi_name.trim() : spot.name;

  // 카카오맵 길찾기 URL (커스텀 navi_url이 있으면 우선 사용)
  const kakaoNaviUrl = spot.navi_url && spot.navi_url.trim().length > 0
    ? spot.navi_url
    : `https://map.kakao.com/link/to/${encodeURIComponent(destinationName)},${spot.lat},${spot.lng}`;

  // 네이버 지도 길찾기 URL (네이버 지도 공식 웹 URL 규격: lat,lng,title)
  const naverNaviUrl = `https://map.naver.com/v5/search/${encodeURIComponent(destinationName)}?c=${spot.lng},${spot.lat},15,0,0,0,dh`;

  // 현재 시각 (HH:00) 기준 곡선 상의 최근접 시간대 찾기
  const now = new Date();
  const currentHour = now.getHours();
  const currentHourStr = `${currentHour < 10 ? '0' : ''}${currentHour}:00`;
  const currentTidePoint = tide?.hourlyCurve.find((c) => c.hour === currentHour);

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 text-white overflow-hidden shadow-2xl">
      {/* 헤더 및 포인트 사진 슬라이드 */}
      <div className="relative h-48 sm:h-56 shrink-0 bg-slate-950 overflow-hidden">
        {spot.photo_urls && spot.photo_urls.length > 0 ? (
          <img
            src={spot.photo_urls[activePhotoIndex] || spot.photo_urls[0]}
            alt={spot.name}
            className="w-full h-full object-cover opacity-85 transition-opacity duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">
            사진 없음
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />

        {/* 상단 액션 버튼 그룹 (수정, 삭제, 닫기 및 모바일 지도보기) */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="px-2.5 py-1 rounded-full bg-cyan-600/90 hover:bg-cyan-500 text-white flex items-center gap-1 text-xs font-bold transition shadow md:hidden"
              title="지도 보기 (창 접기)"
            >
              <span>지도보기</span>
              <ChevronDown size={14} />
            </button>
          )}
          <button
            onClick={() => onEditSpot(spot)}
            className="p-1.5 rounded-full bg-black/60 text-slate-200 hover:text-cyan-400 hover:bg-black/90 transition shadow"
            title="포인트 수정"
          >
            <Edit size={16} />
          </button>
          <button
            onClick={() => {
              if (window.confirm(`'${spot.name}' 포인트를 정말 삭제하시겠습니까?`)) {
                onDeleteSpot(spot.id);
              }
            }}
            className="p-1.5 rounded-full bg-black/60 text-slate-200 hover:text-rose-400 hover:bg-black/90 transition shadow"
            title="포인트 삭제"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/90 transition shadow"
            title="닫기"
          >
            ✕
          </button>
        </div>

        {/* 복수 사진 썸네일 인디케이터 */}
        {spot.photo_urls && spot.photo_urls.length > 1 && (
          <div className="absolute bottom-3 right-3 z-10 flex gap-1.5 bg-black/50 p-1 rounded-full backdrop-blur-sm">
            {spot.photo_urls.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActivePhotoIndex(idx)}
                className={`w-2 h-2 rounded-full transition-all ${
                  idx === activePhotoIndex ? 'bg-cyan-400 w-4' : 'bg-white/50'
                }`}
              />
            ))}
          </div>
        )}

        {/* 포인트명 및 메타데이터 오버레이 */}
        <div className="absolute bottom-3 left-4 right-20 z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/80 text-white backdrop-blur-sm">
              {spot.spot_type === 'ROCK' ? '갯바위' : spot.spot_type === 'BREAKWATER' ? '방파제/석축' : '해변/선착장'}
            </span>
            <span className="text-xs text-slate-300">작성자: {spot.author_name}</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold truncate drop-shadow-md text-white">{spot.name}</h1>
          {spot.navi_name && (
            <div className="text-[11px] text-amber-300 truncate">
              📍 네비 목적지: {spot.navi_name}
            </div>
          )}
        </div>
      </div>

      {/* Esper AI 입질 지수 & 안전 상태 브리핑 바 */}
      {biteScore && (
        <div className="px-4 py-2.5 bg-gradient-to-r from-cyan-950/70 via-slate-900 to-blue-950/70 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-extrabold shadow-md shadow-cyan-500/30">
              <span className="text-xs leading-none opacity-80">Esper</span>
              <span className="text-base leading-none">{biteScore.totalScore}</span>
            </div>
            <div>
              <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                <span>입질 종합 지수: {biteScore.totalScore}점</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] ${
                    biteScore.windRelation.includes('최적')
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : biteScore.windRelation.includes('주의')
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {biteScore.windRelation}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 line-clamp-1">{biteScore.verdict}</p>
            </div>
          </div>
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: `EsperFish - ${spot.name}`,
                  text: `현재 입질 지수 ${biteScore.totalScore}점! ${biteScore.verdict}`,
                  url: window.location.href,
                }).catch(() => {});
              } else {
                navigator.clipboard.writeText(window.location.href);
                alert('포인트 링크가 클립보드에 복사되었습니다.');
              }
            }}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="포인트 공유"
          >
            <Share2 size={16} />
          </button>
        </div>
      )}

      {/* 내비게이션 & 빠른 액션 바 */}
      <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-slate-400">
          <MapPin size={13} className="text-cyan-400" />
          <span>
            {spot.lat.toFixed(4)}, {spot.lng.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={kakaoNaviUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition font-medium"
          >
            <Navigation size={12} />
            <span>카카오길찾기</span>
          </a>
          <a
            href={naverNaviUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 transition font-medium"
          >
            <Navigation size={12} />
            <span>네이버지도</span>
          </a>
          <a
            href={windyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition font-semibold"
          >
            <span>Windy 정밀예보</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {/* 서브 탭 바 */}
      <div className="flex border-b border-slate-800 bg-slate-900/90 text-xs font-semibold shrink-0">
        <button
          onClick={() => setActiveTab('CONDITIONS')}
          className={`flex-1 py-2.5 text-center transition border-b-2 ${
            activeTab === 'CONDITIONS'
              ? 'border-cyan-400 text-cyan-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          기상 & 해양
        </button>
        <button
          onClick={() => setActiveTab('TIDE')}
          className={`flex-1 py-2.5 text-center transition border-b-2 ${
            activeTab === 'TIDE'
              ? 'border-cyan-400 text-cyan-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          물때 & 일출일몰
        </button>
        <button
          onClick={() => setActiveTab('LOGS')}
          className={`flex-1 py-2.5 text-center transition border-b-2 ${
            activeTab === 'LOGS'
              ? 'border-cyan-400 text-cyan-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          조과 기록 ({catchLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('DIRECTIONS')}
          className={`flex-1 py-2.5 text-center transition border-b-2 ${
            activeTab === 'DIRECTIONS'
              ? 'border-cyan-400 text-cyan-400 bg-slate-800/40'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          진입로 & 공략
        </button>
      </div>

      {/* 탭 본문 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'CONDITIONS' && (
          <div className="space-y-4">
            {/* 4대 실시간 해양·기상 카드 그리드 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {/* 바람 위젯 */}
              <div className="p-3 bg-slate-800/70 border border-slate-700/60 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span className="flex items-center gap-1">
                    <Wind size={14} className="text-cyan-400" /> 풍향 · 풍속
                  </span>
                  <span className="text-[11px] font-mono">{weather?.windDirection}°</span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="text-lg font-bold text-cyan-300">
                    {weather ? formatWindSpeed(weather.windSpeed, windUnit) : '--'}
                  </div>
                  <div className="text-xs text-slate-300">
                    {weather ? getCompassDirection(weather.windDirection) : '--'}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-700/50">
                  <span>돌풍:</span>
                  <span className="text-amber-400 font-medium">
                    {weather ? formatWindSpeed(weather.windGust, windUnit) : '--'}
                  </span>
                </div>
              </div>

              {/* 수온 및 체감온도/습도 위젯 */}
              <div className="p-3 bg-slate-800/70 border border-slate-700/60 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span className="flex items-center gap-1">
                    <Thermometer size={14} className="text-rose-400" /> 표층 수온 (SST)
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="text-lg font-bold text-rose-300">
                    {marine ? `${marine.seaSurfaceTemp}°C` : '--'}
                  </div>
                  <span className="text-xs text-slate-300">
                    기온 {weather ? `${weather.temp}°C` : '--'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex justify-between pt-1 border-t border-slate-700/50">
                  <span>체감온도:</span>
                  <span className="text-slate-200 font-medium">
                    {weather ? `${weather.apparentTemp}°C (습도 ${weather.humidity}%)` : '--'}
                  </span>
                </div>
              </div>

              {/* 조류 방향 / 유속 위젯 */}
              <div className="p-3 bg-slate-800/70 border border-slate-700/60 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span className="flex items-center gap-1">
                    <Compass size={14} className="text-emerald-400" /> 조류 / 해류
                  </span>
                  <span className="text-[11px] font-mono">{marine?.currentDirection}°</span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="text-lg font-bold text-emerald-300">
                    {marine ? formatCurrentVelocity(marine.currentVelocity, currentUnit) : '--'}
                  </div>
                  <div className="text-xs text-slate-300">
                    {marine ? getCompassDirection(marine.currentDirection) : '--'}
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-700/50">
                  <span>들물·썰물 유속 흐름</span>
                </div>
              </div>

              {/* 파고 / 파향 위젯 */}
              <div className="p-3 bg-slate-800/70 border border-slate-700/60 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span className="flex items-center gap-1">
                    <Waves size={14} className="text-blue-400" /> 파고 · 파주기
                  </span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="text-lg font-bold text-blue-300">
                    {marine ? `${marine.waveHeight} m` : '--'}
                  </div>
                  <span className="text-xs text-slate-300">
                    {marine ? `${marine.wavePeriod}초 주기` : '--'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-700/50">
                  <span>날씨: {weather?.weatherText}</span>
                </div>
              </div>
            </div>

            {/* Windy.com 웹 실시간 레이어 임베드 및 안내 */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                  🌀 Windy 실시간 바람/파도 레이어
                </span>
                <a
                  href={windyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  새 창으로 열기 <ExternalLink size={11} />
                </a>
              </div>
              <p className="text-[11px] text-slate-400">
                위경도({spot.lat.toFixed(3)}, {spot.lng.toFixed(3)}) 지점의 바람 입자 및 ECMWF/GFS 기상 예측 화면:
              </p>
              <div className="relative w-full h-44 rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
                <iframe
                  title="Windy Map"
                  src={`https://embed.windy.com/embed2.html?lat=${spot.lat}&lon=${spot.lng}&detailLat=${spot.lat}&detailLon=${spot.lng}&width=400&height=200&zoom=11&level=surface&overlay=wind&product=ecmwf&menu=&message=&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=m%2Fs&metricTemp=%C2%B0C&radarRange=-1`}
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'TIDE' && tide && (
          <div className="space-y-4">
            {/* 오늘 물때 & 일출일몰 요약 카드 */}
            <div className="p-4 bg-gradient-to-r from-blue-950/60 to-slate-900 border border-blue-900/60 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-blue-300 font-semibold">{tide.lunarDateStr}</span>
                  <div className="text-xl font-bold text-white flex items-center gap-2">
                    <span>{tide.mulText}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-600/40 text-cyan-300 border border-cyan-500/40">
                      8물제 표준
                    </span>
                  </div>
                </div>
                <div className="text-right text-xs space-y-1">
                  <div className="text-amber-300 font-bold">🌅 일출 {tide.sunrise} (해창)</div>
                  <div className="text-indigo-300 font-bold">🌇 일몰 {tide.sunset} (피딩)</div>
                </div>
              </div>

              {/* 현재 시각 조위 강조 표시 */}
              {currentTidePoint && (
                <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-700/60 flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-300">
                    ⏱️ 현재 시각 ({currentHourStr}) 실시간 조위:
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-extrabold text-white font-mono">
                      {currentTidePoint.height} cm
                    </span>
                    <span className="text-[11px] text-cyan-200">({currentTidePoint.stateText})</span>
                  </div>
                </div>
              )}

              {/* 3일간 (오늘, 내일, 모레) 만조/간조 및 일출/일몰 요약 카드 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-800">
                {tide.threeDays ? (
                  tide.threeDays.map((daySummary, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border space-y-1.5 ${
                        idx === 0
                          ? 'bg-slate-900/90 border-cyan-500/50 ring-1 ring-cyan-500/30'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="font-bold text-slate-100 flex items-center gap-1">
                          <span className={idx === 0 ? 'text-cyan-400 font-extrabold' : 'text-slate-300'}>
                            {daySummary.dayLabel}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({daySummary.dateStr.split(' ')[0]})
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                          {daySummary.mulText}
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 flex justify-between">
                        <span className="text-amber-300">🌅 {daySummary.sunrise}</span>
                        <span className="text-indigo-300">🌇 {daySummary.sunset}</span>
                      </div>

                      <div className="pt-1 border-t border-slate-800/80 space-y-1 text-[11px]">
                        <div>
                          <div className="text-[10px] text-rose-400 font-semibold mb-0.5">고조 (만조)</div>
                          {daySummary.highTides.map((h, i) => (
                            <div key={i} className="flex justify-between text-slate-300 text-[10px]">
                              <span>{h.time}</span>
                              <span className="font-mono text-rose-300 font-bold">{h.height}cm</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="text-[10px] text-blue-400 font-semibold mb-0.5">저조 (간조)</div>
                          {daySummary.lowTides.map((l, i) => (
                            <div key={i} className="flex justify-between text-slate-300 text-[10px]">
                              <span>{l.time}</span>
                              <span className="font-mono text-blue-300 font-bold">{l.height}cm</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 text-slate-400">물때 요약 계산 중...</div>
                )}
              </div>
            </div>

            {/* 72시간 연속 조석 곡선 & 가로 스크롤 차트 */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-200">
                  🌊 72시간 연속 조위 변화 (오늘 0시 기준 3일간)
                </span>
                <span className="text-[10px] text-cyan-400 font-medium">
                  ← 좌우로 스크롤하여 탐색 →
                </span>
              </div>

              {/* 가로 스크롤 래퍼 (최소 너비 1300px로 72시간 정밀 시각화) */}
              <div className="overflow-x-auto w-full pb-2 scrollbar-thin scrollbar-thumb-slate-700">
                <div className="h-52 w-[1300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={tide.hourly72Curve || tide.hourlyCurve}
                      margin={{ top: 15, right: 20, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.6} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="timeStr"
                        stroke="#64748b"
                        fontSize={10}
                        tickLine={false}
                        interval={3}
                      />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} unit="cm" />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs shadow-xl">
                                <div className="font-bold text-cyan-300">
                                  {data.dayLabel && <span className="mr-1 text-slate-400">[{data.dayLabel}]</span>}
                                  {data.timeStr}
                                </div>
                                <div className="text-slate-100 font-mono">
                                  조위: <strong className="text-white">{data.height} cm</strong>
                                </div>
                                <div className="text-slate-400">{data.stateText}</div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />

                      {/* 현재 시각 세로선 표시 */}
                      <ReferenceLine
                        x={
                          tide.hourly72Curve
                            ? tide.hourly72Curve.find((c) => c.hour === currentHour)?.timeStr
                            : currentHourStr
                        }
                        stroke="#22d3ee"
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        label={{
                          value: `현재 (${currentTidePoint?.height ?? ''}cm)`,
                          position: 'top',
                          fill: '#22d3ee',
                          fontSize: 10,
                          fontWeight: 'bold',
                        }}
                      />

                      <Area
                        type="monotone"
                        dataKey="height"
                        stroke="#22d3ee"
                        strokeWidth={2.5}
                        fillOpacity={1}
                        fill="url(#tideGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                💡 <strong>골든타임 공략</strong>: 점선(현재 시각 조위) 위치와 고조(만조) 시각 사이의 중들물 구간, 그리고 일출(해창)/일몰(피딩) 타임이 겹치는 시점이 최고의 입질 찬스입니다.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'LOGS' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-300">
                이 포인트의 실측 조과 히스토리 ({catchLogs.length}건)
              </span>
              <button
                onClick={onOpenCatchLogModal}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20"
              >
                <PlusCircle size={14} />
                <span>조과 등록</span>
              </button>
            </div>

            {catchLogs.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400 space-y-2">
                <Fish size={32} className="mx-auto text-slate-600" />
                <p className="text-sm">아직 등록된 조과 기록이 없습니다.</p>
                <p className="text-xs text-slate-500">
                  첫 손맛의 짜릿한 순간과 당시 환경을 기록해 보세요!
                </p>
              </div>
            ) : (
              catchLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-850/80 border border-slate-800 rounded-xl space-y-2 text-xs"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-emerald-400">
                        {log.fish_species}
                      </span>
                      {log.fish_size_cm && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-bold">
                          {log.fish_size_cm} cm
                        </span>
                      )}
                      <span className="text-slate-300">({log.fish_count}수)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">
                        {log.catch_date} {log.catch_time}
                      </span>
                      <button
                        onClick={() => onEditLog(log)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition"
                        title="조과 기록 수정"
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`'${log.fish_species}' 조과 기록을 삭제하시겠습니까?`)) {
                            onDeleteLog(log.id);
                          }
                        }}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 transition"
                        title="조과 기록 삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* 당시 환경 스냅샷 배지 (선택된 풍속 단위 반영) */}
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900/60">
                      🌊 {log.catch_mul} ({log.tide_state})
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-900/60">
                      🌡️ 수온 {log.water_temp}°C
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-900/60">
                      💨 풍속 {formatWindSpeed(log.wind_speed, windUnit)}
                    </span>
                    {log.lat != null && log.lng != null && (
                      <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-900/60 font-mono">
                        📍 {log.lat.toFixed(4)}, {log.lng.toFixed(4)}
                      </span>
                    )}
                  </div>

                  {log.lure_bait && (
                    <div className="text-slate-300">
                      <span className="text-slate-500">채비: </span>
                      {log.lure_bait} ({log.catch_method === 'LURE' ? '루어' : log.catch_method === 'SURF' ? '원투' : '찌낚'})
                    </div>
                  )}

                  {log.memo && <div className="p-2 rounded bg-slate-900 text-slate-300">{log.memo}</div>}

                  {log.photo_url && (
                    <div className="mt-2 h-32 rounded-lg overflow-hidden border border-slate-800">
                      <img src={log.photo_url} alt="Catch" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'DIRECTIONS' && (
          <div className="space-y-3 text-sm">
            {/* 네비게이션 및 주차 정보 */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                🚗 차량 내비게이션 목적지 안내
              </span>
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1">
                <div>
                  <strong className="text-slate-400">네비 검색 지명:</strong>{' '}
                  <span className="text-amber-200 font-semibold">{destinationName}</span>
                </div>
                {spot.navi_url && (
                  <div className="truncate">
                    <strong className="text-slate-400">현장 네비 URL:</strong>{' '}
                    <a
                      href={spot.navi_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 underline"
                    >
                      {spot.navi_url}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* 도보 진입로 및 팁 */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
              <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                🚶 도보 진입로 & 주차 팁
              </span>
              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">
                {spot.directions || '등록된 진입로 정보가 없습니다.'}
              </p>
            </div>

            {/* 추천 대상어 & 낚시 방법 */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs font-bold text-slate-300">주요 대상어종</span>
              <div className="flex flex-wrap gap-1.5">
                {spot.target_species.map((sp, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 text-xs font-medium"
                  >
                    🐟 {sp}
                  </span>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-800 text-xs space-y-1 text-slate-300">
                <div>
                  <strong className="text-slate-400">선호 물때:</strong>{' '}
                  {spot.best_tides?.join(', ') || '전 물때 무난'}
                </div>
                <div>
                  <strong className="text-slate-400">선호 시간대:</strong>{' '}
                  {spot.best_times?.join(', ') || '새벽/해질녘 피딩'}
                </div>
              </div>
            </div>

            {/* 공략 및 채비 메모 */}
            {spot.description && (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <span className="text-xs font-bold text-slate-300">💡 채비 및 수심 공략 팁</span>
                <p className="text-xs text-slate-300 leading-relaxed">{spot.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
