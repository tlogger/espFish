import { MarineData, WeatherData } from '../types';
import { findNearestKhoaStation } from './tideService';
import { getCachedKhoaWind, getCachedKhoaWaterTemp } from './khoaCache';
import { fetchKhoaRoms } from './khoaApi';

/** WMO Weather Code를 사람이 읽기 쉬운 한국어 텍스트 및 이모지로 변환 */
export function getWeatherText(code: number): string {
  switch (code) {
    case 0: return '맑음 ☀️';
    case 1: return '대체로 맑음 🌤️';
    case 2: return '구름 조금 ⛅';
    case 3: return '흐림 ☁️';
    case 45:
    case 48: return '안개 🌫️';
    case 51:
    case 53:
    case 55: return '이슬비 🌧️';
    case 61:
    case 63:
    case 65: return '비 🌧️';
    case 71:
    case 73:
    case 75: return '눈 ❄️';
    case 80:
    case 81:
    case 82: return '소나기 🌦️';
    case 95: return '뇌우 ⛈️';
    default: return '보통 🌤️';
  }
}

/** 0-360° 방위각을 16방위 텍스트(한국어)로 변환 */
export function getCompassDirection(deg: number): string {
  const directions = [
    '북(N)', '북북동(NNE)', '북동(NE)', '동북동(ENE)',
    '동(E)', '동남동(ESE)', '남동(SE)', '남남동(SSE)',
    '남(S)', '남남서(SSW)', '남서(SW)', '서남서(WSW)',
    '서(W)', '서북서(WNW)', '북서(NW)', '북북서(NNW)'
  ];
  const index = Math.round(deg / 22.5) % 16;
  return directions[index];
}

interface CachedItem<T> {
  data: T;
  expireAt: number;
}

const memoryWeatherCache = new Map<string, CachedItem<WeatherData>>();
const inFlightWeatherRequests = new Map<string, Promise<WeatherData>>();

const memoryMarineCache = new Map<string, CachedItem<MarineData>>();
const inFlightMarineRequests = new Map<string, Promise<MarineData>>();

const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000; // 15분 캐시

