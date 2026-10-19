import { MarineData, WeatherData } from '../types';

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

/** Open-Meteo Weather Forecast API 호출 */
export async function fetchWeatherData(lat: number, lng: number): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather fetch failed: ${res.statusText}`);
    const data = await res.json();
    const current = data.current;

    return {
      temp: Math.round(current.temperature_2m * 10) / 10,
      apparentTemp: Math.round(current.apparent_temperature * 10) / 10,
      humidity: Math.round(current.relative_humidity_2m ?? 65),
      weatherCode: current.weather_code,
      weatherText: getWeatherText(current.weather_code),
      windSpeed: Math.round(current.wind_speed_10m * 10) / 10,
      windDirection: current.wind_direction_10m,
      windGust: Math.round(current.wind_gusts_10m * 10) / 10,
      hourly: {
        time: data.hourly?.time?.slice(0, 24) || [],
        temp: data.hourly?.temperature_2m?.slice(0, 24) || [],
        windSpeed: data.hourly?.wind_speed_10m?.slice(0, 24) || [],
        windDirection: data.hourly?.wind_direction_10m?.slice(0, 24) || [],
        pop: data.hourly?.precipitation_probability?.slice(0, 24) || [],
      },
    };
  } catch (err) {
    console.warn('Weather API fallback used:', err);
    // 오프라인 폴백 목(Mock) 데이터
    return {
      temp: 18.5,
      apparentTemp: 17.8,
      humidity: 68,
      weatherCode: 1,
      weatherText: '대체로 맑음 🌤️',
      windSpeed: 2.8,
      windDirection: 315, // 북서풍
      windGust: 4.5,
      hourly: {
        time: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        temp: Array.from({ length: 24 }, () => 18),
        windSpeed: Array.from({ length: 24 }, () => 3),
        windDirection: Array.from({ length: 24 }, () => 315),
        pop: Array.from({ length: 24 }, () => 10),
      },
    };
  }
}

/** Open-Meteo Marine API 호출 (수온, 파고, 해류) */
export async function fetchMarineData(lat: number, lng: number): Promise<MarineData> {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature&hourly=wave_height,sea_surface_temperature,ocean_current_velocity,ocean_current_direction&timezone=Asia%2FSeoul`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Marine fetch failed: ${res.statusText}`);
    const data = await res.json();
    const current = data.current;
    const hourly = data.hourly;

    return {
      seaSurfaceTemp: current.sea_surface_temperature != null ? Math.round(current.sea_surface_temperature * 10) / 10 : 17.2,
      waveHeight: current.wave_height != null ? Math.round(current.wave_height * 10) / 10 : 0.6,
      waveDirection: current.wave_direction ?? 180,
      wavePeriod: current.wave_period != null ? Math.round(current.wave_period) : 5,
      currentVelocity: current.ocean_current_velocity != null ? Math.round(current.ocean_current_velocity * 100) / 100 : 0.35, // m/s
      currentDirection: current.ocean_current_direction ?? 135, // 남동류
      hourly: {
        time: hourly?.time?.slice(0, 24) || [],
        seaSurfaceTemp: hourly?.sea_surface_temperature?.slice(0, 24) || [],
        waveHeight: hourly?.wave_height?.slice(0, 24) || [],
        currentVelocity: hourly?.ocean_current_velocity?.slice(0, 24) || [],
        currentDirection: hourly?.ocean_current_direction?.slice(0, 24) || [],
      },
    };
  } catch (err) {
    console.warn('Marine API fallback used:', err);
    return {
      seaSurfaceTemp: 17.4,
      waveHeight: 0.5,
      waveDirection: 210,
      wavePeriod: 6,
      currentVelocity: 0.4,
      currentDirection: 140,
      hourly: {
        time: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        seaSurfaceTemp: Array.from({ length: 24 }, () => 17.4),
        waveHeight: Array.from({ length: 24 }, () => 0.5),
        currentVelocity: Array.from({ length: 24 }, () => 0.4),
        currentDirection: Array.from({ length: 24 }, () => 140),
      },
    };
  }
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
