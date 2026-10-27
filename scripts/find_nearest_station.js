const serviceKey = '7Q54Z6DQ%2B9wH23fR%2FAlrOSh4XgQ9xyA8I%2F69h1tmrlCwtFqMG8zdR01z0h8%2Bo%2Ft1Uvt%2BwoN947y1ts5Maeoy%2Bg%3D%3D';

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 시화방조제 서측 (시화나래 조력공원 / 큰가리섬 앞바다)
const SIHWA_LAT = 37.3174;
const SIHWA_LON = 126.6062;

const candidateCodes = ['DT_0001', 'DT_0008', 'DT_0043', 'DT_0052', 'DT_0058', 'DT_0002'];

async function inspectCandidates() {
  console.log(`기준 지점: 시화방조제 서측 (위도: ${SIHWA_LAT}, 경도: ${SIHWA_LON})\n`);
  const results = [];

  for (const code of candidateCodes) {
    try {
      const url = `https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService?serviceKey=${serviceKey}&type=json&obsCode=${code}&reqDate=20261027&min=60&pageNo=1&numOfRows=1`;
      const res = await fetch(url);
      const data = await res.json();
      const item = data.body?.items?.item?.[0];
      if (item) {
        const dist = haversine(SIHWA_LAT, SIHWA_LON, item.lat, item.lot);
        results.push({
          code,
          name: item.obsvtrNm,
          lat: item.lat,
          lon: item.lot,
          distKm: Math.round(dist * 10) / 10
        });
      }
    } catch (e) {
      console.error(code, e.message);
    }
  }

  results.sort((a, b) => a.distKm - b.distKm);
  console.table(results);
}

inspectCandidates();
