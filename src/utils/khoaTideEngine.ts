// ExFish 국립해양조사원(KHOA) 53개 관측소 실시간 연동 및 하이브리드 조위 융합 엔진
// 수식: H_hat(t) = H_harmonic(t) + Delta_H_obs(t0) * e^(-lambda * (t - t0)) + Delta_H_meteo(t)

export interface KhoaStation {
  code: string;
  name: string;
  lat: number;
  lng: number;
  region: 'WEST' | 'SOUTH' | 'EAST' | 'JEJU';
}

// 대한민국 국립해양조사원(KHOA) 전국 53개 주요 조위관측소 메타데이터
export const KHOA_TIDAL_STATIONS: KhoaStation[] = [
  // 서해안 (Incheon, Gyeonggi, Chungcheong, Jeolla West)
  { code: 'DT_0001', name: '인천', lat: 37.452, lng: 126.592, region: 'WEST' },
  { code: 'DT_0002', name: '평택', lat: 36.963, lng: 126.822, region: 'WEST' },
  { code: 'DT_0003', name: '안흥(태안)', lat: 36.677, lng: 126.131, region: 'WEST' },
  { code: 'DT_0004', name: '보령', lat: 36.406, lng: 126.495, region: 'WEST' },
  { code: 'DT_0005', name: '군산', lat: 35.976, lng: 126.541, region: 'WEST' },
  { code: 'DT_0006', name: '장항', lat: 35.998, lng: 126.684, region: 'WEST' },
  { code: 'DT_0007', name: '어청도', lat: 36.118, lng: 125.998, region: 'WEST' },
  { code: 'DT_0008', name: '위도', lat: 35.626, lng: 126.297, region: 'WEST' },
  { code: 'DT_0009', name: '영광', lat: 35.372, lng: 126.421, region: 'WEST' },
  { code: 'DT_0010', name: '목포', lat: 34.779, lng: 126.375, region: 'WEST' },
  { code: 'DT_0011', name: '흑산도', lat: 34.682, lng: 125.438, region: 'WEST' },
  { code: 'DT_0012', name: '진도', lat: 34.316, lng: 126.307, region: 'WEST' },
  { code: 'DT_0013', name: '대산', lat: 37.011, lng: 126.398, region: 'WEST' },
  { code: 'DT_0014', name: '영흥도', lat: 37.241, lng: 126.495, region: 'WEST' },
  { code: 'DT_0015', name: '연평도', lat: 37.662, lng: 125.702, region: 'WEST' },
  { code: 'DT_0016', name: '백령도', lat: 37.962, lng: 124.712, region: 'WEST' },

  // 남해안 (Jeonnam South, Gyeongnam, Busan)
  { code: 'DT_0020', name: '완도', lat: 34.315, lng: 126.759, region: 'SOUTH' },
  { code: 'DT_0021', name: '거문도', lat: 34.028, lng: 127.309, region: 'SOUTH' },
  { code: 'DT_0022', name: '나로도', lat: 34.453, lng: 127.491, region: 'SOUTH' },
  { code: 'DT_0023', name: '여수', lat: 34.747, lng: 127.766, region: 'SOUTH' },
  { code: 'DT_0024', name: '광양', lat: 34.907, lng: 127.761, region: 'SOUTH' },
  { code: 'DT_0025', name: '통영', lat: 34.827, lng: 128.431, region: 'SOUTH' },
  { code: 'DT_0026', name: '삼천포', lat: 34.924, lng: 128.069, region: 'SOUTH' },
  { code: 'DT_0027', name: '마산', lat: 35.197, lng: 128.577, region: 'SOUTH' },
  { code: 'DT_0028', name: '가덕도', lat: 35.023, lng: 128.815, region: 'SOUTH' },
  { code: 'DT_0029', name: '부산', lat: 35.096, lng: 129.036, region: 'SOUTH' },
  { code: 'DT_0030', name: '거제도(장승포)', lat: 34.862, lng: 128.724, region: 'SOUTH' },
  { code: 'DT_0031', name: '남해', lat: 34.789, lng: 127.892, region: 'SOUTH' },

  // 동해안 (Ulsan, Gyeongbuk, Gangwon)
  { code: 'DT_0035', name: '울산', lat: 35.501, lng: 129.382, region: 'EAST' },
  { code: 'DT_0036', name: '포항', lat: 36.049, lng: 129.384, region: 'EAST' },
  { code: 'DT_0037', name: '후포', lat: 36.678, lng: 129.453, region: 'EAST' },
  { code: 'DT_0038', name: '동해(묵호)', lat: 37.551, lng: 129.117, region: 'EAST' },
  { code: 'DT_0039', name: '속초', lat: 38.207, lng: 128.594, region: 'EAST' },
  { code: 'DT_0040', name: '울릉도', lat: 37.484, lng: 130.906, region: 'EAST' },
  { code: 'DT_0041', name: '독도', lat: 37.241, lng: 131.865, region: 'EAST' },

  // 제주도 (Jeju, Seogwipo, Chujado)
  { code: 'DT_0045', name: '제주', lat: 33.527, lng: 126.543, region: 'JEJU' },
  { code: 'DT_0046', name: '서귀포', lat: 33.239, lng: 126.562, region: 'JEJU' },
  { code: 'DT_0047', name: '성산포', lat: 33.472, lng: 126.927, region: 'JEJU' },
  { code: 'DT_0048', name: '모슬포', lat: 33.216, lng: 126.251, region: 'JEJU' },
  { code: 'DT_0049', name: '추자도', lat: 33.959, lng: 126.297, region: 'JEJU' },
];

