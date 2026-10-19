import { calculateTideDay } from './tideEngine';
import { fetchWeatherData, fetchMarineData } from './weatherApi';

export interface CatchSyncResult {
  catch_mul: string;
  tide_state: string;
  water_temp: number;
  wind_speed: number;
  wind_direction?: number;
  temp?: number;
}

/**
 * 출조 날짜, 시각, 위경도 좌표를 기반으로 당시 환경(물때, 조위상태, 수온, 바람)을 계산 및 동기화
 */
export async function syncCatchEnvironment(
  dateStr: string, // YYYY-MM-DD
  timeStr: string, // HH:mm
  lat: number,
  lng: number
): Promise<CatchSyncResult> {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const targetDate = new Date(year, month - 1, day, hour || 12, minute || 0);

  // 1. 해당 날짜 및 좌표의 물때 및 조석 계산
  const tideInfo = calculateTideDay(lat, lng, targetDate);
  const targetHour = targetDate.getHours();
  const matchedCurve = tideInfo.hourlyCurve.find((c) => c.hour === targetHour) || tideInfo.hourlyCurve[0];

  const tide_state = matchedCurve
    ? `${matchedCurve.stateText} (조위 ${matchedCurve.height}cm)`
    : '조석 정보 연동';

  // 2. 기상 및 해양 데이터 조회
  let water_temp = 17.5;
  let wind_speed = 3.0;
  let wind_direction: number | undefined = 315;
  let temp: number | undefined = 18.0;

  try {
    const [wData, mData] = await Promise.all([
      fetchWeatherData(lat, lng),
      fetchMarineData(lat, lng),
    ]);

    // 날짜가 오늘인 경우 시간대별 데이터 매핑
    const isToday = new Date().toDateString() === targetDate.toDateString();
    if (isToday) {
      if (wData.hourly.temp[targetHour] != null) temp = wData.hourly.temp[targetHour];
      if (wData.hourly.windSpeed[targetHour] != null) wind_speed = wData.hourly.windSpeed[targetHour];
      if (wData.hourly.windDirection[targetHour] != null) wind_direction = wData.hourly.windDirection[targetHour];
      if (mData.hourly?.seaSurfaceTemp[targetHour] != null) water_temp = mData.hourly.seaSurfaceTemp[targetHour];
      else water_temp = mData.seaSurfaceTemp;
    } else {
      // 과거 출조일: 해양 기본 관측값 및 계절 평년치 적용
      water_temp = mData.seaSurfaceTemp;
      wind_speed = wData.windSpeed;
      wind_direction = wData.windDirection;
      temp = wData.temp;
    }
  } catch (e) {
    console.warn('syncCatchEnvironment error:', e);
  }

  return {
    catch_mul: tideInfo.mulText,
    tide_state,
    water_temp,
    wind_speed,
    wind_direction,
    temp,
  };
}
