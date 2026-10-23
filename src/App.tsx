import React from 'react';
import { ChevronUp, Crosshair, Filter, HelpCircle, List, Loader2, LogIn, Navigation2, Plus, Search, User, X } from 'lucide-react';
import { MapView } from './components/MapView';
import { SpotDetailPanel } from './components/SpotDetailPanel';
import { SpotFormModal } from './components/SpotFormModal';
import { CatchLogModal } from './components/CatchLogModal';
import { type AuthUser, getSavedAuthUser, LoginModal } from './components/LoginModal';
import { SpotListModal, type SpotRealtimeSummary } from './components/SpotListModal';
import { BiteScoreHelpModal } from './components/BiteScoreHelpModal';
import { ChecklistModal } from './components/ChecklistModal';
import { SplashScreen } from './components/SplashScreen';
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
import { fetchMarineData, fetchWeatherData, formatWindSpeed, getCompassDirection, getWeatherText } from './utils/weatherApi';
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
import { cacheSpotMetadata, getAllCachedSpots, subscribeNetworkStatus } from './utils/offlineStorage';
import { setupHardwareBackButtonListener } from './utils/nativeBridge';

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

  // 로그인 상태 관리 (소셜 로그인 및 30일 세션 유지)
  const [currentUser, setCurrentUser] = React.useState<AuthUser | null>(() => getSavedAuthUser());
  const [isLoginModalOpen, setIsLoginModalOpen] = React.useState(false);

  // 환경 데이터 상태
  const [weather, setWeather] = React.useState<WeatherData | null>(null);
  const [marine, setMarine] = React.useState<MarineData | null>(null);
  const [tide, setTide] = React.useState<TideDayInfo | null>(null);
  const [biteScore, setBiteScore] = React.useState<BiteScoreBreakdown | null>(null);

  // 단위 변환 설정 상태 (사용자 프로필 설정과 동기화)
  const [windUnit, setWindUnit] = React.useState<WindUnit>(() => {
    const user = getSavedAuthUser();
    return user?.windUnit || 'ms';
  });
  const [currentUnit, setCurrentUnit] = React.useState<CurrentUnit>(() => {
    const user = getSavedAuthUser();
    return user?.currentUnit || 'knot';
  });

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
  // 모바일/웹 초기 2초 스플래시 스크린 표시 상태
  const [showSplash, setShowSplash] = React.useState(true);
  const [newSpotLat, setNewSpotLat] = React.useState<number | undefined>();
  const [newSpotLng, setNewSpotLng] = React.useState<number | undefined>();
  const [microAdjustSpot, setMicroAdjustSpot] = React.useState<FishingSpot | null>(null);

  // [요구사항 6] 나만의 즐겨찾기(찜한 포인트) 목록 상태 (로컬 스토리지 및 세션 동기화)
  const [favoriteSpotIds, setFavoriteSpotIds] = React.useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('exfish_favorite_spot_ids');
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  });

  const handleToggleFavorite = React.useCallback((spotId: string) => {
    setFavoriteSpotIds((prev) => {
      const next = prev.includes(spotId) ? prev.filter((id) => id !== spotId) : [...prev, spotId];
      if (typeof window !== 'undefined') {
        localStorage.setItem('exfish_favorite_spot_ids', JSON.stringify(next));
      }
      return next;
    });
  }, []);

  // [요구사항 2] Android 하드웨어 백 버튼 리스너 (기본 지도 뷰 복귀 제어)
  React.useEffect(() => {
    const cleanup = setupHardwareBackButtonListener(() => {
      // 1. 모달들이 열려 있으면 최우선으로 닫기
      if (isSpotModalOpen) {
        setIsSpotModalOpen(false);
        return true;
      }
      if (isCatchLogModalOpen) {
        setIsCatchLogModalOpen(false);
        return true;
      }
      if (isSpotListModalOpen) {
        setIsSpotListModalOpen(false);
        return true;
      }
      if (isLoginModalOpen) {
        setIsLoginModalOpen(false);
        return true;
      }
      if (isHelpModalOpen) {
        setIsHelpModalOpen(false);
        return true;
      }
      if (isChecklistModalOpen) {
        setIsChecklistModalOpen(false);
        return true;
      }
      // 2. 미세조정 모드이면 취소
      if (microAdjustSpot) {
        setMicroAdjustSpot(null);
        return true;
      }
      // 3. 모바일 상세 드로어가 열려 있으면 닫고 지도 뷰로
      if (isMobileDrawerOpen) {
        setIsMobileDrawerOpen(false);
        return true;
      }
      // 4. 선택된 포인트가 있으면 선택 해제 (기본 지도 뷰)
      if (selectedSpot) {
        setSelectedSpot(null);
        return true;
      }
      // 5. 기본 지도 뷰 상태: false 반환하여 앱 종료 방지 및 2초 내 더블 클릭 감지
      return false;
    });

    return cleanup;
  }, [
    isSpotModalOpen,
    isCatchLogModalOpen,
    isSpotListModalOpen,
    isLoginModalOpen,
    isHelpModalOpen,
    isChecklistModalOpen,
    microAdjustSpot,
    isMobileDrawerOpen,
    selectedSpot,
  ]);

  // 아웃도어 초고대비 모드 (Sun Mode: WCAG AAA 7:1) 및 오프라인 상태 관리
  const [isSunMode, setIsSunMode] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('exfish_sun_mode') === 'true';
    }
    return false;
  });
  const [isOffline, setIsOffline] = React.useState<boolean>(() => typeof navigator !== 'undefined' && !navigator.onLine);

  React.useEffect(() => {
    if (typeof document !== 'undefined' && isSunMode) {
      document.body.classList.add('sun-mode-active');
    }
    const unsub = subscribeNetworkStatus((online) => {
      setIsOffline(!online);
    });
    return unsub;
  }, [isSunMode]);

  // 포인트별 실시간 환경 요약 캐시 (리스트 보기 전용)
  const [environmentMap, setEnvironmentMap] = React.useState<Record<string, SpotRealtimeSummary>>({});
  const [userLocation, setUserLocation] = React.useState<{ lat: number; lng: number } | null>(null);

  // 기기 로컬 저장소 대신 오직 Supabase DB에서만 포인트 및 조과 데이터 로드 (오프라인 시 로컬 캐시 폴백)
  const reloadData = React.useCallback(async () => {
    try {
      const [cSpots, cLogs] = await Promise.all([
        fetchCloudSpots(),
        fetchCloudLogs(),
      ]);
      setSpots(cSpots);
      setCatchLogs(cLogs);
      // 오프라인 대비 로컬 캐시 백업
      cSpots.forEach((s) => cacheSpotMetadata(s));
      if (cSpots.length > 0 && !selectedSpot) {
        // 첫 진입 시 포인트 정보는 로드하되, 지도는 내 위치 중심으로 유지하도록 shouldRecenter=false 전달
        handleSelectSpot(cSpots[0], false);
      }
    } catch (err) {
      console.warn('Supabase 데이터 로드 실패, 오프라인 로컬 캐시 복원 시도:', err);
      const cached = getAllCachedSpots();
      if (cached.length > 0) {
        setSpots(cached);
        if (!selectedSpot) handleSelectSpot(cached[0], false);
      }
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
  const handleSelectSpot = React.useCallback(
    async (spot: FishingSpot, shouldRecenter: boolean = true, openMobileDrawer: boolean = false) => {
      setSelectedSpot(spot);
      if (openMobileDrawer) {
        setIsMobileDrawerOpen(true);
      }
      if (shouldRecenter) {
        // [요구사항 3] 공통: 포인트 클릭 시 캐스팅 비거리가 다 나오도록 최적 스케일 확대 (18 - zoom = kakaoLevel)
        // 원투(SURF): kakaoLevel 4 (zoom 14, 약 150m 반경), 루어/찌: kakaoLevel 3 (zoom 15, 약 70~80m 반경)
        const isSurf = spot.fishing_methods && spot.fishing_methods.includes('SURF');
        setRecenterTarget({ lat: spot.lat, lng: spot.lng, zoom: isSurf ? 14 : 15 });
      }

      // 1. 한국형 물때 & 36시간 연속 조석 곡선 & 3일간 일출일몰 즉시 계산
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

        // 4. 오프라인 대비 메타데이터 로컬 캐싱
        cacheSpotMetadata(spot, tideData, weatherData, marineData);
      } catch (err) {
        console.error('Error fetching marine/weather data:', err);
      }
    },
    [currentUser?.favoriteSpecies]
  );

  // 선택된 포인트의 실시간 데이터 10초 주기 자동 갱신 (요구사항 8: 창을 닫지 않는 한 10초마다 업데이트)
  React.useEffect(() => {
    if (!selectedSpot) return;

    const intervalId = setInterval(async () => {
      try {
        const now = new Date();
        const tideData = calculateTideDay(selectedSpot.lat, selectedSpot.lng, now);
        setTide(tideData);

        const [weatherData, marineData] = await Promise.all([
          fetchWeatherData(selectedSpot.lat, selectedSpot.lng),
          fetchMarineData(selectedSpot.lat, selectedSpot.lng),
        ]);
        setWeather(weatherData);
        setMarine(marineData);

        const score = calculateBiteScore(selectedSpot, weatherData, marineData, tideData, currentUser?.favoriteSpecies);
        setBiteScore(score);
      } catch (err) {
        console.warn('10초 자동 갱신 일시 에러 (무시):', err);
      }
    }, 10000);

    return () => clearInterval(intervalId);
  }, [selectedSpot?.id, selectedSpot?.lat, selectedSpot?.lng, currentUser?.favoriteSpecies]);

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

  // 위치 미세 조정 모드 시작 (작성자 본인 포인트 전용)
  const handleStartMicroAdjust = (spot: FishingSpot) => {
    setMicroAdjustSpot(spot);
    setIsMobileDrawerOpen(false); // 모바일 드로워를 닫아 지도 전면 확보
  };

  const handleCancelMicroAdjust = () => {
    setMicroAdjustSpot(null);
  };

  const handleConfirmMicroAdjust = async (spotId: string, newLat: number, newLng: number) => {
    try {
      const target = spots.find((s) => s.id === spotId);
      if (!target) return;
      const updated: FishingSpot = { ...target, lat: newLat, lng: newLng };
      await saveCloudSpot(updated);
      const cSpots = await fetchCloudSpots();
      setSpots(cSpots);
      setSelectedSpot(updated);
      setMicroAdjustSpot(null);
    } catch (e: any) {
      alert(`위치 저장 중 오류가 발생했습니다: ${e?.message || ''}`);
    }
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

  // POI 장소/항구 검색 트리거 (카카오 로컬 키워드 및 주소 검색)
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
      {/* 2초 스플래시 스크린 (앱 시작 시 4대 핵심 가치 안내) */}
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} durationMs={2200} />}

      {/* 글로벌 상단 헤더 & 내비게이션 바 */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 shadow-md gap-2">
        {/* 로고 (ExFish 브랜딩 및 구호 적용, 클릭 시 페이지 새로고침) */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 shrink-0 text-left hover:opacity-90 active:scale-95 transition cursor-pointer"
          title="ExFish 새로고침"
          aria-label="ExFish 메인 새로고침"
        >
          <span className="text-2xl filter drop-shadow">🎣</span>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 bg-clip-text text-transparent leading-none">
              ExFish
            </span>
            <span className="hidden md:inline-block text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
              ex-gf, ex-wife, and ex-fish. 떠나버린 물고기를 기리며...
            </span>
          </div>
        </button>

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
                  🌐 <strong>'{searchQuery}'</strong> 카카오 지명·항구 검색 결과
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
                  <span>카카오 전국 해안/항구/주소 검색 중...</span>
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

        {/* 툴바: PC 웹 로그인 / 회원 정보 버튼 (아이콘 전용) */}
        <div className="flex items-center gap-1.5 shrink-0 text-xs">
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className={`hidden md:flex items-center justify-center p-2 rounded-lg border text-xs font-semibold transition ${
              currentUser
                ? 'bg-slate-800/90 border-slate-700 text-cyan-300 hover:bg-slate-700 hover:text-white'
                : 'bg-gradient-to-r from-cyan-600/30 to-blue-600/30 border-cyan-500/50 text-cyan-300 hover:bg-cyan-600/40 hover:text-white shadow-sm'
            }`}
            title={currentUser ? `계정 정보: ${currentUser.id}` : '로그인하기 (Email & ID)'}
            aria-label={currentUser ? `계정 정보: ${currentUser.id}` : '로그인하기'}
          >
            {currentUser ? <User size={16} className="text-cyan-400" /> : <LogIn size={16} className="text-cyan-400" />}
          </button>
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

            {/* 모바일 화면 전용 로그인 버튼 (아이콘 전용) */}
            <button
              onClick={() => setIsLoginModalOpen(true)}
              className={`md:hidden flex items-center justify-center p-2 rounded-lg border text-xs font-semibold transition ${
                currentUser
                  ? 'bg-slate-800/90 border-slate-700 text-cyan-300'
                  : 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300'
              }`}
              title={currentUser ? `계정 정보: ${currentUser.id}` : '로그인'}
              aria-label={currentUser ? `계정 정보: ${currentUser.id}` : '로그인'}
            >
              {currentUser ? <User size={14} className="text-cyan-400" /> : <LogIn size={14} className="text-cyan-400" />}
            </button>
          </div>

          <span className="text-[11px] text-slate-500">
            총 {filteredSpots.length}개 포인트
          </span>
        </div>
      </div>

      {/* 오프라인 네트워크 단절 안내 배너 */}
      {isOffline && (
        <div className="bg-amber-500 text-slate-950 font-bold px-4 py-1.5 text-xs text-center flex items-center justify-center gap-2 shadow-md shrink-0">
          <span>📶 오프라인 모드 작동 중: 로컬 캐시된 포인트 및 조위 메타데이터로 작동합니다.</span>
        </div>
      )}

      {/* 메인 2열 분할 레이아웃 (지도 캔버스 + 우측 상세 대시보드 패널) */}
      <main className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* 좌측(또는 전체 배경) 카카오 지도 영역 (모달 관통 방지를 위해 isolate 적용) */}
        <div className="flex-1 h-full w-full relative isolate">
          <MapView
            spots={filteredSpots}
            selectedSpot={selectedSpot}
            onSelectSpot={(spot) => handleSelectSpot(spot, true, false)}
            onMapClickForNewSpot={handleMapClickForNewSpot}
            weather={weather}
            marine={marine}
            tide={tide}
            windUnit={windUnit}
            currentUnit={currentUnit}
            recenterTarget={recenterTarget}
            isMobileDrawerOpen={Boolean(selectedSpot && isMobileDrawerOpen && (typeof window !== 'undefined' && window.innerWidth < 768))}
            microAdjustSpot={microAdjustSpot}
            onCancelMicroAdjust={handleCancelMicroAdjust}
            onConfirmMicroAdjust={handleConfirmMicroAdjust}
            currentUser={currentUser}
            onStartMicroAdjust={handleStartMicroAdjust}
            onOpenDetail={(spot) => handleSelectSpot(spot, false, true)}
            favoriteSpotIds={favoriteSpotIds}
            onToggleFavorite={handleToggleFavorite}
            isSunMode={isSunMode}
            onToggleSunMode={() => {
              const next = !isSunMode;
              setIsSunMode(next);
              localStorage.setItem('exfish_sun_mode', String(next));
              if (typeof document !== 'undefined') {
                document.body.classList.toggle('sun-mode-active', next);
              }
            }}
          />
        </div>

        {/* PC 화면: 우측 사이드바 패널 */}
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
              currentUser={currentUser}
              isFavorited={favoriteSpotIds.includes(selectedSpot.id)}
              onToggleFavorite={handleToggleFavorite}
              onStartMicroAdjust={handleStartMicroAdjust}
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

        {/* 모바일 화면 1: 드로어가 열려 있을 때 화면 전체(100%)를 채움 (z-50으로 지도 컨트롤 완벽 차폐) */}
        {selectedSpot && isMobileDrawerOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in">
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
              currentUser={currentUser}
              isFavorited={favoriteSpotIds.includes(selectedSpot.id)}
              onToggleFavorite={handleToggleFavorite}
              onStartMicroAdjust={handleStartMicroAdjust}
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

        {/* 플로팅 포인트 등록 버튼 */}
        {!isMobileDrawerOpen && (
          <div className="fixed bottom-4 md:bottom-6 right-4 md:right-6 z-30 block">
            <button
              onClick={() => {
                setEditingSpot(null);
                setNewSpotLat(37.2541);
                setNewSpotLng(126.4982);
                setIsSpotModalOpen(true);
              }}
              className="w-11 h-11 md:w-auto md:h-auto p-0 md:px-4 md:py-2.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-2xl flex items-center justify-center md:gap-1.5 border border-cyan-400/50 active:scale-95 transition"
              title="새 낚시 포인트 등록"
              aria-label="새 낚시 포인트 등록"
            >
              <Plus size={20} className="shrink-0" />
              <span className="hidden md:inline text-sm">포인트 등록</span>
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

      {/* 간편 로그인 및 계정/환경 설정 모달 */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        currentUser={currentUser}
        onLogin={(user) => {
          setCurrentUser(user);
          if (user.windUnit) setWindUnit(user.windUnit);
          if (user.currentUnit) setCurrentUnit(user.currentUnit);
        }}
        onLogout={() => setCurrentUser(null)}
        onUpdateFavorites={(favorites) => {
          if (currentUser) {
            setCurrentUser({ ...currentUser, favoriteSpecies: favorites });
          }
        }}
        windUnit={windUnit}
        currentUnit={currentUnit}
        onChangeWindUnit={setWindUnit}
        onChangeCurrentUnit={setCurrentUnit}
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
        onSelectSpot={(spot) => handleSelectSpot(spot, true, true)}
        environmentMap={environmentMap}
        windUnit={windUnit}
        currentUnit={currentUnit}
        currentUserId={currentUser?.id}
        userCoords={userLocation}
        favoriteSpotIds={favoriteSpotIds}
        onToggleFavorite={handleToggleFavorite}
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
