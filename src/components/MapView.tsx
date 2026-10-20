import React from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  Circle,
  Tooltip,
  useMapEvents,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Moon, Sun, Plus, Play, Pause } from 'lucide-react';
import type { FishingSpot, WeatherData, MarineData, WindUnit, CurrentUnit, TideDayInfo } from '../types';
import { formatWindSpeed, formatCurrentVelocity, getCompassDirection } from '../utils/weatherApi';

// Carto 공식 API 키 인증 (다크 모드 타일 정상 로드용)
const CARTO_API_KEY = 'cb1_4pjj_1_910d67e653a18bd88f16bb8c';

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

// 화살표 끝부분의 삼각형 화살촉 좌표 계산 (약 9m 크기)
function getArrowheadPoints(
  tipLat: number,
  tipLng: number,
  bearingDeg: number,
  headLengthMeters: number = 9
): [number, number][] {
  const leftCorner = calculateDestinationPoint(tipLat, tipLng, (bearingDeg + 150) % 360, headLengthMeters);
  const rightCorner = calculateDestinationPoint(tipLat, tipLng, (bearingDeg - 150 + 360) % 360, headLengthMeters);
  return [[tipLat, tipLng], leftCorner, rightCorner];
}

// Leaflet DOM 컨테이너에 다크모드 클래스 직접 동기화 컨트롤러
function MapDarkModeController({ isDark }: { isDark: boolean }) {
  const map = useMap();
  React.useEffect(() => {
    const container = map.getContainer();
    if (isDark) {
      container.classList.add('dark-mode-tiles');
    } else {
      container.classList.remove('dark-mode-tiles');
    }
  }, [isDark, map]);
  return null;
}

