import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Crosshair,
  Edit,
  ExternalLink,
  Fish,
  Info,
  MapPin,
  MessageSquare,
  Navigation,
  Pause,
  Play,
  PlusCircle,
  RotateCcw,
  Send,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Thermometer,
  Trash2,
  Waves,
  Wind,
  Volume2,
  Sliders,
  Bell
} from 'lucide-react';
import { Area, AreaChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  BiteScoreBreakdown,
  CatchLog,
  CurrentUnit,
  FishingSpot,
  MarineData,
  SpotMemo,
  SpotMemoTag,
  TideCurvePoint,
  TideDayInfo,
  WeatherData,
  WindUnit
} from '../types';
import { calculateSingleSpeciesScore } from '../utils/biteScore';
import { ChecklistModal } from './ChecklistModal';
import { BiteScoreHelpModal } from './BiteScoreHelpModal';
import { deleteCloudMemo, fetchCloudMemos, saveCloudMemo } from '../utils/cloudDb';
import { SPECIES_ENCYCLOPEDIA } from '../utils/speciesDatabase';
import { getSpeciesRigInfo } from '../utils/speciesRigs';
import { formatCurrentVelocity, formatWindSpeed, getCompassDirection, getWeatherText, getWindyWebUrl, calculateSwellRisk } from '../utils/weatherApi';
import { generatePostMortemReport } from '../utils/postMortemEngine';
import { findNearestKhoaStation } from '../utils/khoaTideEngine';
import { playEvacuationBeep } from '../utils/tideAlertSound';
import {
  getSavedTackleConfig,
  saveTackleConfig,
  calculateSinkingPhysics,
  ROD_POWER_SPECS,
  RodPower,
  RodType,
  TackleRigConfig,
  SURF_ROD_LENGTHS_M,
  WEIGHT_PRESETS,
  WeightCategory,
  getWeightDescription,
} from '../utils/tackleCalibration';

