export type SpotType = 'ROCK' | 'BREAKWATER' | 'BEACH' | 'PIER';
export type FishingMethod = 'SURF' | 'LURE' | 'FLOAT';
export type WindUnit = 'ms' | 'knot' | 'kmh';
export type CurrentUnit = 'knot' | 'ms' | 'cms';

export interface FishingSpot {
  id: string;
  user_id: string;
  author_name: string;
  is_public: boolean;
  name: string;
  spot_type: SpotType;
  lat: number;
  lng: number;
  navi_name?: string; // 네비 검색명 / 주차장 지명 (예: 진두선착장 공영주차장)
  navi_url?: string; // 현장 네비 위치 URL (카카오/네이버지도 커스텀 링크)
  directions: string; // 찾아가는 길, 주차 위치, 도보 팁
  photo_urls: string[]; // 포인트 현장 사진 목록
  fishing_methods: FishingMethod[];
  target_species: string[];
  best_tides?: string[]; // 선호 물때 (예: 사리, 7~9물 등)
  best_times?: string[]; // 선호 시간대 (예: 새벽 해창, 해질녘 등)
  best_seasons?: number[]; // 선호 월 (예: 9, 10, 11)
  description?: string; // 채비 및 수심 팁
  created_at: string;
}

export interface CatchLog {
  id: string;
  spot_id: string;
  user_id: string;
  user_name: string;
  catch_date: string; // YYYY-MM-DD
  catch_time: string; // HH:mm
  fish_species: string;
  fish_size_cm?: number;
  fish_count: number;
  catch_method: FishingMethod;
  lure_bait?: string;
  // 당시 환경 자동 스냅샷 (Environment Snapshot)
  catch_mul: string; // 당시 물때 (예: 8물)
  tide_state: string; // 당시 조석 상태 (예: 중들물 60%)
  water_temp: number; // 당시 수온 (°C)
  wind_speed: number; // 당시 풍속 (m/s)
  wind_direction?: number; // 당시 풍향 (0-360°)
  current_velocity?: number; // 당시 조류 유속 (m/s)
  current_direction?: number; // 당시 조류 방향 (0-360°)
  lat?: number; // 조과 히트 GPS 위도
  lng?: number; // 조과 히트 GPS 경도
  photo_url?: string; // 조과 인증 사진
  memo?: string;
  created_at: string;
}

export interface WeatherData {
  temp: number;
  apparentTemp: number; // 체감온도 (°C)
  humidity: number; // 상대습도 (%)
  weatherCode: number;
  weatherText: string;
  windSpeed: number; // m/s
  windDirection: number; // 0-360°
  windGust: number; // m/s
    hourly: {
      time: string[];
      temp: number[];
      windSpeed: number[];
      windDirection: number[];
      pop: number[]; // 강수확률
      weatherCode?: number[];
    };
}

export interface MarineData {
  seaSurfaceTemp: number; // 수온 (°C)
  waveHeight: number; // 파고 (m)
  waveDirection: number; // 파향 (0-360°)
  wavePeriod: number; // 파주기 (s)
  currentVelocity: number; // 해류/조류 속도 (m/s)
  currentDirection: number; // 해류/조류 방향 (0-360°)
  hourly?: {
    time: string[];
    seaSurfaceTemp: number[];
    waveHeight: number[];
    currentVelocity: number[];
    currentDirection: number[];
  };
}

export interface TidePoint {
  timeStr: string; // HH:mm
  height: number; // cm
  type?: 'HIGH' | 'LOW';
}

export interface TideCurvePoint {
  hour: number;
  timeStr: string; // HH:mm or MM/DD HH:mm
  dateStr?: string; // MM/DD
  dayLabel?: string; // 오늘, 내일, 모레
  height: number;
  stateText: string;
  isSunrise?: boolean;
  isSunset?: boolean;
}

export interface TideDaySummary {
  dateStr: string; // MM/DD (요일)
  dayLabel: string; // 오늘, 내일, 모레
  mulText: string;
  sunrise: string;
  sunset: string;
  highTides: { time: string; height: number }[];
  lowTides: { time: string; height: number }[];
}

export interface TideDayInfo {
  lunarDateStr: string; // 음력 날짜
  mulText: string; // 물때 (예: 8물)
  mulNumber: number; // 1 ~ 15
  highTides: { time: string; height: number }[];
  lowTides: { time: string; height: number }[];
  hourlyCurve: TideCurvePoint[];
  hourly72Curve: TideCurvePoint[]; // 오늘 0시 기준 72시간 연속 조위 곡선
  threeDays: TideDaySummary[]; // 오늘, 내일, 모레 3일간 요약
  sunrise: string; // HH:mm
  sunset: string; // HH:mm
  dawn: string; // HH:mm
  dusk: string; // HH:mm
  feedingTimes?: {
    label: string;
    timeRange: string;
    reason: string;
    startHour: number;
    endHour: number;
    startTimeStr: string;
    endTimeStr: string;
  }[];
}

export interface BiteScoreBreakdown {
  totalScore: number; // 0 - 100
  mulScore: number;
  windScore: number;
  tempScore: number;
  timeScore: number;
  windRelation: '등바람 (최적)' | '옆바람 (주의)' | '맞바람/너울 (위험)';
  verdict: string;
}
