import React from 'react';
import { Filter, Loader2, Navigation2, Plus, Search, User, X } from 'lucide-react';
import { MapView } from './components/MapView';
import { SpotDetailPanel } from './components/SpotDetailPanel';
import { SpotFormModal } from './components/SpotFormModal';
import { CatchLogModal } from './components/CatchLogModal';
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
import { loadLogsFromStorage, loadSpotsFromStorage, saveLogsToStorage, saveSpotsToStorage } from './utils/storage';
import { searchPoi, type PoiSearchResult } from './utils/poiSearch';

export function App() {
  const [spots, setSpots] = React.useState<FishingSpot[]>([]);
  const [catchLogs, setCatchLogs] = React.useState<CatchLog[]>([]);
  const [selectedSpot, setSelectedSpot] = React.useState<FishingSpot | null>(null);
  const [editingSpot, setEditingSpot] = React.useState<FishingSpot | null>(null);
  const [editingCatchLog, setEditingCatchLog] = React.useState<CatchLog | null>(null);

  // 환경 데이터 상태
  const [weather, setWeather] = React.useState<WeatherData | null>(null);
  const [marine, setMarine] = React.useState<MarineData | null>(null);
  const [tide, setTide] = React.useState<TideDayInfo | null>(null);
  const [biteScore, setBiteScore] = React.useState<BiteScoreBreakdown | null>(null);

  // 단위 변환 설정 상태
  const [windUnit, setWindUnit] = React.useState<WindUnit>('ms');
  const [currentUnit, setCurrentUnit] = React.useState<CurrentUnit>('knot');

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

  // 초기 스토리지 로드
  React.useEffect(() => {
    const loadedSpots = loadSpotsFromStorage();
    const loadedLogs = loadLogsFromStorage();
    setSpots(loadedSpots);
    setCatchLogs(loadedLogs);
    if (loadedSpots.length > 0) {
      handleSelectSpot(loadedSpots[0]);
    }
  }, []);

  // 포인트 선택 시 날씨/해양/물때/입질지수 Fetch & 연산
  const handleSelectSpot = async (spot: FishingSpot) => {
    setSelectedSpot(spot);
    setRecenterTarget({ lat: spot.lat, lng: spot.lng, zoom: 14 });

    // 1. 한국형 물때 & 24시간 조석 곡선 & 일출일몰 즉시 계산
    const tideData = calculateTideDay(spot.lat, spot.lng, new Date());
    setTide(tideData);

    // 2. Open-Meteo Weather & Marine API 병렬 Fetch
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

  // 새 포인트 저장 및 수정 핸들러
  const handleSaveSpot = (spotData: Omit<FishingSpot, 'id' | 'user_id' | 'author_name' | 'created_at'>) => {
    if (editingSpot) {
      // 포인트 수정 (Update)
      const updatedList = spots.map((s) =>
        s.id === editingSpot.id ? { ...s, ...spotData } : s
      );
      setSpots(updatedList);
      saveSpotsToStorage(updatedList);
      const updatedTarget = updatedList.find((s) => s.id === editingSpot.id);
      if (updatedTarget) handleSelectSpot(updatedTarget);
      setEditingSpot(null);
    } else {
      // 새 포인트 생성 (Create)
      const newSpot: FishingSpot = {
        ...spotData,
        id: `spot-${Date.now()}`,
        user_id: 'user-me',
        author_name: '나의 포인트',
        created_at: new Date().toISOString(),
      };
      const updated = [newSpot, ...spots];
      setSpots(updated);
      saveSpotsToStorage(updated);
      handleSelectSpot(newSpot);
    }
  };

  // 포인트 삭제 핸들러
  const handleDeleteSpot = (spotId: string) => {
    const updated = spots.filter((s) => s.id !== spotId);
    setSpots(updated);
    saveSpotsToStorage(updated);
    if (selectedSpot?.id === spotId) {
      if (updated.length > 0) {
        handleSelectSpot(updated[0]);
      } else {
        setSelectedSpot(null);
      }
    }
  };

  // 포인트 수정 모달 열기
  const handleEditSpot = (spot: FishingSpot) => {
    setEditingSpot(spot);
    setIsSpotModalOpen(true);
  };

  // 조과 기록 생성 및 수정 핸들러 (CRUD)
  const handleSaveCatchLog = (logData: Omit<CatchLog, 'id' | 'created_at'>) => {
    if (editingCatchLog) {
      // 조과 수정 (Update)
      const updated = catchLogs.map((l) =>
        l.id === editingCatchLog.id ? { ...l, ...logData } : l
      );
      setCatchLogs(updated);
      saveLogsToStorage(updated);
      setEditingCatchLog(null);
    } else {
      // 새 조과 등록 (Create)
      const newLog: CatchLog = {
        ...logData,
        id: `log-${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      const updated = [newLog, ...catchLogs];
      setCatchLogs(updated);
      saveLogsToStorage(updated);
    }
    setIsCatchLogModalOpen(false);
  };

  // 조과 기록 삭제 핸들러 (Delete)
  const handleDeleteCatchLog = (logId: string) => {
    const updated = catchLogs.filter((l) => l.id !== logId);
    setCatchLogs(updated);
    saveLogsToStorage(updated);
  };

  // POI 장소/항구 검색 트리거
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
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30 shadow-md">
        {/* 로고 & 슬로건 */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl filter drop-shadow">🎣</span>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-500 bg-clip-text text-transparent">
                EsperFish
              </span>
              <span className="text-[9px] text-slate-400 -mt-1 font-medium hidden sm:inline">
                초능력자처럼 읽는 한국 연안 스마트 낚시
              </span>
            </div>
          </div>
        </div>

        {/* 검색 및 POI 검색 바 (중앙) */}
        <div className="relative flex items-center gap-2 max-w-md w-full mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="포인트, 어종, 또는 전국 항구·섬 POI 검색 (Enter)..."
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
              className="w-full bg-slate-800/90 border border-slate-700/80 rounded-full pl-9 pr-16 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowPoiDropdown(false);
                  setPoiResults([]);
                }}
                className="absolute right-10 top-2 text-slate-400 hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
            <button
              onClick={handleExecutePoiSearch}
              className="absolute right-1 top-1 bottom-1 px-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full text-[11px] font-bold flex items-center gap-1 transition"
              title="지도 POI 검색"
            >
              {isSearchingPoi ? <Loader2 size={12} className="animate-spin" /> : <Navigation2 size={11} />}
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
                  <span>전국 해안/항구 POI 검색 중...</span>
                </div>
              ) : poiResults.length === 0 ? (
                <div className="p-4 text-center text-slate-400">
                  일치하는 장소를 찾지 못했습니다. (지명이나 항구명을 확인해 주세요)
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
                        {poi.display_name.split(',')[0]}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {poi.display_name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        좌표: {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 단위 변환 및 유저 액션 툴바 */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {/* 풍속 단위 변환 토글 */}
          <div className="hidden md:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px]">
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
          <div className="hidden lg:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-[11px]">
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-md shadow-cyan-500/20 transition"
          >
            <Plus size={15} />
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
            총 {filteredSpots.length}개 포인트 표시 중
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
          />
        </div>

        {/* 우측 포인트 상세 & 기상/물때/조과 대시보드 (반응형: PC 사이드바 / 모바일 하단 슬라이드) */}
        {selectedSpot && (
          <aside className="w-full md:w-[440px] lg:w-[480px] h-[55vh] md:h-full shrink-0 z-20 transition-all duration-300">
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
    </div>
  );
}

export default App;
