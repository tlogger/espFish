async function testSongdo() {
  const serviceKey = '7Q54Z6DQ%2B9wH23fR%2FAlrOSh4XgQ9xyA8I%2F69h1tmrlCwtFqMG8zdR01z0h8%2Bo%2Ft1Uvt%2BwoN947y1ts5Maeoy%2Bg%3D%3D';
  const url = `https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService?serviceKey=${serviceKey}&type=json&obsCode=DT_0052&reqDate=20261027&min=60&pageNo=1&numOfRows=5`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('DT_0052 (인천송도) items:', data.body?.items?.item);
}

testSongdo();
