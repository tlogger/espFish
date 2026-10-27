const testMin = async (minVal) => {
  const url = `https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService?serviceKey=7Q54Z6DQ%2B9wH23fR%2FAlrOSh4XgQ9xyA8I%2F69h1tmrlCwtFqMG8zdR01z0h8%2Bo%2Ft1Uvt%2BwoN947y1ts5Maeoy%2Bg%3D%3D&type=json&obsCode=DT_0001&reqDate=20261027&min=${minVal}&pageNo=1&numOfRows=150`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(`min=${minVal}: totalCount=${data.body?.totalCount}, itemsLength=${data.body?.items?.item?.length}`);
};

(async () => {
  await testMin(10);
  await testMin(30);
  await testMin(60);
})();
