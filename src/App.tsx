import React from 'react';
import { ChevronUp, Filter, HelpCircle, List, Loader2, LogIn, Navigation2, Plus, Search, User, X } from 'lucide-react';
import { MapView } from './components/MapView';
import { SpotDetailPanel } from './components/SpotDetailPanel';
import { SpotFormModal } from './components/SpotFormModal';
import { CatchLogModal } from './components/CatchLogModal';
import { type AuthUser, getSavedAuthUser, LoginModal } from './components/LoginModal';
import { SpotListModal, type SpotRealtimeSummary } from './components/SpotListModal';
import { BiteScoreHelpModal } from './components/BiteScoreHelpModal';
import { ChecklistModal } from './components/ChecklistModal';
import type {
  BiteScoreBreakdown,
  CatchLog,
  CurrentUnit,
  FishingMethod,
  FishingSpot,
  MarineData,
  TideDayInfo,
  WeatherData,
  WindUnit
} from './types';
import { calculateTideDay, getDistanceKm } from './utils/tideEngine';
import { fetchMarineData, fetchWeatherData, getWeatherText } from './utils/weatherApi';
import { calculateBiteScore } from './utils/biteScore';
import { extractExifFromImage } from './utils/exifExtractor';
import { searchPoi, type PoiSearchResult } from './utils/poiSearch';
import {
  deleteCloudCatchLog,
  deleteCloudSpot,
  fetchCloudLogs,
  fetchCloudSpots,
  getSupabase,
  saveCloudCatchLog,
  saveCloudSpot,
} from './utils/cloudDb';

