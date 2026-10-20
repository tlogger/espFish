import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { CatchLog, FishingSpot, SpotMemo } from '../types';
import { INITIAL_CATCH_LOGS, INITIAL_SPOTS } from './storage';

const STORAGE_KEY_URL = 'espfish_supabase_url';
const STORAGE_KEY_ANON = 'espfish_supabase_anon_key';
const STORAGE_KEY_MEMOS = 'espfish_spot_memos';

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
  // description 필드 끝에 캐스팅 방향 정보를 안전하게 인코딩하여 스키마 변경 전/후 모두 무결성 유지
  let desc = spot.description || '';
  if (spot.casting_directions && spot.casting_directions.length > 0) {
    const castingTag = `[CASTING:${spot.casting_directions.join(',')}]`;
    if (!desc.includes('[CASTING:')) {
      desc = desc ? `${desc}\n${castingTag}` : castingTag;
    }
  }

  const record: Record<string, unknown> = {
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
    description: desc,
    created_at: spot.created_at || new Date().toISOString(),
  };

  return record;
}

/** catch_logs 테이블에 존재하는 컬럼만 추출 */
function toDbLogRecord(log: CatchLog): Record<string, unknown> {
  // 조류, 풍향, 출조 시간(시작/종료/총시간), 꽝 여부를 memo 필드에 안전하게 보존하여 스키마 에러 방지
  let memoText = log.memo || '';
  if (log.current_velocity != null && !memoText.includes('[CURRENT:')) {
    const velTag = `[CURRENT:${log.current_velocity}${log.current_direction != null ? `@${log.current_direction}` : ''}]`;
    memoText = memoText ? `${memoText} ${velTag}` : velTag;
  }
  if (log.wind_direction != null && !memoText.includes('[WIND_DIR:')) {
    const windTag = `[WIND_DIR:${log.wind_direction}]`;
    memoText = memoText ? `${memoText} ${windTag}` : windTag;
  }
  if ((log.start_time || log.end_time || log.duration_minutes != null) && !memoText.includes('[TIME:')) {
    const timeTag = `[TIME:${log.start_time || ''}~${log.end_time || ''}(${log.duration_minutes ?? ''})]`;
    memoText = memoText ? `${memoText} ${timeTag}` : timeTag;
  }
  if ((log.fish_count === 0 || log.is_hitless) && !memoText.includes('[HITLESS]')) {
    memoText = memoText ? `${memoText} [HITLESS]` : '[HITLESS]';
  }

  const record: Record<string, unknown> = {
    id: log.id,
    spot_id: log.spot_id,
    user_id: log.user_id || 'user-me',
    user_name: log.user_name || '나의 조과',
    catch_date: log.catch_date,
    catch_time: log.catch_time,
    lat: log.lat ?? null,
    lng: log.lng ?? null,
    fish_species: log.fish_species,
    fish_size_cm: (log.fish_count === 0 || log.is_hitless) ? null : (log.fish_size_cm ?? null),
    fish_count: log.fish_count ?? 0,
    catch_method: log.catch_method,
    lure_bait: log.lure_bait ?? '',
    catch_mul: log.catch_mul,
    tide_state: log.tide_state,
    water_temp: log.water_temp,
    wind_speed: log.wind_speed,
    wind_direction: log.wind_direction ?? null,
    photo_url: log.photo_url ?? null,
    memo: memoText,
    created_at: log.created_at || new Date().toISOString(),
  };

  return record;
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

/** DB 레코드로부터 FishingSpot 객체로 변환 (description 내 [CASTING:...] 태그 파싱) */
function fromDbSpotRecord(record: any): FishingSpot {
  let desc = record.description || '';
  let castingDirections: string[] = record.casting_directions || [];

  if (desc && desc.includes('[CASTING:')) {
    const match = desc.match(/\[CASTING:([^\]]+)\]/);
    if (match && match[1]) {
      castingDirections = match[1].split(',').filter(Boolean);
      desc = desc.replace(/\n?\[CASTING:[^\]]+\]/, '').trim();
    }
  }

  return {
    ...record,
    description: desc,
    casting_directions: castingDirections,
  };
}

