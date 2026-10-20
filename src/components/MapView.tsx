import React from 'react';
import {
  Map,
  CustomOverlayMap,
  Polyline,
  Circle,
  useKakaoLoader,
} from 'react-kakao-maps-sdk';
import { Crosshair, Play, Pause, AlertCircle } from 'lucide-react';
import type { FishingSpot, WeatherData, MarineData, WindUnit, CurrentUnit, TideDayInfo } from '../types';

// 카카오 디벨로퍼스 JavaScript 앱 키
const KAKAO_APP_KEY = '61ebf0b7a0daf24cba357d92677c8d8a';

// 8방위 문자열을 방위각(도) 및 한글 라벨로 변환
const CASTING_BEARINGS: Record<string, { deg: number; label: string }> = {
  N: { deg: 0, label: '북(N)' },
  NE: { deg: 45, label: '북동(NE)' },
  E: { deg: 90, label: '동(E)' },
  SE: { deg: 135, label: '남동(SE)' },
  S: { deg: 180, label: '남(S)' },
  SW: { deg: 225, label: '남서(SW)' },
  W: { deg: 270, label: '서(W)' },
  NW: { deg: 315, label: '북서(NW)' },
};

// 대권 항로 공식에 따른 목표 좌표(위도, 경도) 계산 (비거리 distanceMeters 지점)
function calculateDestinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const R = 6378137; // 지구 반지름 (m)
  const d = distanceMeters;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const endLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(d / R) +
    Math.cos(latRad) * Math.sin(d / R) * Math.cos(bearing)
  );
  const endLngRad = lngRad + Math.atan2(
    Math.sin(bearing) * Math.sin(d / R) * Math.cos(latRad),
    Math.cos(d / R) - Math.sin(latRad) * Math.sin(endLatRad)
  );

  return [(endLatRad * 180) / Math.PI, (endLngRad * 180) / Math.PI];
}

type MapMode = 'ROADMAP' | 'HYBRID' | 'DARK';