/** Open-Meteo Weather Forecast API 호출 및 국립해양조사원(KHOA) 조위관측소 실측 풍향/풍속 융합 (15분 캐시 적용) */
export async function fetchWeatherData(lat: number, lng: number): Promise<WeatherData> {
  const gridLat = Math.round(lat * 20) / 20;
  const gridLng = Math.round(lng * 20) / 20;
  const cacheKey = `exfish_weather_${gridLat.toFixed(2)}_${gridLng.toFixed(2)}`;

  // 1. 메모리 캐시 검사
  const mem = memoryWeatherCache.get(cacheKey);
  if (mem && mem.expireAt > Date.now()) {
    return mem.data;
  }

  // 2. LocalStorage 캐시 검사
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const item: CachedItem<WeatherData> = JSON.parse(raw);
        if (item && item.expireAt > Date.now()) {
          memoryWeatherCache.set(cacheKey, item);
          return item.data;
        }
      }
    } catch {}
  }

  // 3. In-flight 요청 중복 방지 (동시 다발적 동일 좌표 쿼리 병합)
  if (inFlightWeatherRequests.has(cacheKey)) {
    return inFlightWeatherRequests.get(cacheKey)!;
  }

  const reqPromise = (async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&forecast_days=4&timezone=Asia%2FSeoul`;

    // 1. 최근접 국립해양조사원 관측소 실측 풍향/풍속 병렬 조회
    const nearest = findNearestKhoaStation(lat, lng);
    const khoaWindPromise = getCachedKhoaWind(nearest.station.code).catch(() => null);

    try {
      const [res, khoaWind] = await Promise.all([
        fetch(url),
        khoaWindPromise,
      ]);

      if (!res.ok) throw new Error(`Weather fetch failed: ${res.statusText}`);
      const data = await res.json();
      const current = data.current;

      // KHOA 실측 풍향/풍속 우선 반영 (실측치가 존재할 경우)
      let finalWindSpeed = Math.round(current.wind_speed_10m * 10) / 10;
      let finalWindDir = current.wind_direction_10m;
      let isObserved = false;
      let observedStationName: string | undefined = undefined;
      let observedDistanceKm: number | undefined = undefined;
      let observedTime: string | undefined = undefined;

      if (khoaWind && typeof khoaWind.wspd === 'number' && !isNaN(khoaWind.wspd) && typeof khoaWind.wndrct === 'number') {
        finalWindSpeed = Math.round(khoaWind.wspd * 10) / 10;
        finalWindDir = Math.round(khoaWind.wndrct);
        isObserved = true;
        observedStationName = nearest.station.name;
        observedDistanceKm = nearest.distanceKm;
        observedTime = khoaWind.obsrvnDt?.split(' ')[1]?.slice(0, 5) || undefined;
      }

      const result: WeatherData = {
        temp: Math.round(current.temperature_2m * 10) / 10,
        apparentTemp: Math.round(current.apparent_temperature * 10) / 10,
        humidity: Math.round(current.relative_humidity_2m ?? 65),
        weatherCode: current.weather_code,
        weatherText: getWeatherText(current.weather_code),
        windSpeed: finalWindSpeed,
        windDirection: finalWindDir,
        windGust: Math.round(current.wind_gusts_10m * 10) / 10,
        isObserved,
        observedStationName,
        observedDistanceKm,
        observedTime,
        hourly: {
          time: data.hourly?.time?.slice(0, 96) || [],
          temp: data.hourly?.temperature_2m?.slice(0, 96) || [],
          windSpeed: data.hourly?.wind_speed_10m?.slice(0, 96) || [],
          windDirection: data.hourly?.wind_direction_10m?.slice(0, 96) || [],
          pop: data.hourly?.precipitation_probability?.slice(0, 96) || [],
          weatherCode: data.hourly?.weather_code?.slice(0, 96) || [],
        },
      };

      // 캐시 저장
      const expireAt = Date.now() + WEATHER_CACHE_TTL_MS;
      memoryWeatherCache.set(cacheKey, { data: result, expireAt });
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data: result, expireAt }));
        } catch {}
      }

      return result;
    } catch (err) {
      console.warn('Weather API fallback used:', err);
      // KHOA 실측 풍향/풍속이라도 있으면 적용
      const khoaWind = await khoaWindPromise.catch(() => null);

      const fallback: WeatherData = {
        temp: 18.5,
        apparentTemp: 17.8,
        humidity: 68,
        weatherCode: 1,
        weatherText: '대체로 맑음 🌤️',
        windSpeed: (khoaWind && typeof khoaWind.wspd === 'number') ? Math.round(khoaWind.wspd * 10) / 10 : 2.8,
        windDirection: (khoaWind && typeof khoaWind.wndrct === 'number') ? Math.round(khoaWind.wndrct) : 315, // 북서풍
        windGust: 4.5,
        isObserved: !!khoaWind,
        observedStationName: khoaWind ? nearest.station.name : undefined,
        observedDistanceKm: khoaWind ? nearest.distanceKm : undefined,
        hourly: {
          time: Array.from({ length: 24 }, (_, i) => `${i}:00`),
          temp: Array.from({ length: 24 }, () => 18),
          windSpeed: Array.from({ length: 24 }, () => 3),
          windDirection: Array.from({ length: 24 }, () => 315),
          pop: Array.from({ length: 24 }, () => 10),
        },
      };

      return fallback;
    } finally {
      inFlightWeatherRequests.delete(cacheKey);
    }
  })();

  inFlightWeatherRequests.set(cacheKey, reqPromise);
  return reqPromise;
}

/** Open-Meteo Marine API 호출 및 국립해양조사원 실측 수온 & ROMS 해류 융합 (15분 캐시 적용) */
export async function fetchMarineData(lat: number, lng: number): Promise<MarineData> {
  const gridLat = Math.round(lat * 20) / 20;
  const gridLng = Math.round(lng * 20) / 20;
  const cacheKey = `exfish_marine_${gridLat.toFixed(2)}_${gridLng.toFixed(2)}`;

  // 1. 메모리 캐시 검사
  const mem = memoryMarineCache.get(cacheKey);
  if (mem && mem.expireAt > Date.now()) {
    return mem.data;
  }

  // 2. LocalStorage 캐시 검사
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const item: CachedItem<MarineData> = JSON.parse(raw);
        if (item && item.expireAt > Date.now()) {
          memoryMarineCache.set(cacheKey, item);
          return item.data;
        }
      }
    } catch {}
  }

  // 3. In-flight 요청 중복 방지
  if (inFlightMarineRequests.has(cacheKey)) {
    return inFlightMarineRequests.get(cacheKey)!;
  }

  const reqPromise = (async () => {
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&hourly=wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&forecast_days=4&timezone=Asia%2FSeoul`;

    const nearest = findNearestKhoaStation(lat, lng);
    const khoaTempPromise = getCachedKhoaWaterTemp(nearest.station.code).catch(() => null);
    const romsPromise = fetchKhoaRoms(lat, lng).catch(() => null);

    try {
      const [res, khoaTemp, roms] = await Promise.all([
        fetch(url),
        khoaTempPromise,
        romsPromise,
      ]);

      if (!res.ok) throw new Error(`Marine fetch failed: ${res.statusText}`);
      const data = await res.json();
      const current = data.current;
      const hourly = data.hourly;

      // 실측 수온 우선 반영
      let finalSst = current.sea_surface_temperature != null ? Math.round(current.sea_surface_temperature * 10) / 10 : 17.2;
      let isObservedTemp = false;
      let observedTempStationName: string | undefined = undefined;

      if (khoaTemp && typeof khoaTemp.wtem === 'number' && !isNaN(khoaTemp.wtem)) {
        finalSst = Math.round(khoaTemp.wtem * 10) / 10;
        isObservedTemp = true;
        observedTempStationName = nearest.station.name;
      }

      // ROMS 수치예측모델 유향/유속 우선 반영
      let finalCurrentVel = current.ocean_current_velocity != null ? Math.round(current.ocean_current_velocity * 100) / 100 : 0.35;
      let finalCurrentDir = current.ocean_current_direction ?? 135;
      let isRomsCurrent = false;

      if (roms && typeof roms.crsp === 'number' && !isNaN(roms.crsp) && typeof roms.crdir === 'number') {
        finalCurrentVel = Math.round(roms.crsp * 100) / 100;
        finalCurrentDir = Math.round(roms.crdir);
        isRomsCurrent = true;
      }

      const result: MarineData = {
        seaSurfaceTemp: finalSst,
        waveHeight: current.wave_height != null ? Math.round(current.wave_height * 10) / 10 : 0.6,
        waveDirection: current.wave_direction ?? 180,
        wavePeriod: current.wave_period != null ? Math.round(current.wave_period) : 5,
        currentVelocity: finalCurrentVel,
        currentDirection: finalCurrentDir,
        isObservedTemp,
        observedTempStationName,
        isRomsCurrent,
        hourly: {
          time: hourly?.time?.slice(0, 96) || [],
          seaSurfaceTemp: hourly?.sea_surface_temperature?.slice(0, 96) || [],
          waveHeight: hourly?.wave_height?.slice(0, 96) || [],
          currentVelocity: hourly?.ocean_current_velocity?.slice(0, 96) || [],
          currentDirection: hourly?.ocean_current_direction?.slice(0, 96) || [],
        },
      };

      // 캐시 저장
      const expireAt = Date.now() + WEATHER_CACHE_TTL_MS;
      memoryMarineCache.set(cacheKey, { data: result, expireAt });
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data: result, expireAt }));
        } catch {}
      }

      return result;
    } catch (err) {
      console.warn('Marine API fallback used:', err);
      const khoaTemp = await khoaTempPromise.catch(() => null);

      return {
        seaSurfaceTemp: khoaTemp && typeof khoaTemp.wtem === 'number' ? Math.round(khoaTemp.wtem * 10) / 10 : 17.4,
        waveHeight: 0.5,
        waveDirection: 210,
        wavePeriod: 6,
        currentVelocity: 0.4,
        currentDirection: 140,
        isObservedTemp: !!khoaTemp,
        observedTempStationName: khoaTemp ? nearest.station.name : undefined,
        hourly: {
          time: Array.from({ length: 24 }, (_, i) => `${i}:00`),
          seaSurfaceTemp: Array.from({ length: 24 }, () => 17.4),
          waveHeight: Array.from({ length: 24 }, () => 0.5),
          currentVelocity: Array.from({ length: 24 }, () => 0.4),
          currentDirection: Array.from({ length: 24 }, () => 140),
        },
      };
    } finally {
      inFlightMarineRequests.delete(cacheKey);
    }
  })();

  inFlightMarineRequests.set(cacheKey, reqPromise);
  return reqPromise;
}

