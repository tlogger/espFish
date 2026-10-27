async function checkEarlier() {
  const dates = ['20261011', '20261012', '20261013', '20261014', '20261015', '20261016', '20261017', '20261018', '20261019'];
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
      console.log(`양력: ${item.searchDate} | 음력: ${item.dateMoon} | moolNormal: ${item.moolNormal.padEnd(8)} | mool7: ${item.mool7.padEnd(8)} | mool8: ${item.mool8.padEnd(8)} | moonState: ${item.moonState}`);
    }
  }
}
checkEarlier();