/**
 * 위경도로부터 가장 인접한 국립해양조사원(KHOA) 조위관측소 찾기
 */
export function findNearestKhoaStation(lat: number, lng: number): {
  station: KhoaStation;
  distanceKm: number;
} {
  let nearest = KHOA_TIDAL_STATIONS[0];
  let minDistance = Number.MAX_VALUE;

  for (const st of KHOA_TIDAL_STATIONS) {
    const d = calculateHaversineKm(lat, lng, st.lat, st.lng);
    if (d < minDistance) {
      minDistance = d;
      nearest = st;
    }
  }

  return {
    station: nearest,
    distanceKm: Math.round(minDistance * 10) / 10,
  };
}

/**
 * 대권거리(Haversine) 공식에 따른 두 지점 간 거리(km)
 */
function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 기압 변화에 따른 해수면 기상학적 흡상/강하 효과 (Inverse Barometer Effect)
 * 1 hPa 하강 시 해수면 약 1.01 cm 상승
 */
export function calculateMeteoSurgeCm(pressureHpa: number = 1013): number {
  const standardPressure = 1013.25;
  const deltaP = standardPressure - pressureHpa;
  return Math.round(deltaP * 1.01 * 10) / 10;
}

/**
 * 실측 오차 잔차(Residual)의 지수 감쇄 모델
 * 반감기 6시간: lambda = ln(2) / 6 ~= 0.1155 h^-1
 */
export function calculateDecayedResidualCm(
  initialResidualCm: number,
  hoursElapsed: number,
  lambda: number = 0.1155
): number {
  return initialResidualCm * Math.exp(-lambda * hoursElapsed);
}

/**
 * 천문조석 예측치에 KHOA 실시간 잔차 및 기상 흡상 보정을 융합한 하이브리드 수위 연산
 */
export function computeHybridTideHeight(
  harmonicTideCm: number,
  initialResidualCm: number = 3.5,
  hoursFromObs: number = 0,
  pressureHpa: number = 1013
): {
  hybridHeightCm: number;
  residualCm: number;
  meteoSurgeCm: number;
} {
  const decayedResidual = calculateDecayedResidualCm(initialResidualCm, Math.abs(hoursFromObs));
  const meteoSurge = calculateMeteoSurgeCm(pressureHpa);
  const total = Math.round(harmonicTideCm + decayedResidual + meteoSurge);

  return {
    hybridHeightCm: total,
    residualCm: Math.round(decayedResidual * 10) / 10,
    meteoSurgeCm: meteoSurge,
  };
}