// 줌 레벨 추적 컴포넌트
function MapZoomWatcher({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  React.useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

// 기본 Leaflet 아이콘 깨짐 방지 커스텀 SVG 마커 (정확한 앵커와 박스 크기)
function createCustomPin(spot: FishingSpot, isSelected: boolean) {
  let bgColor = '#06b6d4'; // cyan (lure)
  let iconEmoji = '🎣';
  if (spot.fishing_methods.includes('FLOAT')) {
    bgColor = '#f43f5e'; // rose (float)
    iconEmoji = '🔴';
  } else if (spot.fishing_methods.includes('SURF')) {
    bgColor = '#f59e0b'; // amber (surf)
  }

  const borderClass = isSelected
    ? 'border-[3px] border-white shadow-2xl scale-110 ring-4 ring-cyan-400'
    : 'border-2 border-white/90 shadow-lg hover:scale-105';

  const html = `
    <div style="width: 36px; height: 44px; position: relative;">
      <div class="flex items-center justify-center w-9 h-9 rounded-full ${borderClass} transition-transform duration-200" style="background-color: ${bgColor};">
        <span style="font-size: 16px; line-height: 1;">${iconEmoji}</span>
      </div>
      <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid ${bgColor}; margin: -2px auto 0 auto;"></div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'custom-spot-marker',
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  });
}

// 사용자 현재 위치 GPS 핀 마커
const userLocationPin = L.divIcon({
  html: `
    <div style="width: 24px; height: 24px; position: relative;" class="animate-pulse">
      <div class="w-6 h-6 rounded-full bg-cyan-500 border-2 border-white shadow-xl flex items-center justify-center text-[10px]">
        🎯
      </div>
    </div>
  `,
  className: 'user-location-marker',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// 클릭 시 지도 좌표 획득 컴포넌트
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// 지도 중심 이동 컴포넌트
function MapRecenter({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  React.useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], target.zoom || 13, { duration: 1.2 });
    }
  }, [target, map]);
  return null;
}

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
  weather,
  marine,
  tide,
  windUnit,
  currentUnit,
  recenterTarget,
  isMobileDrawerOpen = false,
}) => {
  // 타임라인 미래 시뮬레이션: 현재 시각 기준 앞으로 0 ~ 48시간 (48h 오프셋)
  const [timelineOffsetHours, setTimelineOffsetHours] = React.useState<number>(0);
  const [isPlaying, setIsPlaying] = React.useState(false);

  // 내 현재 GPS 위치 및 추적 상태
  const [myLocation, setMyLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = React.useState(false);
  const [internalRecenter, setInternalRecenter] = React.useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // 야간 낚시용 다크 테마 타일 토글 (localStorage 영구 보존)
  const [isDarkTile, setIsDarkTile] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('exfish_dark_mode') === 'true';
    }
    return false;
  });

  const handleToggleDarkMode = () => {
    setIsDarkTile((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('exfish_dark_mode', String(next));
      }
      return next;
    });
  };

  // 지도 현재 줌 레벨 추적 (고배율 줌 >= 15 일 때만 캐스팅 방향 화살표 활성화)
  const [zoomLevel, setZoomLevel] = React.useState<number>(7);
  const showCastingArrows = zoomLevel >= 15;

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
        setInternalRecenter({ lat: userPos.lat, lng: userPos.lng, zoom: 15 });
      },
      (err) => {
        setIsLocating(false);
        console.warn('Geolocation error:', err);
        alert('현재 위치 정보를 가져올 수 없습니다. 브라우저의 위치 권한을 확인해 주세요.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // 재생 타이머 (1초마다 +1시간 전진, 48시간 후 0으로 루프)
  React.useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setTimelineOffsetHours((prev) => (prev >= 48 ? 0 : prev + 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // 대상 시뮬레이션 시각 Date 객체
  const now = new Date();
  const targetTime = new Date(now.getTime() + timelineOffsetHours * 3600 * 1000);
  const isNow = timelineOffsetHours === 0;

  // 대상 시각에 매칭되는 Open-Meteo hourly 데이터 인덱스 탐색
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

  const displayWindSpeed =
    weatherIdx >= 0 && weather?.hourly?.windSpeed && weather.hourly.windSpeed[weatherIdx] != null
      ? weather.hourly.windSpeed[weatherIdx]
      : weather?.windSpeed ?? 0;

  const displayWindDir =
    weatherIdx >= 0 && weather?.hourly?.windDirection && weather.hourly.windDirection[weatherIdx] != null
      ? weather.hourly.windDirection[weatherIdx]
      : weather?.windDirection ?? 0;

  const displayTemp =
    weatherIdx >= 0 && weather?.hourly?.temp && weather.hourly.temp[weatherIdx] != null
      ? weather.hourly.temp[weatherIdx]
      : weather?.temp ?? 0;

  const displayWaterTemp =
    marineIdx >= 0 && marine?.hourly?.seaSurfaceTemp && marine.hourly.seaSurfaceTemp[marineIdx] != null
      ? marine.hourly.seaSurfaceTemp[marineIdx]
      : marine?.seaSurfaceTemp ?? 0;

  const displayCurrentVel =
    marineIdx >= 0 && marine?.hourly?.currentVelocity && marine.hourly.currentVelocity[marineIdx] != null
      ? marine.hourly.currentVelocity[marineIdx]
      : marine?.currentVelocity ?? 0;

  const displayCurrentDir =
    marineIdx >= 0 && marine?.hourly?.currentDirection && marine.hourly.currentDirection[marineIdx] != null
      ? marine.hourly.currentDirection[marineIdx]
      : marine?.currentDirection ?? 0;

  // 오늘 0시 기준 경과 시간으로 72h 조위 곡선 매칭
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
  const diffHoursFromMidnight = Math.floor((targetTime.getTime() - todayStart) / 3600000);
  const matchedTidePoint =
    tide?.hourly72Curve?.find((c) => c.hour === diffHoursFromMidnight) ||
    tide?.hourlyCurve[targetHour];

  return (
    <div className={`relative w-full h-full bg-slate-950 ${isDarkTile ? 'dark-mode-tiles' : ''}`}>
      <MapContainer
        center={[36.0, 127.8]} // 한국 중심
        zoom={7}
        minZoom={6}
        maxZoom={18}
        className={`w-full h-full ${isDarkTile ? 'dark-mode-tiles' : ''}`}
      >
        {/* Leaflet DOM 컨테이너에 다크모드 클래스 직접 동기화 */}
        <MapDarkModeController isDark={isDarkTile} />

        {/* 줌 레벨 실시간 감지 (고배율 줌 시 캐스팅 화살표 렌더링) */}
        <MapZoomWatcher onZoomChange={setZoomLevel} />

        {/* 공식 타일 레이어
            - 주간: OpenStreetMap 기본 타일
            - 야간 다크모드: CartoDB Dark Matter 정품 타일 (API 키 인증 적용) */}
        <TileLayer
          key={isDarkTile ? 'carto-dark' : 'osm-standard'}
          attribution={
            isDarkTile
              ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
          url={
            isDarkTile
              ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${CARTO_API_KEY}`
              : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
        />

        <MapClickHandler onMapClick={onMapClickForNewSpot} />
        <MapRecenter target={internalRecenter || recenterTarget || null} />

        {/* 고배율 줌(Zoom >= 15) 시 포인트 캐스팅 공략 방향 화살표 렌더링 */}
        {showCastingArrows &&
          spots.map((spot) => {
            const directions = spot.casting_directions;
            if (!directions || directions.length === 0) return null;

            const isSelected = selectedSpot?.id === spot.id;
            const lineColor = isSelected ? '#22d3ee' : '#10b981'; // 선택 시 형광 cyan, 일반 에메랄드
            const arrowWeight = isSelected ? 4 : 2.5;

            // 'ALL' (전방위 캐스팅)인 경우 반경 45m 점선 레이더 원 및 4방위 화살표
            if (directions.includes('ALL')) {
              const cardinalBearings = [0, 90, 180, 270];
              return (
                <React.Fragment key={`casting-all-${spot.id}`}>
                  <Circle
                    center={[spot.lat, spot.lng]}
                    radius={45}
                    pathOptions={{
                      color: lineColor,
                      weight: isSelected ? 2.5 : 1.5,
                      dashArray: '4, 4',
                      fillColor: lineColor,
                      fillOpacity: isSelected ? 0.18 : 0.08,
                    }}
                  >
                    <Tooltip sticky>
                      <div className="text-xs font-sans">
                        <strong className="text-cyan-400">{spot.name}</strong>
                        <div>🎯 전방위 (360°) 캐스팅 공략 가능</div>
                      </div>
                    </Tooltip>
                  </Circle>
                  {cardinalBearings.map((deg) => {
                    const tip = calculateDestinationPoint(spot.lat, spot.lng, deg, 45);
                    const head = getArrowheadPoints(tip[0], tip[1], deg, 8);
                    return (
                      <React.Fragment key={`all-arrow-${spot.id}-${deg}`}>
                        <Polyline
                          positions={[[spot.lat, spot.lng], tip]}
                          pathOptions={{ color: lineColor, weight: arrowWeight, opacity: 0.85 }}
                        />
                        <Polygon
                          positions={head}
                          pathOptions={{
                            color: lineColor,
                            fillColor: lineColor,
                            fillOpacity: 0.9,
                            weight: 1,
                          }}
                        />
                      </React.Fragment>
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
                  const head = getArrowheadPoints(tip[0], tip[1], bearing, 9);

                  return (
                    <React.Fragment key={`arrow-${spot.id}-${dir}`}>
                      <Polyline
                        positions={[[spot.lat, spot.lng], tip]}
                        pathOptions={{
                          color: lineColor,
                          weight: arrowWeight,
                          opacity: 0.9,
                        }}
                      >
                        <Tooltip sticky>
                          <div className="text-xs font-sans">
                            <strong className="text-cyan-400">{spot.name}</strong>
                            <div>🎯 캐스팅 방향: {info.label} ({Math.round(bearing)}°) ~50m</div>
                          </div>
                        </Tooltip>
                      </Polyline>
                      <Polygon
                        positions={head}
                        pathOptions={{
                          color: lineColor,
                          fillColor: lineColor,
                          fillOpacity: 0.95,
                          weight: 1,
                        }}
                      />
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}

        {/* 내 현재 GPS 위치 마커 */}
        {myLocation && (
          <Marker position={[myLocation.lat, myLocation.lng]} icon={userLocationPin}>
            <Popup className="custom-spot-popup">
              <div className="p-1 text-slate-100 text-xs font-sans">
                <div className="font-bold text-sm text-cyan-400 mb-1">🎯 내 현재 위치</div>
                <div className="text-[11px] text-slate-300 mb-2">
                  위도: {myLocation.lat.toFixed(4)}, 경도: {myLocation.lng.toFixed(4)}
                </div>
                <button
                  onClick={() => onMapClickForNewSpot(myLocation.lat, myLocation.lng)}
                  className="w-full py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold transition shadow"
                >
                  이곳을 낚시 포인트로 등록
                </button>
              </div>
            </Popup>
          </Marker>
        )}

        {spots.map((spot) => {
          const isSelected = selectedSpot?.id === spot.id;
          return (
            <Marker
              key={spot.id}
              position={[spot.lat, spot.lng]}
              icon={createCustomPin(spot, isSelected)}
              eventHandlers={{
                click: () => onSelectSpot(spot),
              }}
            >
              <Popup className="custom-spot-popup">
                <div className="p-1 text-slate-100 text-xs font-sans">
                  <div className="font-bold text-sm text-cyan-400 mb-0.5">{spot.name}</div>
                  <div className="text-slate-300 mb-1 text-[11px]">
                    어종: {spot.target_species.join(', ')}
                  </div>
                  {spot.casting_directions && spot.casting_directions.length > 0 && (
                    <div className="text-[11px] text-amber-300 mb-1 font-semibold">
                      🎯 투척 방향: {spot.casting_directions.includes('ALL') ? '전방위 (360°)' : spot.casting_directions.join(', ')}
                    </div>
                  )}
                  <button
                    onClick={() => onSelectSpot(spot)}
                    className="w-full py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium transition shadow mt-1 text-xs"
                  >
                    상세 및 기상 보기
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* 지도 플로팅 컨트롤: GPS 내 위치 & 야간 다크모드 타일 토글
          - 모바일에서는 드로어가 전체화면을 덮을 때만 숨김
          - PC 웹에서는 사이드 패널이 열려있어도 지도 상단에 항시 온전히 노출되도록 보장 */}
      <div className={`absolute top-4 right-4 z-[400] flex flex-col gap-2 ${isMobileDrawerOpen ? 'hidden md:flex' : 'flex'}`}>
        <button
          onClick={handleLocateMe}
          disabled={isLocating}
          title="내 현재 GPS 위치 찾기"
          className="p-2.5 bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border border-slate-700/80 rounded-xl shadow-lg backdrop-blur flex items-center justify-center transition active:scale-95"
        >
          {isLocating ? (
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg">🎯</span>
          )}
        </button>
        <button
          onClick={handleToggleDarkMode}
          title={isDarkTile ? '주간 지도 타일로 변경' : '야간 낚시 다크 지도 타일로 변경 (Carto Dark)'}
          className={`p-2.5 border rounded-xl shadow-lg backdrop-blur flex items-center justify-center transition active:scale-95 ${
            isDarkTile
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-amber-500/20'
              : 'bg-slate-900/90 hover:bg-slate-800 text-amber-400 border-slate-700/80'
          }`}
        >
          <span className="text-lg">{isDarkTile ? '☀️' : '🌙'}</span>
        </button>
      </div>

      {/* 지도 안내 뱃지 */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 hidden sm:flex items-center gap-2 shadow-lg">
        <span>💡 해안·갯바위를 클릭하면 <strong>새 포인트를 즉시 추가</strong>할 수 있습니다.</span>
        {showCastingArrows && (
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
            🎯 캐스팅 공략 방향 표시 중
          </span>
        )}
      </div>
    </div>
  );
};