interface SpotDetailPanelProps {
  spot: FishingSpot;
  weather: WeatherData | null;
  marine: MarineData | null;
  tide: TideDayInfo | null;
  biteScore: BiteScoreBreakdown | null;
  catchLogs: CatchLog[];
  favoriteSpecies?: string[];
  windUnit: WindUnit;
  currentUnit: CurrentUnit;
  currentUser?: { id: string; name: string } | null;
  onStartMicroAdjust?: (spot: FishingSpot) => void;
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
  favoriteSpecies,
  windUnit,
  currentUnit,
  currentUser,
  onStartMicroAdjust,
  onOpenCatchLogModal,
  onEditLog,
  onDeleteLog,
  onEditSpot,
  onDeleteSpot,
  onClose,
  onMinimize,
}) => {
  const [activeTab, setActiveTab] = React.useState<'WEATHER_TIDE' | 'LOGS' | 'DIRECTIONS' | 'MEMOS'>('WEATHER_TIDE');
  const [activePhotoIndex, setActivePhotoIndex] = React.useState(0);
  const [isWindyOpen, setIsWindyOpen] = React.useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = React.useState(false);
  const [isBiteScoreHelpOpen, setIsBiteScoreHelpOpen] = React.useState(false);
  const [expandedSpecies, setExpandedSpecies] = React.useState<string | null>(null);

  // 채비 공기역학 캘리브레이션 동기화 상태
  const [tackleConfig, setTackleConfig] = React.useState<TackleRigConfig>(() => getSavedTackleConfig());
  const [panelWeightCategory, setPanelWeightCategory] = React.useState<WeightCategory>(() => {
    const current = getSavedTackleConfig();
    if (current.rodType === 'SURF' || current.weightGrams >= 30) return 'SURF';
    if (current.weightGrams >= 11 && current.weightGrams <= 27) return 'JUKKUMI';
    return 'JIG';
  });

  React.useEffect(() => {
    const handleTackleUpdate = () => {
      setTackleConfig(getSavedTackleConfig());
    };
    window.addEventListener('exfish_tackle_updated', handleTackleUpdate);
    return () => window.removeEventListener('exfish_tackle_updated', handleTackleUpdate);
  }, []);

  // 갯바위 들물 탈출 골든타임 비프 경보 활성화 상태
  const [isEvacAlarmEnabled, setIsEvacAlarmEnabled] = React.useState(false);
  const evacAlarmIntervalRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (isEvacAlarmEnabled) {
      playEvacuationBeep();
      evacAlarmIntervalRef.current = setInterval(() => {
        playEvacuationBeep();
      }, 25000); // 25초마다 위험 경보음 발생
    } else {
      if (evacAlarmIntervalRef.current) {
        clearInterval(evacAlarmIntervalRef.current);
        evacAlarmIntervalRef.current = null;
      }
    }
    return () => {
      if (evacAlarmIntervalRef.current) {
        clearInterval(evacAlarmIntervalRef.current);
      }
    };
  }, [isEvacAlarmEnabled]);

  // 포인트별 커뮤니티 현장 메모 (Spot Memos) 상태
  const [spotMemos, setSpotMemos] = React.useState<SpotMemo[]>([]);
  const [newMemoAuthor, setNewMemoAuthor] = React.useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('espfish_memo_author') || '익명 조사';
    return '익명 조사';
  });
  const [newMemoContent, setNewMemoContent] = React.useState('');
  const [newMemoTag, setNewMemoTag] = React.useState<SpotMemoTag>('GENERAL');
  const [memoFilterTag, setMemoFilterTag] = React.useState<string>('ALL');
  const [isSubmittingMemo, setIsSubmittingMemo] = React.useState(false);

  // 포인트 변경 시 해당 포인트의 현장 메모 로드
  React.useEffect(() => {
    let isMounted = true;
    fetchCloudMemos(spot.id).then((memos) => {
      if (isMounted) setSpotMemos(memos);
    });
    return () => {
      isMounted = false;
    };
  }, [spot.id]);

  const handleAddSpotMemo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoContent.trim()) return;

    setIsSubmittingMemo(true);
    const author = newMemoAuthor.trim() || '익명 조사';
    if (typeof window !== 'undefined') {
      localStorage.setItem('espfish_memo_author', author);
    }

    const newMemo: SpotMemo = {
      id: `memo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      spot_id: spot.id,
      user_id: 'user-me',
      user_name: author,
      content: newMemoContent.trim(),
      tag: newMemoTag,
      created_at: new Date().toISOString(),
    };

    try {
      await saveCloudMemo(newMemo);
      setSpotMemos((prev) => [newMemo, ...prev]);
      setNewMemoContent('');
    } finally {
      setIsSubmittingMemo(false);
    }
  };

  const handleDeleteSpotMemo = async (memoId: string) => {
    if (!confirm('이 현장 메모를 삭제하시겠습니까?')) return;
    await deleteCloudMemo(memoId);
    setSpotMemos((prev) => prev.filter((m) => m.id !== memoId));
  };

  // 48시간 미래 환경 타임라인 시뮬레이션 상태
  const [timelineOffsetHours, setTimelineOffsetHours] = React.useState<number>(0);
  const [isPlaying, setIsPlaying] = React.useState(false);

  // 자동 재생 (1초마다 +1시간 전진, 48시간 초과 시 0으로 리셋)
  React.useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimelineOffsetHours((prev) => (prev >= 48 ? 0 : prev + 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const windyUrl = getWindyWebUrl(spot.lat, spot.lng);

  // 네비 목적지 명칭: 사용자가 지정한 navi_name이 있으면 그것을 우선 사용, 없으면 spot.name
  const destinationName = spot.navi_name && spot.navi_name.trim().length > 0 ? spot.navi_name.trim() : spot.name;

  // 카카오맵 길찾기 URL (커스텀 navi_url이 있으면 우선 사용)
  const kakaoNaviUrl = spot.navi_url && spot.navi_url.trim().length > 0
    ? spot.navi_url
    : `https://map.kakao.com/link/to/${encodeURIComponent(destinationName)},${spot.lat},${spot.lng}`;

  // 네이버 지도 길찾기 URL (네이버 지도 공식 웹 URL 규격: lat,lng,title)
  const naverNaviUrl = `https://map.naver.com/v5/search/${encodeURIComponent(destinationName)}?c=${spot.lng},${spot.lat},15,0,0,0,dh`;

  // 현재 시각 및 시뮬레이션 대상 시각 Date 객체
  const now = new Date();
  const currentHour = now.getHours();
  const currentHourStr = `${currentHour < 10 ? '0' : ''}${currentHour}:00`;
  const currentTidePoint = tide?.hourlyCurve.find((c) => c.hour === currentHour);

  const targetTime = new Date(now.getTime() + timelineOffsetHours * 3600 * 1000);
  const isNow = timelineOffsetHours === 0;

  const targetHour = targetTime.getHours();
  const targetYear = targetTime.getFullYear();
  const targetMonth = String(targetTime.getMonth() + 1).padStart(2, '0');
  const targetDate = String(targetTime.getDate()).padStart(2, '0');
  const targetHourStr = String(targetHour).padStart(2, '0');
  const targetTimePrefix = `${targetYear}-${targetMonth}-${targetDate}T${targetHourStr}:00`;

  let weatherIdx = -1;
  if (weather?.hourly?.time) {
    weatherIdx = weather.hourly.time.findIndex((t) => t.startsWith(targetTimePrefix));
  }

  let marineIdx = -1;
  if (marine?.hourly?.time) {
    marineIdx = marine.hourly.time.findIndex((t) => t.startsWith(targetTimePrefix));
  }

  // 시뮬레이션 시각에 따른 기상 / 해양 지표
  const simWindSpeed =
    weatherIdx >= 0 && weather?.hourly?.windSpeed && weather.hourly.windSpeed[weatherIdx] != null
      ? weather.hourly.windSpeed[weatherIdx]
      : weather?.windSpeed ?? 0;

  const simWindDir =
    weatherIdx >= 0 && weather?.hourly?.windDirection && weather.hourly.windDirection[weatherIdx] != null
      ? weather.hourly.windDirection[weatherIdx]
      : weather?.windDirection ?? 0;

  const simTemp =
    weatherIdx >= 0 && weather?.hourly?.temp && weather.hourly.temp[weatherIdx] != null
      ? weather.hourly.temp[weatherIdx]
      : weather?.temp ?? 0;

  const simWaterTemp =
    marineIdx >= 0 && marine?.hourly?.seaSurfaceTemp && marine.hourly.seaSurfaceTemp[marineIdx] != null
      ? marine.hourly.seaSurfaceTemp[marineIdx]
      : marine?.seaSurfaceTemp ?? 0;

  const simCurrentVel =
    marineIdx >= 0 && marine?.hourly?.currentVelocity && marine.hourly.currentVelocity[marineIdx] != null
      ? marine.hourly.currentVelocity[marineIdx]
      : marine?.currentVelocity ?? 0;

  const simCurrentDir =
    marineIdx >= 0 && marine?.hourly?.currentDirection && marine.hourly.currentDirection[marineIdx] != null
      ? marine.hourly.currentDirection[marineIdx]
      : marine?.currentDirection ?? 0;

  const simWaveHeight =
    marineIdx >= 0 && marine?.hourly?.waveHeight && marine.hourly.waveHeight[marineIdx] != null
      ? marine.hourly.waveHeight[marineIdx]
      : marine?.waveHeight ?? 0;

  const simWeatherText =
    weatherIdx >= 0 && weather?.hourly?.weatherCode && weather.hourly.weatherCode[weatherIdx] != null
      ? getWeatherText(weather.hourly.weatherCode[weatherIdx])
      : weather?.weatherText ?? '--';

  const simPop =
    weatherIdx >= 0 && weather?.hourly?.pop && weather.hourly.pop[weatherIdx] != null
      ? weather.hourly.pop[weatherIdx]
      : 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 text-white overflow-hidden shadow-2xl">
      {/* 헤더 및 포인트 사진 슬라이드 (모바일에서는 화면 높이 절약을 위해 사진 높이 대폭 축소) */}
      {/* 1. 상단 일체형 히어로: 흐릿한 배경 사진 + 포인트명 + 입질 종합지수 + 안전 주의보 오버레이 (모바일 세로 공간 대폭 확보) */}
      <div className="relative shrink-0 bg-slate-950 overflow-hidden border-b border-slate-800">
        {/* 배경 사진 (흐릿하게 처리 및 딤 오버레이) */}
        <div className="absolute inset-0 z-0 overflow-hidden">
          {spot.photo_urls && spot.photo_urls.length > 0 ? (
            <img
              src={spot.photo_urls[activePhotoIndex] || spot.photo_urls[0]}
              alt={spot.name}
              className="w-full h-full object-cover filter blur-[2px] brightness-[0.35] opacity-45 scale-105 transition-all duration-300"
            />
          ) : (
            <div className="w-full h-full bg-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/80" />
        </div>

        {/* 오버레이 콘텐츠 */}
        <div className="relative z-10 p-3 sm:p-3.5 space-y-2">
          {/* 1행: 포인트명 & 작성자 & 타입 뱃지 & 액션 버튼들 */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-cyan-600/90 text-white shadow-sm">
                  {spot.spot_type === 'ROCK' ? '갯바위' : spot.spot_type === 'BREAKWATER' ? '방파제/석축' : '해변/선착장'}
                </span>
                <span className="text-[10px] text-slate-300">작성자: {spot.author_name}</span>
                {spot.photo_urls && spot.photo_urls.length > 1 && (
                  <div className="flex gap-1 ml-1 bg-black/40 px-1.5 py-0.5 rounded-full">
                    {spot.photo_urls.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActivePhotoIndex(idx)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          idx === activePhotoIndex ? 'bg-cyan-400 w-3' : 'bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <h1 className="text-base sm:text-lg font-bold text-white truncate drop-shadow-md">
                {spot.name}
              </h1>
            </div>

            {/* 버튼 그룹 (지도보기, 수정, 삭제, 공유, 닫기) */}
            <div className="flex items-center gap-1 shrink-0">
              {onMinimize && (
                <button
                  onClick={onMinimize}
                  className="px-2 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-0.5 text-[11px] font-bold transition shadow md:hidden"
                  title="지도 보기 (창 접기)"
                >
                  <span>지도</span>
                  <ChevronDown size={13} />
                </button>
              )}
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: `ExFish - ${spot.name}`,
                      text: `현재 입질 지수 ${biteScore?.totalScore ?? 0}점!`,
                      url: window.location.href,
                    }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                    alert('포인트 링크가 클립보드에 복사되었습니다.');
                  }
                }}
                className="p-1.5 rounded-lg bg-black/50 text-slate-200 hover:text-cyan-400 transition"
                title="공유"
              >
                <Share2 size={13} />
              </button>
              <button
                onClick={() => onEditSpot(spot)}
                className="p-1.5 rounded-lg bg-black/50 text-slate-200 hover:text-cyan-400 transition"
                title="수정"
              >
                <Edit size={13} />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`'${spot.name}' 포인트를 정말 삭제하시겠습니까?`)) {
                    onDeleteSpot(spot.id);
                  }
                }}
                className="p-1.5 rounded-lg bg-black/50 text-slate-200 hover:text-rose-400 transition"
                title="삭제"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-black/50 text-slate-300 hover:text-white transition text-xs md:hidden"
                title="닫기"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 2행: 입질 종합 지수 브리핑 오버레이 */}
          {biteScore && (
            <div className="p-2.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-cyan-500/40 flex items-center justify-between gap-2 shadow-lg">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-extrabold shadow shrink-0">
                  <span className="text-[10px] leading-none opacity-80">Ex</span>
                  <span className="text-base leading-none font-mono">{biteScore.totalScore}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5 flex-wrap">
                    <span>입질 {biteScore.totalScore}점</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] ${
                        biteScore.windRelation.includes('최적')
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : biteScore.windRelation.includes('주의')
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {biteScore.windRelation}
                    </span>
                    {biteScore.targetSummaryLabel && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] bg-cyan-900/60 text-cyan-200 border border-cyan-700/50 truncate max-w-[140px]">
                        🎯 {biteScore.targetSummaryLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 truncate pt-0.5">{biteScore.verdict}</p>
                </div>
              </div>
              {biteScore.topSpecies && (
                <div className="hidden sm:block text-right shrink-0">
                  <div className="text-[11px] font-bold text-emerald-300">
                    🏆 {biteScore.topSpecies.speciesName} ({biteScore.topSpecies.score}점)
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {biteScore.topSpecies.activityMatch}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3행: 안전 경보 & 고립 주의 배너 오버레이 (너울성 파도, 강풍, 만조 고립 위험 자동 감지) */}
          {(() => {
            const warnings: string[] = [];
            if (weather && weather.windSpeed >= 8) {
              warnings.push(`순간 강풍 주의 (${weather.windSpeed}m/s)`);
            }
            if (marine && marine.waveHeight >= 1.5) {
              warnings.push(`높은 파고/너울 주의 (${marine.waveHeight}m)`);
            }
            if (spot.spot_type === 'ROCK' && tide?.highTides && tide.highTides.length > 0) {
              const nowMinutes = now.getHours() * 60 + now.getMinutes();
              for (const ht of tide.highTides) {
                const [h, m] = ht.time.split(':').map(Number);
                const htMinutes = h * 60 + m;
                const diff = htMinutes - nowMinutes;
                if (diff > 0 && diff <= 120) {
                  warnings.push(`만조(${ht.time}) ${diff}분 전! 갯바위 퇴로 확보 필수`);
                  break;
                }
              }
            }
            if (warnings.length === 0) return null;

            return (
              <div className="p-2 rounded-xl bg-amber-950/80 backdrop-blur-md border border-amber-500/50 text-amber-200 text-xs flex items-center gap-2 shadow-sm animate-pulse">
                <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                <span className="font-bold text-amber-300 shrink-0 text-[11px]">⚠️ 안전주의:</span>
                <span className="text-[11px] text-amber-100 font-medium truncate">
                  {warnings.join(' · ')}
                </span>
              </div>
            );
          })()}
        </div>
      </div>

      {/* 2. 내비게이션 퀵 버튼 바 (경위도 및 목적지 텍스트 제거로 초슬림화, 작성자일 때만 위치조정 버튼 노출) */}
      {(() => {
        const isAuthor = Boolean(
          currentUser &&
            (spot.user_id === currentUser.id ||
              spot.user_id === 'user-me' ||
              currentUser.id === 'user-me')
        );
        return (
          <div className="px-3 py-1.5 bg-slate-950/90 border-b border-slate-800">
            <div className={`grid ${isAuthor && onStartMicroAdjust ? 'grid-cols-5 gap-1 text-[10px]' : 'grid-cols-4 gap-1.5 text-[11px]'}`}>
              <a
                href={kakaoNaviUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30 transition font-medium border border-yellow-500/30 shadow-sm"
                title="카카오맵 길찾기"
              >
                <Navigation size={12} />
                <span className="truncate">카카오길</span>
              </a>
              <a
                href={`https://map.kakao.com/link/roadview/${spot.lat},${spot.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition font-medium border border-amber-500/30 shadow-sm"
                title="카카오 로드뷰로 현장 주차장 및 진입로 360도 확인"
              >
                <span className="truncate">🚗 로드뷰</span>
              </a>
              <a
                href={windyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition font-semibold border border-cyan-500/30 shadow-sm"
                title="Windy 정밀 해양기상 예보"
              >
                <span className="truncate">Windy</span>
                <ExternalLink size={10} />
              </a>
              <button
                onClick={() => setIsChecklistOpen(true)}
                className="flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition font-medium border border-indigo-500/30 shadow-sm"
                title="출조 필수품 및 안전 체크리스트 열기"
              >
                <span className="truncate">🎒 점검표</span>
              </button>
              {isAuthor && onStartMicroAdjust && (
                <button
                  onClick={() => onStartMicroAdjust(spot)}
                  className="flex items-center justify-center gap-1 py-1.5 px-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition font-bold border border-emerald-500/40 shadow-sm active:scale-95"
                  title="위성 스카이뷰에서 마커를 드래그하여 포인트 위치 2D 평면 미세 조정"
                >
                  <Crosshair size={12} className="text-emerald-400" />
                  <span className="truncate">위치조정</span>
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* 3. 아이콘 전용 탭 바 (텍스트 라벨 완전 제거로 높이 최소화) */}
      <div className="flex border-b border-slate-800 bg-slate-900/95 shrink-0 px-2 py-1 gap-1.5">
        <button
          onClick={() => setActiveTab('WEATHER_TIDE')}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center transition relative ${
            activeTab === 'WEATHER_TIDE'
              ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="기상 & 물때 통합 뷰"
        >
          <Waves size={20} className={activeTab === 'WEATHER_TIDE' ? 'text-cyan-400 scale-110' : ''} />
          {activeTab === 'WEATHER_TIDE' && (
            <span className="absolute bottom-0 w-6 h-0.5 bg-cyan-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('LOGS')}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center transition relative ${
            activeTab === 'LOGS'
              ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="조과 기록 및 실측 통계"
        >
          <div className="relative">
            <Fish size={20} className={activeTab === 'LOGS' ? 'text-emerald-400 scale-110' : ''} />
            {catchLogs.length > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 py-0.2 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-bold">
                {catchLogs.length}
              </span>
            )}
          </div>
          {activeTab === 'LOGS' && (
            <span className="absolute bottom-0 w-6 h-0.5 bg-emerald-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('DIRECTIONS')}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center transition relative ${
            activeTab === 'DIRECTIONS'
              ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="포인트 상세 정보 및 도보 진입로, 주차 안내"
        >
          <Info size={20} className={activeTab === 'DIRECTIONS' ? 'text-amber-400 scale-110' : ''} />
          {activeTab === 'DIRECTIONS' && (
            <span className="absolute bottom-0 w-6 h-0.5 bg-amber-400 rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('MEMOS')}
          className={`flex-1 py-2 rounded-xl flex items-center justify-center transition relative ${
            activeTab === 'MEMOS'
              ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
          title="조사님들의 실시간 현장 메모 & 방명록"
        >
          <div className="relative">
            <MessageSquare size={20} className={activeTab === 'MEMOS' ? 'text-indigo-400 scale-110' : ''} />
            {spotMemos.length > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 py-0.2 rounded-full bg-indigo-500 text-white text-[9px] font-bold">
                {spotMemos.length}
              </span>
            )}
          </div>
          {activeTab === 'MEMOS' && (
            <span className="absolute bottom-0 w-6 h-0.5 bg-indigo-400 rounded-full" />
          )}
        </button>
      </div>

      {/* 탭 본문 영역 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'WEATHER_TIDE' && (
          <div className="space-y-4">
            {/* [제안 2] 국립해양조사원·해양경찰청 연안안전사고 위험예보제 위젯 */}
            {(() => {
              const isSpringTide = tide ? (tide.mulNumber >= 6 && tide.mulNumber <= 10) : false;
              const now = new Date();
              const curMinutes = now.getHours() * 60 + now.getMinutes();
              let isNearHighTide = false;
              let nextHighTideTimeStr = '';

              if (tide?.highTides && tide.highTides.length > 0) {
                for (const ht of tide.highTides) {
                  const parts = ht.time.split(':').map(Number);
                  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    const htMinutes = parts[0] * 60 + parts[1];
                    if (Math.abs(curMinutes - htMinutes) <= 120) {
                      isNearHighTide = true;
                      nextHighTideTimeStr = ht.time;
                      break;
                    }
                  }
                }
                if (!nextHighTideTimeStr && tide.highTides[0]) {
                  nextHighTideTimeStr = tide.highTides[0].time;
                }
              }

              const isHighWave = simWaveHeight >= 1.5;
              const isHighWind = simWindSpeed >= 8.5;

              // 연안안전사고 예보 등급 판정
              const safetyLevel: 'WARNING' | 'ADVISORY' | 'NORMAL' =
                (isSpringTide && isNearHighTide && isHighWave) || simWaveHeight >= 2.0 || simWindSpeed >= 11.0
                  ? 'WARNING' // 경보
                  : (isSpringTide && isNearHighTide) || isHighWave || isHighWind || (tide && tide.mulNumber >= 7 && tide.mulNumber <= 9)
                  ? 'ADVISORY' // 주의보
                  : 'NORMAL'; // 관심

              if (safetyLevel === 'NORMAL') return null;

              const isWarning = safetyLevel === 'WARNING';

              return (
                <div
                  className={`p-3 rounded-2xl border text-xs shadow-lg space-y-1.5 ${
                    isWarning
                      ? 'bg-rose-950/90 border-rose-600 text-rose-100 shadow-rose-950/60 animate-pulse'
                      : 'bg-amber-950/70 border-amber-600/80 text-amber-100 shadow-amber-950/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold">
                      <ShieldAlert size={16} className={isWarning ? 'text-rose-400' : 'text-amber-400'} />
                      <span className={isWarning ? 'text-rose-200' : 'text-amber-200'}>
                        해양경찰청 연안안전사고 위험예보 [{isWarning ? '🚨 경보' : '⚡ 주의보'}]
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-slate-900/80 border border-slate-700">
                      {isSpringTide ? '사리(대조기)' : '연안위험'}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] leading-relaxed">
                    {isSpringTide && isNearHighTide && (
                      <p className="font-semibold text-rose-200">
                        🚨 <strong>[만조 전후 갯바위 고립 주의]</strong> 현재 대조기(사리) 만조({nextHighTideTimeStr}) 전후 2시간 구간입니다. 바닷물이 빠르게 유입되어 갯바위 하산로나 진입로가 침수될 수 있으니 미리 퇴로를 확보하세요!
                      </p>
                    )}
                    {isHighWave && (
                      <p className="text-amber-200">
                        🌊 <strong>[너울성 파도 월파 주의]</strong> 테트라포드(TTP) 및 간출암에 너울이 덮칠 수 있습니다. 미끄럼 방지 펠트화 및 구명조끼를 반드시 착용하세요.
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-300">
                      <span>연안사고 예방법 낚시통제구역 진입 금지</span>
                      <span className="font-bold text-amber-300">📞 해양긴급신고 119 / 122</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* [항목 1] 갯바위 들물 고립 방지 탈출 골든타임 카운트다운 타이머 & 비프 경보 */}
            {tide && (() => {
              if (!tide.lowTides || tide.lowTides.length === 0) return null;
              const now = new Date();
              const curMins = now.getHours() * 60 + now.getMinutes();

              // 가장 인접한 간조(들물 시작점) 찾기
              let nearestLow: { time: string; height: number; diffMinutes: number } | null = null;
              for (const lt of tide.lowTides) {
                const [lh, lm] = lt.time.split(':').map(Number);
                const lowMins = lh * 60 + lm;
                const diff = curMins - lowMins;
                if (diff >= -60 && diff <= 300) {
                  if (!nearestLow || Math.abs(diff) < Math.abs(nearestLow.diffMinutes)) {
                    nearestLow = { time: lt.time, height: lt.height, diffMinutes: diff };
                  }
                }
              }

              if (!nearestLow) return null;

              const isFloodStarted = nearestLow.diffMinutes >= 0;
              const elapsedMinutes = Math.max(0, nearestLow.diffMinutes);
              const safeWindowMinutes = 90; // 간조 후 90분 이내 철수 권장
              const remainingMinutes = safeWindowMinutes - elapsedMinutes;

              const isDanger = isFloodStarted && remainingMinutes <= 0;
              const isCaution = isFloodStarted && remainingMinutes > 0 && remainingMinutes <= 30;
              const isSafe = isFloodStarted && remainingMinutes > 30;

              return (
                <div
                  className={`p-3 rounded-2xl border text-xs shadow-xl space-y-2 transition-all ${
                    isDanger
                      ? 'bg-rose-950/95 border-rose-500 text-rose-100 ring-2 ring-rose-500/50 animate-pulse'
                      : isCaution
                      ? 'bg-amber-950/90 border-amber-500/80 text-amber-100 shadow-amber-950/50'
                      : 'bg-slate-900/90 border-slate-700/80 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Clock size={16} className={isDanger ? 'text-rose-400 animate-spin' : isCaution ? 'text-amber-400' : 'text-cyan-400'} />
                      <span className={isDanger ? 'text-rose-200 text-sm' : isCaution ? 'text-amber-200' : 'text-cyan-200'}>
                        {isDanger
                          ? '🚨 [갯바위 침수 고립 위험] 즉시 철수하십시오!'
                          : isCaution
                          ? '⚠️ [들물 탈출 골든타임 임박] 안전 철수 준비'
                          : isSafe
                          ? '⏱️ 갯바위 들물 탈출 골든타임 카운트다운'
                          : '🌊 [간조 임박] 들물 안전 계획'}
                      </span>
                    </div>

                    {/* 비프 경보음 토글 및 테스트 버튼 */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => playEvacuationBeep()}
                        className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] flex items-center gap-1 transition active:scale-95"
                        title="대피 비프 경보음 1회 테스트"
                      >
                        <Volume2 size={12} className="text-cyan-400" />
                        <span>소리 테스트</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEvacAlarmEnabled(!isEvacAlarmEnabled)}
                        className={`px-2 py-0.5 rounded-lg border text-[10px] flex items-center gap-1 font-bold transition active:scale-95 ${
                          isEvacAlarmEnabled
                            ? 'bg-rose-600 text-white border-rose-400 ring-1 ring-rose-300 animate-pulse'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                        }`}
                        title="주기적 비프 경보 알람 토글"
                      >
                        <Bell size={12} className={isEvacAlarmEnabled ? 'text-white' : 'text-slate-400'} />
                        <span>{isEvacAlarmEnabled ? '경보음 켜짐' : '비프 알람'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/80">
                    <div>
                      <span className="text-slate-400">기준 간조: </span>
                      <strong className="text-cyan-300 font-mono">{nearestLow.time}</strong>
                      <span className="text-slate-400"> ({nearestLow.height}cm)</span>
                      {isFloodStarted ? (
                        <span className="text-slate-400 ml-1.5">
                          · 들물 <strong className="text-amber-300 font-mono">{elapsedMinutes}분</strong> 경과
                        </span>
                      ) : (
                        <span className="text-slate-400 ml-1.5">
                          · 간조까지 <strong className="text-cyan-300 font-mono">{Math.abs(nearestLow.diffMinutes)}분</strong> 전
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      {isFloodStarted ? (
                        remainingMinutes > 0 ? (
                          <span className="font-bold text-amber-300">
                            탈출 잔여: <span className="text-sm font-mono text-white">{remainingMinutes}분</span>
                          </span>
                        ) : (
                          <span className="font-bold text-rose-400 animate-pulse">
                            골든타임 초과 (+{Math.abs(remainingMinutes)}분)
                          </span>
                        )
                      ) : (
                        <span className="text-cyan-300 font-bold">간조 후 90분 골든타임 예정</span>
                      )}
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-300 leading-snug">
                    {isDanger
                      ? '⚠️ 바닷물이 갯바위 하산로나 낮은 진입로를 이미 삼켰을 수 있습니다. 테트라포드나 갯바위에 서 있지 말고 해경(119/122)에 구조를 요청하거나 즉시 고지대로 대피하세요.'
                      : isCaution
                      ? '💡 갯바위는 간조 후 1시간 30분이 지나면 발목 이상 물이 차올라 짐을 챙기기 어려워집니다. 지금 즉시 낚싯대를 접고 철수하십시오.'
                      : '💡 서해/남해 갯바위는 들물 시작 시 퇴로가 가장 먼저 잠깁니다. 안전을 위해 간조 후 90분 이내에 반드시 육지로 철수하세요.'}
                  </p>
                </div>
              );
            })()}

            {/* [요구사항 7] 오늘 물때 & 일출/일몰, 만조/간조 크게 강조 표기 */}
            {tide && (
              <div className="p-3.5 sm:p-4 bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-950/95 border border-cyan-500/40 rounded-2xl shadow-xl space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-base sm:text-lg text-cyan-300 drop-shadow">🌊 {tide.mulText}</span>
                    <span className="text-xs sm:text-sm text-slate-300 font-medium">({tide.lunarDateStr})</span>
                    {currentTidePoint && (
                      <span className="text-xs sm:text-sm text-cyan-200 font-mono font-bold bg-cyan-950/90 border border-cyan-700/70 px-2 py-0.5 rounded-lg shadow-inner">
                        현재 {currentTidePoint.height}cm ({currentTidePoint.stateText})
                      </span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60 shadow-sm">
                    <span className="text-amber-300">🌅 일출 {tide.sunrise}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-indigo-300">🌇 일몰 {tide.sunset}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/90">
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-rose-950/30 border border-rose-900/40">
                    <span className="text-rose-400 font-extrabold text-xs sm:text-sm shrink-0">🔴 만조</span>
                    <span className="font-mono text-xs sm:text-sm text-rose-100 font-bold truncate">
                      {tide.highTides.length > 0 ? tide.highTides.map((t) => `${t.time} (${t.height}cm)`).join(' · ') : '--'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-blue-950/30 border border-blue-900/40">
                    <span className="text-blue-400 font-extrabold text-xs sm:text-sm shrink-0">🔵 간조</span>
                    <span className="font-mono text-xs sm:text-sm text-blue-100 font-bold truncate">
                      {tide.lowTides.length > 0 ? tide.lowTides.map((t) => `${t.time} (${t.height}cm)`).join(' · ') : '--'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {/* 48시간 미래 환경 타임라인 시뮬레이터 (모바일 및 패널 전용 통합) */}
            <div className="p-3.5 bg-slate-950/90 border border-cyan-500/30 rounded-2xl shadow-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    {isNow
                      ? '⏱️ 실시간 환경'
                      : `⏱️ ${targetMonth}/${targetDate} ${targetHourStr}:00 (+${timelineOffsetHours}시간 예측)`}
                  </span>
                  {!isNow && (
                    <button
                      onClick={() => setTimelineOffsetHours(0)}
                      className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-200 font-semibold"
                    >
                      <RotateCcw size={11} /> 현재 시각 복귀
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition shadow ${
                    isPlaying
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                  }`}
                  title={isPlaying ? '시뮬레이션 일시정지' : '미래 예측 자동 재생'}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                  <span>{isPlaying ? '일시정지' : '재생'}</span>
                </button>
              </div>

              {/* 타임라인 슬라이더 바 (0h ~ 48h) */}
              <div className="space-y-1">
                <input
                  type="range"
                  min="0"
                  max="48"
                  step="1"
                  value={timelineOffsetHours}
                  onChange={(e) => {
                    setTimelineOffsetHours(Number(e.target.value));
                    if (isPlaying) setIsPlaying(false);
                  }}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>현재 (0h)</span>
                  <span>+12h</span>
                  <span>내일 (+24h)</span>
                  <span>+36h</span>
                  <span>모레 (+48h)</span>
                </div>
              </div>
            </div>

            {/* 풍속·조류·파고 위험 수준 판정 및 위험 경고 배너 */}
            {(() => {
              const isWindDanger = simWindSpeed >= 9.5 || (weather?.windGust ? weather.windGust >= 13.0 : false);
              const isWindWarning = !isWindDanger && simWindSpeed >= 6.5;

              const isCurrentDanger = simCurrentVel >= 0.9;
              const isCurrentWarning = !isCurrentDanger && simCurrentVel >= 0.6;

              const isWaveDanger = simWaveHeight >= 1.8;
              const isWaveWarning = !isWaveDanger && simWaveHeight >= 1.2;

              const hasAnyDanger = isWindDanger || isCurrentDanger || isWaveDanger;

              return (
                <>
                  {hasAnyDanger && (
                    <div className="p-3 bg-rose-950/85 border border-rose-500 rounded-2xl flex items-center gap-2.5 text-rose-200 text-xs shadow-lg shadow-rose-950/50 animate-pulse">
                      <ShieldAlert size={22} className="text-rose-400 shrink-0" />
                      <div>
                        <div className="font-bold text-rose-300 flex items-center gap-1.5">
                          <span>🚨 해양 기상 특보급 위험 경고</span>
                        </div>
                        <p className="text-[11px] text-rose-200/95 leading-relaxed pt-0.5">
                          {isWaveDanger && '⚠️ 높은 파고(너울)로 인한 갯바위/방파제 테트라포드 월파 위험! '}
                          {isWindDanger && '⚠️ 강풍/돌풍으로 인한 낚시 불가 및 실족 추락 위험! '}
                          {isCurrentDanger && '⚠️ 빠른 급류/와류로 인한 채비 쓸림 및 해상 안전사고 위험! '}
                          출조를 자제하고 안전장구(구명조끼/펠트화)를 반드시 점검하세요.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 4대 실시간/예측 해양·기상 카드 그리드
                      - 위험 수준 시 경고 배경색(bg-rose-950/80, border-rose-600) 자동 적용 */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    {/* 1. 바람 위젯 (풍향 + 풍속 + 나침반 화살표) */}
                    <div
                      className={`p-2.5 rounded-xl space-y-1 transition-colors border ${
                        isWindDanger
                          ? 'bg-rose-950/80 border-rose-600 shadow-[0_0_15px_rgba(244,63,94,0.35)]'
                          : isWindWarning
                          ? 'bg-amber-950/60 border-amber-600 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                          : 'bg-slate-800/70 border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span className="flex items-center gap-1 font-semibold truncate">
                          <Wind
                            size={13}
                            className={isWindDanger ? 'text-rose-400 shrink-0 animate-bounce' : isWindWarning ? 'text-amber-400 shrink-0' : 'text-cyan-400 shrink-0'}
                          />{' '}
                          <span className={isWindDanger ? 'text-rose-200 font-bold' : isWindWarning ? 'text-amber-200 font-bold' : ''}>
                            풍향·풍속
                          </span>
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isWindDanger ? (
                            <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white font-bold text-[9px] animate-pulse">
                              위험
                            </span>
                          ) : isWindWarning ? (
                            <span className="px-1.5 py-0.2 rounded bg-amber-600 text-slate-950 font-bold text-[9px]">
                              주의
                            </span>
                          ) : null}
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold transition-transform duration-300 ${
                              isWindDanger ? 'bg-rose-500/30 text-rose-200' : 'bg-cyan-500/20 text-cyan-300'
                            }`}
                            style={{ transform: `rotate(${simWindDir}deg)` }}
                            title={`풍향 ${Math.round(simWindDir)}°`}
                          >
                            ↓
                          </div>
                          <span className={`text-[10px] font-mono ${isWindDanger ? 'text-rose-300' : ''}`}>
                            {Math.round(simWindDir)}°
                          </span>
                        </div>
                      </div>
                      <div className="flex items-baseline justify-between mt-0.5">
                        <div
                          className={`text-sm sm:text-base font-bold truncate ${
                            isWindDanger ? 'text-rose-200' : isWindWarning ? 'text-amber-300' : 'text-cyan-300'
                          }`}
                        >
                          {formatWindSpeed(simWindSpeed, windUnit)}
                        </div>
                        <div className={`text-[11px] font-medium shrink-0 ml-1 ${isWindDanger ? 'text-rose-300' : 'text-slate-300'}`}>
                          {getCompassDirection(simWindDir)}
                        </div>
                      </div>
                      <div className={`text-[10px] flex justify-between pt-1 border-t ${isWindDanger ? 'border-rose-800/80 text-rose-300' : 'border-slate-700/50 text-slate-400'}`}>
                        <span>돌풍:</span>
                        <span className={isWindDanger ? 'text-rose-200 font-bold' : 'text-amber-400 font-medium'}>
                          {weather ? formatWindSpeed(weather.windGust, windUnit) : '--'}
                        </span>
                      </div>
                    </div>

                    {/* 2. 조류 방향 / 유속 위젯 (풍향풍속 바로 옆에 배치) */}
                    <div
                      className={`p-2.5 rounded-xl space-y-1 transition-colors border ${
                        isCurrentDanger
                          ? 'bg-rose-950/80 border-rose-600 shadow-[0_0_15px_rgba(244,63,94,0.35)]'
                          : isCurrentWarning
                          ? 'bg-amber-950/60 border-amber-600 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                          : 'bg-slate-800/70 border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span className="flex items-center gap-1 font-semibold truncate">
                          <Compass
                            size={13}
                            className={isCurrentDanger ? 'text-rose-400 shrink-0 animate-bounce' : isCurrentWarning ? 'text-amber-400 shrink-0' : 'text-emerald-400 shrink-0'}
                          />{' '}
                          <span className={isCurrentDanger ? 'text-rose-200 font-bold' : isCurrentWarning ? 'text-amber-200 font-bold' : ''}>
                            조류·해류
                          </span>
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {isCurrentDanger ? (
                            <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white font-bold text-[9px] animate-pulse">
                              위험
                            </span>
                          ) : isCurrentWarning ? (
                            <span className="px-1.5 py-0.2 rounded bg-amber-600 text-slate-950 font-bold text-[9px]">
                              주의
                            </span>
                          ) : null}
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold transition-transform duration-300 ${
                              isCurrentDanger ? 'bg-rose-500/30 text-rose-200' : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                            style={{ transform: `rotate(${simCurrentDir}deg)` }}
                            title={`조류방향 ${Math.round(simCurrentDir)}°`}
                          >
                            ↑
                          </div>
                          <span className={`text-[10px] font-mono ${isCurrentDanger ? 'text-rose-300' : ''}`}>
                            {Math.round(simCurrentDir)}°
                          </span>
                        </div>
                      </div>
                      <div className="flex items-baseline justify-between mt-0.5">
                        <div
                          className={`text-sm sm:text-base font-bold truncate ${
                            isCurrentDanger ? 'text-rose-200' : isCurrentWarning ? 'text-amber-300' : 'text-emerald-300'
                          }`}
                        >
                          {formatCurrentVelocity(simCurrentVel, currentUnit)}
                        </div>
                        <div className={`text-[11px] font-medium shrink-0 ml-1 ${isCurrentDanger ? 'text-rose-300' : 'text-slate-300'}`}>
                          {getCompassDirection(simCurrentDir)}
                        </div>
                      </div>
                      <div className={`text-[10px] pt-1 border-t flex justify-between ${isCurrentDanger ? 'border-rose-800/80 text-rose-300' : 'border-slate-700/50 text-slate-400'}`}>
                        <span>흐름:</span>
                        <span className={`font-mono text-[10px] font-semibold ${isCurrentDanger ? 'text-rose-200' : isCurrentWarning ? 'text-amber-300' : 'text-emerald-400'}`}>
                          {simCurrentVel > 0.8 ? '급류 (위험)' : simCurrentVel > 0.5 ? '빠른 본류대' : simCurrentVel > 0.2 ? '완만한 조류' : '정조/약류'}
                        </span>
                      </div>
                    </div>

                    {/* 3. 표층 수온 및 기온 위젯 */}
                    <div className="p-2.5 bg-slate-800/70 border border-slate-700/60 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span className="flex items-center gap-1 font-semibold truncate">
                          <Thermometer size={13} className="text-rose-400 shrink-0" /> 표층 수온 (SST)
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between mt-0.5">
                        <div className="text-sm sm:text-base font-bold text-rose-300 truncate">
                          {simWaterTemp.toFixed(1)}°C
                        </div>
                        <span className="text-[11px] text-slate-300 shrink-0 ml-1">
                          기온 {simTemp.toFixed(1)}°C
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex justify-between pt-1 border-t border-slate-700/50">
                        <span>강수확률:</span>
                        <span className="text-cyan-300 font-medium">{simPop}%</span>
                      </div>
                    </div>

                    {/* 4. 파고 / 날씨 위젯 (표층수온 바로 옆에 배치) */}
                    <div
                      className={`p-2.5 rounded-xl space-y-1 transition-colors border ${
                        isWaveDanger
                          ? 'bg-rose-950/80 border-rose-600 shadow-[0_0_15px_rgba(244,63,94,0.35)]'
                          : isWaveWarning
                          ? 'bg-amber-950/60 border-amber-600 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                          : 'bg-slate-800/70 border-slate-700/60'
                      }`}
                    >
                      <div className="flex items-center justify-between text-slate-400 text-[11px]">
                        <span className="flex items-center gap-1 font-semibold truncate">
                          <Waves
                            size={13}
                            className={isWaveDanger ? 'text-rose-400 shrink-0 animate-bounce' : isWaveWarning ? 'text-amber-400 shrink-0' : 'text-blue-400 shrink-0'}
                          />{' '}
                          <span className={isWaveDanger ? 'text-rose-200 font-bold' : isWaveWarning ? 'text-amber-200 font-bold' : ''}>
                            파고 · 날씨
                          </span>
                        </span>
                        {isWaveDanger ? (
                          <span className="px-1.5 py-0.2 rounded bg-rose-600 text-white font-bold text-[9px] animate-pulse">
                            위험
                          </span>
                        ) : isWaveWarning ? (
                          <span className="px-1.5 py-0.2 rounded bg-amber-600 text-slate-950 font-bold text-[9px]">
                            주의
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-baseline justify-between mt-0.5">
                        <div
                          className={`text-sm sm:text-base font-bold truncate ${
                            isWaveDanger ? 'text-rose-200' : isWaveWarning ? 'text-amber-300' : 'text-blue-300'
                          }`}
                        >
                          {simWaveHeight.toFixed(1)} m
                        </div>
                        <span className={`text-[11px] shrink-0 ml-1 ${isWaveDanger ? 'text-rose-300' : 'text-slate-300'}`}>
                          {marine?.wavePeriod ? `${marine.wavePeriod}초 주기` : '--'}
                        </span>
                      </div>
                      <div className={`text-[10px] pt-1 border-t flex justify-between ${isWaveDanger ? 'border-rose-800/80 text-rose-300' : 'border-slate-700/50 text-slate-300'}`}>
                        <span className={isWaveDanger ? 'text-rose-300' : 'text-slate-400'}>날씨:</span>
                        <span className={`font-semibold truncate ${isWaveDanger ? 'text-rose-200' : 'text-cyan-300'}`}>
                          {simWeatherText}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}

            {/* 너울성(Swell) 파도 위험도 지수 (파고×파주기 결합 에너지) */}
            {(() => {
              const waveH = simWaveHeight;
              const waveP = marine?.wavePeriod || 6.0;
              const swell = calculateSwellRisk(waveH, waveP);
              return (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs backdrop-blur-sm ${swell.badgeColor}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">🌊</span>
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-1.5 truncate">
                        <span>{swell.title}</span>
                        <span className="text-[10px] font-mono opacity-80 font-normal">
                          (파고 {waveH.toFixed(1)}m × 주기 {waveP}s = 에너지 {swell.energyScore})
                        </span>
                      </div>
                      <div className="text-[10.5px] opacity-90 truncate mt-0.5">
                        {swell.description}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-current shrink-0">
                    {swell.level === 'DANGER' ? '진입금지' : swell.level === 'CAUTION' ? '주의요망' : '양호'}
                  </span>
                </div>
              );
            })()}

            {/* 3. [제안 6] 현재 시각 기준 연속 조위 변화 곡선 (-6h ~ +36h, 스크롤 없는 반응형 100% 뷰) */}
            {tide && (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2.5">
                {/* [항목 5] KHOA 53개 관측소 실시간 API 연동 & 잔차 지수감쇄 하이브리드 엔진 뱃지 */}
                {(() => {
                  const stationInfo = findNearestKhoaStation(spot.lat, spot.lng);
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-cyan-800/60 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                        <span className="font-bold text-cyan-200">
                          📍 KHOA 국립해양조사원 {stationInfo.station.name} 관측소
                        </span>
                        <span className="font-mono text-[10.5px] text-slate-400">
                          (직선거리 {stationInfo.distanceKm}km, 코드 {stationInfo.station.code})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>하이브리드 잔차(e^-λt) 보정 가동중</span>
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-200 flex items-center gap-1.5">
                    🌊 조위 변화 곡선 (-6h ~ +36h 실시간 예측)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">
                      ✨ 피딩 구간 표시
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono font-semibold hidden sm:inline">
                      한 화면 맞춤
                    </span>
                  </div>
                </div>

                {/* 그래프 본체: 스크롤 없이 가로 100% 반응형으로 채움 */}
                <div className="w-full h-56 pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={tide.curve36 || tide.hourly72Curve || tide.hourlyCurve}
                      margin={{ top: 18, right: 10, left: -22, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="tideGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.65} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>

                      {/* 황금 피딩 타임 영역 시각화 (요구사항 2: 조위 그래프에 황금 피딩 타임 표시) */}
                      {tide.feedingTimes?.map((f, fIdx) => {
                        if (!f.startDisplayTime || !f.endDisplayTime) return null;
                        return (
                          <ReferenceArea
                            key={`feed-zone-${fIdx}`}
                            x1={f.startDisplayTime}
                            x2={f.endDisplayTime}
                            fill="#f59e0b"
                            fillOpacity={0.16}
                            stroke="#f59e0b"
                            strokeOpacity={0.5}
                            strokeDasharray="2 2"
                          />
                        );
                      })}

                      <XAxis
                        dataKey="displayTime"
                        stroke="#64748b"
                        fontSize={9}
                        tickLine={false}
                        interval={5}
                      />
                      <YAxis stroke="#64748b" fontSize={9} tickLine={false} unit="cm" domain={['auto', 'auto']} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload as TideCurvePoint;
                            return (
                              <div className="bg-slate-900/95 border border-slate-700 p-2.5 rounded-xl text-xs shadow-2xl space-y-1 backdrop-blur-md">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1 font-bold">
                                  <span className="text-cyan-300">
                                    {data.dayLabel && <span className="mr-1 text-slate-400">[{data.dayLabel}]</span>}
                                    {data.timeStr}
                                  </span>
                                  {data.isCurrent && (
                                    <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold">
                                      현재
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-baseline justify-between gap-4 text-slate-200">
                                  <span className="text-slate-400">실시간 조위:</span>
                                  <span className="font-mono font-bold text-white text-sm">{data.height} cm</span>
                                </div>
                                {data.tideDiff && (
                                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span>조차 (만·간조차):</span>
                                    <span className="font-mono text-cyan-200 font-semibold">{data.tideDiff} cm</span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                  <span>조류 상태:</span>
                                  <span className="text-slate-300 font-medium">{data.stateText}</span>
                                </div>
                                {data.eventLabel && (
                                  <div className="text-[10px] text-amber-300 font-semibold pt-1 border-t border-slate-800">
                                    📌 {data.eventLabel}
                                  </div>
                                )}
                                {data.isFeedingTime && (
                                  <div className="text-[10px] text-amber-300 font-bold pt-1 border-t border-slate-800 flex items-center gap-1">
                                    <span>✨ {data.feedingLabel || '황금 피딩 타임'}</span>
                                    {data.feedingReason && (
                                      <span className="text-slate-400 font-normal truncate max-w-[170px]">
                                        ({data.feedingReason})
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />

                      {/* 현재 시각 세로 점선 표시 (isCurrent === true) */}
                      {(() => {
                        const curPoint = (tide.curve36 || []).find((c) => c.isCurrent);
                        if (!curPoint) return null;
                        return (
                          <ReferenceLine
                            x={curPoint.displayTime}
                            stroke="#22d3ee"
                            strokeWidth={2}
                            strokeDasharray="3 3"
                            label={{
                              value: `현재 (${curPoint.height}cm)`,
                              position: 'top',
                              fill: '#22d3ee',
                              fontSize: 10,
                              fontWeight: 'bold',
                            }}
                          />
                        );
                      })()}

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
            )}

            {/* 4. 다가오는 황금 피딩 타임 카드 */}
            {tide?.feedingTimes && tide.feedingTimes.length > 0 && (
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Clock size={13} />
                  <span>🔥 다가오는 황금 피딩 타임 (현재 시각 이후 입질 찬스)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {tide.feedingTimes.map((f, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-amber-200">{f.label}</div>
                        <div className="text-[10px] text-slate-400">{f.reason}</div>
                      </div>
                      <span className="font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/40 text-[11px]">
                        {f.timeRange}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Windy 정밀 해양기상 레이더 (접이식 아코디언 버튼으로 단순화 & 스크롤 최적화) */}
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsWindyOpen(!isWindyOpen)}
                  className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200 transition"
                >
                  <ChevronDown
                    size={15}
                    className={`transition-transform duration-200 ${isWindyOpen ? 'rotate-180' : ''}`}
                  />
                  <span>🗺️ Windy 정밀 해양기상 레이더 {isWindyOpen ? '접기' : '펼치기'}</span>
                </button>
                <a
                  href={windyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  새 창으로 열기 <ExternalLink size={10} />
                </a>
              </div>

              {isWindyOpen && (
                <div className="pt-2 space-y-1">
                  <p className="text-[10px] text-slate-400">
                    위경도({spot.lat.toFixed(3)}, {spot.lng.toFixed(3)}) 지점의 바람 입자 및 ECMWF/GFS 기상 예측 화면:
                  </p>
                  <div className="relative w-full h-52 rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                    <iframe
                      title="Windy Map"
                      src={`https://embed.windy.com/embed2.html?lat=${spot.lat}&lon=${spot.lng}&detailLat=${spot.lat}&detailLon=${spot.lng}&width=400&height=200&zoom=11&level=surface&overlay=wind&product=ecmwf&menu=&message=&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=m%2Fs&metricTemp=%C2%B0C&radarRange=-1`}
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}



        {activeTab === 'LOGS' && (
          <div className="space-y-3">
            {/* 상단 액션 및 요약 */}
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-300">
                이 포인트의 실측 조과 히스토리 ({catchLogs.length}건)
              </span>
              <button
                onClick={onOpenCatchLogModal}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-md shadow-emerald-600/20"
              >
                <PlusCircle size={14} />
                <span>조과/꽝 등록</span>
              </button>
            </div>

            {/* 1. 이 포인트에서 낚이는 어종별 실시간 입질 지수 & 공략 팁 (내 관심어종 우선 정렬) */}
            {(() => {
              // 해당 포인트의 대표 대상어종 + 실제 조과 로그에 등록된 어종 목록 취합
              const spotTargetSpecies = spot.target_species || [];
              const caughtSpeciesFromLogs = Array.from(new Set(catchLogs.map((l) => l.fish_species).filter(Boolean)));
              const combinedSpecies = Array.from(new Set([...spotTargetSpecies, ...caughtSpeciesFromLogs]));
              const availableSpeciesList = combinedSpecies.length > 0 ? combinedSpecies : ['우럭', '광어', '감성돔', '농어'];

              // 사용자 관심 어종 목록 (props 또는 localStorage)
              const userFavorites = (favoriteSpecies && favoriteSpecies.length > 0)
                ? favoriteSpecies
                : (() => {
                    try {
                      const local = localStorage.getItem('exfish_favorite_species');
                      return local ? JSON.parse(local) : ['우럭', '광어'];
                    } catch {
                      return ['우럭', '광어'];
                    }
                  })();

              const now = new Date();
              const curHour = now.getHours();
              const curMonth = now.getMonth() + 1;

              const scoredList = availableSpeciesList.map((spName) => {
                const ecology =
                  SPECIES_ENCYCLOPEDIA[spName] ||
                  Object.values(SPECIES_ENCYCLOPEDIA).find((sp) => sp.name.includes(spName) || spName.includes(sp.name)) ||
                  SPECIES_ENCYCLOPEDIA['우럭'];

                const scoreInfo = (weather && marine && tide)
                  ? calculateSingleSpeciesScore(ecology, spot, weather, marine, tide, curHour, curMonth)
                  : {
                      speciesName: spName,
                      score: 50,
                      verdict: '환경 데이터 수신 중...',
                      activityMatch: ecology.activityName,
                      tempMatch: `최적수온 ${ecology.tempRange.optMin}~${ecology.tempRange.optMax}°C`,
                    };

                const isFavorite = userFavorites.some((fav: string) => fav.includes(spName) || spName.includes(fav));
                const hitsCount = catchLogs.filter((l) => l.fish_species === spName && (l.fish_count ?? 0) > 0 && !l.is_hitless).length;
                const hitlessCount = catchLogs.filter((l) => l.fish_species === spName && ((l.fish_count ?? 0) === 0 || l.is_hitless)).length;
                const isPeakSeason = ecology.peakMonths ? ecology.peakMonths.includes(curMonth) : false;

                return {
                  name: spName,
                  ecology,
                  scoreInfo,
                  isFavorite,
                  hitsCount,
                  hitlessCount,
                  isPeakSeason,
                };
              });

              // 정렬: 1순위 내 관심어종(⭐), 2순위 실시간 입질 점수 높은 순
              scoredList.sort((a, b) => {
                if (a.isFavorite && !b.isFavorite) return -1;
                if (!a.isFavorite && b.isFavorite) return 1;
                return b.scoreInfo.score - a.scoreInfo.score;
              });

              return (
                <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl shadow-lg space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Fish size={15} className="text-cyan-400" />
                      <span className="text-xs font-bold text-slate-100">
                        포인트 출현 어종별 실시간 입질 지수
                      </span>
                    </div>
                    <span className="text-[10px] text-amber-300 font-semibold bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                      <Star size={10} className="fill-amber-300 text-amber-300" /> 내 관심어종 우선
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    현재 시각({curHour}시) 수온·물때·일출몰 및 어종별 생태 주기를 반영한 실시간 입질 예측입니다.
                  </p>

                  <div className="space-y-2 pt-1">
                    {scoredList.map((item) => {
                      const { name, ecology, scoreInfo, isFavorite, hitsCount, isPeakSeason } = item;
                      const score = scoreInfo.score;
                      const isExpanded = expandedSpecies === name;
                      const rigInfo = getSpeciesRigInfo(name);

                      // 점수 등급별 스타일
                      const scoreBg = score >= 80
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                        : score >= 65
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                        : score >= 50
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700';

                      const scoreLabel = score >= 80 ? '대박 찬스' : score >= 65 ? '호조황 기대' : score >= 50 ? '무난한 편' : '비활성';

                      return (
                        <div
                          key={`scored-species-${name}`}
                          className={`p-2.5 rounded-xl border transition cursor-pointer select-none ${
                            isFavorite
                              ? 'bg-gradient-to-r from-amber-950/20 via-slate-900 to-slate-900/90 border-amber-500/50 shadow-sm'
                              : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
                          }`}
                          onClick={() => setExpandedSpecies(isExpanded ? null : name)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isFavorite && (
                                <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-bold">
                                  <Star size={9} className="fill-amber-300" /> 관심어종
                                </span>
                              )}
                              <span className="font-bold text-sm text-slate-100">{name}</span>
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px]">
                                {ecology.categoryName}
                              </span>
                              {isPeakSeason && (
                                <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-semibold">
                                  🔥 지금 제철
                                </span>
                              )}
                              {hitsCount > 0 && (
                                <span className="text-[10px] text-emerald-400 font-mono">
                                  (실측 {hitsCount}수 성공)
                                </span>
                              )}
                            </div>

                            {/* 입질 점수 뱃지 */}
                            <div className={`px-2 py-0.5 rounded-lg border font-mono font-bold text-xs flex items-center gap-1 shrink-0 ${scoreBg}`}>
                              <span>{score}점</span>
                              <span className="text-[9px] font-sans font-normal opacity-90">({scoreLabel})</span>
                            </div>
                          </div>

                          {/* 생태 설명 및 현재 입질 타이밍 */}
                          <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed">
                            <div className="text-slate-300 flex items-center gap-1.5 flex-wrap">
                              <span className="text-cyan-300 font-medium">🕒 {scoreInfo.activityMatch}</span>
                              <span className="text-slate-500">·</span>
                              <span className="text-rose-300 font-medium">🌡️ {scoreInfo.tempMatch}</span>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-400">🌊 {ecology.currentPrefName}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 line-clamp-2">
                              💡 {scoreInfo.verdict} {ecology.description}
                            </p>
                          </div>

                          {/* 원클릭 추천 채비 토글 버튼 */}
                          <div className="pt-1.5 flex items-center justify-between text-[10px]">
                            <span className="text-cyan-400 flex items-center gap-0.5 font-semibold hover:underline">
                              <span>{isExpanded ? '추천 채비 및 골든타임 접기' : '🎣 추천 채비 & 히트 골든타임 보기'}</span>
                              <ChevronDown
                                size={12}
                                className={`transition-transform duration-200 ${isExpanded ? 'rotate-180 text-cyan-300' : ''}`}
                              />
                            </span>
                            <span className="text-slate-500 text-[9px]">클릭 시 펼침</span>
                          </div>

                          {/* [제안 3] 원클릭 추천 채비 & 히트 골든타임 상세 확장 뷰 */}
                          {isExpanded && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2.5 pt-2.5 border-t border-slate-800 space-y-2 animate-in fade-in duration-150"
                            >
                              {/* 맞춤 추천 채비 */}
                              <div className="p-2.5 bg-slate-950/80 rounded-xl border border-cyan-900/50 space-y-1.5 text-[11px]">
                                <div className="font-bold text-cyan-300 flex items-center justify-between">
                                  <span>🎣 오늘 맞춤 추천 채비 ({name})</span>
                                  <span className="text-[10px] text-slate-400">
                                    수온 {simWaterTemp.toFixed(1)}°C · 조류 {simCurrentVel.toFixed(1)}m/s 기준
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-300 text-[10px]">
                                  <div>
                                    <strong className="text-slate-400">· 루어:</strong> {rigInfo.recommendedRig.lure}
                                  </div>
                                  <div>
                                    <strong className="text-slate-400">· 생미끼:</strong> {rigInfo.recommendedRig.bait}
                                  </div>
                                  <div>
                                    <strong className="text-slate-400">· 원줄/목줄:</strong> {rigInfo.recommendedRig.line}
                                  </div>
                                  <div>
                                    <strong className="text-slate-400">· 봉돌/싱커:</strong> {rigInfo.recommendedRig.hookWeight}
                                  </div>
                                </div>
                                <div className="text-[10px] text-amber-200/90 bg-amber-950/40 p-1.5 rounded-lg border border-amber-900/40">
                                  ⚡ <strong>핵심 액션 요령:</strong> {rigInfo.recommendedRig.action}
                                </div>
                              </div>

                              {/* 오늘 히트 골든타임 타임라인 */}
                              <div className="p-2.5 bg-gradient-to-r from-amber-950/20 to-indigo-950/30 rounded-xl border border-amber-500/30 space-y-1 text-[11px]">
                                <div className="font-bold text-amber-300 flex items-center gap-1">
                                  <Clock size={12} />
                                  <span>⏰ 오늘 이 어종의 최적 히트 골든타임</span>
                                </div>
                                <p className="text-[10px] text-slate-200">
                                  {rigInfo.goldenHoursText(tide?.sunrise || '06:30', tide?.sunset || '18:30', tide?.mulNumber || 7)}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                  💡 <strong>섭이 전략:</strong> {rigInfo.feedingStrategy}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 빅데이터 조과 & 꽝 통계 카드 (출조 1건 이상일 때 표시) */}
            {catchLogs.length > 0 && (() => {
              const total = catchLogs.length;
              const hitLogs = catchLogs.filter((l) => (l.fish_count ?? 0) > 0 && !l.is_hitless);
              const hitlessLogs = catchLogs.filter((l) => (l.fish_count ?? 0) === 0 || l.is_hitless);
              const hitRate = Math.round((hitLogs.length / total) * 100);
              const avgHitTemp = hitLogs.length > 0
                ? (hitLogs.reduce((acc, cur) => acc + (cur.water_temp || 0), 0) / hitLogs.length).toFixed(1)
                : null;
              const avgHitlessTemp = hitlessLogs.length > 0
                ? (hitlessLogs.reduce((acc, cur) => acc + (cur.water_temp || 0), 0) / hitlessLogs.length).toFixed(1)
                : null;

              return (
                <div className="p-3 bg-gradient-to-r from-slate-900 to-blue-950/70 border border-slate-800 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      📊 포인트 실측 통계 (빅데이터 분석)
                    </span>
                    <span className="text-[11px] text-cyan-400 font-mono font-bold">
                      히트 적중률: {hitRate}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">총 출조</div>
                      <div className="text-sm font-bold text-white font-mono">{total}회</div>
                    </div>
                    <div className="bg-emerald-950/50 p-2 rounded-lg border border-emerald-800/60">
                      <div className="text-[10px] text-emerald-400">손맛 성공</div>
                      <div className="text-sm font-bold text-emerald-300 font-mono">{hitLogs.length}회</div>
                    </div>
                    <div className="bg-rose-950/50 p-2 rounded-lg border border-rose-800/60">
                      <div className="text-[10px] text-rose-400">꽝 (노피시)</div>
                      <div className="text-sm font-bold text-rose-300 font-mono">{hitlessLogs.length}회</div>
                    </div>
                  </div>
                  {(avgHitTemp || avgHitlessTemp) && (
                    <div className="text-[11px] text-slate-400 pt-1 flex justify-between border-t border-slate-800/80">
                      {avgHitTemp && <span>🐟 성공 시 평균수온: <strong className="text-emerald-300">{avgHitTemp}°C</strong></span>}
                      {avgHitlessTemp && <span>❌ 꽝 당시 평균수온: <strong className="text-rose-300">{avgHitlessTemp}°C</strong></span>}
                    </div>
                  )}
                </div>
              );
            })()}

            {catchLogs.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400 space-y-2">
                <Fish size={32} className="mx-auto text-slate-600" />
                <p className="text-sm">아직 등록된 조과 기록이 없습니다.</p>
                <p className="text-xs text-slate-500">
                  첫 손맛이나 꽝 경험 당시의 기상·해양 환경을 기록해 보세요!
                </p>
              </div>
            ) : (
              catchLogs.map((log) => {
                const isHitless = (log.fish_count ?? 0) === 0 || log.is_hitless;

                return (
                  <div
                    key={log.id}
                    className={`p-3 rounded-xl space-y-2 text-xs border transition ${
                      isHitless
                        ? 'bg-rose-950/20 border-rose-900/40 hover:border-rose-700/60'
                        : 'bg-slate-850/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isHitless ? (
                          <>
                            <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[11px] shadow-sm flex items-center gap-1">
                              <span>💔 꽝</span>
                              <span className="text-[10px] opacity-90">(떠나버린 물고기)</span>
                            </span>
                            <span className="text-sm font-bold text-rose-200">
                              대상어: {log.fish_species}
                            </span>
                            <span className="text-slate-400 text-[11px]">(0수 / 입질 없음)</span>
                          </>
                        ) : (
                          <>
                            <span className="text-base font-bold text-emerald-400">
                              {log.fish_species}
                            </span>
                            {log.fish_size_cm && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-bold">
                                {log.fish_size_cm} cm
                              </span>
                            )}
                            <span className="text-slate-300">({log.fish_count}수)</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
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

                    {/* 출조 시간대 정보 (시작~종료 및 총 낚시시간) */}
                    {(log.start_time || log.end_time || log.duration_minutes) && (
                      <div className="text-[11px] text-slate-300 flex items-center gap-1.5">
                        <Clock size={11} className="text-cyan-400" />
                        <span>낚시 시간: </span>
                        <span className="font-mono text-cyan-200">
                          {log.start_time || ''} ~ {log.end_time || ''}
                        </span>
                        {log.duration_minutes != null && log.duration_minutes > 0 && (
                          <span className="text-amber-300 font-medium">
                            ({Math.floor(log.duration_minutes / 60)}시간 {log.duration_minutes % 60}분간)
                          </span>
                        )}
                      </div>
                    )}

                    {/* 당시 환경 스냅샷 배지 (풍향, 풍속, 수온, 물때, 조류) */}
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
                      {log.wind_direction != null && (
                        <span className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-200 border border-cyan-800/60 font-mono flex items-center gap-1">
                          🧭 {log.wind_direction}° ({getCompassDirection(log.wind_direction)})
                        </span>
                      )}
                      {log.current_velocity != null && (
                        <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-900/60 font-mono">
                          🧭 조류 {formatCurrentVelocity(log.current_velocity, currentUnit)}
                        </span>
                      )}
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

                    {log.memo && (
                      <div className={`p-2 rounded text-slate-300 leading-relaxed ${isHitless ? 'bg-rose-950/30 border border-rose-900/30' : 'bg-slate-900'}`}>
                        {log.memo}
                      </div>
                    )}

                    {/* AI 꽝 사후 복기 브리핑 ("떠나버린 물고기를 기리며") */}
                    {isHitless && (() => {
                      const pm = generatePostMortemReport({
                        targetSpecies: log.fish_species || '우럭',
                        catchTime: log.catch_time || '16:00',
                        weather: {
                          temp: 18,
                          apparentTemp: 18,
                          windSpeed: log.wind_speed || 4.5,
                          windDirection: log.wind_direction || 180,
                          windGust: (log.wind_speed || 4.5) * 1.3,
                          weatherCode: 0,
                          weatherText: '맑음',
                          humidity: 60,
                          hourly: { time: [], temp: [], windSpeed: [], windDirection: [], pop: [] },
                        },
                        marine: {
                          seaSurfaceTemp: log.water_temp || 16.5,
                          waveHeight: 0.8,
                          wavePeriod: 6.0,
                          currentVelocity: log.current_velocity || 0.35,
                          waveDirection: 180,
                          currentDirection: 135,
                          hourly: { time: [], seaSurfaceTemp: [], waveHeight: [], currentVelocity: [], currentDirection: [] },
                        },
                        tide: null,
                        biteScore: null,
                      });
                      return (
                        <div className="mt-1.5 p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-[11px] space-y-1.5 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between text-rose-300 font-bold border-b border-rose-900/50 pb-1">
                            <span>💔 실패 원인 분석: {pm.topFactors[0]?.name} ({pm.topFactors[0]?.contributionPercent}%)</span>
                            <span className="text-[10px] text-slate-400 font-mono">7대 환경벡터</span>
                          </div>
                          <div className="text-[10.5px] text-slate-300 leading-snug">{pm.topFactors[0]?.description}</div>
                          <div className="text-[10px] text-amber-300 bg-slate-900/90 p-2 rounded-lg border border-slate-800 mt-0.5">
                            {pm.tacticalAdvice}
                          </div>
                        </div>
                      );
                    })()}

                    {log.photo_url && (
                      <div className="mt-2 h-32 rounded-lg overflow-hidden border border-slate-800">
                        <img src={log.photo_url} alt="Catch" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'DIRECTIONS' && (
          <div className="space-y-3 text-sm">
            {/* [요구사항 7] 입질 지수 기준 및 체크리스트 (정보 탭으로 이동) */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span>🧭</span>
                <span>출조 지원 & 평가 기준 안내</span>
              </span>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsBiteScoreHelpOpen(true)}
                  className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                  title="입질 종합 지수(Bite Index) 평가 기준 설명 열람"
                >
                  <Info size={14} className="text-amber-400 shrink-0" />
                  <span>입질지수 기준</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsChecklistOpen(true)}
                  className="p-2.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
                  title="출조 필수품 및 안전 점검 체크리스트 열기"
                >
                  <span className="shrink-0">🎒</span>
                  <span>체크리스트</span>
                </button>
              </div>
            </div>

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
                <div className="pt-1.5 flex">
                  <a
                    href={`https://map.kakao.com/link/roadview/${spot.lat},${spot.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs border border-amber-500/40 transition shadow"
                  >
                    <span>🚗 카카오 로드뷰로 진입로/주차장 360° 현장 미리보기</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
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
                {spot.casting_directions && spot.casting_directions.length > 0 && (
                  <div>
                    <strong className="text-slate-400">캐스팅 공략 방향:</strong>{' '}
                    <span className="text-cyan-300 font-semibold">
                      {spot.casting_directions.includes('ALL') ? '전방위 (모든 방향)' : spot.casting_directions.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 공략 및 채비 메모 */}
            {spot.description && (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                <span className="text-xs font-bold text-slate-300">💡 채비 및 수심 공략 팁</span>
                <p className="text-xs text-slate-300 leading-relaxed">{spot.description}</p>
              </div>
            )}

            {/* [항목 3] 유저 맞춤형 공기역학 채비 항력 계수(Cd) & 로드 탄성 캘리브레이터 */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sliders size={14} className="text-cyan-400" />
                  <span>장비·채비 공기역학 캘리브레이터</span>
                </span>
                <span className="text-[10.5px] font-mono text-cyan-400 font-bold bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800/60">
                  기준 사거리 {tackleConfig.calibratedDistanceMeters}m
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                {/* 1. 로드 구분 (루어대 vs 원투대) */}
                <div className="space-y-1.5">
                  <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        const newPower: RodPower = 'ML';
                        const newLenM = 2.6;
                        const updated = saveTackleConfig(tackleConfig.weightGrams, tackleConfig.peLineSize, newPower, newLenM);
                        setTackleConfig(updated);
                      }}
                      className={`flex-1 py-1 text-center text-[11px] font-bold rounded-md transition ${
                        tackleConfig.rodType === 'LURE'
                          ? 'bg-cyan-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🎣 루어대 (UL ~ H)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newPower: RodPower = 'SURF';
                        const newLenM = 4.2;
                        const newW = tackleConfig.weightGrams < 20 ? 93.8 : tackleConfig.weightGrams;
                        const updated = saveTackleConfig(newW, tackleConfig.peLineSize, newPower, newLenM);
                        setTackleConfig(updated);
                        setPanelWeightCategory('SURF');
                      }}
                      className={`flex-1 py-1 text-center text-[11px] font-bold rounded-md transition ${
                        tackleConfig.rodType === 'SURF'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      🌊 원투대 (서프 8~40호)
                    </button>
                  </div>

                  {/* 루어대: 파워 6개 선택 & 1.6~3.0m 전장 */}
                  {tackleConfig.rodType === 'LURE' ? (
                    <div className="space-y-1.5 bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-300">루어대 파워 등급:</span>
                        <span className="font-mono font-bold text-cyan-300">
                          {tackleConfig.rodPower} (최적 {ROD_POWER_SPECS[tackleConfig.rodPower]?.optWeightG}g)
                        </span>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {(['UL', 'L', 'ML', 'M', 'MH', 'H'] as RodPower[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              const updated = saveTackleConfig(
                                tackleConfig.weightGrams,
                                tackleConfig.peLineSize,
                                p,
                                tackleConfig.rodLengthM
                              );
                              setTackleConfig(updated);
                            }}
                            className={`py-1 rounded text-[10.5px] font-bold font-mono transition ${
                              tackleConfig.rodPower === p
                                ? 'bg-cyan-500 text-slate-950 shadow ring-1 ring-cyan-300'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                      <div className="text-[9.5px] text-cyan-400/90 leading-tight">
                        * {ROD_POWER_SPECS[tackleConfig.rodPower]?.description}
                      </div>

                      {/* 루어대 전장 1.6m ~ 3.0m (ft 동시 표기) */}
                      <div className="space-y-1 pt-1 border-t border-slate-800/80">
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-slate-300">루어대 전장:</span>
                          <span className="font-mono font-bold text-cyan-300">
                            {tackleConfig.rodLengthM.toFixed(1)}m ({tackleConfig.rodLengthFt.toFixed(1)}ft)
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1.6}
                          max={3.0}
                          step={0.1}
                          value={tackleConfig.rodLengthM}
                          onChange={(e) => {
                            const lenM = Number(e.target.value);
                            const updated = saveTackleConfig(
                              tackleConfig.weightGrams,
                              tackleConfig.peLineSize,
                              tackleConfig.rodPower,
                              lenM
                            );
                            setTackleConfig(updated);
                          }}
                          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                        />
                        <div className="flex flex-wrap gap-1">
                          {[
                            { m: 1.8, label: '1.8m (5.9ft)' },
                            { m: 2.1, label: '2.1m (6.9ft)' },
                            { m: 2.4, label: '2.4m (7.9ft)' },
                            { m: 2.6, label: '2.6m (8.6ft)' },
                            { m: 3.0, label: '3.0m (9.8ft)' },
                          ].map((item) => (
                            <button
                              key={item.m}
                              type="button"
                              onClick={() => {
                                const updated = saveTackleConfig(
                                  tackleConfig.weightGrams,
                                  tackleConfig.peLineSize,
                                  tackleConfig.rodPower,
                                  item.m
                                );
                                setTackleConfig(updated);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition ${
                                Math.abs(tackleConfig.rodLengthM - item.m) < 0.05
                                  ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/80 font-bold'
                                  : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 border border-slate-800'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* 원투대: 고정 규격 길이 (2.7, 3.3, 4.2, 4.5, 5.4m) */
                    <div className="space-y-1.5 bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-300">원투대 규격 전장 (m/ft):</span>
                        <span className="font-mono font-bold text-amber-300">
                          {tackleConfig.rodLengthM.toFixed(1)}m ({tackleConfig.rodLengthFt.toFixed(1)}ft)
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { m: 2.7, sub: '8.9ft' },
                          { m: 3.3, sub: '10.8ft' },
                          { m: 4.2, sub: '13.8ft' },
                          { m: 4.5, sub: '14.8ft' },
                          { m: 5.4, sub: '17.7ft' },
                        ].map((surf) => (
                          <button
                            key={surf.m}
                            type="button"
                            onClick={() => {
                              const updated = saveTackleConfig(
                                tackleConfig.weightGrams,
                                tackleConfig.peLineSize,
                                'SURF',
                                surf.m
                              );
                              setTackleConfig(updated);
                            }}
                            className={`py-1.5 px-0.5 rounded flex flex-col items-center justify-center transition ${
                              Math.abs(tackleConfig.rodLengthM - surf.m) < 0.05
                                ? 'bg-amber-500 text-slate-950 font-bold shadow ring-1 ring-amber-300'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                            }`}
                          >
                            <span className="text-[10px] font-mono font-bold leading-tight">{surf.m}m</span>
                            <span className="text-[8px] opacity-75 font-mono">{surf.sub}</span>
                          </button>
                        ))}
                      </div>
                      <div className="text-[9px] text-amber-300/90 leading-tight">
                        * 원투대는 휨·탄성의 왜곡보다 "추 무게(8~40호)"와 "로드 길이"가 비거리를 지배합니다.
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. 추 / 봉돌 무게 선택 (지그헤드, 온스, 주꾸미, 원투봉돌) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-300">추/봉돌 무게:</span>
                    <span className="font-mono font-bold text-cyan-300">
                      {tackleConfig.weightGrams}g
                      <span className="text-[9.5px] text-slate-400 font-normal ml-1">
                        ({getWeightDescription(tackleConfig.weightGrams)})
                      </span>
                    </span>
                  </div>

                  {/* 카테고리 탭 (4개) */}
                  <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-900 rounded-lg border border-slate-800">
                    {[
                      { cat: 'JIG' as WeightCategory, label: '지그헤드', desc: '1~5g' },
                      { cat: 'OZ' as WeightCategory, label: '온스(oz)', desc: '1/32~1oz' },
                      { cat: 'JUKKUMI' as WeightCategory, label: '주꾸미', desc: '3~7호' },
                      { cat: 'SURF' as WeightCategory, label: '원투봉돌', desc: '8~40호' },
                    ].map((tab) => (
                      <button
                        key={tab.cat}
                        type="button"
                        onClick={() => setPanelWeightCategory(tab.cat)}
                        className={`py-1 rounded text-center transition ${
                          panelWeightCategory === tab.cat
                            ? 'bg-slate-800 text-cyan-300 font-bold border border-cyan-500/50 shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="text-[10px] leading-tight">{tab.label}</div>
                        <div className="text-[8px] opacity-75 font-mono leading-tight">{tab.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* 프리셋 버튼 목록 */}
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-slate-900/70 rounded-lg border border-slate-800">
                    {WEIGHT_PRESETS.filter((p) => p.category === panelWeightCategory).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          const updated = saveTackleConfig(
                            preset.weightGrams,
                            tackleConfig.peLineSize,
                            tackleConfig.rodPower,
                            tackleConfig.rodLengthM
                          );
                          setTackleConfig(updated);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono flex items-center gap-0.5 transition ${
                          Math.abs(tackleConfig.weightGrams - preset.weightGrams) < 0.15
                            ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                        }`}
                      >
                        <span>{preset.label}</span>
                        <span className="text-[8px] opacity-75">({preset.subLabel})</span>
                      </button>
                    ))}
                  </div>

                  {/* 슬라이더 1~150g */}
                  <input
                    type="range"
                    min={1}
                    max={150}
                    step={1}
                    value={Math.round(tackleConfig.weightGrams)}
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      const updated = saveTackleConfig(
                        w,
                        tackleConfig.peLineSize,
                        tackleConfig.rodPower,
                        tackleConfig.rodLengthM
                      );
                      setTackleConfig(updated);
                    }}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between text-[8.5px] text-slate-500 font-mono">
                    <span>1g (지그)</span>
                    <span>28g (1oz)</span>
                    <span>75g (20호)</span>
                    <span>150g (40호)</span>
                  </div>
                </div>

                {/* 3. 합사 라인 호수 슬라이더 (0.4~3.0호) */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-300">합사(PE) 라인 굵기:</span>
                    <span className="font-mono font-bold text-cyan-300">{tackleConfig.peLineSize.toFixed(1)}호</span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={3.0}
                    step={0.1}
                    value={tackleConfig.peLineSize}
                    onChange={(e) => {
                      const pe = Number(e.target.value);
                      const updated = saveTackleConfig(
                        tackleConfig.weightGrams,
                        pe,
                        tackleConfig.rodPower,
                        tackleConfig.rodLengthM
                      );
                      setTackleConfig(updated);
                    }}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between text-[8.5px] text-slate-500 font-mono">
                    <span>0.4호 (아징)</span>
                    <span>1.0호 (에깅)</span>
                    <span>2.0호 (원투)</span>
                    <span>3.0호 (대물)</span>
                  </div>
                </div>

                {/* 4. 사거리 및 물리 특성 요약 */}
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-slate-300">
                    <span>공기역학 산출 사거리:</span>
                    <strong className="text-cyan-300 font-mono text-xs">{tackleConfig.calibratedDistanceMeters}m</strong>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[10.5px]">
                    <span>{tackleConfig.rodType === 'SURF' ? '원투 추진력 / 지렛대:' : '탄성효율 / 레버암:'}</span>
                    <span className="text-amber-300 font-mono">
                      {tackleConfig.rodType === 'SURF' ? '원심력 ' : 'η '}
                      {Math.round(tackleConfig.rodElasticityEfficiency * 100)}% / ×{tackleConfig.rodLengthFactor}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[10.5px]">
                    <span>지도 동심원 눈금 링 반경:</span>
                    <span className="text-emerald-400 font-mono font-semibold">{tackleConfig.radii.join('m · ')}m</span>
                  </div>
                </div>

                {/* 실시간 조류 연동 수심별 바닥 안착(폴링) 카운트다운 가이드 표 */}
                {(() => {
                  const curVel = marine?.currentVelocity ?? 0.3;
                  const sampleDepths = [3, 5, 8, 12, 18];
                  return (
                    <div className="p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-800/50 space-y-1.5 text-[11px]">
                      <div className="flex justify-between items-center font-bold text-cyan-300">
                        <span>⏱️ 조류 연동 수심별 바닥 안착 카운트</span>
                        <span className="font-mono text-[10px] text-slate-400 font-normal">
                          (현재 조류 {curVel}m/s 반영)
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1 text-center pt-1 font-mono text-[10.5px]">
                        {sampleDepths.map((d) => {
                          const p = calculateSinkingPhysics(tackleConfig.weightGrams, d, curVel);
                          return (
                            <div key={d} className="p-1 rounded bg-slate-900/90 border border-slate-800 flex flex-col">
                              <span className="text-slate-400 text-[9.5px]">수심 {d}m</span>
                              <span className="font-bold text-amber-300">{p.fallTimeSec}초</span>
                              <span className="text-[8.5px] text-slate-500">+{p.driftDistanceM}m</span>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[9.5px] text-slate-400 pt-0.5 leading-snug">
                        💡 캐스팅 후 위 초만큼 카운트다운한 뒤 릴링/액션을 시작하면 밑걸림 없이 바닥권 입질을 유도할 수 있습니다.
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 유튜브 실시간 현장 조황 & 낚시 영상 링크 (최신순 검색) */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-rose-600 flex items-center justify-center text-white text-[10px] font-black">
                    ▶
                  </span>
                  <span>유튜브 최근 현장 조황 & 공략 영상</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium">최신 업로드순</span>
              </div>
              <p className="text-[11px] text-slate-400">
                유튜브에서 최근 업로드된 이 포인트의 생생한 실시간 조황 및 공략 영상을 확인하세요.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 1. 포인트 전체 최신 조황 */}
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(spot.name + ' 낚시')}&sp=CAI%253D`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40 hover:border-rose-600/60 text-slate-200 transition flex items-center justify-between group"
                >
                  <div className="truncate pr-2">
                    <div className="text-xs font-bold text-white group-hover:text-rose-300 truncate">
                      📺 {spot.name} 낚시
                    </div>
                    <div className="text-[10px] text-slate-400">최근 조황 영상 보기</div>
                  </div>
                  <ExternalLink size={13} className="text-rose-400 group-hover:text-rose-300 shrink-0" />
                </a>

                {/* 2. 네비 명칭이 다를 경우 네비 지명 조황 */}
                {spot.navi_name && spot.navi_name !== spot.name && (
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(spot.navi_name + ' 낚시')}&sp=CAI%253D`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-rose-700/50 text-slate-200 transition flex items-center justify-between group"
                  >
                    <div className="truncate pr-2">
                      <div className="text-xs font-bold text-white group-hover:text-rose-300 truncate">
                        📺 {spot.navi_name} 낚시
                      </div>
                      <div className="text-[10px] text-slate-400">주변 지명 탐색</div>
                    </div>
                    <ExternalLink size={13} className="text-slate-400 group-hover:text-rose-400 shrink-0" />
                  </a>
                )}

                {/* 3. 대상 어종별 맞춤 최신 조황 */}
                {spot.target_species.slice(0, 4).map((sp, idx) => (
                  <a
                    key={idx}
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${spot.name} ${sp} 낚시`)}&sp=CAI%253D`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-cyan-600/50 text-slate-200 transition flex items-center justify-between group"
                  >
                    <div className="truncate pr-2">
                      <div className="text-xs font-bold text-white group-hover:text-cyan-300 truncate">
                        🐟 {spot.name} {sp}
                      </div>
                      <div className="text-[10px] text-slate-400">{sp} 실시간 공략 영상</div>
                    </div>
                    <ExternalLink size={13} className="text-slate-400 group-hover:text-cyan-400 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 💬 커뮤니티 현장 메모 (Spot Memos / 실시간 팁 & 방명록) */}
        {activeTab === 'MEMOS' && (
          <div className="space-y-3 text-xs">
            {/* 상단 안내 카드 */}
            <div className="p-3.5 bg-gradient-to-r from-slate-900 to-indigo-950/60 border border-indigo-900/40 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-indigo-300">
                <MessageSquare size={14} />
                <span>조사님들의 실시간 현장 메모 & 방명록</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                현장 진입로 상태, 갯바위 안전 주의, 주차 혼잡도, 실시간 물돌이 팁 등 생생한 정보를 공유해 주세요!
              </p>
            </div>

            {/* 새 메모 작성 폼 */}
            <form onSubmit={handleAddSpotMemo} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-300 text-[11px]">✍️ 새 현장 메모 남기기</span>
                <span className="text-[10px] text-slate-500">누구나 자유롭게 작성 가능</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">작성자 닉네임</label>
                  <input
                    type="text"
                    required
                    value={newMemoAuthor}
                    onChange={(e) => setNewMemoAuthor(e.target.value)}
                    placeholder="조사 닉네임"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-medium focus:outline-none focus:border-cyan-400 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-0.5">메모 유형</label>
                  <select
                    value={newMemoTag}
                    onChange={(e) => setNewMemoTag(e.target.value as SpotMemoTag)}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white focus:outline-none focus:border-cyan-400 text-xs"
                  >
                    <option value="GENERAL">💬 일반 팁</option>
                    <option value="SAFETY">⚠️ 안전 주의</option>
                    <option value="PARKING">🚗 주차/진입로</option>
                    <option value="CONDITION">🌊 바다/조황상황</option>
                  </select>
                </div>
              </div>

              <div>
                <textarea
                  rows={2}
                  required
                  value={newMemoContent}
                  onChange={(e) => setNewMemoContent(e.target.value)}
                  placeholder="예: 간조 2시간 전부터 진입로가 드러납니다. 갯바위 젖은 곳 매우 미끄러우니 안전 유의하세요!"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 text-xs leading-relaxed"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmittingMemo || !newMemoContent.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold transition shadow"
                >
                  <Send size={12} />
                  <span>{isSubmittingMemo ? '등록 중...' : '현장 메모 등록'}</span>
                </button>
              </div>
            </form>

            {/* 태그 필터 칩 */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {[
                { id: 'ALL', label: '전체 메모' },
                { id: 'SAFETY', label: '⚠️ 안전주의' },
                { id: 'PARKING', label: '🚗 주차/진입' },
                { id: 'CONDITION', label: '🌊 바다상황' },
                { id: 'GENERAL', label: '💬 일반팁' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setMemoFilterTag(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium shrink-0 transition ${
                    memoFilterTag === f.id
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 메모 카드 리스트 */}
            {(() => {
              const filtered = spotMemos.filter((m) => memoFilterTag === 'ALL' || m.tag === memoFilterTag);

              if (filtered.length === 0) {
                return (
                  <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 text-slate-400 space-y-1">
                    <MessageSquare size={28} className="mx-auto text-slate-600" />
                    <p className="text-xs">등록된 현장 메모가 없습니다.</p>
                    <p className="text-[11px] text-slate-500">첫 번째 현장 팁을 남겨보세요!</p>
                  </div>
                );
              }

              return filtered.map((m) => {
                const isSafety = m.tag === 'SAFETY';
                const isParking = m.tag === 'PARKING';
                const isCondition = m.tag === 'CONDITION';

                const tagBadge = isSafety ? (
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold flex items-center gap-1">
                    <ShieldAlert size={10} />
                    안전주의
                  </span>
                ) : isParking ? (
                  <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[10px] font-bold">
                    🚗 주차/진입
                  </span>
                ) : isCondition ? (
                  <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 text-[10px] font-bold">
                    🌊 바다상황
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                    💬 일반팁
                  </span>
                );

                const dateStr = new Date(m.created_at).toLocaleDateString('ko-KR', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={m.id}
                    className={`p-3 rounded-xl space-y-1.5 border transition ${
                      isSafety
                        ? 'bg-rose-950/20 border-rose-900/40'
                        : isParking
                        ? 'bg-amber-950/15 border-amber-900/40'
                        : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {tagBadge}
                        <span className="font-bold text-slate-200 text-xs">{m.user_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-mono">{dateStr}</span>
                        <button
                          onClick={() => handleDeleteSpotMemo(m.id)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                          title="메모 삭제"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                    <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-line pl-0.5">
                      {m.content}
                    </p>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* 출조 필수품 & 안전 점검 체크리스트 모달 */}
      <ChecklistModal
        isOpen={isChecklistOpen}
        onClose={() => setIsChecklistOpen(false)}
        spotName={spot.name}
        mulText={tide?.mulText}
      />

      {/* 입질 종합 지수 평가 기준 설명 모달 */}
      <BiteScoreHelpModal
        isOpen={isBiteScoreHelpOpen}
        onClose={() => setIsBiteScoreHelpOpen(false)}
      />
    </div>
  );
};
