import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CatchLog, FishingSpot } from '../types';
import { INITIAL_CATCH_LOGS, INITIAL_SPOTS } from './storage';

const STORAGE_KEY_URL = 'espfish_supabase_url';
const STORAGE_KEY_ANON = 'espfish_supabase_anon_key';

// 사용자가 생성한 Supabase Project URL 및 Publishable Key 기본값 (tlogger's Project)
export const DEFAULT_SUPABASE_URL = 'https://johtqemdlprtbpohdkgu.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_Aj8gNxqXefjkBg6H6zsCxw_icac_-2G';

// 별도 설정 전에도 PC ⇄ 모바일 간 즉시 동기화를 지원하는 무료 클라우드 REST 스토어 엔드포인트
const BUILTIN_CLOUD_STORE_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a1540b3a0819ce';

let supabaseInstance: SupabaseClient | null = null;

export interface CloudDbConfig {
  url: string;
  anonKey: string;
}

interface BuiltinCloudPayload {
  spots?: FishingSpot[];
  logs?: CatchLog[];
  deletedSpotIds?: string[];
  deletedLogIds?: string[];
  updatedAt?: string;
}

/** 저장된 클라우드 DB 설정 가져오기 (환경변수, localStorage 또는 기본 탑재된 tlogger's Project) */
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

  // 2. localStorage 또는 기본 탑재된 Supabase 설정
  if (typeof window !== 'undefined') {
    const savedUrl = localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_SUPABASE_URL;
    const savedKey = localStorage.getItem(STORAGE_KEY_ANON) || DEFAULT_SUPABASE_KEY;
    if (savedUrl && savedKey) {
      return { url: savedUrl, anonKey: savedKey };
    }
  }

  // 3. 빌드 타임 환경변수 또는 기본값
  const envUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
  return { url: envUrl, anonKey: envKey };
}

/** 클라우드 DB 설정 저장 */
export function saveCloudConfig(url: string, anonKey: string): void {
  localStorage.setItem(STORAGE_KEY_URL, url.trim());
  localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
  supabaseInstance = null; // 인스턴스 재생성
}

/** 클라우드 DB 설정 제거 (기본 공유 클라우드 모드로 전환) */
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
    if (error && error.code !== 'PGRST116') {
      console.warn('Supabase test warning:', error);
      return !error.message.includes('Invalid API key') && !error.message.includes('JWT');
    }
    return true;
  } catch (e) {
    console.error('Test connection failed:', e);
    return false;
  }
}

// ============================================================================
// Built-in Zero-Config Cloud Store (PC ⇄ Mobile 즉시 동기화 엔진)
// ============================================================================

async function fetchBuiltinCloudStore(): Promise<BuiltinCloudPayload | null> {
  try {
    const res = await fetch(BUILTIN_CLOUD_STORE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.data as BuiltinCloudPayload) || {};
  } catch (err) {
    console.warn('Built-in cloud store fetch failed:', err);
    return null;
  }
}

/** 대용량 DataURL 이미지를 경량화하여 REST 페이로드 한도 초과 방지 */
function sanitizeSpotForRest(spot: FishingSpot): FishingSpot {
  return {
    ...spot,
    photo_urls: (spot.photo_urls || []).map((u) => (u.startsWith('data:') && u.length > 40000 ? '' : u)).filter(Boolean),
  };
}

function sanitizeLogForRest(log: CatchLog): CatchLog {
  return {
    ...log,
    photo_url: log.photo_url && log.photo_url.startsWith('data:') && log.photo_url.length > 40000 ? undefined : log.photo_url,
  };
}

