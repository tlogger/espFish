async function testWeeklySongdo() {
  const params = new URLSearchParams();
  params.append('stDate', '20261027');
  params.append('obsPostId', 'DT_0052');
  const res = await fetch('https://www.khoa.go.kr/swtc/getWeeklyData.do', {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  const data = await res.json();
  console.log('Weekly DT_0052:', data.weeklyData?.[0]);
}

testWeeklySongdo();