export function App() {
  const [spots, setSpots] = React.useState<FishingSpot[]>([]);
  const [catchLogs, setCatchLogs] = React.useState<CatchLog[]>([]);
  const [selectedSpot, setSelectedSpot] = React.useState<FishingSpot | null>(null);
  const [editingSpot, setEditingSpot] = React.useState<FishingSpot | null>(null);
  const [editingCatchLog, setEditingCatchLog] = React.useState<CatchLog | null>(null);

  // 모바일 드로워 표시 상태 (모바일 시작 시 지도 우선 표시 위해 초기값 false, PC는 true)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return false;
  });

  // 로그인 상태 관리 (Email & ID 확인, PW 불필요)
  const [currentUser, setCurrentUser] = React.useState<AuthUser | null>(() => getSavedAuthUser());
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);

  // 환경 데이터 상태
  const [weather, setWeather] = React.useState<WeatherData | null>(null);
  const [marine, setMarine] = React.useState<MarineData | null>(null);
  const [tide, setTide] = React.useState<TideDayInfo | null>(null);
  const [biteScore, setBiteScore] = React.useState<BiteScoreBreakdown | null>(null);

  // 단위 변환 설정 상태 (바람 및 조류 초기 단위는 m/s로 통일)
  const [windUnit, setWindUnit] = React.useState<WindUnit>('ms');
  const [currentUnit, setCurrentUnit] = React.useState<CurrentUnit>('ms');

  // 필터 및 검색 상태
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedMethodFilter, setSelectedMethodFilter] = React.useState<FishingMethod | 'ALL'>('ALL');
  const [viewOnlyMySpots, setViewOnlyMySpots] = React.useState(false);

  // POI 검색 및 지도 이동 상태
  const [poiResults, setPoiResults] = React.useState<PoiSearchResult[]>([]);
  const [isSearchingPoi, setIsSearchingPoi] = React.useState(false);
  const [showPoiDropdown, setShowPoiDropdown] = React.useState(false);
  const [recenterTarget, setRecenterTarget] = React.useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // 모달 상태
  const [isSpotModalOpen, setIsSpotModalOpen] = React.useState(false);
  const [isCatchLogModalOpen, setIsCatchLogModalOpen] = React.useState(false);
  const [isSpotListModalOpen, setIsSpotListModalOpen] = React.useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = React.useState(false);
  const [isChecklistModalOpen, setIsChecklistModalOpen] = React.useState(false);
  const [newSpotLat, setNewSpotLat] = React.useState<number | undefined>();
  const [newSpotLng, setNewSpotLng] = React.useState<number | undefined>();

  // 포인트별 실시간 환경 요약 캐시 (리스트 보기 전용)
  const [environmentMap, setEnvironmentMap] = React.useState<Record<string, SpotRealtimeSummary>>({});
  const [userLocation, setUserLocation] = React.useState<{ lat: number; lng: number } | null>(null);

  // 기기 로컬 저장소 대신 오직 Supabase DB에서만 포인트 및 조과 데이터 로드
  const reloadData = React.useCallback(async () => {
    try {
      const [cSpots, cLogs] = await Promise.all([
        fetchCloudSpots(),
        fetchCloudLogs(),
      ]);
      setSpots(cSpots);
      setCatchLogs(cLogs);
      if (cSpots.length > 0 && !selectedSpot) {
        // 첫 진입 시 포인트 정보는 로드하되, 지도는 내 위치 중심으로 유지하도록 shouldRecenter=false 전달
        handleSelectSpot(cSpots[0], false);
      }
    } catch (err) {
      console.error('Supabase 데이터 로드 실패:', err);
    }
  }, [selectedSpot]);

  React.useEffect(() => {
    reloadData();
  }, [reloadData]);

  // 사용자 GPS 현재 위치 백그라운드 확인 및 초기 지도 중심을 내 위치로 이동
  React.useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLocation(userPos);
          // 웹 진입 시 지도를 내 위치로 우선 자동 이동
          setRecenterTarget({ lat: userPos.lat, lng: userPos.lng, zoom: 14 });
        },
        (err) => {
          console.warn('Geolocation 권한 미허용 또는 에러:', err);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, []);

  // 모든 포인트의 실시간 요약 데이터(환경 & 물때 & 입질지수) 백그라운드 병렬 수집
  React.useEffect(() => {
    if (spots.length === 0) return;

    let isMounted = true;
    const loadSummaries = async () => {
      const now = new Date();
      const currentHour = now.getHours();

      // 주요 포인트별 병렬 fetch (동시 최대 10개)
      const entries = await Promise.all(
        spots.map(async (spot) => {
          try {
            const tideData = calculateTideDay(spot.lat, spot.lng, now);
            const currentTide = tideData.hourlyCurve.find((c) => c.hour === currentHour);

            const [w, m] = await Promise.all([
              fetchWeatherData(spot.lat, spot.lng),
              fetchMarineData(spot.lat, spot.lng),
            ]);

            const bScore = calculateBiteScore(spot, w, m, tideData, currentUser?.favoriteSpecies);
            const dist = userLocation
              ? getDistanceKm(userLocation.lat, userLocation.lng, spot.lat, spot.lng)
              : undefined;

            const summary: SpotRealtimeSummary = {
              temp: w.temp,
              weatherText: w.weatherText,
              windSpeed: w.windSpeed,
              windDir: w.windDirection,
              seaTemp: m.seaSurfaceTemp,
              waveHeight: m.waveHeight,
              currentVel: m.currentVelocity,
              currentDir: m.currentDirection,
              mulText: tideData.mulText,
              tideHeight: currentTide?.height ?? 0,
              biteScore: bScore.totalScore,
              distanceKm: dist,
            };
            return [spot.id, summary] as const;
          } catch {
            return null;
          }
        })
      );

      if (isMounted) {
        const nextMap: Record<string, SpotRealtimeSummary> = {};
        for (const item of entries) {
          if (item) {
            nextMap[item[0]] = item[1];
          }
        }
        setEnvironmentMap(nextMap);
      }
    };

    loadSummaries();
    return () => {
      isMounted = false;
    };
  }, [spots, userLocation, currentUser?.favoriteSpecies]);

  // Supabase 실시간 동기화 구독 (PC ⇄ 모바일 실시간 전파)
  React.useEffect(() => {
    const client = getSupabase();

    const channel = client
      .channel('espfish_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fishing_spots' }, async () => {
        try {
          const cSpots = await fetchCloudSpots();
          setSpots(cSpots);
        } catch (e) {
          console.error('Realtime spot reload error:', e);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catch_logs' }, async () => {
        try {
          const cLogs = await fetchCloudLogs();
          setCatchLogs(cLogs);
        } catch (e) {
          console.error('Realtime log reload error:', e);
        }
      })
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  // 포인트 선택 시 날씨/해양/물때/입질지수 Fetch & 연산
  const handleSelectSpot = async (spot: FishingSpot, shouldRecenter: boolean = true) => {
    setSelectedSpot(spot);
    setIsMobileDrawerOpen(true); // 모바일에서 선택 시 드로워 열기
    if (shouldRecenter) {
      setRecenterTarget({ lat: spot.lat, lng: spot.lng, zoom: 14 });
    }

    // 1. 한국형 물때 & 72시간 연속 조석 곡선 & 3일간 일출일몰 즉시 계산
    const tideData = calculateTideDay(spot.lat, spot.lng, new Date());
    setTide(tideData);

    // 2. Open-Meteo Weather & Marine API 병렬 Fetch (48h+ 예보 지원)
    try {
      const [weatherData, marineData] = await Promise.all([
        fetchWeatherData(spot.lat, spot.lng),
        fetchMarineData(spot.lat, spot.lng),
      ]);
      setWeather(weatherData);
      setMarine(marineData);

      // 3. ExFish AI 입질 지수 도출 (로그인 유저의 관심 어종 가중치 자동 반영)
      const score = calculateBiteScore(spot, weatherData, marineData, tideData, currentUser?.favoriteSpecies);
      setBiteScore(score);
    } catch (err) {
      console.error('Error fetching marine/weather data:', err);
    }
  };

  // 로그인 유저의 관심 어종(favoriteSpecies) 변경 시, 현재 선택된 포인트의 입질 지수 실시간 재연산
  React.useEffect(() => {
    if (selectedSpot && weather && marine && tide) {
      const score = calculateBiteScore(selectedSpot, weather, marine, tide, currentUser?.favoriteSpecies);
      setBiteScore(score);
    }
  }, [currentUser?.favoriteSpecies]);

  // 지도 클릭을 통한 새 포인트 추가 트리거
  const handleMapClickForNewSpot = (lat: number, lng: number) => {
    setEditingSpot(null);
    setNewSpotLat(lat);
    setNewSpotLng(lng);
    setIsSpotModalOpen(true);
  };

  // 새 포인트 저장 및 수정 핸들러 (오직 Supabase DB에 직접 저장)
  const handleSaveSpot = async (spotData: Omit<FishingSpot, 'id' | 'user_id' | 'author_name' | 'created_at'>) => {
    try {
      if (editingSpot) {
        const updatedSpot: FishingSpot = { ...editingSpot, ...spotData };
        await saveCloudSpot(updatedSpot);
        const cSpots = await fetchCloudSpots();
        setSpots(cSpots);
        handleSelectSpot(updatedSpot);
        setEditingSpot(null);
      } else {
        const newSpot: FishingSpot = {
          ...spotData,
          id: `spot-${Date.now()}`,
          user_id: currentUser ? currentUser.id : 'user-me',
          author_name: currentUser ? currentUser.id : '나의 포인트',
          created_at: new Date().toISOString(),
        };
        await saveCloudSpot(newSpot);
        const cSpots = await fetchCloudSpots();
        setSpots(cSpots);
        handleSelectSpot(newSpot);
      }
      setIsSpotModalOpen(false);
      // 신규 등록 후 즉시 최신 데이터 반영 보장
      await reloadData();
    } catch (e: any) {
      console.error('Supabase spot save error:', e);
      alert(`Supabase DB 저장에 실패했습니다: ${e?.message || '연결 또는 권한을 확인하세요.'}`);
    }
  };

  // 포인트 삭제 핸들러 (오직 Supabase DB에서 직접 삭제)
  const handleDeleteSpot = async (spotId: string) => {
    try {
      await deleteCloudSpot(spotId);
      const updated = await fetchCloudSpots();
      setSpots(updated);

      if (selectedSpot?.id === spotId) {
        if (updated.length > 0) {
          handleSelectSpot(updated[0]);
        } else {
          setSelectedSpot(null);
          setIsMobileDrawerOpen(false);
        }
      }
    } catch (e: any) {
      console.error('Supabase spot delete error:', e);
      alert(`Supabase DB 삭제에 실패했습니다: ${e?.message || ''}`);
    }
  };

  // 포인트 수정 모달 열기
  const handleEditSpot = (spot: FishingSpot) => {
    setEditingSpot(spot);
    setIsSpotModalOpen(true);
  };

  // 조과 기록 생성 및 수정 핸들러 (오직 Supabase DB에 직접 저장)
  const handleSaveCatchLog = async (logData: Omit<CatchLog, 'id' | 'created_at'>) => {
    try {
      if (editingCatchLog) {
        const updatedLog: CatchLog = { ...editingCatchLog, ...logData };
        await saveCloudCatchLog(updatedLog);
        setEditingCatchLog(null);
      } else {
        const newLog: CatchLog = {
          ...logData,
          id: `log-${Date.now()}`,
          user_id: currentUser ? currentUser.id : (logData.user_id || 'user-me'),
          user_name: currentUser ? currentUser.id : (logData.user_name || '나의 조과'),
          created_at: new Date().toISOString(),
        };
        await saveCloudCatchLog(newLog);
      }
      const cLogs = await fetchCloudLogs();
      setCatchLogs(cLogs);
      setIsCatchLogModalOpen(false);
    } catch (e: any) {
      console.error('Supabase catch log save error:', e);
      alert(`Supabase DB 조과 저장에 실패했습니다: ${e?.message || ''}`);
    }
  };

  // 조과 기록 삭제 핸들러 (오직 Supabase DB에서 직접 삭제)
  const handleDeleteCatchLog = async (logId: string) => {
    try {
      await deleteCloudCatchLog(logId);
      const cLogs = await fetchCloudLogs();
      setCatchLogs(cLogs);
    } catch (e: any) {
      console.error('Supabase catch log delete error:', e);
      alert(`Supabase DB 조과 삭제에 실패했습니다: ${e?.message || ''}`);
    }
  };

  // POI 장소/항구 검색 트리거 (Photon + OSM 고속 검색)
  const handleExecutePoiSearch = async () => {
    if (!searchQuery || searchQuery.trim().length < 2) return;
    setIsSearchingPoi(true);
    setShowPoiDropdown(true);
    try {
      const results = await searchPoi(searchQuery.trim());
      setPoiResults(results);
    } catch (e) {
      console.error(e);
      setPoiResults([]);
    } finally {
      setIsSearchingPoi(false);
    }
  };

  // 필터링된 포인트 목록
  const filteredSpots = spots.filter((spot) => {
    if (viewOnlyMySpots && spot.user_id !== 'user-me' && spot.user_id !== 'user-esper-1') {
      return false;
    }
    if (selectedMethodFilter !== 'ALL' && !spot.fishing_methods.includes(selectedMethodFilter)) {
      return false;
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchName = spot.name.toLowerCase().includes(query);
      const matchSpecies = spot.target_species.some((sp) => sp.toLowerCase().includes(query));
      if (!matchName && !matchSpecies) return false;
    }
    return true;
  });

  const spotLogs = selectedSpot ? catchLogs.filter((log) => log.spot_id === selectedSpot.id) : [];

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 글로벌 상단 헤더 & 내비게이션 바 */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 shadow-md gap-2">
        {/* 로고 (PC 문구 제거, ExFish 브랜딩 적용) */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-2xl filter drop-shadow">🎣</span>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 bg-clip-text text-transparent">
              ExFish
            </span>
          </div>
        </div>

        {/* 검색 및 POI 검색 바 (중앙) */}
        <div className="relative flex items-center gap-1.5 flex-1 max-w-sm sm:max-w-md mx-1 sm:mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="포인트, 어종, 강릉시청 등 지명·항구 검색 (Enter)..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (showPoiDropdown) setShowPoiDropdown(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleExecutePoiSearch();
                }
              }}
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-full pl-8 sm:pl-9 pr-14 sm:pr-16 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowPoiDropdown(false);
                  setPoiResults([]);
                }}
                className="absolute right-20 top-2 text-slate-400 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
            <div className="absolute right-1 top-1 bottom-1 flex items-center gap-1">
              <button
                onClick={handleExecutePoiSearch}
                className="px-2.5 h-full bg-cyan-600 hover:bg-cyan-500 text-white rounded-full text-[11px] font-bold flex items-center gap-0.5 transition shadow"
                title="지도 장소 검색"
              >
                {isSearchingPoi ? <Loader2 size={11} className="animate-spin" /> : <Navigation2 size={11} />}
                <span>검색</span>
              </button>
              <button
                onClick={() => setIsSpotListModalOpen(true)}
                className="px-2.5 h-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-full text-[11px] font-bold flex items-center gap-1 transition shadow"
                title="전체 포인트 리스트 및 실시간 환경 열람"
              >
                <List size={12} />
                <span className="hidden sm:inline">리스트</span>
              </button>
            </div>
          </div>

          {/* 장소 검색 결과 드롭다운 팝오버 */}
          {showPoiDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden text-xs max-h-72 overflow-y-auto">
              <div className="px-3 py-1.5 bg-slate-800 text-[11px] text-slate-300 font-semibold flex justify-between items-center border-b border-slate-700">
                <span className="flex items-center gap-1">
                  🌐 <strong>'{searchQuery}'</strong> 전국 지명·항구 검색 결과
                </span>
                <button
                  onClick={() => setShowPoiDropdown(false)}
                  className="text-slate-400 hover:text-white p-0.5 rounded"
                >
                  <X size={13} />
                </button>
              </div>

              {isSearchingPoi ? (
                <div className="p-4 text-center text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin text-cyan-400" />
                  <span>전국 해안/관공서/항구 검색 중...</span>
                </div>
              ) : poiResults.length === 0 ? (
                <div className="p-4 text-center text-slate-400">
                  일치하는 장소를 찾지 못했습니다.
                </div>
              ) : (
                poiResults.map((poi, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setRecenterTarget({ lat: poi.lat, lng: poi.lng, zoom: 14 });
                      setShowPoiDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-cyan-950/70 border-b border-slate-800/80 flex items-start gap-2.5 text-slate-200 transition group"
                  >
                    <span className="text-cyan-400 mt-0.5 group-hover:scale-110 transition">📍</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white group-hover:text-cyan-300 transition truncate">
                        {poi.display_name.split('(')[0]}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{poi.display_name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        좌표: {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)} ({poi.type})
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 툴바: 헬프 버튼, 로그인 버튼 (PC 웹용), 단위 변환 토글 */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs">
          {/* 입질 종합 지수 평가 기준 헬프 버튼 */}
          <button
            onClick={() => setIsHelpModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold text-xs transition shadow-sm"
            title="입질 종합 지수(Bite Index) 평가 기준 설명"
          >
            <HelpCircle size={14} className="text-amber-400" />
            <span className="hidden sm:inline">입질지수 기준</span>
          </button>

          {/* 출조 필수품 & 안전 점검 체크리스트 버튼 */}
          <button
            onClick={() => setIsChecklistModalOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 font-semibold text-xs transition shadow-sm"
            title="출조 필수품 & 안전 점검 체크리스트"
          >
            <span>🎒</span>
            <span className="hidden sm:inline">체크리스트</span>
          </button>

          {/* PC 웹 로그인 / 회원 정보 버튼 (모바일에서는 아래 서브바로 이동) */}
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
              currentUser
                ? 'bg-slate-800/90 border-slate-700 text-cyan-300 hover:bg-slate-700 hover:text-white'
                : 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 border-cyan-500/50 text-cyan-300 hover:bg-cyan-600/40 hover:text-white shadow-sm'
            }`}
            title={currentUser ? `로그인됨: ${currentUser.id}` : '로그인하기 (Email & ID)'}
          >
            {currentUser ? <User size={14} className="text-cyan-400" /> : <LogIn size={14} className="text-cyan-400" />}
            <span>
              {currentUser ? currentUser.id : '로그인'}
            </span>
          </button>

          {/* 풍속 단위 변환 토글 */}
          <div className="hidden lg:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px]">
            <span className="px-1.5 text-slate-400">바람:</span>
            {(['ms', 'knot', 'kmh'] as WindUnit[]).map((u) => (
              <button
                key={u}
                onClick={() => setWindUnit(u)}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  windUnit === u ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {u === 'ms' ? 'm/s' : u === 'knot' ? 'knot' : 'km/h'}
              </button>
            ))}
          </div>

          {/* 조류 단위 변환 토글 */}
          <div className="hidden xl:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px]">
            <span className="px-1.5 text-slate-400">조류:</span>
            {(['knot', 'ms', 'cms'] as CurrentUnit[]).map((u) => (
              <button
                key={u}
                onClick={() => setCurrentUnit(u)}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  currentUnit === u ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {u === 'knot' ? 'knot' : u === 'ms' ? 'm/s' : 'cm/s'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* 서브 바: 모바일에서는 장르 선택을 제거하고 '내 포인트만 보기'와 '로그인'을 나란히 배치 */}
      <div className="h-10 bg-slate-900/90 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between text-xs shrink-0 overflow-x-auto">
        {/* PC 화면 전용 장르 필터 (모바일에서는 완전히 숨김) */}
        <div className="hidden md:flex items-center gap-1.5">
          <span className="text-slate-400 flex items-center gap-1 mr-1">
            <Filter size={12} /> 장르:
          </span>
          {[
            { id: 'ALL', label: '전체' },
            { id: 'LURE', label: '🎣 루어' },
            { id: 'SURF', label: '⚓ 원투' },
            { id: 'FLOAT', label: '🔴 찌낚시' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedMethodFilter(item.id as FishingMethod | 'ALL')}
              className={`px-2.5 py-1 rounded-full text-xs transition ${
                selectedMethodFilter === item.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 모바일 & 공통 액션: 내 포인트만 보기와 로그인 버튼 나란히 배치 */}
        <div className="flex items-center justify-between w-full md:w-auto gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewOnlyMySpots(!viewOnlyMySpots)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition ${
                viewOnlyMySpots
                  ? 'bg-cyan-950 border-cyan-600 text-cyan-300 font-bold'
                  : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <User size={13} />
              <span>내 포인트만 보기</span>
            </button>

            {/* 모바일 화면 전용 로그인 버튼 (내 포인트만 보기 바로 옆에 배치) */}
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className={`md:hidden flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                currentUser
                  ? 'bg-slate-800/90 border-slate-700 text-cyan-300'
                  : 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300'
              }`}
            >
              {currentUser ? <User size={12} className="text-cyan-400" /> : <LogIn size={12} className="text-cyan-400" />}
              <span>{currentUser ? currentUser.id : '로그인'}</span>
            </button>
          </div>

          <span className="text-[11px] text-slate-500">
            총 {filteredSpots.length}개 포인트
          </span>
        </div>
      </div>

      {/* 메인 2열 분할 레이아웃 (지도 캔버스 + 우측 상세 대시보드 패널) */}
      <main className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* 좌측(또는 전체 배경) OpenStreetMap 영역 */}
        <div className="flex-1 h-full w-full relative">
          <MapView
            spots={filteredSpots}
            selectedSpot={selectedSpot}
            onSelectSpot={handleSelectSpot}
            onMapClickForNewSpot={handleMapClickForNewSpot}
            weather={weather}
            marine={marine}
            tide={tide}
            windUnit={windUnit}
            currentUnit={currentUnit}
            recenterTarget={recenterTarget}
            isMobileDrawerOpen={Boolean(selectedSpot && isMobileDrawerOpen)}
          />
        </div>

        {/* PC 화면: 우측 사이드바 패널 (현 상태 유지) */}
        {selectedSpot && (
          <aside className="hidden md:block w-[440px] lg:w-[480px] h-full shrink-0 z-20 border-l border-slate-800 shadow-2xl">
            <SpotDetailPanel
              spot={selectedSpot}
              weather={weather}
              marine={marine}
              tide={tide}
              biteScore={biteScore}
              catchLogs={spotLogs}
              favoriteSpecies={currentUser?.favoriteSpecies}
              windUnit={windUnit}
              currentUnit={currentUnit}
              onToggleWindUnit={() => setWindUnit((prev) => prev === 'ms' ? 'knot' : prev === 'knot' ? 'kmh' : 'ms')}
              onToggleCurrentUnit={() => setCurrentUnit((prev) => prev === 'ms' ? 'knot' : prev === 'knot' ? 'cms' : 'ms')}
              onOpenCatchLogModal={() => {
                setEditingCatchLog(null);
                setIsCatchLogModalOpen(true);
              }}
              onEditLog={(log) => {
                setEditingCatchLog(log);
                setIsCatchLogModalOpen(true);
              }}
              onDeleteLog={handleDeleteCatchLog}
              onEditSpot={handleEditSpot}
              onDeleteSpot={handleDeleteSpot}
              onClose={() => setSelectedSpot(null)}
            />
          </aside>
        )}

        {/* 모바일 화면 1: 드로어가 열려 있을 때 화면 전체(100%)를 채워 밑부분이 잘리지 않게 함 (실시간 환경 숨김) */}
        {selectedSpot && isMobileDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-slate-900 flex flex-col animate-fade-in">
            <SpotDetailPanel
              spot={selectedSpot}
              weather={weather}
              marine={marine}
              tide={tide}
              biteScore={biteScore}
              catchLogs={spotLogs}
              favoriteSpecies={currentUser?.favoriteSpecies}
              windUnit={windUnit}
              currentUnit={currentUnit}
              onToggleWindUnit={() => setWindUnit((prev) => prev === 'ms' ? 'knot' : prev === 'knot' ? 'kmh' : 'ms')}
              onToggleCurrentUnit={() => setCurrentUnit((prev) => prev === 'ms' ? 'knot' : prev === 'knot' ? 'cms' : 'ms')}
              onOpenCatchLogModal={() => {
                setEditingCatchLog(null);
                setIsCatchLogModalOpen(true);
              }}
              onEditLog={(log) => {
                setEditingCatchLog(log);
                setIsCatchLogModalOpen(true);
              }}
              onDeleteLog={handleDeleteCatchLog}
              onEditSpot={handleEditSpot}
              onDeleteSpot={handleDeleteSpot}
              onClose={() => {
                setSelectedSpot(null);
                setIsMobileDrawerOpen(false);
              }}
              onMinimize={() => setIsMobileDrawerOpen(false)}
            />
          </div>
        )}

        {/* 모바일 화면 2: 드로어를 숨겼을 때 하단 플로팅 바를 통해 원터치로 다시 열 수 있도록 지원 */}
        {selectedSpot && !isMobileDrawerOpen && (
          <div className="md:hidden fixed bottom-4 left-4 right-4 z-30 animate-fade-in flex flex-col gap-2">
            <button
              onClick={() => setIsMobileDrawerOpen(true)}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold flex items-center justify-between shadow-2xl border border-cyan-400/40 transition active:scale-98"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-base">📍</span>
                <span className="truncate">{selectedSpot.name} 포인트 상세정보 열기</span>
              </div>
              <ChevronUp size={18} className="shrink-0 text-cyan-200" />
            </button>
          </div>
        )}

        {/* 플로팅 포인트 등록 버튼 (PC/모바일 공통: 모바일 드로어가 열려있을 때만 숨김) */}
        {!isMobileDrawerOpen && (
          <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-30">
            <button
              onClick={() => {
                setEditingSpot(null);
                setNewSpotLat(37.2541);
                setNewSpotLng(126.4982);
                setIsSpotModalOpen(true);
              }}
              className="px-4 py-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-2xl flex items-center gap-1.5 border border-cyan-400/50 active:scale-95 transition"
              title="새 낚시 포인트 등록"
            >
              <Plus size={16} />
              <span>포인트 등록</span>
            </button>
          </div>
        )}
      </main>

      {/* 포인트 등록 / 수정 모달 */}
      <SpotFormModal
        isOpen={isSpotModalOpen}
        onClose={() => {
          setIsSpotModalOpen(false);
          setEditingSpot(null);
        }}
        onSubmit={handleSaveSpot}
        editingSpot={editingSpot}
        initialLat={newSpotLat}
        initialLng={newSpotLng}
        extractExifFromImage={extractExifFromImage}
      />

      {/* 새 조과 기록 등록 및 수정 모달 (당시 환경 자동 스냅샷 박제 & 수정) */}
      {selectedSpot && (
        <CatchLogModal
          isOpen={isCatchLogModalOpen}
          onClose={() => {
            setIsCatchLogModalOpen(false);
            setEditingCatchLog(null);
          }}
          spotId={selectedSpot.id}
          spotName={selectedSpot.name}
          spotLat={selectedSpot.lat}
          spotLng={selectedSpot.lng}
          editingLog={editingCatchLog}
          currentWeather={weather}
          currentTide={tide}
          currentWaterTemp={marine?.seaSurfaceTemp || 17.5}
          currentVelocity={marine?.currentVelocity || 0.3}
          windUnit={windUnit}
          currentUnit={currentUnit}
          extractExifFromImage={extractExifFromImage}
          onSaveLog={handleSaveCatchLog}
        />
      )}

      {/* 간편 로그인 모달 (Email & ID 확인) */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        currentUser={currentUser}
        onLogin={(user) => setCurrentUser(user)}
        onLogout={() => setCurrentUser(null)}
        onUpdateFavorites={(favorites) => {
          if (currentUser) {
            setCurrentUser({ ...currentUser, favoriteSpecies: favorites });
          }
        }}
      />

      {/* 입질 종합 지수 평가 기준 설명 헬프 모달 */}
      <BiteScoreHelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />

      {/* 전국 포인트 리스트 모달 (필터, 소팅, 실시간 환경 요약) */}
      <SpotListModal
        isOpen={isSpotListModalOpen}
        onClose={() => setIsSpotListModalOpen(false)}
        spots={spots}
        selectedSpot={selectedSpot}
        onSelectSpot={handleSelectSpot}
        environmentMap={environmentMap}
        windUnit={windUnit}
        currentUnit={currentUnit}
        currentUserId={currentUser?.id}
        userCoords={userLocation}
      />
      {/* 출조 필수품 & 안전 점검 체크리스트 모달 */}
      <ChecklistModal
        isOpen={isChecklistModalOpen}
        onClose={() => setIsChecklistModalOpen(false)}
        spotName={selectedSpot?.name || '전국 포인트'}
        mulText={tide?.mulText}
      />
    </div>
  );
}

export default App;
