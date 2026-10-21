import React from 'react';
import {
  Map,
  CustomOverlayMap,
  Polyline,
  Circle,
  useKakaoLoader,
} from 'react-kakao-maps-sdk';
import { AlertCircle, Star } from 'lucide-react';
import type { FishingSpot, WeatherData, MarineData, WindUnit, CurrentUnit, TideDayInfo } from '../types';
import { formatWindSpeed, formatCurrentVelocity, getCompassDirection } from '../utils/weatherApi';

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
  weather,
  marine,
  windUnit,
  currentUnit,
  recenterTarget,
  isMobileDrawerOpen = false,
}) => {
  // 카카오 지도 SDK 동적 로더
  const [loading, error] = useKakaoLoader({
    appkey: KAKAO_APP_KEY,
    libraries: ['services', 'clusterer'],
  });

  // 지도 중심 및 줌 레벨 (카카오맵: 숫자가 작을수록 확대, 1=20m, 3=50m, 12=전국)
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

  // 내 현재 GPS 위치 및 추적 상태
  const [myLocation, setMyLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = React.useState(false);

  // 클릭 이벤트 관통 방지 이중 락 레퍼런스
  const isMarkerClickRef = React.useRef(false);

  // 실수 터치 방지: 지도 빈 자리 클릭 시 임시 핀 & 미니 확인 팝업 상태
  const [pendingNewSpot, setPendingNewSpot] = React.useState<{ lat: number; lng: number } | null>(null);

  // 나만의 즐겨찾기(찜한 포인트) 목록
  const [favoriteSpotIds, setFavoriteSpotIds] = React.useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('exfish_favorite_spot_ids');
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  });
  const [viewOnlyFavorites, setViewOnlyFavorites] = React.useState(false);

  const toggleFavorite = (spotId: string) => {
    setFavoriteSpotIds((prev) => {
      const next = prev.includes(spotId) ? prev.filter((id) => id !== spotId) : [...prev, spotId];
      if (typeof window !== 'undefined') {
        localStorage.setItem('exfish_favorite_spot_ids', JSON.stringify(next));
      }
      return next;
    });
  };

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

  // 초기 진입 시 사용자 위치 자동 이동 보장을 위한 플래그
  const hasAutoLocatedRef = React.useRef(false);

  React.useEffect(() => {
    if (!hasAutoLocatedRef.current && typeof navigator !== 'undefined' && navigator.geolocation) {
      hasAutoLocatedRef.current = true;
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocating(false);
          const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMyLocation(userPos);
          setCenter(userPos);
          setLevel(4); // 약 100m~250m 상세 레벨
        },
        (err) => {
          setIsLocating(false);
          console.warn('Initial geolocation failed or denied:', err);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, []);

  // 최근 선택 타겟 또는 포인트 이동 감지
  React.useEffect(() => {
    if (recenterTarget) {
      setCenter({ lat: recenterTarget.lat, lng: recenterTarget.lng });
      if (recenterTarget.zoom) {
        const kakaoLevel = Math.max(1, Math.min(14, 18 - recenterTarget.zoom));
        setLevel(kakaoLevel);
      } else {
        setLevel(3);
      }
    }
  }, [recenterTarget]);

  // 선택된 포인트 변경 시 센터 자동 동기화 (초기 자동 위치 이동과 충돌 방지)
  const isInitialMount = React.useRef(true);
  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (selectedSpot) {
      setCenter({ lat: selectedSpot.lat, lng: selectedSpot.lng });
      setLevel(3);
      setPendingNewSpot(null);
    }
  }, [selectedSpot?.id]);

  // 카카오맵 기준 고배율 줌 레벨 (level 1, 2, 3, 4 = 현장 20m~100m 상세도)에서만 캐스팅 화살표 표시
  const showCastingArrows = level <= 4;

  // 찜한 포인트 필터 적용 목록
  const displayedSpots = viewOnlyFavorites
    ? spots.filter((s) => favoriteSpotIds.includes(s.id))
    : spots;

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
        <AlertCircle size={40} className="text-amber-400" />
        <h3 className="text-base font-bold text-white">카카오 맵 API 활성화 안내</h3>
        <div className="text-xs text-slate-300 max-w-lg leading-relaxed bg-slate-900 border border-slate-800 p-4 rounded-xl text-left space-y-2 shadow-xl">
          <p className="font-semibold text-amber-300">
            ⚠️ 카카오 개발자 콘솔에서 <strong>[지도/로컬]</strong> 서비스 활성화가 필요합니다:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
            <li>
              <a
                href="https://developers.kakao.com/console/app"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 underline font-bold"
              >
                developers.kakao.com
              </a>{' '}
              접속 → <strong>ExFish</strong> 애플리케이션 선택
            </li>
            <li>
              좌측 사이드바 <strong>[제품 설정] → [지도/로컬]</strong> 메뉴 이동
            </li>
            <li>
              <strong>[활성화 설정]</strong> 토글을 <strong>[ON (활성화)]</strong>으로 켜기
            </li>
            <li>
              <strong>[앱 설정] → [플랫폼] → [Web 플랫폼]</strong> 사이트 도메인에{' '}
              <code className="text-amber-200">https://tlogger.github.io</code> 및{' '}
              <code className="text-amber-200">http://localhost:5173</code> 등록 확인
            </li>
          </ol>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition shadow mt-1"
        >
          설정 완료 후 새로고침 (다시 시도)
        </button>
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
          // 마커나 팝업 클릭 시 지도 클릭 핸들러가 발화되는 관통 현상 원천 차단
          if (isMarkerClickRef.current) {
            isMarkerClickRef.current = false;
            return;
          }
          // 지도 빈 공간 클릭 시 바로 모달을 열지 않고 '미니 확인 팝업'을 띄워 실수 터치 방지
          const latLng = mouseEvent.latLng;
          setPendingNewSpot({ lat: latLng.getLat(), lng: latLng.getLng() });
        }}
        onZoomChanged={(target) => {
          setLevel(target.getLevel());
        }}
        onCenterChanged={(target) => {
          const latLng = target.getCenter();
          setCenter({ lat: latLng.getLat(), lng: latLng.getLng() });
        }}
      >
        {/* 선택된 포인트의 캐스팅 비거리 동심원 눈금 링 (캐스팅 방향만 부채꼴 호로 표기 + 각 동심원에 30m / 60m / 100m 거리 표기) */}
        {showCastingArrows && selectedSpot && (() => {
          const castingDirs = selectedSpot.casting_directions || [];
          const isAllDirections = castingDirs.includes('ALL');
          const radii = [30, 60, 100];
          const fanHalfAngle = 30; // 투척 방향 중심 좌우 30도 (총 60도 부채꼴 호)

          // 1. 'ALL' (전방위) 또는 방향 미지정인 경우: 360도 전체 동심원 + 북쪽 기준 거리 표기
          if (isAllDirections || castingDirs.length === 0) {
            return (
              <React.Fragment key={`range-rings-${selectedSpot.id}`}>
                {radii.map((r, idx) => {
                  const [labelLat, labelLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, 0, r);
                  return (
                    <React.Fragment key={`all-ring-${selectedSpot.id}-${r}`}>
                      <Circle
                        center={{ lat: selectedSpot.lat, lng: selectedSpot.lng }}
                        radius={r}
                        strokeWeight={1.5}
                        strokeColor="#06b6d4"
                        strokeOpacity={idx === 0 ? 0.75 : idx === 1 ? 0.5 : 0.3}
                        strokeStyle="dash"
                        zIndex={30}
                      />
                      <CustomOverlayMap
                        position={{ lat: labelLat, lng: labelLng }}
                        yAnchor={0.5}
                        xAnchor={0.5}
                        zIndex={35}
                        clickable={false}
                      >
                        <div className="px-1.5 py-0.5 rounded-full bg-slate-950/90 text-cyan-300 border border-cyan-400/60 text-[9px] font-bold font-mono shadow-md backdrop-blur-xs select-none pointer-events-none kakao-invert-restore whitespace-nowrap">
                          {r}m
                        </div>
                      </CustomOverlayMap>
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          }

          // 2. 개별 지정 방향(N, NE, E 등)인 경우: 캐스팅 투척 방향으로만 30m, 60m, 100m 부채꼴 호 및 거리 라벨 렌더링
          return (
            <React.Fragment key={`range-arcs-${selectedSpot.id}`}>
              {castingDirs.map((dir) => {
                const info = CASTING_BEARINGS[dir];
                if (!info) return null;
                const bearing = info.deg;

                // 좌우 부채꼴 경계선 (100m 지점까지 뻗어나가는 은은한 레이더 가이드 선)
                const leftEdge = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, bearing - fanHalfAngle, 100);
                const rightEdge = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, bearing + fanHalfAngle, 100);

                return (
                  <React.Fragment key={`casting-fan-${selectedSpot.id}-${dir}`}>
                    {/* 부채꼴 좌측 경계선 */}
                    <Polyline
                      path={[
                        { lat: selectedSpot.lat, lng: selectedSpot.lng },
                        { lat: leftEdge[0], lng: leftEdge[1] },
                      ]}
                      strokeWeight={1}
                      strokeColor="#06b6d4"
                      strokeOpacity={0.25}
                      strokeStyle="dash"
                      zIndex={28}
                    />
                    {/* 부채꼴 우측 경계선 */}
                    <Polyline
                      path={[
                        { lat: selectedSpot.lat, lng: selectedSpot.lng },
                        { lat: rightEdge[0], lng: rightEdge[1] },
                      ]}
                      strokeWeight={1}
                      strokeColor="#06b6d4"
                      strokeOpacity={0.25}
                      strokeStyle="dash"
                      zIndex={28}
                    />

                    {/* 각 거리(30m / 60m / 100m)별 부채꼴 호 및 거리 m 라벨 오버레이 */}
                    {radii.map((r, rIdx) => {
                      const arcPoints: { lat: number; lng: number }[] = [];
                      for (let b = bearing - fanHalfAngle; b <= bearing + fanHalfAngle; b += 2) {
                        const [pLat, pLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, b, r);
                        arcPoints.push({ lat: pLat, lng: pLng });
                      }

                      // 호 중심 지점에 m 거리 표기 오버레이
                      const [labelLat, labelLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, bearing, r);

                      return (
                        <React.Fragment key={`arc-r-${selectedSpot.id}-${dir}-${r}`}>
                          <Polyline
                            path={arcPoints}
                            strokeWeight={rIdx === 0 ? 2 : 1.5}
                            strokeColor="#06b6d4"
                            strokeOpacity={rIdx === 0 ? 0.85 : rIdx === 1 ? 0.6 : 0.4}
                            strokeStyle="dash"
                            zIndex={30}
                          />
                          <CustomOverlayMap
                            position={{ lat: labelLat, lng: labelLng }}
                            yAnchor={0.5}
                            xAnchor={0.5}
                            zIndex={35}
                            clickable={false}
                          >
                            <div className="px-1.5 py-0.5 rounded-full bg-slate-950/90 text-cyan-300 border border-cyan-400/60 text-[9px] font-bold font-mono shadow-md backdrop-blur-xs select-none pointer-events-none kakao-invert-restore whitespace-nowrap">
                              {r}m
                            </div>
                          </CustomOverlayMap>
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })()}

        {/* 선택된 포인트의 파란색 캐스팅 방향 화살표 + 실시간 바람·조류 상호작용 HUD (요구사항 3, 4, 5) */}
        {showCastingArrows && selectedSpot && (() => {
          const castingDirs = selectedSpot.casting_directions || [];
          const primaryDir = castingDirs.find((d) => d !== 'ALL') || 'E';
          const primaryInfo = CASTING_BEARINGS[primaryDir];
          const bearing = primaryInfo?.deg ?? 90;

          // 1. 파란색 캐스팅 방향 화살표 (요구사항 4: 파란색 화살표 적용)
          const isAllDirections = castingDirs.includes('ALL');
          const castingLines = isAllDirections ? (
            <React.Fragment key={`selected-casting-all-${selectedSpot.id}`}>
              {[0, 90, 180, 270].map((deg) => {
                const tip = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, deg, 55);
                return (
                  <Polyline
                    key={`all-arrow-${selectedSpot.id}-${deg}`}
                    path={[
                      { lat: selectedSpot.lat, lng: selectedSpot.lng },
                      { lat: tip[0], lng: tip[1] },
                    ]}
                    endArrow={true}
                    strokeWeight={4.5}
                    strokeColor="#2563eb"
                    strokeOpacity={0.95}
                    zIndex={50}
                  />
                );
              })}
            </React.Fragment>
          ) : (
            <React.Fragment key={`selected-casting-${selectedSpot.id}`}>
              {castingDirs.map((dir) => {
                const info = CASTING_BEARINGS[dir];
                if (!info) return null;
                const tip = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, info.deg, 55);
                const badgePos = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, info.deg, 58);

                return (
                  <React.Fragment key={`casting-arrow-${selectedSpot.id}-${dir}`}>
                    <Polyline
                      path={[
                        { lat: selectedSpot.lat, lng: selectedSpot.lng },
                        { lat: tip[0], lng: tip[1] },
                      ]}
                      endArrow={true}
                      strokeWeight={4.5}
                      strokeColor="#2563eb"
                      strokeOpacity={0.95}
                      zIndex={50}
                    />
                    <CustomOverlayMap
                      position={{ lat: badgePos[0], lng: badgePos[1] }}
                      yAnchor={0.5}
                      xAnchor={0.5}
                      zIndex={55}
                      clickable={false}
                    >
                      <div className="px-1.5 py-0.5 rounded-full bg-blue-950/95 text-blue-300 border border-blue-400/80 text-[9px] font-bold shadow-lg pointer-events-none kakao-invert-restore select-none whitespace-nowrap">
                        🎯 캐스팅 {info.label} ({info.deg}°)
                      </div>
                    </CustomOverlayMap>
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );

          // 2. 실시간 풍향 및 풍속 상호작용 (요구사항 3 & 4)
          // weather.windDirection: 바람이 불어오는 방위 (From)
          // windVectorDeg: 바람이 불어가는 진행 방위 (To) = (windDirection + 180) % 360
          let windElements = null;
          if (weather) {
            const windVectorDeg = (weather.windDirection + 180) % 360;
            const diff = Math.abs(bearing - windVectorDeg) % 360;
            const angleDiff = diff > 180 ? 360 - diff : diff;

            // 등바람(Tailwind) <= 45도 / 맞바람(Headwind) >= 135도 / 옆바람(Crosswind)
            const isTailwind = angleDiff <= 45;
            const isHeadwind = angleDiff >= 135;

            let windTypeLabel = '';
            let windColor = '#f59e0b'; // 옆바람 (기본 호박색)
            let ratio = 1.0;

            if (isTailwind) {
              windColor = '#10b981'; // 에메랄드 그린
              const tailFactor = Math.cos((angleDiff * Math.PI) / 180);
              ratio = Math.min(1.35, 1 + tailFactor * (weather.windSpeed / 10) * 0.28);
              const plusMeters = Math.round((ratio - 1) * 60);
              windTypeLabel = `등바람 (비거리 +${plusMeters}m)`;
            } else if (isHeadwind) {
              windColor = '#ef4444'; // 로즈 레드
              const headFactor = Math.abs(Math.cos((angleDiff * Math.PI) / 180));
              ratio = Math.max(0.65, 1 - headFactor * (weather.windSpeed / 10) * 0.28);
              const minusMeters = Math.round((1 - ratio) * 60);
              windTypeLabel = `맞바람 (비거리 -${minusMeters}m)`;
            } else {
              windColor = '#f59e0b'; // 황금/호박색
              const crossFactor = Math.sin((angleDiff * Math.PI) / 180);
              ratio = Math.max(0.85, 1 - crossFactor * (weather.windSpeed / 10) * 0.12);
              windTypeLabel = '옆바람 (줄날림 주의)';
            }

            const effDist = Math.round(60 * ratio);

            // 바람 진행 벡터 화살표 (바람이 불어가는 방향으로 45m 뻗어감)
            const windTip = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, windVectorDeg, 45);
            const windBadgePos = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, windVectorDeg, 48);

            // 보정된 유효 비거리 부채꼴 호
            const arcPts: { lat: number; lng: number }[] = [];
            for (let b = bearing - 22; b <= bearing + 22; b += 2) {
              const [pLat, pLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, b, effDist);
              arcPts.push({ lat: pLat, lng: pLng });
            }
            const [effLabelLat, effLabelLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, bearing, effDist);

            windElements = (
              <React.Fragment key={`wind-physics-${selectedSpot.id}`}>
                {/* 바람 진행 벡터 화살표 */}
                <Polyline
                  path={[
                    { lat: selectedSpot.lat, lng: selectedSpot.lng },
                    { lat: windTip[0], lng: windTip[1] },
                  ]}
                  endArrow={true}
                  strokeWeight={4}
                  strokeColor={windColor}
                  strokeOpacity={0.9}
                  zIndex={60}
                />
                <CustomOverlayMap
                  position={{ lat: windBadgePos[0], lng: windBadgePos[1] }}
                  yAnchor={0.5}
                  xAnchor={0.5}
                  zIndex={65}
                  clickable={false}
                >
                  <div
                    className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono shadow-xl border pointer-events-none kakao-invert-restore select-none whitespace-nowrap flex items-center gap-1"
                    style={{
                      backgroundColor: `${windColor}22`,
                      color: windColor,
                      borderColor: `${windColor}aa`,
                    }}
                  >
                    <span>💨 {getCompassDirection(weather.windDirection)}풍 {formatWindSpeed(weather.windSpeed, windUnit)}</span>
                    <span className="opacity-70">|</span>
                    <span>{windTypeLabel}</span>
                  </div>
                </CustomOverlayMap>

                {/* 실질 보정 비거리 호 & 배지 */}
                <Polyline
                  path={arcPts}
                  strokeWeight={2.5}
                  strokeColor={windColor}
                  strokeOpacity={0.9}
                  strokeStyle="shortdash"
                  zIndex={32}
                />
                <CustomOverlayMap
                  position={{ lat: effLabelLat, lng: effLabelLng }}
                  yAnchor={1.4}
                  xAnchor={0.5}
                  zIndex={36}
                  clickable={false}
                >
                  <div
                    className="px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono shadow-lg border pointer-events-none kakao-invert-restore select-none whitespace-nowrap"
                    style={{
                      backgroundColor: `${windColor}22`,
                      color: windColor,
                      borderColor: `${windColor}aa`,
                    }}
                  >
                    🎯 실질 비거리 {effDist}m ({isTailwind ? `등바람 +${Math.round((ratio - 1) * 60)}m` : isHeadwind ? `맞바람 -${Math.round((1 - ratio) * 60)}m` : '옆바람 감쇄'})
                  </div>
                </CustomOverlayMap>
              </React.Fragment>
            );
          }

          // 3. 실시간 조류 흘림선 (Drift Path)
          let currentElements = null;
          if (marine && (marine.currentVelocity ?? 0) > 0.05) {
            const landing = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, bearing, 50);
            const driftDist = Math.max(18, Math.min(45, (marine.currentVelocity ?? 0.3) * 65));
            const driftEnd = calculateDestinationPoint(landing[0], landing[1], marine.currentDirection, driftDist);
            const driftMid = calculateDestinationPoint(landing[0], landing[1], marine.currentDirection, driftDist * 0.5);

            currentElements = (
              <React.Fragment key={`drift-path-${selectedSpot.id}`}>
                <Polyline
                  path={[
                    { lat: landing[0], lng: landing[1] },
                    { lat: driftEnd[0], lng: driftEnd[1] },
                  ]}
                  endArrow={true}
                  strokeWeight={3}
                  strokeColor="#06b6d4"
                  strokeOpacity={0.85}
                  strokeStyle="dash"
                  zIndex={34}
                />
                <CustomOverlayMap
                  position={{ lat: driftMid[0], lng: driftMid[1] }}
                  yAnchor={0.5}
                  xAnchor={0.5}
                  zIndex={37}
                  clickable={false}
                >
                  <div className="px-1.5 py-0.5 rounded-full bg-slate-950/95 text-cyan-300 border border-cyan-500/70 text-[9px] font-bold shadow-md pointer-events-none kakao-invert-restore select-none whitespace-nowrap">
                    🌊 조류 흘림 ({formatCurrentVelocity(marine.currentVelocity, currentUnit)}, {getCompassDirection(marine.currentDirection)})
                  </div>
                </CustomOverlayMap>
              </React.Fragment>
            );
          }

          return (
            <React.Fragment key={`selected-hud-${selectedSpot.id}`}>
              {castingLines}
              {windElements}
              {currentElements}
            </React.Fragment>
          );
        })()}

        {/* 내 현재 GPS 위치 마커 */}
        {myLocation && (
          <CustomOverlayMap
            position={{ lat: myLocation.lat, lng: myLocation.lng }}
            yAnchor={0.5}
            xAnchor={0.5}
            zIndex={90}
            clickable={true}
          >
            <div className="relative flex items-center justify-center kakao-invert-restore">
              <div className="w-8 h-8 rounded-full bg-cyan-400/30 animate-ping absolute" />
              <div className="w-6 h-6 rounded-full bg-cyan-500 border-2 border-white shadow-xl flex items-center justify-center text-xs">
                🎯
              </div>
            </div>
          </CustomOverlayMap>
        )}

        {/* 지도 빈 공간 클릭 시: 새 포인트 등록 확인 미니 팝업 (실수 터치 완벽 방지) */}
        {pendingNewSpot && (
          <React.Fragment key="pending-new-spot">
            <CustomOverlayMap
              position={pendingNewSpot}
              yAnchor={0.5}
              xAnchor={0.5}
              zIndex={290}
              clickable={true}
            >
              <div className="relative flex items-center justify-center pointer-events-none kakao-invert-restore">
                <div className="w-9 h-9 rounded-full bg-cyan-400/40 animate-ping absolute" />
                <div className="w-7 h-7 rounded-full bg-cyan-500 border-2 border-white shadow-2xl flex items-center justify-center text-sm">
                  📍
                </div>
              </div>
            </CustomOverlayMap>

            <CustomOverlayMap
              position={pendingNewSpot}
              yAnchor={1.3}
              zIndex={300}
              clickable={true}
            >
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  isMarkerClickRef.current = true;
                }}
                className="p-3 bg-slate-900/95 backdrop-blur-md border border-cyan-500/60 rounded-xl shadow-2xl text-white text-xs font-sans space-y-2 animate-in fade-in zoom-in-95 duration-150 kakao-invert-restore min-w-[210px]"
              >
                <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                  <span>📍 새 포인트 등록</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  위도 {pendingNewSpot.lat.toFixed(4)}, 경도 {pendingNewSpot.lng.toFixed(4)}
                </div>
                <p className="text-[10px] text-slate-400">
                  이 해안/갯바위 위치를 새 낚시 포인트로 등록하시겠습니까?
                </p>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      isMarkerClickRef.current = true;
                      setPendingNewSpot(null);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition text-[11px]"
                  >
                    취소
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      isMarkerClickRef.current = true;
                      onMapClickForNewSpot(pendingNewSpot.lat, pendingNewSpot.lng);
                      setPendingNewSpot(null);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition shadow text-[11px]"
                  >
                    포인트 등록
                  </button>
                </div>
              </div>
            </CustomOverlayMap>
          </React.Fragment>
        )}

        {/* 등록된 포인트 커스텀 핀 오버레이 (요구사항 9: 불필요한 마커 팝업 제거, 클릭 시 해당 포인트 선택 및 HUD 표시) */}
        {displayedSpots.map((spot) => {
          const isSelected = selectedSpot?.id === spot.id;
          const isFavorited = favoriteSpotIds.includes(spot.id);

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
                clickable={true}
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    isMarkerClickRef.current = true;
                    onSelectSpot(spot);
                    setPendingNewSpot(null);
                  }}
                  className="cursor-pointer group flex flex-col items-center kakao-invert-restore"
                  title={`${spot.name} (${spot.target_species.join(', ')}) 클릭하여 선택`}
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
                    {isFavorited && (
                      <span className="absolute -top-1 -right-1 text-xs">⭐</span>
                    )}
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
            </React.Fragment>
          );
        })}
      </Map>

      {/* 지도 우상단 플로팅 컨트롤: 모드 3단 전환 & 찜한 포인트 필터 & GPS 내 위치 */}
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
            title="갯바위·방파제 고해상도 실사 항공 스카이뷰"
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

        {/* 보조 액션 버튼들 (찜한 포인트 필터 & GPS 내 위치) */}
        <div className="flex items-center gap-2">
          {/* 찜한 포인트만 보기 필터 */}
          <button
            onClick={() => setViewOnlyFavorites(!viewOnlyFavorites)}
            className={`p-2.5 border rounded-xl shadow-xl backdrop-blur flex items-center justify-center transition active:scale-95 ${
              viewOnlyFavorites
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-amber-500/20'
                : 'bg-slate-900/95 hover:bg-slate-800 text-slate-400 border-slate-700/80'
            }`}
            title={viewOnlyFavorites ? '전체 포인트 보기' : '내가 찜한 포인트만 보기'}
          >
            <Star size={16} className={viewOnlyFavorites ? 'fill-amber-400 text-amber-400' : ''} />
          </button>

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
      </div>

      {/* 지도 좌하단 안내 뱃지 */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 hidden sm:flex items-center gap-2 shadow-lg">
        <span>💡 해안·갯바위를 클릭하면 <strong>새 포인트를 추가</strong>할 수 있습니다.</span>
        {showCastingArrows && (
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
            🎯 캐스팅 공략 화살표 표시 중 (30/60/100m 비거리)
          </span>
        )}
      </div>
    </div>
  );
};