/** DB 레코드로부터 CatchLog 객체로 변환 (memo 내 [CURRENT:...], [TIME:...], [WIND_DIR:...], [HITLESS] 태그 파싱) */
function fromDbLogRecord(record: any): CatchLog {
  let memoText = record.memo || '';
  let currentVel = record.current_velocity ?? undefined;
  let currentDir = record.current_direction ?? undefined;
  let windDir = record.wind_direction ?? undefined;
  let startTime = record.start_time ?? undefined;
  let endTime = record.end_time ?? undefined;
  let durationMins = record.duration_minutes ?? undefined;
  let isHitless = (record.fish_count === 0) || (record.is_hitless === true);

  if (memoText && memoText.includes('[CURRENT:')) {
    const match = memoText.match(/\[CURRENT:([0-9.]+)(?:@([0-9.]+))?\]/);
    if (match) {
      if (match[1]) currentVel = parseFloat(match[1]);
      if (match[2]) currentDir = parseFloat(match[2]);
      memoText = memoText.replace(/\s*\[CURRENT:[^\]]+\]/, '').trim();
    }
  }

  if (memoText && memoText.includes('[WIND_DIR:')) {
    const match = memoText.match(/\[WIND_DIR:([0-9.]+)\]/);
    if (match && match[1]) {
      windDir = parseFloat(match[1]);
      memoText = memoText.replace(/\s*\[WIND_DIR:[^\]]+\]/, '').trim();
    }
  }

  if (memoText && memoText.includes('[TIME:')) {
    const match = memoText.match(/\[TIME:([^~]*?)~([^(]*?)(?:\(([0-9]+)\))?\]/);
    if (match) {
      if (match[1]) startTime = match[1];
      if (match[2]) endTime = match[2];
      if (match[3]) durationMins = parseInt(match[3], 10);
      memoText = memoText.replace(/\s*\[TIME:[^\]]+\]/, '').trim();
    }
  }

  if (memoText && memoText.includes('[HITLESS]')) {
    isHitless = true;
    memoText = memoText.replace(/\s*\[HITLESS\]/, '').trim();
  }

  return {
    ...record,
    memo: memoText,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: durationMins,
    wind_direction: windDir,
    is_hitless: isHitless || record.fish_count === 0,
    fish_count: record.fish_count ?? 0,
    current_velocity: currentVel,
    current_direction: currentDir,
  };
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

  return data.map(fromDbSpotRecord);
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

  return data.map(fromDbLogRecord);
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

// -------------------------------------------------------------
// 포인트별 커뮤니티 현장 메모 (Spot Memos / 방명록 / 실시간 팁)
// -------------------------------------------------------------

const DEFAULT_SAMPLE_MEMOS: SpotMemo[] = [
  {
    id: 'memo-sample-1',
    spot_id: 'spot-seonjae-bridge',
    user_id: 'user-angler-kim',
    user_name: '바다사랑김조사',
    content: '간조 2시간 전부터 진입로 자갈길이 완전히 드러납니다. 갯바위 젖은 이끼가 매우 미끄러우니 펠트 갯바위화 필수입니다!',
    tag: 'SAFETY',
    created_at: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
  },
  {
    id: 'memo-sample-2',
    spot_id: 'spot-seonjae-bridge',
    user_id: 'user-angler-park',
    user_name: '인천루어맨',
    content: '다리 밑 공영주차장 주말 10시 이후 만차됩니다. 도로변 갓길은 주차단속 잦으니 안쪽 유료주차장 이용 권장드려요.',
    tag: 'PARKING',
    created_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
  },
  {
    id: 'memo-sample-3',
    spot_id: 'spot-yeongheung-jindu',
    user_id: 'user-angler-lee',
    user_name: '영흥도원투왕',
    content: '중들물 유속 강할 때 30호 봉돌도 굴러갑니다. 스파이크 봉돌 35호 이상 쓰시거나 물돌이 정조 타임 집중 공략 추천합니다.',
    tag: 'CONDITION',
    created_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
  },
];

function getLocalMemos(): SpotMemo[] {
  if (typeof window === 'undefined') return DEFAULT_SAMPLE_MEMOS;
  const raw = localStorage.getItem(STORAGE_KEY_MEMOS);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY_MEMOS, JSON.stringify(DEFAULT_SAMPLE_MEMOS));
    return DEFAULT_SAMPLE_MEMOS;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SAMPLE_MEMOS;
  }
}

function saveLocalMemos(memos: SpotMemo[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_MEMOS, JSON.stringify(memos));
  }
}

/** 특정 포인트의 현장 메모 목록 조회 */
export async function fetchCloudMemos(spotId: string): Promise<SpotMemo[]> {
  try {
    const client = getSupabase();
    const { data, error } = await client
      .from('spot_memos')
      .select('*')
      .eq('spot_id', spotId)
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch {
    // Supabase 테이블이 아직 없거나 네트워크 오프라인 시 fallback
  }

  // Local fallback
  const allMemos = getLocalMemos();
  return allMemos.filter((m) => m.spot_id === spotId);
}

/** 현장 메모 등록 */
export async function saveCloudMemo(memo: SpotMemo): Promise<boolean> {
  // 1. Supabase 시도
  try {
    const client = getSupabase();
    const { error } = await client.from('spot_memos').upsert({
      id: memo.id,
      spot_id: memo.spot_id,
      user_id: memo.user_id,
      user_name: memo.user_name,
      content: memo.content,
      tag: memo.tag || 'GENERAL',
      created_at: memo.created_at,
    });
    if (!error) {
      // Local 캐시도 동기화
      const local = getLocalMemos();
      const updated = [memo, ...local.filter((m) => m.id !== memo.id)];
      saveLocalMemos(updated);
      return true;
    }
  } catch {
    // ignore
  }

  // 2. Local fallback 저장
  const local = getLocalMemos();
  const updated = [memo, ...local.filter((m) => m.id !== memo.id)];
  saveLocalMemos(updated);
  return true;
}

/** 현장 메모 삭제 */
export async function deleteCloudMemo(memoId: string): Promise<boolean> {
  try {
    const client = getSupabase();
    await client.from('spot_memos').delete().eq('id', memoId);
  } catch {
    // ignore
  }

  const local = getLocalMemos();
  const updated = local.filter((m) => m.id !== memoId);
  saveLocalMemos(updated);
  return true;
}
