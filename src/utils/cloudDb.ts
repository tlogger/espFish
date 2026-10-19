import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CatchLog, FishingSpot } from '../types';
import { INITIAL_CATCH_LOGS, INITIAL_SPOTS } from './storage';

const STORAGE_KEY_URL = 'espfish_supabase_url';
const STORAGE_KEY_ANON = 'espfish_supabase_anon_key';

// 사용자가 생성한 Supabase Project URL 및 Publishable Key 기본값 (tlogger's Project)
export const DEFAULT_SUPABASE_URL = 'https://johtqemdlprtbpohdkgu.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_Aj8gNxqXefjkBg6H6zsCxw_icac_-2G';

let supabaseInstance: SupabaseClient | null = null;

export interface CloudDbConfig {
  url: string;
  anonKey: string;
}

/** fishing_spots 테이블에 존재하는 컬럼만 추출하여 Supabase 스키마 불일치 에러 방지 */
function toDbSpotRecord(spot: FishingSpot): Record<string, unknown> {
  return {
    id: spot.id,
    user_id: spot.user_id || 'user-me',
    author_name: spot.author_name || '나의 포인트',
    is_public: spot.is_public ?? true,
    name: spot.name,
    spot_type: spot.spot_type,
    lat: spot.lat,
    lng: spot.lng,
    navi_name: spot.navi_name ?? null,
    navi_url: spot.navi_url ?? null,
    directions: spot.directions ?? '',
    photo_urls: spot.photo_urls ?? [],
    fishing_methods: spot.fishing_methods ?? [],
    target_species: spot.target_species ?? [],
    best_tides: spot.best_tides ?? [],
    best_times: spot.best_times ?? [],
    description: spot.description ?? '',
    created_at: spot.created_at || new Date().toISOString(),
  };
}

/** catch_logs 테이블에 존재하는 컬럼만 추출 */
function toDbLogRecord(log: CatchLog): Record<string, unknown> {
  return {
    id: log.id,
    spot_id: log.spot_id,
    user_id: log.user_id || 'user-me',
    user_name: log.user_name || '나의 조과',
    catch_date: log.catch_date,
    catch_time: log.catch_time,
    lat: log.lat ?? null,
    lng: log.lng ?? null,
    fish_species: log.fish_species,
    fish_size_cm: log.fish_size_cm ?? null,
    fish_count: log.fish_count ?? 1,
    catch_method: log.catch_method,
    lure_bait: log.lure_bait ?? '',
    catch_mul: log.catch_mul,
    tide_state: log.tide_state,
    water_temp: log.water_temp,
    wind_speed: log.wind_speed,
    wind_direction: log.wind_direction ?? null,
    photo_url: log.photo_url ?? null,
    memo: log.memo ?? '',
    created_at: log.created_at || new Date().toISOString(),
  };
}

/** 클라우드 DB 설정 가져오기 (항상 Supabase 사용) */
export function getSavedCloudConfig(): CloudDbConfig {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const qUrl = params.get('sb_url');
    const qKey = params.get('sb_key');
    if (qUrl && qKey) {
      saveCloudConfig(qUrl, qKey);
      window.history.replaceState({}, document.title, window.location.pathname);
      return { url: qUrl, anonKey: qKey };
    }

    const savedUrl = localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_SUPABASE_URL;
    const savedKey = localStorage.getItem(STORAGE_KEY_ANON) || DEFAULT_SUPABASE_KEY;
    return { url: savedUrl, anonKey: savedKey };
  }

  return {
    url: import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY,
  };
}

/** 클라우드 DB 설정 저장 */
export function saveCloudConfig(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_URL, url.trim());
    localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
  }
  supabaseInstance = null;
}

/** 기본 Supabase 설정으로 초기화 */
export function clearCloudConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_URL);
    localStorage.removeItem(STORAGE_KEY_ANON);
  }
  supabaseInstance = null;
}

/** Supabase 클라이언트 초기화 */
export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const config = getSavedCloudConfig();
  supabaseInstance = createClient(config.url, config.anonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
  return supabaseInstance;
}

