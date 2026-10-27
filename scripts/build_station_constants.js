import fs from 'fs';

const stations = JSON.parse(fs.readFileSync('scripts/khoa_all_stations.json', 'utf-8'));

// 누락된 핵심 관측소 추가 (인천송도, 부산, 성산포 등)
const essentialExtras = [
  { code: 'DT_0052', name: '인천송도', region: 'WEST', lat: 37.3381, lng: 126.5861, meanRange: 750, highLagHours: 4.7, datumZ0: 4.55 },
  { code: 'DT_0005', name: '부산', region: 'SOUTH', lat: 35.096, lng: 129.038, meanRange: 130, highLagHours: 7.5, datumZ0: 0.80 },
  { code: 'DT_0023', name: '성산포', region: 'JEJU', lat: 33.385, lng: 126.928, meanRange: 210, highLagHours: 10.6, datumZ0: 1.30 },
  { code: 'DT_0903', name: '독도', region: 'EAST', lat: 37.241, lng: 131.867, meanRange: 18, highLagHours: 2.0, datumZ0: 0.12 }
];

for (const extra of essentialExtras) {
  if (!stations.some(s => s.code === extra.code)) {
    stations.push(extra);
  }
}

stations.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

const lines = [];
lines.push(`export const KHOA_TIDE_STATIONS: KhoaTideStation[] = [`);

const west = stations.filter(s => s.region === 'WEST');
const south = stations.filter(s => s.region === 'SOUTH');
const east = stations.filter(s => s.region === 'EAST');
const jeju = stations.filter(s => s.region === 'JEJU');

lines.push(`  // 1. 서해안 조위관측소 (7물제 적용: 음력 16일 = 7물 사리, 음력 8일 조금, 음력 9일 무시)`);
for (const s of west) {
  lines.push(`  { code: '${s.code}', name: '${s.name}', region: 'WEST', lat: ${s.lat}, lng: ${s.lng}, meanRange: 680, highLagHours: 4.5, datumZ0: 4.20 },`);
}

lines.push(`\n  // 2. 남해안 조위관측소 (8물제 적용: 음력 16일 = 8물 사리, 음력 7일 조금, 음력 8일 무시)`);
for (const s of south) {
  lines.push(`  { code: '${s.code}', name: '${s.name}', region: 'SOUTH', lat: ${s.lat}, lng: ${s.lng}, meanRange: 260, highLagHours: 9.0, datumZ0: 1.60 },`);
}

lines.push(`\n  // 3. 동해안 조위관측소 (8물제 적용: 소조차 해역)`);
for (const s of east) {
  lines.push(`  { code: '${s.code}', name: '${s.name}', region: 'EAST', lat: ${s.lat}, lng: ${s.lng}, meanRange: 25, highLagHours: 3.5, datumZ0: 0.18 },`);
}

lines.push(`\n  // 4. 제주도 조위관측소 (8물제 적용)`);
for (const s of jeju) {
  lines.push(`  { code: '${s.code}', name: '${s.name}', region: 'JEJU', lat: ${s.lat}, lng: ${s.lng}, meanRange: 220, highLagHours: 10.4, datumZ0: 1.40 },`);
}

lines.push(`];`);

fs.writeFileSync('scripts/generated_tide_stations.ts', lines.join('\n'), 'utf-8');
console.log('완전한 전수 관측소 생성 완료: 총', stations.length, '개');