/** 포인트 위경도로부터 공식 Windy.com 상세 웹페이지 URL 생성 */
export function getWindyWebUrl(lat: number, lng: number): string {
  // 사용자가 요청한 Windy 링크 포맷
  const latFormatted = lat.toFixed(3);
  const lngFormatted = lng.toFixed(3);
  return `https://www.windy.com/${latFormatted}/${lngFormatted}?${latFormatted},${lngFormatted},13,i:pressure,p:cities,m:eHmajGb`;
}

/** 단위 변환 헬퍼 */
export function formatWindSpeed(valMs: number, unit: 'ms' | 'knot' | 'kmh'): string {
  switch (unit) {
    case 'knot':
      return `${(valMs * 1.94384).toFixed(1)} kt`;
    case 'kmh':
      return `${(valMs * 3.6).toFixed(1)} km/h`;
    case 'ms':
    default:
      return `${valMs.toFixed(1)} m/s`;
  }
}

export function formatCurrentVelocity(valMs: number, unit: 'knot' | 'ms' | 'cms'): string {
  switch (unit) {
    case 'knot':
      return `${(valMs * 1.94384).toFixed(1)} kt`;
    case 'cms':
      return `${(valMs * 100).toFixed(0)} cm/s`;
    case 'ms':
    default:
      return `${valMs.toFixed(2)} m/s`;
  }
}