/** 클라우드 DB 연결 테스트 */
export async function testCloudConnection(url: string, anonKey: string): Promise<boolean> {
  try {
    const client = createClient(url.trim(), anonKey.trim());
    const { error } = await client.from('fishing_spots').select('id').limit(1);
    if (error) {
      console.error('Supabase connection test error:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Test connection failed:', e);
    return false;
  }
}

/** Supabase로부터 포인트 목록 불러오기 (테이블이 비어있으면 기본 5대 포인트를 Supabase에 자동 시딩) */
export async function fetchCloudSpots(): Promise<FishingSpot[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from('fishing_spots')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching Supabase spots:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    // 최초 빈 테이블일 경우 기본 5대 포인트를 Supabase에 저장
    const seedRecords = INITIAL_SPOTS.map(toDbSpotRecord);
    const { error: seedErr } = await client.from('fishing_spots').upsert(seedRecords);
    if (seedErr) {
      console.error('Error seeding initial spots to Supabase:', seedErr);
      return INITIAL_SPOTS;
    }
    return INITIAL_SPOTS;
  }

  return data as FishingSpot[];
}

/** Supabase로부터 조과 목록 불러오기 (테이블이 비어있으면 기본 조과를 Supabase에 자동 시딩) */
export async function fetchCloudLogs(): Promise<CatchLog[]> {
  const client = getSupabase();
  const { data, error } = await client
    .from('catch_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching Supabase logs:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    const seedRecords = INITIAL_CATCH_LOGS.map(toDbLogRecord);
    const { error: seedErr } = await client.from('catch_logs').upsert(seedRecords);
    if (seedErr) {
      console.error('Error seeding initial logs to Supabase:', seedErr);
      return INITIAL_CATCH_LOGS;
    }
    return INITIAL_CATCH_LOGS;
  }

  return data as CatchLog[];
}

/** 포인트 Supabase 직접 저장 (신규 등록 및 업데이트) */
export async function saveCloudSpot(spot: FishingSpot): Promise<boolean> {
  const client = getSupabase();
  const { error } = await client.from('fishing_spots').upsert(toDbSpotRecord(spot));
  if (error) {
    console.error('Failed to save spot to Supabase:', error);
    throw error;
  }
  return true;
}

/** 포인트 Supabase 직접 삭제 */
export async function deleteCloudSpot(spotId: string): Promise<boolean> {
  const client = getSupabase();
  const { error } = await client.from('fishing_spots').delete().eq('id', spotId);
  if (error) {
    console.error('Failed to delete spot from Supabase:', error);
    throw error;
  }
  return true;
}

/** 조과 기록 Supabase 직접 저장 (신규 등록 및 업데이트) */
export async function saveCloudCatchLog(log: CatchLog): Promise<boolean> {
  const client = getSupabase();
  const { error } = await client.from('catch_logs').upsert(toDbLogRecord(log));
  if (error) {
    console.error('Failed to save catch log to Supabase:', error);
    throw error;
  }
  return true;
}

/** 조과 기록 Supabase 직접 삭제 */
export async function deleteCloudCatchLog(logId: string): Promise<boolean> {
  const client = getSupabase();
  const { error } = await client.from('catch_logs').delete().eq('id', logId);
  if (error) {
    console.error('Failed to delete catch log from Supabase:', error);
    throw error;
  }
  return true;
}

/** 데이터 일괄 Supabase 업로드 */
export async function uploadLocalToCloud(
  spots: FishingSpot[],
  logs: CatchLog[]
): Promise<{ spotsCount: number; logsCount: number }> {
  const client = getSupabase();

  if (spots.length > 0) {
    const { error: sError } = await client.from('fishing_spots').upsert(spots.map(toDbSpotRecord));
    if (sError) throw sError;
  }
  if (logs.length > 0) {
    const { error: lError } = await client.from('catch_logs').upsert(logs.map(toDbLogRecord));
    if (lError) throw lError;
  }

  return { spotsCount: spots.length, logsCount: logs.length };
}

/** PC에서 모바일로 1초 자동 연동할 수 있는 공유 링크 생성 */
export function generateMobilePairingUrl(): string | null {
  const config = getSavedCloudConfig();
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?sb_url=${encodeURIComponent(config.url)}&sb_key=${encodeURIComponent(config.anonKey)}`;
}
