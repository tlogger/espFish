import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Play, Pause } from 'lucide-react';
import type { FishingSpot, WeatherData, MarineData, WindUnit, CurrentUnit, TideDayInfo } from '../types';
import { formatWindSpeed, formatCurrentVelocity, getCompassDirection } from '../utils/weatherApi';

// 기본 Leaflet 아이콘 깨짐 방지 커스텀 SVG 마커 (정확한 앵커와 박스 크기)
function createCustomPin(spot: FishingSpot, isSelected: boolean) {
  let bgColor = '#06b6d4'; // cyan (lure)
  let iconEmoji = '🎣';
  if (spot.fishing_methods.includes('FLOAT')) {
    bgColor = '#f43f5e'; // rose (float)
    iconEmoji = '🔴';
  } else if (spot.fishing_methods.includes('SURF')) {
    bgColor = '#f59e0b'; // amber (surf)
    iconEmoji = '⚓';
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
}) => {
  // 타임라인 미래 시뮬레이션 슬라이더 상태 (0 ~ 23시)
  const currentHourNow = new Date().getHours();
  const [selectedHour, setSelectedHour] = React.useState<number>(currentHourNow);
  const [isPlaying, setIsPlaying] = React.useState(false);

  // 재생 타이머
  React.useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setSelectedHour((prev) => (prev + 1) % 24);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // 선택된 시간대의 데이터 추출
  const isNow = selectedHour === currentHourNow;

  const displayWindSpeed =
    weather?.hourly?.windSpeed && weather.hourly.windSpeed[selectedHour] != null
      ? weather.hourly.windSpeed[selectedHour]
      : weather?.windSpeed ?? 0;

  const displayWindDir =
    weather?.hourly?.windDirection && weather.hourly.windDirection[selectedHour] != null
      ? weather.hourly.windDirection[selectedHour]
      : weather?.windDirection ?? 0;

  const displayTemp =
    weather?.hourly?.temp && weather.hourly.temp[selectedHour] != null
      ? weather.hourly.temp[selectedHour]
      : weather?.temp ?? 0;

  const displayWaterTemp =
    marine?.hourly?.seaSurfaceTemp && marine.hourly.seaSurfaceTemp[selectedHour] != null
      ? marine.hourly.seaSurfaceTemp[selectedHour]
      : marine?.seaSurfaceTemp ?? 0;

  const displayCurrentVel =
    marine?.hourly?.currentVelocity && marine.hourly.currentVelocity[selectedHour] != null
      ? marine.hourly.currentVelocity[selectedHour]
      : marine?.currentVelocity ?? 0;

  const displayCurrentDir =
    marine?.hourly?.currentDirection && marine.hourly.currentDirection[selectedHour] != null
      ? marine.hourly.currentDirection[selectedHour]
      : marine?.currentDirection ?? 0;

  const matchedTidePoint = tide?.hourlyCurve.find((c) => c.hour === selectedHour);

  return (
    <div className="relative w-full h-full bg-slate-950">
      <MapContainer
        center={[36.0, 127.8]} // 한국 중심
        zoom={7}
        minZoom={6}
        maxZoom={18}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onMapClick={onMapClickForNewSpot} />
        <MapRecenter target={recenterTarget ?? null} />

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
                <div className="p-1 text-slate-900 text-xs font-sans">
                  <div className="font-bold text-sm text-cyan-800 mb-0.5">{spot.name}</div>
                  <div className="text-slate-600 mb-1">
                    어종: {spot.target_species.join(', ')}
                  </div>
                  <button
                    onClick={() => onSelectSpot(spot)}
                    className="w-full py-1 bg-cyan-600 text-white rounded font-medium hover:bg-cyan-700 transition"
                  >
                    상세 및 기상 보기
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* 선택된 포인트 지도 상단 실시간/미래 시뮬레이션 환경 오버레이 (Windy 스타일) */}
      {selectedSpot && (
        <div className="absolute top-4 left-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3.5 text-white shadow-2xl max-w-xs sm:max-w-sm space-y-3 pointer-events-auto">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {isNow ? '실시간 환경' : `${selectedHour}:00 예측 시뮬레이션`}
                </span>
                {!isNow && (
                  <button
                    onClick={() => setSelectedHour(currentHourNow)}
                    className="text-[10px] text-cyan-400 hover:underline"
                  >
                    현재시각으로 복귀
                  </button>
                )}
              </div>
              <h3 className="font-bold text-sm text-slate-100 truncate mt-1">{selectedSpot.name}</h3>
            </div>
          </div>

          {/* 풍향·풍속 & 조류 벡터 카드 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* 풍향·풍속 벡터 */}
            <div className="flex items-center gap-2 p-2 bg-slate-800/80 rounded-lg border border-slate-700">
              <div
                className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold shrink-0"
                style={{
                  transform: `rotate(${displayWindDir}deg)`,
                  transition: 'transform 0.4s ease',
                }}
                title={`풍향 ${displayWindDir}°`}
              >
                <span className="text-base select-none">↓</span>
              </div>
              <div className="overflow-hidden">
                <div className="text-[10px] text-slate-400 truncate">
                  풍향: {getCompassDirection(displayWindDir)}
                </div>
                <div className="font-bold text-cyan-300">
                  {formatWindSpeed(displayWindSpeed, windUnit)}
                </div>
              </div>
            </div>

            {/* 조류 방향·유속 벡터 */}
            <div className="flex items-center gap-2 p-2 bg-slate-800/80 rounded-lg border border-slate-700">
              <div
                className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold shrink-0"
                style={{
                  transform: `rotate(${displayCurrentDir}deg)`,
                  transition: 'transform 0.4s ease',
                }}
                title={`조류방향 ${displayCurrentDir}°`}
              >
                <span className="text-base select-none">↑</span>
              </div>
              <div className="overflow-hidden">
                <div className="text-[10px] text-slate-400 truncate">
                  조류: {getCompassDirection(displayCurrentDir)}
                </div>
                <div className="font-bold text-emerald-300">
                  {formatCurrentVelocity(displayCurrentVel, currentUnit)}
                </div>
              </div>
            </div>
          </div>

          {/* 수온, 기온, 조위 상태 */}
          <div className="flex justify-between items-center text-[11px] text-slate-300 pt-1 border-t border-slate-800">
            <span>
              🌡️ 수온: <strong className="text-rose-400">{displayWaterTemp}°C</strong>
              <span className="text-slate-400 ml-1">/ 기온 {displayTemp}°C</span>
            </span>
            <span>
              조위: <strong className="text-cyan-300">{matchedTidePoint?.height ?? '--'}cm</strong>
            </span>
          </div>

          {/* Windy 스타일 24시간 타임라인 슬라이더 컨트롤 */}
          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-white transition"
                  title={isPlaying ? '정지' : '24시간 시뮬레이션 재생'}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                </button>
                <span>{selectedHour}:00 타임라인</span>
              </div>
              <span className="text-[10px] text-slate-400">
                {matchedTidePoint?.stateText || ''}
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={23}
              value={selectedHour}
              onChange={(e) => setSelectedHour(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>00시</span>
              <span>06시</span>
              <span>12시</span>
              <span>18시</span>
              <span>23시</span>
            </div>
          </div>
        </div>
      )}

      {/* 지도 안내 뱃지 */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 hidden sm:block">
        💡 지도의 원하는 해안·갯바위를 클릭하면 해당 위치로 <strong>새 포인트를 즉시 추가</strong>할 수 있습니다.
      </div>
    </div>
  );
};
