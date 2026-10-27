import { calculateTideDay, getMulInfo, getMoonAge, findNearestHarbor } from '../src/utils/tideEngine.ts';

// 오늘 날짜 2026-10-27
const testDate = new Date('2026-10-27T12:00:00+09:00');
const moonAge = getMoonAge(testDate);

console.log('=== 해역별 물때 분기 검증 (기준일: 2026-10-27) ===');
console.log(`월령(Moon Age): ${moonAge.toFixed(2)}일 | 음력 일자: ${Math.floor(moonAge) + 1}일`);

// 1. 함수 직접 호출 검증
const westMul = getMulInfo(moonAge, 'WEST');
const southMul = getMulInfo(moonAge, 'SOUTH');
const eastMul = getMulInfo(moonAge, 'EAST');
const jejuMul = getMulInfo(moonAge, 'JEJU');

console.log('\n[직접 계산 결과]');
console.log(`- 서해(WEST)      : ${westMul.mulText} (물번호: ${westMul.mulNumber}) -> 기대값: 8물`);
console.log(`- 남해(SOUTH)     : ${southMul.mulText} (물번호: ${southMul.mulNumber}) -> 기대값: 9물`);
console.log(`- 동해(EAST)      : ${eastMul.mulText} (물번호: ${eastMul.mulNumber}) -> 기대값: 9물`);
console.log(`- 제주(JEJU)      : ${jejuMul.mulText} (물번호: ${jejuMul.mulNumber}) -> 기대값: 9물`);

// 2. 실제 좌표 기반 calculateTideDay 호출 검증
// 시화방조제 서측 (37.317, 126.606)
const sihwaTide = calculateTideDay(37.3174, 126.6062, testDate);
const sihwaHarbor = findNearestHarbor(37.3174, 126.6062);

// 통영 척포방파제 (34.792, 128.432)
const tongyeongTide = calculateTideDay(34.792, 128.432, testDate);
const tongyeongHarbor = findNearestHarbor(34.792, 128.432);

console.log('\n[포인트 좌표 기반 calculateTideDay 결과]');
console.log(`- 시화방조제 서측 : 인접항=[${sihwaHarbor.name}(${sihwaHarbor.region})] -> 물때=${sihwaTide.mulText}`);
console.log(`- 통영 척포방파제 : 인접항=[${tongyeongHarbor.name}(${tongyeongHarbor.region})] -> 물때=${tongyeongTide.mulText}`);

if (sihwaTide.mulNumber === 8 && tongyeongTide.mulNumber === 9) {
  console.log('\n>>> 검증 성공! 서해 8물 / 남해 9물 정확히 일치하여 1일 밀림 원천 해소됨! <<<');
} else {
  console.error('\n>>> 검증 실패! <<<');
}