export interface SwellRisk {
  level: 'SAFE' | 'CAUTION' | 'DANGER';
  title: string;
  badgeColor: string;
  energyScore: number;
  description: string;
}

/** 유의파고(m) 및 파주기(s) 결합 너울성(Swell) 위험도 판정 */
export function calculateSwellRisk(waveHeight: number, wavePeriod: number): SwellRisk {
  const energy = (waveHeight ** 2) * wavePeriod;
  if (energy >= 12 || waveHeight >= 1.6 || (wavePeriod >= 9 && waveHeight >= 0.9)) {
    return {
      level: 'DANGER',
      title: '너울성 파도 경보',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
      energyScore: Math.round(energy * 10) / 10,
      description: '긴 파주기의 너울이 갯바위를 덮칠 수 있습니다. 간출여 진입을 절대 금지하세요.',
    };
  }
  if (energy >= 5.5 || waveHeight >= 1.0 || wavePeriod >= 7.5) {
    return {
      level: 'CAUTION',
      title: '너울 주의보',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
      energyScore: Math.round(energy * 10) / 10,
      description: '간헐적인 세트 너울이 발생할 수 있습니다. 구명조끼를 필히 착용하고 발판 침수에 유의하세요.',
    };
  }
  return {
    level: 'SAFE',
    title: '해상 파도 양호',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
    energyScore: Math.round(energy * 10) / 10,
    description: '너울 에너지가 낮아 도보 포인트 및 갯바위 진입에 양호한 상태입니다.',
  };
}