interface MapViewProps {
  spots: FishingSpot[];
  selectedSpot: FishingSpot | null;
  onSelectSpot: (spot: FishingSpot) => void;
  onMapClickForNewSpot: (lat: number, lng: number) => void;
  weather: WeatherData | null;
  marine: MarineData | null;
  tide: TideDayInfo | null;
  windUnit: WindUnit;
  currentUnit: CurrentUnit;
  recenterTarget?: { lat: number; lng: number; zoom?: number } | null;
  isMobileDrawerOpen?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({
  spots,
  selectedSpot,
  onSelectSpot,
  onMapClickForNewSpot,
  recenterTarget,
  isMobileDrawerOpen = false,
}) => {
  // 카카오 지도 SDK 동적 로더
  const [loading, error] = useKakaoLoader({
    appkey: KAKAO_APP_KEY,
    libraries: ['services', 'clusterer'],
  });

  // 지도 중심 및 줌 레벨 (카카오맵은 레벨 숫자가 작을수록 확대, 1=20m, 3=50m, 12=전국)
  const [center, setCenter] = React.useState<{ lat: number; lng: number }>({
    lat: 36.3,
    lng: 127.8,
  });
  const [level, setLevel] = React.useState<number>(12);

  // 지도 뷰 모드 (일반 로드맵 / 고해상도 스카이뷰 / 야간 다크 모드)
  const [mapMode, setMapMode] = React.useState<MapMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('exfish_map_mode');
      if (saved === 'HYBRID' || saved === 'DARK') return saved;
    }
    return 'ROADMAP';
  });

  // 활성 팝업 포인트 ID 관리
  const [activePopupSpotId, setActivePopupSpotId] = React.useState<string | null>(null);

  // 내 현재 GPS 위치 및 추적 상태
  const [myLocation, setMyLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = React.useState(false);

  // 모드 변경 시 localStorage 영구 저장
  const handleModeChange = (mode: MapMode) => {
    setMapMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('exfish_map_mode', mode);
    }
  };

  // 현재 GPS 위치 가져오기 핸들러
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 위치 정보(GPS)를 지원하지 않습니다.');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(userPos);
        setCenter(userPos);
        setLevel(3); // 상세 50m 레벨
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        alert('현재 위치 정보를 가져올 수 없습니다. 브라우저의 위치 권한을 확인해 주세요.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 최근 선택 타겟 또는 포인트 이동 감지
  React.useEffect(() => {
    if (recenterTarget) {
      setCenter({ lat: recenterTarget.lat, lng: recenterTarget.lng });
      if (recenterTarget.zoom) {
        // Leaflet 14 -> Kakao 4, Leaflet 15 -> Kakao 3
        const kakaoLevel = Math.max(1, Math.min(14, 18 - recenterTarget.zoom));
        setLevel(kakaoLevel);
      } else {
        setLevel(3);
      }
    }
  }, [recenterTarget]);

  // 선택된 포인트 변경 시 센터 자동 동기화
  React.useEffect(() => {
    if (selectedSpot) {
      setCenter({ lat: selectedSpot.lat, lng: selectedSpot.lng });
      setLevel(3);
      setActivePopupSpotId(selectedSpot.id);
    }
  }, [selectedSpot?.id]);

  // 카카오맵 기준 고배율 줌 레벨 (level 1, 2, 3, 4 = 현장 20m~100m 상세도)에서만 캐스팅 화살표 표시
  const showCastingArrows = level <= 4;

  if (loading) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-300 gap-3">
        <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold">카카오 맵 고해상도 해양 지도를 불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-rose-300 gap-3">
        <AlertCircle size={36} className="text-rose-400" />
        <h3 className="text-base font-bold text-white">카카오 맵 API 인증 오류</h3>
        <p className="text-xs text-slate-400 max-w-md leading-relaxed">
          카카오 개발자 콘솔(developers.kakao.com)의 <strong>[플랫폼] → [Web 플랫폼]</strong>에{' '}
          현재 접속 도메인(<code>{window.location.origin}</code>)이 등록되어 있는지 확인해 주세요.
        </p>
      </div>
    );
  }

  // 실제 카카오 맵 mapTypeId (스카이뷰 또는 하이브리드)
  const kakaoMapTypeId = mapMode === 'HYBRID' ? 'HYBRID' : 'ROADMAP';
  const isDarkMode = mapMode === 'DARK';

  return (
    <div
      className={`relative w-full h-full bg-slate-950 overflow-hidden kakao-map-container ${
        isDarkMode ? 'kakao-dark-mode' : ''
      }`}
    >
      <Map
        center={center}
        level={level}
        mapTypeId={kakaoMapTypeId}
        style={{ width: '100%', height: '100%' }}
        onClick={(_target, mouseEvent) => {
          const latLng = mouseEvent.latLng;
          onMapClickForNewSpot(latLng.getLat(), latLng.getLng());
        }}
        onZoomChanged={(target) => {
          setLevel(target.getLevel());
        }}
        onCenterChanged={(target) => {
          const latLng = target.getCenter();
          setCenter({ lat: latLng.getLat(), lng: latLng.getLng() });
        }}
      >
        {/* 고배율 줌(Level <= 4) 시 포인트 캐스팅 공략 방향 화살표 렌더링 */}
        {showCastingArrows &&
          spots.map((spot) => {
            const directions = spot.casting_directions;
            if (!directions || directions.length === 0) return null;

            const isSelected = selectedSpot?.id === spot.id;
            const lineColor = isSelected ? '#22d3ee' : '#10b981';
            const arrowWeight = isSelected ? 5 : 3.5;

            // 'ALL' (전방위 캐스팅)인 경우 반경 45m 점선 레이더 원 및 4방위 화살표
            if (directions.includes('ALL')) {
              const cardinalBearings = [0, 90, 180, 270];
              return (
                <React.Fragment key={`casting-all-${spot.id}`}>
                  <Circle
                    center={{ lat: spot.lat, lng: spot.lng }}
                    radius={45}
                    strokeWeight={isSelected ? 2.5 : 1.5}
                    strokeColor={lineColor}
                    strokeOpacity={0.9}
                    strokeStyle="dash"
                    fillColor={lineColor}
                    fillOpacity={isSelected ? 0.2 : 0.08}
                    zIndex={40}
                  />
                  {cardinalBearings.map((deg) => {
                    const tip = calculateDestinationPoint(spot.lat, spot.lng, deg, 45);
                    return (
                      <Polyline
                        key={`all-arrow-${spot.id}-${deg}`}
                        path={[
                          { lat: spot.lat, lng: spot.lng },
                          { lat: tip[0], lng: tip[1] },
                        ]}
                        endArrow={true}
                        strokeWeight={isSelected ? 4 : 2.5}
                        strokeColor={lineColor}
                        strokeOpacity={0.85}
                        zIndex={45}
                      />
                    );
                  })}
                </React.Fragment>
              );
            }

            // 개별 지정 방향 화살표들
            return (
              <React.Fragment key={`casting-group-${spot.id}`}>
                {directions.map((dir) => {
                  const info = CASTING_BEARINGS[dir];
                  if (!info) return null;
                  const bearing = info.deg;
                  const distanceMeters = 50; // 실제 캐스팅 비거리 약 50m
                  const tip = calculateDestinationPoint(spot.lat, spot.lng, bearing, distanceMeters);

                  return (
                    <Polyline
                      key={`arrow-${spot.id}-${dir}`}
                      path={[
                        { lat: spot.lat, lng: spot.lng },
                        { lat: tip[0], lng: tip[1] },
                      ]}
                      endArrow={true}
                      strokeWeight={arrowWeight}
                      strokeColor={lineColor}
                      strokeOpacity={0.95}
                      zIndex={50}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}

        {/* 내 현재 GPS 위치 마커 */}
        {myLocation && (
          <CustomOverlayMap
            position={{ lat: myLocation.lat, lng: myLocation.lng }}
            yAnchor={0.5}
            xAnchor={0.5}
            zIndex={90}
          >
            <div className="relative flex items-center justify-center kakao-invert-restore">
              <div className="w-8 h-8 rounded-full bg-cyan-400/30 animate-ping absolute" />
              <div className="w-6 h-6 rounded-full bg-cyan-500 border-2 border-white shadow-xl flex items-center justify-center text-xs">
                🎯
              </div>
            </div>
          </CustomOverlayMap>
        )}

        {/* 등록된 포인트 커스텀 핀 오버레이 */}
        {spots.map((spot) => {
          const isSelected = selectedSpot?.id === spot.id;
          const isPopupOpen = activePopupSpotId === spot.id;

          const pinColor = spot.fishing_methods.includes('FLOAT')
            ? '#f43f5e'
            : spot.fishing_methods.includes('SURF')
            ? '#f59e0b'
            : '#06b6d4';

          const pinEmoji = spot.fishing_methods.includes('FLOAT')
            ? '🔴'
            : spot.fishing_methods.includes('SURF')
            ? '⚓'
            : '🎣';

          return (
            <React.Fragment key={`spot-group-${spot.id}`}>
              <CustomOverlayMap
                position={{ lat: spot.lat, lng: spot.lng }}
                yAnchor={1}
                zIndex={isSelected ? 100 : 20}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSpot(spot);
                    setActivePopupSpotId(isPopupOpen ? null : spot.id);
                  }}
                  className="cursor-pointer group flex flex-col items-center kakao-invert-restore"
                  title={`${spot.name} 클릭하여 상세 보기`}
                >
                  <div className="relative">
                    <div
                      className={`flex items-center justify-center w-9 h-9 rounded-full shadow-2xl transition-transform duration-200 ${
                        isSelected
                          ? 'scale-115 ring-4 ring-cyan-400 border-[3px] border-white'
                          : 'group-hover:scale-105 border-2 border-white/90'
                      }`}
                      style={{ backgroundColor: pinColor }}
                    >
                      <span className="text-base select-none leading-none">{pinEmoji}</span>
                    </div>
                    <div
                      className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] mx-auto -mt-0.5"
                      style={{ borderTopColor: pinColor }}
                    />
                  </div>
                  <span className="mt-0.5 px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-700/80 text-[11px] text-white font-bold whitespace-nowrap shadow-md">
                    {spot.name}
                  </span>
                </div>
              </CustomOverlayMap>

              {/* 포인트 클릭 시 팝업 창 */}
              {isPopupOpen && (
                <CustomOverlayMap
                  position={{ lat: spot.lat, lng: spot.lng }}
                  yAnchor={1.25}
                  zIndex={150}
                >
                  <div className="p-3 bg-slate-900/95 backdrop-blur-md text-white rounded-xl border border-slate-700 shadow-2xl min-w-[210px] text-xs font-sans kakao-invert-restore">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-sm text-cyan-400 truncate max-w-[150px]">
                        {spot.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePopupSpotId(null);
                        }}
                        className="p-1 text-slate-400 hover:text-white rounded"
                        title="닫기"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="text-slate-300 mb-1 text-[11px] truncate">
                      어종: {spot.target_species.join(', ')}
                    </div>
                    {spot.casting_directions && spot.casting_directions.length > 0 && (
                      <div className="text-[11px] text-amber-300 mb-2 font-semibold">
                        🎯 투척:{' '}
                        {spot.casting_directions.includes('ALL')
                          ? '전방위 (360°)'
                          : spot.casting_directions.join(', ')}
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSpot(spot);
                        setActivePopupSpotId(null);
                      }}
                      className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-xs transition shadow"
                    >
                      상세 및 기상 보기
                    </button>
                  </div>
                </CustomOverlayMap>
              )}
            </React.Fragment>
          );
        })}
      </Map>

      {/* 지도 우상단 플로팅 컨트롤: 모드 3단 전환 & GPS 내 위치
          - 모바일에서는 드로어가 전체화면을 덮을 때만 숨김
          - PC 웹에서는 사이드 패널이 열려있어도 지도 상단에 항시 온전히 노출 */}
      <div
        className={`absolute top-4 right-4 z-[400] flex flex-col items-end gap-2 ${
          isMobileDrawerOpen ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* 일반 지도 / 스카이뷰(항공사진) / 야간 다크 모드 3단 선택 탭 */}
        <div className="flex bg-slate-900/95 border border-slate-700/80 rounded-xl p-1 shadow-2xl backdrop-blur">
          <button
            onClick={() => handleModeChange('ROADMAP')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
              mapMode === 'ROADMAP'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="일반 도로 지도"
          >
            <span>🗺️ 일반</span>
          </button>
          <button
            onClick={() => handleModeChange('HYBRID')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
              mapMode === 'HYBRID'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="갯바위·방파제 고해상도 항공 스카이뷰"
          >
            <span>🛰️ 스카이뷰</span>
          </button>
          <button
            onClick={() => handleModeChange('DARK')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
              mapMode === 'DARK'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
            title="야간 낚시 다크 모드 (눈부심 방지)"
          >
            <span>🌙 야간 다크</span>
          </button>
        </div>

        {/* GPS 내 위치 바로가기 버튼 */}
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          title="내 현재 GPS 위치 찾기"
          className="p-2.5 bg-slate-900/95 hover:bg-slate-800 text-cyan-400 border border-slate-700/80 rounded-xl shadow-xl backdrop-blur flex items-center justify-center transition active:scale-95"
        >
          {isLocating ? (
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg leading-none">🎯</span>
          )}
        </button>
      </div>

      {/* 지도 좌하단 안내 뱃지 */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 hidden sm:flex items-center gap-2 shadow-lg">
        <span>💡 해안·갯바위를 클릭하면 <strong>새 포인트를 즉시 추가</strong>할 수 있습니다.</span>
        {showCastingArrows && (
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
            🎯 캐스팅 공략 방향 표시 중 (Zoom 4 이하)
          </span>
        )}
      </div>
    </div>
  );
};
