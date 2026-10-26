import {
  fetchKhoaTideLevel,
  fetchKhoaWaterDepth,
  fetchKhoaWaterTemp,
  fetchKhoaWind,
  KhoaDepthRecord,
  KhoaTideRecord,
  KhoaWaterTempRecord,
  KhoaWindRecord,
} from './khoaApi';

const DEPTH_CACHE_KEY_PREFIX = 'khoa_depth_grid_v1_';
const WIND_CACHE_KEY_PREFIX = 'khoa_wind_v1_';
const WTEM_CACHE_KEY_PREFIX = 'khoa_wtem_v1_';
const TIDE_CACHE_KEY_PREFIX = 'khoa_tide_series_v1_';

/** 150m 격자 인덱스 키 생성 (약 0.0015도 간격 정규화) */
export function get150mGridKey(lat: number, lng: number): string {
  const gLat = Math.round(lat / 0.0015);
  const gLng = Math.round(lng / 0.0015);
  return `${DEPTH_CACHE_KEY_PREFIX}${gLat}_${gLng}`;
}

/** 1. 150m 격자 수심 캐시 취득 (영구 캐시) */
export async function getCachedKhoaDepth(lat: number, lng: number): Promise<KhoaDepthRecord | null> {
  const key = get150mGridKey(lat, lng);
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      // 캐시 에러 무시
    }
  }

  // API 호출
  const record = await fetchKhoaWaterDepth(lat, lng);
  if (record && typeof window !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(record));
    } catch (e) {
      // 용량 초과 무시
    }
  }
  return record;
}

/** 2. 실측 풍향/풍속 캐시 취득 (10분 유효) */
export async function getCachedKhoaWind(obsCode: string): Promise<KhoaWindRecord | null> {
  const key = `${WIND_CACHE_KEY_PREFIX}${obsCode}`;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.expireAt > Date.now()) {
          return cached.data;
        }
      }
    } catch (e) {}
  }

  const record = await fetchKhoaWind(obsCode);
  if (record && typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          expireAt: Date.now() + 10 * 60 * 1000, // 10분 유효
          data: record,
        })
      );
    } catch (e) {}
  }
  return record;
}

/** 3. 실측 수온 캐시 취득 (15분 유효) */
export async function getCachedKhoaWaterTemp(obsCode: string): Promise<KhoaWaterTempRecord | null> {
  const key = `${WTEM_CACHE_KEY_PREFIX}${obsCode}`;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.expireAt > Date.now()) {
          return cached.data;
        }
      }
    } catch (e) {}
  }

  const record = await fetchKhoaWaterTemp(obsCode);
  if (record && typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          expireAt: Date.now() + 15 * 60 * 1000, // 15분 유효
          data: record,
        })
      );
    } catch (e) {}
  }
  return record;
}

/** 4. 1일 실측·예측 조위 시계열 캐시 취득 (24시간 유효) */
export async function getCachedKhoaTideSeries(
  obsCode: string,
  dateStr: string
): Promise<KhoaTideRecord[]> {
  const key = `${TIDE_CACHE_KEY_PREFIX}${obsCode}_${dateStr}`;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.expireAt > Date.now() && Array.isArray(cached.data) && cached.data.length > 0) {
          return cached.data;
        }
      }
    } catch (e) {}
  }

  const records = await fetchKhoaTideLevel(obsCode, dateStr);
  if (records.length > 0 && typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          expireAt: Date.now() + 24 * 60 * 60 * 1000,
          data: records,
        })
      );
    } catch (e) {}
  }
  return records;
}
