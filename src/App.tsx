import React from 'react';
import { ChevronUp, Filter, Loader2, LogIn, Navigation2, Plus, Search, User, X } from 'lucide-react';
import { MapView } from './components/MapView';
import { SpotDetailPanel } from './components/SpotDetailPanel';
import { SpotFormModal } from './components/SpotFormModal';
import { CatchLogModal } from './components/CatchLogModal';
import { getSavedAuthUser, LoginModal } from './components/LoginModal';
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
import { calculateTideDay } from './utils/tideEngine';
import { fetchMarineData, fetchWeatherData } from './utils/weatherApi';
import { calculateBiteScore } from './utils/biteScore';
import { extractExifFromImage } from './utils/exifExtractor';
import { searchPoi, type PoiSearchResult } from './utils/poiSearch';
import {
  deleteCloudCatchLog,
  deleteCloudSpot,
  fetchCloudLogs,
  fetchCloudSpots,
  getSavedCloudConfig,
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

  // 모바일 드로워 표시 상태 (보일 때는 100% 화면 채우고, 숨길 때는 지도와 실시간 환경 복귀)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = React.useState(true);

  // 로그인 상태 관리 (Email & ID 확인, PW 불필요)
  const [currentUser, setCurrentUser] = React.useState<{ id: string; email: string } | null>(() => getSavedAuthUser());
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
  const [newSpotLat, setNewSpotLat] = React.useState<number | undefined>();
  const [newSpotLng, setNewSpotLng] = React.useState<number | undefined>();

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
        handleSelectSpot(cSpots[0]);
      }
    } catch (err) {
      console.error('Supabase 데이터 로드 실패:', err);
    }
  }, [selectedSpot]);

  React.useEffect(() => {
    reloadData();
  }, [reloadData]);

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
  const handleSelectSpot = async (spot: FishingSpot) => {
    setSelectedSpot(spot);
    setIsMobileDrawerOpen(true); // 모바일에서 선택 시 드로워 열기
    setRecenterTarget({ lat: spot.lat, lng: spot.lng, zoom: 14 });

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

      // 3. Esper AI 입질 지수 도출
      const score = calculateBiteScore(spot, weatherData, marineData, tideData);
      setBiteScore(score);
    } catch (err) {
      console.error('Error fetching marine/weather data:', err);
    }
  };

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
        {/* 로고 & 슬로건 */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-2xl filter drop-shadow">🎣</span>
          <div className="flex flex-col">
            <span className="text-base sm:text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 bg-clip-text text-transparent">
              EsperFish
            </span>
            <span className="text-[9px] text-slate-400 -mt-1 font-medium hidden md:inline">
              초능력자처럼 읽는 한국 연안 스마트 낚시
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
                className="absolute right-9 top-2 text-slate-400 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
            <button
              onClick={handleExecutePoiSearch}
              className="absolute right-1 top-1 bottom-1 px-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full text-[11px] font-bold flex items-center gap-0.5 transition"
              title="지도 POI 검색"
            >
              {isSearchingPoi ? <Loader2 size={11} className="animate-spin" /> : <Navigation2 size={11} />}
              <span>POI</span>
            </button>
          </div>

          {/* POI 검색 결과 드롭다운 팝오버 */}
          {showPoiDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden text-xs max-h-72 overflow-y-auto">
              <div className="px-3 py-1.5 bg-slate-800 text-[11px] text-slate-300 font-semibold flex justify-between items-center border-b border-slate-700">
                <span className="flex items-center gap-1">
                  🌐 <strong>'{searchQuery}'</strong> 전국 장소·항구 POI 검색 결과
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
                  <span>전국 해안/관공서/항구 POI 검색 중...</span>
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

        {/* 툴바: 로그인 버튼, 단위 변환 및 포인트 추가 */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs">
          {/* 로그인 / 회원 정보 버튼 */}
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
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

          {/* 포인트 추가 버튼 */}
          <button
            onClick={() => {
              setEditingSpot(null);
              setNewSpotLat(37.2541);
              setNewSpotLng(126.4982);
              setIsSpotModalOpen(true);
            }}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-md shadow-cyan-500/20 transition"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">포인트 등록</span>
          </button>
        </div>
      </header>

      {/* 장르별 서브 필터 칩 바 */}
      <div className="h-10 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between text-xs shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5">
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
          <span className="text-[11px] text-slate-500 hidden sm:inline">
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
              windUnit={windUnit}
              currentUnit={currentUnit}
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
              windUnit={windUnit}
              currentUnit={currentUnit}
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
          <div className="md:hidden fixed bottom-4 left-4 right-4 z-30 animate-fade-in">
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
      />
    </div>
  );
}

export default App;
