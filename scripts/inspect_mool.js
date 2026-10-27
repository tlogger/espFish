// KHOA 모바일 사이트 전체 스크립트와 getWeeklyData.do 응답 데이터들을 일자별로(예: 음력 1일~30일까지) 전수 조사해보자
async function checkWeeklyMultipleDays() {
  const dates = ['20261020', '20261021', '20261022', '20261023', '20261024', '20261025', '20261026', '20261027', '20261028', '20261029', '20261030', '20261031'];
  
  for (const d of dates) {
    const params = new URLSearchParams();
    params.append('stDate', d);
    params.append('obsPostId', 'DT_0001');
    const res = await fetch('https://www.khoa.go.kr/swtc/getWeeklyData.do', {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0'
      }
    });
    const data = await res.json();
    const item = data.weeklyData?.[0];
    if (item) {
      console.log(`양력: ${item.searchDate} | 음력: ${item.dateMoon} | moolNormal: ${item.moolNormal.padEnd(6)} | mool7: ${item.mool7.padEnd(6)} | mool8: ${item.mool8.padEnd(6)} | moonState: ${item.moonState}`);
    }
  }
}

checkWeeklyMultipleDays();