async function updateBuiltinCloudStore(updater: (prev: BuiltinCloudPayload) => BuiltinCloudPayload): Promise<boolean> {
  try {
    const current = (await fetchBuiltinCloudStore()) || {};
    const nextData = updater(current);
    nextData.updatedAt = new Date().toISOString();

    const res = await fetch(BUILTIN_CLOUD_STORE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'espfish_db',
        data: nextData,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Built-in cloud store update failed:', err);
    return false;
  }
}

/** ID 기준 병합 유틸 (클라우드 + 로컬 + 기본 데이터 통합) */
export function mergeSpotsById(primary: FishingSpot[], secondary: FishingSpot[], deletedIds: string[] = []): FishingSpot[] {
  const deletedSet = new Set(deletedIds);
  const map = new Map<string, FishingSpot>();
  // 기본 및 보조 데이터 먼저 등록
  for (const s of [...INITIAL_SPOTS, ...secondary]) {
    if (!deletedSet.has(s.id)) {
      map.set(s.id, s);
    }
  }
  // 최신 클라우드 데이터 덮어쓰기
  for (const s of primary) {
    if (!deletedSet.has(s.id)) {
      const existing = map.get(s.id);
      // 로컬에 고화질 사진이 있고 클라우드 버전에는 생략된 경우 보존
      const mergedPhotos =
        s.photo_urls && s.photo_urls.length > 0
          ? s.photo_urls
          : existing?.photo_urls || [];
      map.set(s.id, { ...s, photo_urls: mergedPhotos });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function mergeLogsById(primary: CatchLog[], secondary: CatchLog[], deletedIds: string[] = []): CatchLog[] {
  const deletedSet = new Set(deletedIds);
  const map = new Map<string, CatchLog>();
  for (const l of [...INITIAL_CATCH_LOGS, ...secondary]) {
    if (!deletedSet.has(l.id)) {
      map.set(l.id, l);
    }
  }
  for (const l of primary) {
    if (!deletedSet.has(l.id)) {
      const existing = map.get(l.id);
      map.set(l.id, {
        ...l,
        photo_url: l.photo_url || existing?.photo_url,
      });
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/** 클라우드로부터 포인트 목록 불러오기 (Supabase 우선, 미설정 시 내장 무료 클라우드 DB 사용) */
export async function fetchCloudSpots(localSpots: FishingSpot[] = []): Promise<FishingSpot[] | null> {
  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client
        .from('fishing_spots')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return mergeSpotsById(data as FishingSpot[], localSpots);
      }
    } catch (err) {
      console.warn('Supabase spot fetch fallback to built-in cloud:', err);
    }
  }

  // 내장 클라우드 스토어에서 가져오기
  const payload = await fetchBuiltinCloudStore();
  if (payload) {
    const cloudSpots = payload.spots || [];
    const deletedIds = payload.deletedSpotIds || [];
    const merged = mergeSpotsById(cloudSpots, localSpots, deletedIds);

    // 만약 로컬에만 있는 사용자 생성 포인트가 있다면 클라우드에도 자동 반영
    const cloudIds = new Set(cloudSpots.map((s) => s.id));
    const unsyncedLocal = localSpots.filter((s) => !cloudIds.has(s.id) && !deletedIds.includes(s.id));
    if (unsyncedLocal.length > 0) {
      updateBuiltinCloudStore((prev) => ({
        ...prev,
        spots: mergeSpotsById(prev.spots || [], localSpots, prev.deletedSpotIds || []).map(sanitizeSpotForRest),
      })).catch(() => {});
    }

    return merged;
  }

  return null;
}

/** 클라우드로부터 조과 목록 불러오기 (Supabase 우선, 미설정 시 내장 무료 클라우드 DB 사용) */
export async function fetchCloudLogs(localLogs: CatchLog[] = []): Promise<CatchLog[] | null> {
  const client = getSupabase();
  if (client) {
    try {
      const { data, error } = await client
        .from('catch_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        return mergeLogsById(data as CatchLog[], localLogs);
      }
    } catch (err) {
      console.warn('Supabase logs fetch fallback to built-in cloud:', err);
    }
  }

  const payload = await fetchBuiltinCloudStore();
  if (payload) {
    const cloudLogs = payload.logs || [];
    const deletedIds = payload.deletedLogIds || [];
    const merged = mergeLogsById(cloudLogs, localLogs, deletedIds);

    const cloudIds = new Set(cloudLogs.map((l) => l.id));
    const unsyncedLocal = localLogs.filter((l) => !cloudIds.has(l.id) && !deletedIds.includes(l.id));
    if (unsyncedLocal.length > 0) {
      updateBuiltinCloudStore((prev) => ({
        ...prev,
        logs: mergeLogsById(prev.logs || [], localLogs, prev.deletedLogIds || []).map(sanitizeLogForRest),
      })).catch(() => {});
    }

    return merged;
  }

  return null;
}

/** 포인트 저장 (신규 등록 및 업데이트) */
export async function saveCloudSpot(spot: FishingSpot): Promise<boolean> {
  let supabaseOk = false;
  const client = getSupabase();
  if (client) {
    try {
      const { error } = await client.from('fishing_spots').upsert(spot);
      if (!error) supabaseOk = true;
    } catch (err) {
      console.warn('Save Supabase spot error:', err);
    }
  }

  const builtinOk = await updateBuiltinCloudStore((prev) => {
    const list = (prev.spots || INITIAL_SPOTS).filter((s) => s.id !== spot.id);
    const deleted = (prev.deletedSpotIds || []).filter((id) => id !== spot.id);
    return {
      ...prev,
      spots: [sanitizeSpotForRest(spot), ...list],
      deletedSpotIds: deleted,
    };
  });

  return supabaseOk || builtinOk;
}

/** 포인트 삭제 */
export async function deleteCloudSpot(spotId: string): Promise<boolean> {
  let supabaseOk = false;
  const client = getSupabase();
  if (client) {
    try {
      const { error } = await client.from('fishing_spots').delete().eq('id', spotId);
      if (!error) supabaseOk = true;
    } catch (err) {
      console.warn('Delete Supabase spot error:', err);
    }
  }

  const builtinOk = await updateBuiltinCloudStore((prev) => {
    const list = (prev.spots || []).filter((s) => s.id !== spotId);
    const deleted = Array.from(new Set([...(prev.deletedSpotIds || []), spotId]));
    return {
      ...prev,
      spots: list,
      deletedSpotIds: deleted,
    };
  });

  return supabaseOk || builtinOk;
}

/** 조과 기록 저장 (신규 등록 및 업데이트) */
export async function saveCloudCatchLog(log: CatchLog): Promise<boolean> {
  let supabaseOk = false;
  const client = getSupabase();
  if (client) {
    try {
      const { error } = await client.from('catch_logs').upsert(log);
      if (!error) supabaseOk = true;
    } catch (err) {
      console.warn('Save Supabase log error:', err);
    }
  }

  const builtinOk = await updateBuiltinCloudStore((prev) => {
    const list = (prev.logs || INITIAL_CATCH_LOGS).filter((l) => l.id !== log.id);
    const deleted = (prev.deletedLogIds || []).filter((id) => id !== log.id);
    return {
      ...prev,
      logs: [sanitizeLogForRest(log), ...list],
      deletedLogIds: deleted,
    };
  });

  return supabaseOk || builtinOk;
}

/** 조과 기록 삭제 */
export async function deleteCloudCatchLog(logId: string): Promise<boolean> {
  let supabaseOk = false;
  const client = getSupabase();
  if (client) {
    try {
      const { error } = await client.from('catch_logs').delete().eq('id', logId);
      if (!error) supabaseOk = true;
    } catch (err) {
      console.warn('Delete Supabase log error:', err);
    }
  }

  const builtinOk = await updateBuiltinCloudStore((prev) => {
    const list = (prev.logs || []).filter((l) => l.id !== logId);
    const deleted = Array.from(new Set([...(prev.deletedLogIds || []), logId]));
    return {
      ...prev,
      logs: list,
      deletedLogIds: deleted,
    };
  });

  return supabaseOk || builtinOk;
}

/** 로컬 데이터를 클라우드로 일괄 업로드 */
export async function uploadLocalToCloud(
  spots: FishingSpot[],
  logs: CatchLog[]
): Promise<{ spotsCount: number; logsCount: number }> {
  const client = getSupabase();
  if (client) {
    if (spots.length > 0) {
      const { error: sError } = await client.from('fishing_spots').upsert(spots);
      if (sError) throw sError;
    }
    if (logs.length > 0) {
      const { error: lError } = await client.from('catch_logs').upsert(logs);
      if (lError) throw lError;
    }
  }

  await updateBuiltinCloudStore((prev) => ({
    ...prev,
    spots: mergeSpotsById(spots, prev.spots || [], prev.deletedSpotIds || []).map(sanitizeSpotForRest),
    logs: mergeLogsById(logs, prev.logs || [], prev.deletedLogIds || []).map(sanitizeLogForRest),
  }));

  return { spotsCount: spots.length, logsCount: logs.length };
}

/** PC에서 모바일로 1초 자동 연동할 수 있는 공유 링크 생성 */
export function generateMobilePairingUrl(): string | null {
  const config = getSavedCloudConfig();
  if (!config) return null;
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?sb_url=${encodeURIComponent(config.url)}&sb_key=${encodeURIComponent(config.anonKey)}`;
}
