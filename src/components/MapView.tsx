import React from 'react';
import {
  Map,
  MapMarker,
  CustomOverlayMap,
  Polyline,
  Circle,
  useKakaoLoader,
} from 'react-kakao-maps-sdk';
import { AlertCircle, Check, Crosshair, Star, Sliders, Waves as WavesIcon, Map as MapIcon, Satellite, Moon, Sun } from 'lucide-react';
import type { FishingSpot, WeatherData, MarineData, WindUnit, CurrentUnit, TideDayInfo } from '../types';
import { formatWindSpeed, formatCurrentVelocity, getCompassDirection } from '../utils/weatherApi';
import { KOREA_DEPTH_CONTOURS, estimateDepthAtPoint } from '../data/depthContours';
import { generateDynamicBathymetryContours } from '../utils/dynamicBathymetryEngine';
import {
  getSavedTackleConfig,
  saveTackleConfig,
  calculateSinkingPhysics,
  calculateAerodynamicCastingDrift,
  ROD_POWER_SPECS,
  RodPower,
  TackleRigConfig,
} from '../utils/tackleCalibration';

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
  microAdjustSpot?: FishingSpot | null;
  onCancelMicroAdjust?: () => void;
  onConfirmMicroAdjust?: (spotId: string, newLat: number, newLng: number) => void;
  currentUser?: { id: string; name: string } | null;
  onStartMicroAdjust?: (spot: FishingSpot) => void;
  isSunMode?: boolean;
  onToggleSunMode?: () => void;
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
  microAdjustSpot = null,
  onCancelMicroAdjust,
  onConfirmMicroAdjust,
  currentUser = null,
  onStartMicroAdjust,
  isSunMode = false,
  onToggleSunMode,
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

  // 내 현재 GPS 위치 및 추적 상태 (GPS 수평 오차 반경 원 포함)
  const [myLocation, setMyLocation] = React.useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = React.useState<number | null>(null);
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

  // KHOA 국가해양격자 수심 등심선 오버레이 표시 여부
  const [showDepthContours, setShowDepthContours] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('exfish_show_depth_contours') === 'true';
    }
    return false;
  });

  const toggleDepthContours = () => {
    setShowDepthContours((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('exfish_show_depth_contours', String(next));
      }
      return next;
    });
  };

  // 150m 격자수심 + 국립해양조사원(KHOA) 실시간 조위 합성 동적 등심선 (5~30m)
  const currentHour = new Date().getHours();
  const currentTideHeightCm = tide?.hourlyCurve?.find((c) => c.isCurrent || c.hour === currentHour)?.height;

  const dynamicBathymetry = React.useMemo(() => {
    if (!showDepthContours) return null;
    const targetLat = selectedSpot ? selectedSpot.lat : center.lat;
    const targetLng = selectedSpot ? selectedSpot.lng : center.lng;
    return generateDynamicBathymetryContours(
      targetLat,
      targetLng,
      currentTideHeightCm,
      18, // 반경 18km
      [5, 10, 15, 20, 25, 30] // 5m ~ 30m 등심선
    );
  }, [showDepthContours, selectedSpot?.lat, selectedSpot?.lng, center.lat, center.lng, currentTideHeightCm]);

  // 공기역학 채비 캘리브레이션 (루어 무게 g & PE 라인 호수)
  const [tackleConfig, setTackleConfig] = React.useState<TackleRigConfig>(() => getSavedTackleConfig());
  const [isTacklePopoverOpen, setIsTacklePopoverOpen] = React.useState(false);

  React.useEffect(() => {
    const handleTackleUpdate = () => {
      setTackleConfig(getSavedTackleConfig());
    };
    window.addEventListener('exfish_tackle_updated', handleTackleUpdate);
    return () => window.removeEventListener('exfish_tackle_updated', handleTackleUpdate);
  }, []);

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
        setGpsAccuracy(pos.coords.accuracy || 10);
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
          setGpsAccuracy(pos.coords.accuracy || 12);
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
    if (selectedSpot && !microAdjustSpot) {
      setCenter({ lat: selectedSpot.lat, lng: selectedSpot.lng });
      setLevel(3);
      setPendingNewSpot(null);
    }
  }, [selectedSpot?.id, microAdjustSpot]);

  // 위치 미세 조정 좌표 상태 (2D 평면 드래깅 및 1m 넛지 연동)
  const [adjustedPos, setAdjustedPos] = React.useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 });

  // 위치 미세 조정 모드 활성화 시 위성 스카이뷰(HYBRID) 전환, 최고 배율 줌(Level 1), 드래깅 마커 좌표 초기화
  React.useEffect(() => {
    if (microAdjustSpot) {
      setMapMode('HYBRID');
      try {
        localStorage.setItem('exfish_map_mode', 'HYBRID');
      } catch (e) {
        // ignore
      }
      setCenter({ lat: microAdjustSpot.lat, lng: microAdjustSpot.lng });
      setAdjustedPos({ lat: microAdjustSpot.lat, lng: microAdjustSpot.lng });
      setLevel(1);
      setPendingNewSpot(null);
    }
  }, [microAdjustSpot]);

  const handleNudge = (deltaLat: number, deltaLng: number) => {
    setAdjustedPos((prev) => {
      const next = {
        lat: Number((prev.lat + deltaLat).toFixed(7)),
        lng: Number((prev.lng + deltaLng).toFixed(7)),
      };
      setCenter(next);
      return next;
    });
  };

  // 원본 위치 대비 이동 거리(미터) 계산
  const distMeters = microAdjustSpot
    ? Math.hypot(
        (adjustedPos.lat - microAdjustSpot.lat) * 111000,
        (adjustedPos.lng - microAdjustSpot.lng) * 88800
      )
    : 0;

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
      } ${isSunMode ? 'exfish-sun-mode' : ''}`}
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
        {/* KHOA 150m 격자수심 + 실시간 관측 조위 합성 동적 등심선 오버레이 (5m, 10m, 15m, 20m, 25m, 30m) */}
        {showDepthContours && (
          <React.Fragment key="khoa-depth-contours-layer">
            {dynamicBathymetry && dynamicBathymetry.contours.length > 0 ? (
              dynamicBathymetry.contours.map((contour) => (
                <React.Fragment key={`dyn-contour-${contour.id}-${contour.depthMeters}`}>
                  {contour.paths.map((path, pIdx) => (
                    <Polyline
                      key={`dyn-path-${contour.id}-${pIdx}`}
                      path={path}
                      strokeWeight={contour.strokeWeight}
                      strokeColor={contour.color}
                      strokeOpacity={0.88}
                      strokeStyle={contour.depthMeters <= 5 ? 'shortdash' : contour.depthMeters === 10 ? 'solid' : 'dash'}
                      zIndex={15}
                    />
                  ))}
                  {contour.labelPos && (
                    <CustomOverlayMap
                      position={contour.labelPos}
                      yAnchor={0.5}
                      xAnchor={0.5}
                      zIndex={16}
                      clickable={false}
                    >
                      <div
                        className="px-1.5 py-0.5 rounded text-[8.5px] font-bold font-mono shadow-md pointer-events-none kakao-invert-restore select-none whitespace-nowrap border"
                        style={{
                          backgroundColor: '#020617f0',
                          color: contour.color,
                          borderColor: `${contour.color}77`,
                        }}
                      >
                        -{contour.depthMeters}m ({contour.name})
                      </div>
                    </CustomOverlayMap>
                  )}
                </React.Fragment>
              ))
            ) : (
              KOREA_DEPTH_CONTOURS.map((contour) => (
                <React.Fragment key={`contour-${contour.id}`}>
                  <Polyline
                    path={contour.path}
                    strokeWeight={contour.depthMeters <= 5 ? 2.2 : contour.depthMeters <= 10 ? 2 : 1.5}
                    strokeColor={contour.color}
                    strokeOpacity={0.85}
                    strokeStyle={contour.depthMeters === 5 ? 'shortdash' : contour.depthMeters === 10 ? 'solid' : 'dash'}
                    zIndex={15}
                  />
                  <CustomOverlayMap
                    position={contour.labelPos}
                    yAnchor={0.5}
                    xAnchor={0.5}
                    zIndex={16}
                    clickable={false}
                  >
                    <div
                      className="px-1.5 py-0.5 rounded text-[8.5px] font-bold font-mono shadow-md pointer-events-none kakao-invert-restore select-none whitespace-nowrap border"
                      style={{
                        backgroundColor: '#020617f0',
                        color: contour.color,
                        borderColor: `${contour.color}77`,
                      }}
                    >
                      -{contour.depthMeters}m ({contour.name})
                    </div>
                  </CustomOverlayMap>
                </React.Fragment>
              ))
            )}
          </React.Fragment>
        )}

        {/* 선택된 포인트의 캐스팅 비거리 동심원 눈금 링 및 유효 공략 부채꼴 섹터 (채비 캘리브레이션 거리 반영) */}
        {showCastingArrows && selectedSpot && (() => {
          let startDeg = selectedSpot.casting_start_deg;
          let endDeg = selectedSpot.casting_end_deg;

          // 레거시 하위 호환 매핑
          if (startDeg === undefined || endDeg === undefined) {
            const dirs = selectedSpot.casting_directions || [];
            if (dirs.length > 0 && !dirs.includes('ALL')) {
              const info = CASTING_BEARINGS[dirs[0]];
              if (info) {
                startDeg = (info.deg - 30 + 360) % 360;
                endDeg = (info.deg + 30) % 360;
              }
            }
          }

          if (startDeg === undefined || endDeg === undefined) {
            return null;
          }

          const span = endDeg >= startDeg ? endDeg - startDeg : 360 - startDeg + endDeg;
          const centerBearing = (startDeg + span / 2) % 360;
          const radii = tackleConfig.radii;
          const maxRadius = radii[2];

          // 좌우 유효 경계선 (최대 사거리 지점까지 뻗어나가는 레이더 가이드 선)
          const leftEdge = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, startDeg, maxRadius);
          const rightEdge = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, endDeg, maxRadius);

          return (
            <React.Fragment key={`range-sector-${selectedSpot.id}`}>
              {/* 시작각 경계선 */}
              <Polyline
                path={[
                  { lat: selectedSpot.lat, lng: selectedSpot.lng },
                  { lat: leftEdge[0], lng: leftEdge[1] },
                ]}
                strokeWeight={1.5}
                strokeColor="#10b981"
                strokeOpacity={0.65}
                strokeStyle="dash"
                zIndex={28}
              />

              {/* 종료각 경계선 */}
              <Polyline
                path={[
                  { lat: selectedSpot.lat, lng: selectedSpot.lng },
                  { lat: rightEdge[0], lng: rightEdge[1] },
                ]}
                strokeWeight={1.5}
                strokeColor="#06b6d4"
                strokeOpacity={0.65}
                strokeStyle="dash"
                zIndex={28}
              />

              {/* 거리(30m / 60m / 100m)별 부채꼴 호 및 거리 라벨 오버레이 */}
              {radii.map((r, rIdx) => {
                const step = Math.max(1, Math.min(3, Math.round(span / 25)));
                const arcPoints: { lat: number; lng: number }[] = [];
                for (let offset = 0; offset <= span; offset += step) {
                  const b = (startDeg! + offset) % 360;
                  const [pLat, pLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, b, r);
                  arcPoints.push({ lat: pLat, lng: pLng });
                }
                const [endLat, endLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, endDeg!, r);
                arcPoints.push({ lat: endLat, lng: endLng });

                // 호 중심 지점에 거리 m 표기 오버레이
                const [labelLat, labelLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, centerBearing, r);

                return (
                  <React.Fragment key={`arc-r-${selectedSpot.id}-${r}`}>
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
        })()}

        {/* 선택된 포인트의 파란색 캐스팅 방향 화살표 + 실시간 바람·조류 상호작용 HUD */}
        {showCastingArrows && selectedSpot && (() => {
          let startDeg = selectedSpot.casting_start_deg;
          let endDeg = selectedSpot.casting_end_deg;

          // 레거시 하위 호환 매핑
          if (startDeg === undefined || endDeg === undefined) {
            const dirs = selectedSpot.casting_directions || [];
            if (dirs.length > 0 && !dirs.includes('ALL')) {
              const info = CASTING_BEARINGS[dirs[0]];
              if (info) {
                startDeg = (info.deg - 30 + 360) % 360;
                endDeg = (info.deg + 30) % 360;
              }
            }
          }

          if (startDeg === undefined || endDeg === undefined) {
            startDeg = 45;
            endDeg = 135;
          }

          const span = endDeg >= startDeg ? endDeg - startDeg : 360 - startDeg + endDeg;
          const bearing = (startDeg + span / 2) % 360; // 중심 방위각

          const baseDist = tackleConfig.calibratedDistanceMeters;
          const tipDist = Math.max(20, Math.round(baseDist * 0.9));
          const tip = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, bearing, tipDist);
          const badgePos = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, bearing, tipDist + 4);

          // 착수 지점 수심 선형 추정 (KHOA 국가해양격자 수심 모델 기반)
          const landingDepth = estimateDepthAtPoint(
            selectedSpot.lat,
            selectedSpot.lng,
            tip[0],
            tip[1],
            selectedSpot.spot_type
          );

          // 수중 침강 물리 및 조류 연동 바닥 안착 소요 시간/흘림 계산
          const currentVel = marine?.currentVelocity ?? 0.3;
          const sinkPhysics = calculateSinkingPhysics(tackleConfig.weightGrams, landingDepth, currentVel);

          const castingLines = (
            <React.Fragment key={`selected-casting-${selectedSpot.id}`}>
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
                <div className="flex flex-col items-center gap-1 pointer-events-none kakao-invert-restore select-none whitespace-nowrap">
                  <div className="px-2 py-0.5 rounded-full bg-slate-950/95 text-cyan-300 border border-cyan-500/80 text-[8.5px] font-mono font-bold shadow-lg flex items-center gap-1.5">
                    <span>🌊 착수수심: -{landingDepth}m</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-amber-300">⏱️ 바닥 안착: 약 {sinkPhysics.fallTimeSec}초</span>
                    {sinkPhysics.driftDistanceM > 0.3 && (
                      <>
                        <span className="text-slate-500">|</span>
                        <span className="text-emerald-300">조류 흘림 +{sinkPhysics.driftDistanceM}m</span>
                      </>
                    )}
                  </div>
                </div>
              </CustomOverlayMap>
            </React.Fragment>
          );

          // 2. 실시간 풍향·풍속 및 합사줄(PE) 길이/두께 + 지그헤드/2인치 쉐드 웜 채비 공기역학 편류(밀림) 오렌지 라인
          // weather.windDirection: 바람이 불어오는 방위 (From)
          // windVectorDeg: 바람이 불어가는 진행 방위 (To) = (windDirection + 180) % 360
          let windElements = null;
          if (weather) {
            const windVectorDeg = (weather.windDirection + 180) % 360;
            const rigWeight = tackleConfig.weightGrams;
            const peLine = tackleConfig.peLineSize;

            // 공략각 시점, 중간, 종점 3개 포인트에 대한 정밀 편류(Drift) 물리 계산
            const midDeg = (startDeg + span / 2) % 360;
            const driftStart = calculateAerodynamicCastingDrift(startDeg, baseDist, weather.windSpeed, weather.windDirection, rigWeight, peLine, 2.0);
            const driftMid = calculateAerodynamicCastingDrift(midDeg, baseDist, weather.windSpeed, weather.windDirection, rigWeight, peLine, 2.0);
            const driftEnd = calculateAerodynamicCastingDrift(endDeg, baseDist, weather.windSpeed, weather.windDirection, rigWeight, peLine, 2.0);

            // 공략각 시점~종점 전체 구간에서 바람/합사줄에 의해 밀린 실제 착수 지점들을 이은 오렌지색 arc 폴리라인 생성
            const orangeArcPts: { lat: number; lng: number }[] = [];
            const targetArcPts: { lat: number; lng: number }[] = [];
            const arcStep = Math.max(1, Math.min(3, Math.round(span / 30)));
            for (let offset = 0; offset <= span; offset += arcStep) {
              const b = (startDeg + offset) % 360;
              const dRes = calculateAerodynamicCastingDrift(b, baseDist, weather.windSpeed, weather.windDirection, rigWeight, peLine, 2.0);
              // 실제 밀린 착수 좌표
              const [pActualLat, pActualLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, dRes.actualBearingDeg, dRes.actualDistanceM);
              orangeArcPts.push({ lat: pActualLat, lng: pActualLng });
              // 원래 목표했던 착수 좌표 (보조 기준선)
              const [pTargetLat, pTargetLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, b, dRes.targetDistanceM);
              targetArcPts.push({ lat: pTargetLat, lng: pTargetLng });
            }
            // 종점 마무리 포인트
            const [pEndActualLat, pEndActualLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, driftEnd.actualBearingDeg, driftEnd.actualDistanceM);
            orangeArcPts.push({ lat: pEndActualLat, lng: pEndActualLng });
            const [pEndTargetLat, pEndTargetLng] = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, endDeg, driftEnd.targetDistanceM);
            targetArcPts.push({ lat: pEndTargetLat, lng: pEndTargetLng });

            // 3개 포인트의 실제 밀린 착수 좌표 (오렌지 라인 위에 위치)
            const ptStartActual = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, driftStart.actualBearingDeg, driftStart.actualDistanceM);
            const ptMidActual = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, driftMid.actualBearingDeg, driftMid.actualDistanceM);
            const ptEndActual = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, driftEnd.actualBearingDeg, driftEnd.actualDistanceM);

            // 3개 포인트의 원래 목표 좌표
            const ptStartTarget = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, startDeg, driftStart.targetDistanceM);
            const ptMidTarget = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, midDeg, driftMid.targetDistanceM);
            const ptEndTarget = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, endDeg, driftEnd.targetDistanceM);

            // 바람 진행 벡터 화살표 (바람이 불어가는 방향으로 45m 뻗어감)
            const windTip = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, windVectorDeg, 45);
            const windBadgePos = calculateDestinationPoint(selectedSpot.lat, selectedSpot.lng, windVectorDeg, 48);

            windElements = (
              <React.Fragment key={`wind-physics-${selectedSpot.id}`}>
                {/* 1. 바람 진행 벡터 화살표 */}
                <Polyline
                  path={[
                    { lat: selectedSpot.lat, lng: selectedSpot.lng },
                    { lat: windTip[0], lng: windTip[1] },
                  ]}
                  endArrow={true}
                  strokeWeight={3.5}
                  strokeColor="#38bdf8"
                  strokeOpacity={0.85}
                  zIndex={45}
                />
                <CustomOverlayMap
                  position={{ lat: windBadgePos[0], lng: windBadgePos[1] }}
                  yAnchor={0.5}
                  xAnchor={0.5}
                  zIndex={55}
                  clickable={false}
                >
                  <div className="px-2 py-0.5 rounded-full text-[9px] font-bold font-mono shadow-xl border pointer-events-none kakao-invert-restore select-none whitespace-nowrap flex items-center gap-1 bg-slate-950/95 text-cyan-300 border-cyan-400/80">
                    <span>💨 {getCompassDirection(weather.windDirection)}풍 {formatWindSpeed(weather.windSpeed, windUnit)}</span>
                  </div>
                </CustomOverlayMap>

                {/* 2. 바람 없을 때의 원래 목표 호선 (은은한 점선 기준선) */}
                <Polyline
                  path={targetArcPts}
                  strokeWeight={1.5}
                  strokeColor="#94a3b8"
                  strokeOpacity={0.35}
                  strokeStyle="dashed"
                  zIndex={41}
                />

                {/* 3. 목표 지점 -> 실제 착수 지점 사이의 밀림 편류 가이드 선 (밀림 1m 이상 시 표시) */}
                {[
                  { target: ptStartTarget, actual: ptStartActual, drift: driftStart },
                  { target: ptMidTarget, actual: ptMidActual, drift: driftMid },
                  { target: ptEndTarget, actual: ptEndActual, drift: driftEnd },
                ].map((item, idx) =>
                  item.drift.driftDistanceM >= 1.0 ? (
                    <Polyline
                      key={`drift-offset-${idx}`}
                      path={[
                        { lat: item.target[0], lng: item.target[1] },
                        { lat: item.actual[0], lng: item.actual[1] },
                      ]}
                      strokeWeight={1.5}
                      strokeColor="#fbbf24"
                      strokeOpacity={0.7}
                      strokeStyle="dashed"
                      zIndex={43}
                    />
                  ) : null
                )}

                {/* 4. 풍향·풍속 및 합사/채비 공기역학으로 밀린 실제 착수 오렌지색 arc */}
                <Polyline
                  path={orangeArcPts}
                  strokeWeight={3.5}
                  strokeColor="#f97316"
                  strokeOpacity={0.95}
                  zIndex={42}
                />

                {/* 5. 시점 착수점 배지 (오렌지 라인 위에 정확히 표시) */}
                <CustomOverlayMap
                  position={{ lat: ptStartActual[0], lng: ptStartActual[1] }}
                  yAnchor={0.5}
                  xAnchor={0.5}
                  zIndex={48}
                  clickable={false}
                >
                  <div className="px-1.5 py-0.5 rounded-full bg-slate-950/95 text-orange-400 border border-orange-500 font-bold font-mono text-[9px] shadow-lg pointer-events-none kakao-invert-restore select-none whitespace-nowrap flex items-center gap-1">
                    <span>{driftStart.actualDistanceM}m</span>
                    {driftStart.driftDistanceM >= 1.0 && (
                      <span className="text-[8px] text-amber-300 font-normal">
                        ({driftStart.driftAngleDeg > 0 ? '우' : '좌'} {driftStart.driftDistanceM}m)
                      </span>
                    )}
                  </div>
                </CustomOverlayMap>

                {/* 6. 중간 착수점 배지 */}
                <CustomOverlayMap
                  position={{ lat: ptMidActual[0], lng: ptMidActual[1] }}
                  yAnchor={0.5}
                  xAnchor={0.5}
                  zIndex={48}
                  clickable={false}
                >
                  <div className="px-1.5 py-0.5 rounded-full bg-slate-950/95 text-orange-400 border border-orange-500 font-bold font-mono text-[9px] shadow-lg pointer-events-none kakao-invert-restore select-none whitespace-nowrap flex items-center gap-1">
                    <span>{driftMid.actualDistanceM}m</span>
                    {driftMid.driftDistanceM >= 1.0 && (
                      <span className="text-[8px] text-amber-300 font-normal">
                        ({driftMid.driftAngleDeg > 0 ? '우' : '좌'} {driftMid.driftDistanceM}m)
                      </span>
                    )}
                  </div>
                </CustomOverlayMap>

                {/* 7. 종점 착수점 배지 */}
                <CustomOverlayMap
                  position={{ lat: ptEndActual[0], lng: ptEndActual[1] }}
                  yAnchor={0.5}
                  xAnchor={0.5}
                  zIndex={48}
                  clickable={false}
                >
                  <div className="px-1.5 py-0.5 rounded-full bg-slate-950/95 text-orange-400 border border-orange-500 font-bold font-mono text-[9px] shadow-lg pointer-events-none kakao-invert-restore select-none whitespace-nowrap flex items-center gap-1">
                    <span>{driftEnd.actualDistanceM}m</span>
                    {driftEnd.driftDistanceM >= 1.0 && (
                      <span className="text-[8px] text-amber-300 font-normal">
                        ({driftEnd.driftAngleDeg > 0 ? '우' : '좌'} {driftEnd.driftDistanceM}m)
                      </span>
                    )}
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

        {/* 내 현재 GPS 위치 마커 & 수평 오차 반경 원 (Virtual Crosshair Accuracy Circle) */}
        {myLocation && (
          <React.Fragment key="my-location-group">
            {gpsAccuracy && gpsAccuracy > 0 && (
              <Circle
                center={myLocation}
                radius={gpsAccuracy}
                strokeWeight={1}
                strokeColor="#06b6d4"
                strokeOpacity={0.8}
                strokeStyle="dash"
                fillColor="#06b6d4"
                fillOpacity={0.12}
                zIndex={85}
              />
            )}
            <CustomOverlayMap
              position={{ lat: myLocation.lat, lng: myLocation.lng }}
              yAnchor={0.5}
              xAnchor={0.5}
              zIndex={90}
              clickable={true}
            >
              <div
                className="relative flex items-center justify-center kakao-invert-restore cursor-pointer"
                title={`현재 내 위치 (GPS 오차 반경 약 ±${Math.round(gpsAccuracy || 10)}m)`}
              >
                <div className="w-8 h-8 rounded-full bg-cyan-400/30 animate-ping absolute" />
                <div className="w-6 h-6 rounded-full bg-cyan-500 border-2 border-white shadow-xl flex items-center justify-center text-xs">
                  🎯
                </div>
              </div>
            </CustomOverlayMap>
          </React.Fragment>
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
          // 미세 조정 대상 포인트는 드래깅 전용 MapMarker로 별도 렌더링
          if (microAdjustSpot?.id === spot.id) return null;

          const isSelected = selectedSpot?.id === spot.id;
          const isFavorited = favoriteSpotIds.includes(spot.id);
          const isAuthor = Boolean(
            currentUser &&
              (spot.user_id === currentUser.id ||
                spot.user_id === 'user-me' ||
                currentUser.id === 'user-me')
          );

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

                  {/* PC 및 지도 화면 포인트 아이콘 하단 미세이동 아이콘 버튼 (포인트 작성자 전용) */}
                  {isSelected && isAuthor && onStartMicroAdjust && !microAdjustSpot && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        isMarkerClickRef.current = true;
                        onStartMicroAdjust(spot);
                      }}
                      className="mt-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-[11px] shadow-xl flex items-center gap-1 active:scale-95 transition pointer-events-auto border border-emerald-300 ring-2 ring-emerald-400/40"
                      title="위성 스카이뷰에서 마커를 드래그하여 위치 미세이동"
                    >
                      <Crosshair size={12} className="shrink-0 text-slate-950 animate-pulse" />
                      <span>미세이동</span>
                    </button>
                  )}
                </div>
              </CustomOverlayMap>
            </React.Fragment>
          );
        })}

        {/* [요구사항 2] 위성지도 기반 2D 평면 포인트 마커 드래깅 미세조정 */}
        {microAdjustSpot && (
          <React.Fragment key="micro-adjust-marker-group">
            {/* 기존 등록 위치 옅은 고스트 마커 */}
            <CustomOverlayMap
              position={{ lat: microAdjustSpot.lat, lng: microAdjustSpot.lng }}
              yAnchor={1}
              zIndex={40}
            >
              <div className="flex flex-col items-center opacity-60 pointer-events-none">
                <div className="w-7 h-7 rounded-full border-2 border-dashed border-rose-400 bg-rose-500/20 flex items-center justify-center text-[10px] text-rose-300 font-bold shadow">
                  기존
                </div>
                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-rose-400" />
                <span className="text-[10px] text-rose-300 font-mono bg-slate-900/90 px-1 rounded border border-rose-500/30">
                  이전 위치
                </span>
              </div>
            </CustomOverlayMap>

            {/* 기존 위치에서 새 위치로의 이동 궤적 점선 */}
            {distMeters > 0.1 && (
              <Polyline
                path={[
                  { lat: microAdjustSpot.lat, lng: microAdjustSpot.lng },
                  { lat: adjustedPos.lat, lng: adjustedPos.lng },
                ]}
                strokeWeight={3}
                strokeColor="#10b981"
                strokeOpacity={0.9}
                strokeStyle="shortdash"
                zIndex={45}
              />
            )}

            {/* 2차원 평면 드래그 가능한 마커 (사용자가 위성지도에서 마우스/터치로 직접 발판으로 드래깅) */}
            <MapMarker
              position={adjustedPos}
              draggable={true}
              onDragEnd={(marker) => {
                const pos = marker.getPosition();
                setAdjustedPos({ lat: pos.getLat(), lng: pos.getLng() });
              }}
              zIndex={150}
            />

            {/* 마커 상단 드래그 가이드 툴팁 배지 */}
            <CustomOverlayMap
              position={adjustedPos}
              yAnchor={2.3}
              zIndex={160}
            >
              <div className="px-3 py-1 rounded-full bg-slate-950/95 border-2 border-emerald-400 text-emerald-300 font-bold text-xs shadow-2xl flex items-center gap-1.5 whitespace-nowrap animate-bounce pointer-events-none">
                <span>👆 핀을 드래그하여 정확한 발판으로 옮기세요</span>
              </div>
            </CustomOverlayMap>
          </React.Fragment>
        )}
      </Map>

      {/* 지도 우상단 플로팅 컨트롤: 모드 3단 전환 & 찜한 포인트 필터 & GPS 내 위치 (모바일 드로어 열림 시에만 모바일에서 숨김, PC는 상시 flex 유지) */}
      <div
        className={`absolute top-4 right-4 z-20 flex-col items-end gap-2 ${
          isMobileDrawerOpen ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* 일반 지도 / 스카이뷰(항공사진) / 야간 다크 모드 / 고대비 모드 아이콘 전용 탭 */}
        <div className="flex items-center bg-slate-900/95 border border-slate-700/80 rounded-xl p-1 shadow-2xl backdrop-blur gap-0.5">
          <button
            onClick={() => handleModeChange('ROADMAP')}
            className={`p-2 rounded-lg transition flex items-center justify-center ${
              mapMode === 'ROADMAP'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="일반 도로 지도"
            aria-label="일반 지도"
          >
            <MapIcon size={16} />
          </button>
          <button
            onClick={() => handleModeChange('HYBRID')}
            className={`p-2 rounded-lg transition flex items-center justify-center ${
              mapMode === 'HYBRID'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="갯바위·방파제 고해상도 실사 항공 스카이뷰"
            aria-label="스카이뷰"
          >
            <Satellite size={16} />
          </button>
          <button
            onClick={() => handleModeChange('DARK')}
            className={`p-2 rounded-lg transition flex items-center justify-center ${
              mapMode === 'DARK'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="야간 낚시 다크 모드 (눈부심 방지)"
            aria-label="야간 다크"
          >
            <Moon size={16} />
          </button>
          {onToggleSunMode && (
            <button
              onClick={onToggleSunMode}
              className={`p-2 rounded-lg transition flex items-center justify-center border-l border-slate-800 ml-0.5 pl-1.5 ${
                isSunMode
                  ? 'bg-yellow-400 text-black font-bold shadow-yellow-500/30'
                  : 'text-yellow-400/90 hover:text-yellow-300 hover:bg-slate-800'
              }`}
              title={isSunMode ? '아웃도어 초고대비 모드 끄기' : '아웃도어 초고대비 모드 켜기 (한낮 직사광선용)'}
              aria-label="고대비 모드"
            >
              <Sun size={16} className={isSunMode ? 'text-black' : 'text-yellow-400'} />
            </button>
          )}
        </div>

        {/* 보조 액션 버튼들 (수심선 토글 & 채비 캘리브레이션 & 찜한 포인트 필터 & GPS 내 위치) */}
        <div className="flex items-center gap-2">
          {/* 150m 격자수심 + 실시간 조위 합성 동적 등심선(5~30m) 토글 버튼 */}
          <button
            onClick={toggleDepthContours}
            className={`p-2.5 border rounded-xl shadow-xl backdrop-blur flex items-center justify-center transition active:scale-95 ${
              showDepthContours
                ? 'bg-blue-600 text-white border-blue-400 shadow-blue-500/30 ring-1 ring-blue-400'
                : 'bg-slate-900/95 hover:bg-slate-800 text-slate-400 border-slate-700/80'
            }`}
            title={
              showDepthContours
                ? '150m 격자 + 실시간 조위 합성 등심선(5~30m) 끄기'
                : '150m 격자 + 실시간 조위 합성 등심선(5~30m) 켜기'
            }
          >
            <WavesIcon size={16} className={showDepthContours ? 'text-white' : 'text-slate-400'} />
          </button>

          {/* 공기역학 채비 캘리브레이션 버튼 */}
          <button
            onClick={() => setIsTacklePopoverOpen(!isTacklePopoverOpen)}
            className={`p-2.5 border rounded-xl shadow-xl backdrop-blur flex items-center justify-center transition active:scale-95 ${
              isTacklePopoverOpen
                ? 'bg-cyan-600 text-white border-cyan-400 ring-1 ring-cyan-400'
                : 'bg-slate-900/95 hover:bg-slate-800 text-slate-400 border-slate-700/80'
            }`}
            title="채비 공기역학 캘리브레이션 (루어 무게 & PE 라인 호수 설정)"
          >
            <Sliders size={16} className={isTacklePopoverOpen ? 'text-white' : 'text-slate-400'} />
          </button>

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

        {/* 채비 및 로드 탄성 공기역학 캘리브레이션 플로팅 팝업 */}
        {isTacklePopoverOpen && (
          <div className="w-72 bg-slate-950/95 border border-cyan-500/60 rounded-2xl p-3.5 shadow-2xl backdrop-blur text-white flex flex-col gap-2.5 animate-fade-in text-xs pointer-events-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                <Sliders size={14} className="text-cyan-400" />
                <span>장비·채비 공기역학 캘리브레이터</span>
              </div>
              <button
                onClick={() => setIsTacklePopoverOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800"
              >
                닫기
              </button>
            </div>

            {/* 낚싯대 파워(탄성) 선택 */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">로드 파워 (블랭크 탄성)</span>
                <span className="font-mono font-bold text-cyan-300">
                  {tackleConfig.rodPower} (스위트스팟 {ROD_POWER_SPECS[tackleConfig.rodPower]?.optWeightG}g)
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {(['UL', 'L', 'ML', 'M', 'MH', 'H', 'XH'] as RodPower[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      const updated = saveTackleConfig(
                        tackleConfig.weightGrams,
                        tackleConfig.peLineSize,
                        p,
                        tackleConfig.rodLengthFt
                      );
                      setTackleConfig(updated);
                    }}
                    className={`py-1 rounded text-[10px] font-bold font-mono transition ${
                      tackleConfig.rodPower === p
                        ? 'bg-cyan-500 text-slate-950 shadow ring-1 ring-cyan-300'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* 낚싯대 전장(길이) 슬라이더 */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">로드 전장 (지렛대 레버 암)</span>
                <span className="font-mono font-bold text-cyan-300">
                  {tackleConfig.rodLengthFt.toFixed(1)} ft ({Math.round(tackleConfig.rodLengthFt * 0.3048 * 10) / 10}m)
                </span>
              </div>
              <input
                type="range"
                min={6.0}
                max={12.0}
                step={0.2}
                value={tackleConfig.rodLengthFt}
                onChange={(e) => {
                  const len = Number(e.target.value);
                  const updated = saveTackleConfig(
                    tackleConfig.weightGrams,
                    tackleConfig.peLineSize,
                    tackleConfig.rodPower,
                    len
                  );
                  setTackleConfig(updated);
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>6.6ft (선상/내항)</span>
                <span>8.6ft (표준)</span>
                <span>10.6ft (서프/장타)</span>
              </div>
            </div>

            {/* 루어/싱커 무게 슬라이더 (1~100g) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">루어/싱커 무게</span>
                <span className="font-mono font-bold text-cyan-300">{tackleConfig.weightGrams}g</span>
              </div>
              <input
                type="range"
                min={1}
                max={100}
                step={1}
                value={tackleConfig.weightGrams}
                onChange={(e) => {
                  const w = Number(e.target.value);
                  const updated = saveTackleConfig(
                    w,
                    tackleConfig.peLineSize,
                    tackleConfig.rodPower,
                    tackleConfig.rodLengthFt
                  );
                  setTackleConfig(updated);
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>1g (극소 지그)</span>
                <span>30g (에기/스푼)</span>
                <span>100g (헤비메탈)</span>
              </div>
            </div>

            {/* 합사 라인 호수 슬라이더 (0.4~3.0호) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-slate-300">원줄 합사(PE)</span>
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
                    tackleConfig.rodLengthFt
                  );
                  setTackleConfig(updated);
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                <span>0.4호 (아징)</span>
                <span>1.0호 (에깅/농어)</span>
                <span>3.0호 (헤비/원투)</span>
              </div>
            </div>

            {/* 계산된 물리 기준 비거리 및 수중 침강 특성 */}
            {(() => {
              const demoDepth = 10;
              const demoCur = marine?.currentVelocity ?? 0.3;
              const sink = calculateSinkingPhysics(tackleConfig.weightGrams, demoDepth, demoCur);
              return (
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 space-y-1 text-[11px]">
                  <div className="flex justify-between text-slate-300">
                    <span>공기역학 산출 사거리:</span>
                    <strong className="font-mono text-cyan-300 text-xs">{tackleConfig.calibratedDistanceMeters}m</strong>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>탄성효율 / 길이계수:</span>
                    <span className="font-mono text-amber-300">
                      η {Math.round(tackleConfig.rodElasticityEfficiency * 100)}% / ×{tackleConfig.rodLengthFactor}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                    <span>수심 10m 바닥 안착:</span>
                    <span className="font-mono text-emerald-300 font-semibold">
                      약 {sink.fallTimeSec}초 (유속 {demoCur}m/s 시)
                    </span>
                  </div>
                  <div className="flex justify-between text-[9.5px] text-slate-500">
                    <span>침강속도 / 조류흘림:</span>
                    <span className="font-mono">
                      {sink.effSinkSpeedMps}m/s · 흘림 +{sink.driftDistanceM}m
                    </span>
                  </div>
                  <div className="text-[9px] text-amber-300/90 pt-1 border-t border-slate-800/60 leading-tight">
                    💡 지그헤드+2인치 쉐드 웜 및 합사 방출 길이/호수 연동 바람 편류(오렌지 라인) 시뮬레이션 적용됨
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* [요구사항 3] 미니멀 위치 조정 컴팩트 패널 */}
      {microAdjustSpot && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-auto max-w-[92vw] z-30 bg-slate-900/95 border border-emerald-500/60 rounded-xl p-2.5 shadow-2xl backdrop-blur text-white flex flex-col items-center gap-2 animate-fade-in text-xs">
          <div className="flex items-center justify-between w-full border-b border-slate-800 pb-1.5 px-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-300 text-xs">
              <Crosshair size={14} className="text-emerald-400 animate-pulse" />
              <span>위치 조정</span>
            </div>
            {distMeters > 0.05 && (
              <span className="text-[10px] text-emerald-400 font-mono font-semibold">+{distMeters.toFixed(1)}m</span>
            )}
          </div>

          {/* D-Pad 1m 단위 미세 넛지 컨트롤 (라벨 텍스트 완전 제거) */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleNudge(0.000009, 0)}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-slate-100 rounded-lg text-xs font-bold active:scale-95 transition flex items-center justify-center border border-slate-700 shadow"
              title="북쪽 1m 이동"
              aria-label="북쪽 1m"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => handleNudge(-0.000009, 0)}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-slate-100 rounded-lg text-xs font-bold active:scale-95 transition flex items-center justify-center border border-slate-700 shadow"
              title="남쪽 1m 이동"
              aria-label="남쪽 1m"
            >
              ▼
            </button>
            <button
              type="button"
              onClick={() => handleNudge(0, -0.000011)}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-slate-100 rounded-lg text-xs font-bold active:scale-95 transition flex items-center justify-center border border-slate-700 shadow"
              title="서쪽 1m 이동"
              aria-label="서쪽 1m"
            >
              ◄
            </button>
            <button
              type="button"
              onClick={() => handleNudge(0, 0.000011)}
              className="w-10 h-10 bg-slate-800 hover:bg-slate-700 active:bg-emerald-600 text-slate-100 rounded-lg text-xs font-bold active:scale-95 transition flex items-center justify-center border border-slate-700 shadow"
              title="동쪽 1m 이동"
              aria-label="동쪽 1m"
            >
              ►
            </button>
          </div>

          {/* 저장 버튼(왼쪽), 취소 버튼(오른쪽) */}
          <div className="flex gap-2 w-full pt-0.5">
            <button
              type="button"
              onClick={() => onConfirmMicroAdjust && onConfirmMicroAdjust(microAdjustSpot.id, adjustedPos.lat, adjustedPos.lng)}
              className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-500/20 transition active:scale-95 flex items-center justify-center gap-1"
            >
              <Check size={13} />
              <span>저장</span>
            </button>
            <button
              type="button"
              onClick={onCancelMicroAdjust}
              className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition flex items-center justify-center"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 지도 좌하단 안내 뱃지 */}
      <div className="absolute bottom-4 left-4 z-20 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] text-slate-300 hidden sm:flex items-center gap-2 shadow-lg">
        <span>💡 해안·갯바위를 클릭하면 <strong>새 포인트를 추가</strong>할 수 있습니다.</span>
        {showCastingArrows && (
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
            🎯 채비 기준비거리 {tackleConfig.calibratedDistanceMeters}m ({tackleConfig.radii.join('/')}m 링)
          </span>
        )}
      </div>
    </div>
  );
};
