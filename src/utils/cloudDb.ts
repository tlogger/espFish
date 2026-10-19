import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CatchLog, FishingSpot } from '../types';

const STORAGE_KEY_URL = 'espfish_supabase_url';
const STORAGE_KEY_ANON = 'espfish_supabase_anon_key';

let supabaseInstance: SupabaseClient | null = null;

export interface CloudDbConfig {
  url: string;
  anonKey: string;
}

/** 저장된 클라우드 DB 설정 가져오기 (환경변수 또는 localStorage) */
export function getSavedCloudConfig(): CloudDbConfig | null {
  // 1. URL 쿼리 파라미터에서 자동 추출 (PC -> 모바일 동기화 링크)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const qUrl = params.get('sb_url');
    const qKey = params.get('sb_key');
    if (qUrl && qKey) {
      saveCloudConfig(qUrl, qKey);
      // URL에서 민감 파라미터 제거
      window.history.replaceState({}, document.title, window.location.pathname);
      return { url: qUrl, anonKey: qKey };
    }
  }

  // 2. localStorage
  const savedUrl = localStorage.getItem(STORAGE_KEY_URL);
  const savedKey = localStorage.getItem(STORAGE_KEY_ANON);
  if (savedUrl && savedKey) {
    return { url: savedUrl, anonKey: savedKey };
  }

  // 3. 빌드 타임 환경변수
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey };
  }

  return null;
}

/** 클라우드 DB 설정 저장 */
export function saveCloudConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
  localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
  supabaseInstance = null; // 인스턴스 재생성
}

/** 클라우드 DB 설정 제거 (로컬 모드로 전환) */
export function clearCloudConfig(): void {
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON);
  supabaseInstance = null;
}

/** Supabase 클라이언트 초기화 */
export function getSupabase(): SupabaseClient | null {
  if (supabaseInstance) return supabaseInstance;

  const config = getSavedCloudConfig();
  if (!config || !config.url || !config.anonKey) return null;

  try {
    supabaseInstance = createClient(config.url, config.anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return supabaseInstance;
  } catch (err) {
    console.error('Supabase init error:', err);
    return null;
  }
}

/** 클라우드 DB 연결 테스트 */
export async function testCloudConnection(url: string, anonKey: string): Promise<boolean> {
  try {
    const client = createClient(url.trim(), anonKey.trim());
    const { error } = await client.from('fishing_spots').select('id').limit(1);
    // 테이블이 없거나 404면 실패, 테이블이 비어있어도 에러 없으면 성공
    if (error && error.code !== 'PGRST116') {
      console.warn('Supabase test warning:', error);
      // 테이블 존재하지 않는 에러일 수 있으나 키 유효성은 확인됨
      return !error.message.includes('Invalid API key') && !error.message.includes('JWT');
    }
    return true;
  } catch (e) {
    console.error('Test connection failed:', e);
    return false;
  }
}

/** 클라우드로부터 포인트 목록 불러오기 */
export async function fetchCloudSpots(): Promise<FishingSpot[] | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('fishing_spots')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching cloud spots:', error);
      return null;
    }
    return data as FishingSpot[];
  } catch (err) {
    console.error('Cloud spot fetch exception:', err);
    return null;
  }
}

/** 클라우드로부터 조과 목록 불러오기 */
export async function fetchCloudLogs(): Promise<CatchLog[] | null> {
  const client = getSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from('catch_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching cloud logs:', error);
      return null;
    }
    return data as CatchLog[];
  } catch (err) {
    console.error('Cloud logs fetch exception:', err);
    return null;
  }
}

/** 포인트 저장 (신규 등록 및 업데이트) */
export async function saveCloudSpot(spot: FishingSpot): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;

  try {
    const { error } = await client.from('fishing_spots').upsert(spot);
    if (error) {
      console.error('Failed to save cloud spot:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Save cloud spot exception:', err);
    return false;
  }
}

/** 포인트 삭제 */
export async function deleteCloudSpot(spotId: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;

  try {
    const { error } = await client.from('fishing_spots').delete().eq('id', spotId);
    if (error) {
      console.error('Failed to delete cloud spot:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Delete cloud spot exception:', err);
    return false;
  }
}

/** 조과 기록 저장 (신규 등록 및 업데이트) */
export async function saveCloudCatchLog(log: CatchLog): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;

  try {
    const { error } = await client.from('catch_logs').upsert(log);
    if (error) {
      console.error('Failed to save cloud log:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Save cloud log exception:', err);
    return false;
  }
}

/** 조과 기록 삭제 */
export async function deleteCloudCatchLog(logId: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;

  try {
    const { error } = await client.from('catch_logs').delete().eq('id', logId);
    if (error) {
      console.error('Failed to delete cloud log:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Delete cloud log exception:', err);
    return false;
  }
}

/** 로컬 데이터를 클라우드로 일괄 업로드 */
export async function uploadLocalToCloud(spots: FishingSpot[], logs: CatchLog[]): Promise<{ spotsCount: number; logsCount: number }> {
  const client = getSupabase();
  if (!client) throw new Error('클라우드 DB가 연결되어 있지 않습니다.');

  let spotsCount = 0;
  let logsCount = 0;

  if (spots.length > 0) {
    const { error: sError } = await client.from('fishing_spots').upsert(spots);
    if (sError) throw sError;
    spotsCount = spots.length;
  }

  if (logs.length > 0) {
    const { error: lError } = await client.from('catch_logs').upsert(logs);
    if (lError) throw lError;
    logsCount = logs.length;
  }

  return { spotsCount, logsCount };
}

/** PC에서 모바일로 1초 자동 연동할 수 있는 공유 링크 생성 */
export function generateMobilePairingUrl(): string | null {
  const config = getSavedCloudConfig();
  if (!config) return null;
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?sb_url=${encodeURIComponent(config.url)}&sb_key=${encodeURIComponent(config.anonKey)}`;
}
