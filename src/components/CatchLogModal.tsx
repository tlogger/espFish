import React from 'react';
import { ArrowUp, Clock, Compass, RefreshCw } from 'lucide-react';
import type { CatchLog, CurrentUnit, FishingMethod, TideDayInfo, WeatherData, WindUnit } from '../types';
import { syncCatchEnvironment } from '../utils/catchSync';
import { formatCurrentVelocity, formatWindSpeed, getCompassDirection } from '../utils/weatherApi';

interface CatchLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  spotId: string;
  spotName: string;
  spotLat: number;
  spotLng: number;
  editingLog?: CatchLog | null;
  currentWeather: WeatherData | null;
  currentTide: TideDayInfo | null;
  currentWaterTemp: number;
  currentVelocity?: number;
  windUnit?: WindUnit;
  currentUnit?: CurrentUnit;
  extractExifFromImage: (file: File) => Promise<{ lat?: number; lng?: number; dateStr?: string; timeStr?: string }>;
  onSaveLog: (logData: Omit<CatchLog, 'id' | 'created_at'>) => void;
}

// 8방위 빠른 선택 프리셋
const WIND_DIR_PRESETS: { label: string; deg: number }[] = [
  { label: '북 (N)', deg: 0 },
  { label: '북동 (NE)', deg: 45 },
  { label: '동 (E)', deg: 90 },
  { label: '남동 (SE)', deg: 135 },
  { label: '남 (S)', deg: 180 },
  { label: '남서 (SW)', deg: 225 },
  { label: '서 (W)', deg: 270 },
  { label: '북서 (NW)', deg: 315 },
];

/** 시작 시각과 종료 시각(HH:mm)으로부터 경과 시간(분)을 계산 */
function calcDurationMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sH, sM] = start.split(':').map((v) => parseInt(v, 10));
  const [eH, eM] = end.split(':').map((v) => parseInt(v, 10));
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;

  let startTotal = sH * 60 + sM;
  let endTotal = eH * 60 + eM;
  if (endTotal < startTotal) {
    // 자정을 넘긴 경우 (예: 22:00 ~ 02:00)
    endTotal += 24 * 60;
  }
  return Math.max(0, endTotal - startTotal);
}

/** 분 단위를 "X시간 Y분" 텍스트로 포맷 */
function formatDuration(mins: number): string {
  if (!mins || mins <= 0) return '0분';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export const CatchLogModal: React.FC<CatchLogModalProps> = ({
  isOpen,
  onClose,
  spotId,
  spotLat,
  spotLng,
  editingLog,
  currentWeather,
  currentTide,
  currentWaterTemp,
  currentVelocity = 0.3,
  windUnit = 'ms',
  currentUnit = 'ms',
  extractExifFromImage,
  onSaveLog,
}) => {
  const [fishSpecies, setFishSpecies] = React.useState('우럭');
  const [fishCount, setFishCount] = React.useState(1);
  const [fishSize, setFishSize] = React.useState<number | undefined>(28.5);
  const [catchMethod, setCatchMethod] = React.useState<FishingMethod>('LURE');
  const [lureBait, setLureBait] = React.useState('지그헤드 1/2oz + 웜');
  const [catchDate, setCatchDate] = React.useState(new Date().toISOString().split('T')[0]);

  // 출조 시간 분할 필드
  const [startTime, setStartTime] = React.useState('14:00');
  const [endTime, setEndTime] = React.useState('18:30');
  const [catchTime, setCatchTime] = React.useState('16:30'); // 히트 시각
  const [durationMins, setDurationMins] = React.useState<number>(270);

  const [catchLat, setCatchLat] = React.useState<number | undefined>();
  const [catchLng, setCatchLng] = React.useState<number | undefined>();

  // 당시 환경 스냅샷 필드 (풍향, 풍속, 수온, 조류 등)
  const [catchMul, setCatchMul] = React.useState(currentTide?.mulText || '8물');
  const [tideState, setTideState] = React.useState('중들물 (조류 왕성)');
  const [waterTemp, setWaterTemp] = React.useState(currentWaterTemp || 18.0);
  const [windSpeed, setWindSpeed] = React.useState(currentWeather?.windSpeed || 2.5);
  const [windDirection, setWindDirection] = React.useState<number>(currentWeather?.windDirection ?? 315);
  const [simCurrentVel, setSimCurrentVel] = React.useState<number>(currentVelocity);
  const [photoUrl, setPhotoUrl] = React.useState('');
  const [memo, setMemo] = React.useState('');
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [exifNotice, setExifNotice] = React.useState('');

  // 시작/종료 시각 변경 시 총 낚시 시간 자동 갱신
  React.useEffect(() => {
    const mins = calcDurationMinutes(startTime, endTime);
    setDurationMins(mins);
  }, [startTime, endTime]);

  React.useEffect(() => {
    if (editingLog) {
      setFishSpecies(editingLog.fish_species);
      setFishCount(editingLog.fish_count ?? (editingLog.is_hitless ? 0 : 1));
      setFishSize(editingLog.fish_size_cm);
      setCatchMethod(editingLog.catch_method);
      setLureBait(editingLog.lure_bait || '');
      setCatchDate(editingLog.catch_date);
      setCatchTime(editingLog.catch_time);
      setStartTime(editingLog.start_time || '14:00');
      setEndTime(editingLog.end_time || '18:30');
      setDurationMins(editingLog.duration_minutes ?? calcDurationMinutes(editingLog.start_time || '14:00', editingLog.end_time || '18:30'));
      setCatchLat(editingLog.lat);
      setCatchLng(editingLog.lng);
      setCatchMul(editingLog.catch_mul);
      setTideState(editingLog.tide_state);
      setWaterTemp(editingLog.water_temp);
      setWindSpeed(editingLog.wind_speed);
      if (editingLog.wind_direction != null) setWindDirection(editingLog.wind_direction);
      if (editingLog.current_velocity != null) setSimCurrentVel(editingLog.current_velocity);
      setPhotoUrl(editingLog.photo_url || '');
      setMemo(editingLog.memo || '');
      setExifNotice('');
    } else {
      setFishSpecies('우럭');
      setFishCount(1);
      setFishSize(28.5);
      setCatchMethod('LURE');
      setLureBait('지그헤드 1/2oz + 웜');
      setCatchDate(new Date().toISOString().split('T')[0]);
      setStartTime('14:00');
      setEndTime('18:30');
      setCatchTime('16:30');
      setDurationMins(270);
      setCatchLat(spotLat);
      setCatchLng(spotLng);
      if (currentTide) setCatchMul(currentTide.mulText);
      if (currentWaterTemp) setWaterTemp(currentWaterTemp);
      if (currentWeather) {
        setWindSpeed(currentWeather.windSpeed);
        if (currentWeather.windDirection != null) setWindDirection(currentWeather.windDirection);
      }
      if (currentVelocity) setSimCurrentVel(currentVelocity);
      setPhotoUrl('');
      setMemo('');
      setExifNotice('');
    }
  }, [editingLog, currentTide, currentWaterTemp, currentWeather, currentVelocity, spotLat, spotLng, isOpen]);

  if (!isOpen) return null;

  const isHitless = fishCount === 0;

  // 일자/시각/위치 기반 환경 동기화 함수
  const handleAutoSyncEnvironment = async (dStr: string, tStr: string, latVal: number, lngVal: number) => {
    setIsSyncing(true);
    try {
      const syncRes = await syncCatchEnvironment(dStr, tStr, latVal, lngVal);
      setCatchMul(syncRes.catch_mul);
      setTideState(syncRes.tide_state);
      setWaterTemp(syncRes.water_temp);
      setWindSpeed(syncRes.wind_speed);
      if (syncRes.current_velocity != null) {
        setSimCurrentVel(syncRes.current_velocity);
      }
      setExifNotice((prev) => `${prev} 🔄 당시 환경(물때 ${syncRes.catch_mul}, ${syncRes.tide_state}, 수온 ${syncRes.water_temp}°C, 조류 ${formatCurrentVelocity(syncRes.current_velocity || 0, currentUnit)}) 동기화 완료!`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setExifNotice('');

    try {
      const localUrl = URL.createObjectURL(file);
      setPhotoUrl(localUrl);

      const res = await extractExifFromImage(file);
      const notices: string[] = [];

      let targetDate = catchDate;
      let targetTime = catchTime;
      let targetLat = catchLat || spotLat;
      let targetLng = catchLng || spotLng;

      if (res.dateStr) {
        setCatchDate(res.dateStr);
        targetDate = res.dateStr;
        notices.push(`출조일자: ${res.dateStr}`);
      }
      if (res.timeStr) {
        setCatchTime(res.timeStr);
        targetTime = res.timeStr;
        notices.push(`히트시각: ${res.timeStr}`);
      }
      if (res.lat && res.lng) {
        setCatchLat(res.lat);
        setCatchLng(res.lng);
        targetLat = res.lat;
        targetLng = res.lng;
        notices.push(`GPS: ${res.lat.toFixed(5)}, ${res.lng.toFixed(5)}`);
      }

      if (notices.length > 0) {
        setExifNotice(`📸 EXIF 인식 완료 (${notices.join(' | ')})`);
      } else {
        setExifNotice('ℹ️ 사진에 EXIF 메타데이터가 없어 기본 좌표 및 일시를 유지합니다.');
      }

      // 날짜/시각/좌표 기반 환경 자동 동기화 트리거
      await handleAutoSyncEnvironment(targetDate, targetTime, targetLat, targetLng);
    } catch {
      setExifNotice('사진 분석 중 오류가 발생했습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fishSpecies.trim()) {
      alert('잡은 어종 또는 대상 어종을 입력해주세요.');
      return;
    }

    const countNum = Math.max(0, Number(fishCount) || 0);
    const hitlessFlag = countNum === 0;

    onSaveLog({
      spot_id: spotId,
      user_id: 'user-me',
      user_name: '나의 조행기록',
      catch_date: catchDate,
      catch_time: catchTime,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMins,
      fish_species: fishSpecies.trim(),
      fish_size_cm: hitlessFlag ? undefined : (fishSize ? Number(fishSize) : undefined),
      fish_count: countNum,
      is_hitless: hitlessFlag,
      catch_method: catchMethod,
      lure_bait: lureBait,
      catch_mul: catchMul,
      tide_state: tideState,
      water_temp: Number(waterTemp),
      wind_speed: Number(windSpeed),
      wind_direction: windDirection,
      current_velocity: Number(simCurrentVel),
      lat: catchLat,
      lng: catchLng,
      photo_url: photoUrl || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80',
      memo,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg text-white shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{isHitless ? '❌' : '🐟'}</span>
            <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
              {editingLog ? '조과(Catch Log) 수정하기' : '새 조과(Catch Log) 기록하기'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* 꽝/히트 빠른 결과 토글 바 */}
        <div className="mb-4 p-2 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (fishCount === 0) setFishCount(1);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              !isHitless
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span>🐟 손맛 성공 (히트)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFishCount(0);
              setFishSize(undefined);
            }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
              isHitless
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-1 ring-rose-400'
                : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <span>❌ 꽝 / 노피시 (입질 무)</span>
          </button>
        </div>

        {isHitless && (
          <div className="mb-4 p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 leading-relaxed">
            💡 <strong>'꽝' 기록도 소중한 빅데이터입니다!</strong> 당시 바다 상황(수온, 물때, 풍향·풍속, 조류)을 함께 기록해 두시면, 추후 해당 포인트에서 <strong>'고기가 낚이지 않는 조건'을 분석하는 통계 자료</strong>로 매우 유용하게 활용됩니다.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {/* 어종 & 마릿수 & 체장 */}
          <div className="p-3.5 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-slate-200 font-semibold text-xs flex items-center gap-1">
                  <span>🎣 잡은 어종 또는 대상 어종 *</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {isHitless ? '(노렸던 대상 어종을 적어주세요)' : '(실제 히트한 어종)'}
                </span>
              </div>
              <input
                type="text"
                required
                value={fishSpecies}
                onChange={(e) => setFishSpecies(e.target.value)}
                placeholder="감성돔, 우럭, 농어, 볼락, 쭈꾸미 등"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 mb-1 font-medium text-xs">
                  마릿수 (0이면 자동 꽝 판정) *
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    required
                    value={fishCount}
                    onChange={(e) => setFishCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-white font-bold font-mono focus:outline-none ${
                      isHitless ? 'border-rose-500 text-rose-300' : 'border-slate-700 focus:border-cyan-400'
                    }`}
                  />
                  <span className={`text-xs font-bold px-2 py-2 rounded shrink-0 ${isHitless ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}`}>
                    {isHitless ? '0수 (꽝)' : `${fishCount}수`}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium text-xs">
                  최대 체장 (cm)
                </label>
                <input
                  type="number"
                  step="0.5"
                  disabled={isHitless}
                  value={isHitless ? '' : (fishSize ?? '')}
                  onChange={(e) => setFishSize(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder={isHitless ? '꽝 (기록 생략)' : '선택 (예: 35.5)'}
                  className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-white font-mono focus:outline-none ${
                    isHitless ? 'border-slate-800 text-slate-500 bg-slate-950 cursor-not-allowed' : 'border-slate-700 focus:border-cyan-400'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* 출조 일자 & 낚시 시간대 (시작, 종료, 총 낚시시간, 히트 시각) */}
          <div className="p-3.5 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-cyan-300 text-xs flex items-center gap-1.5">
                <Clock size={13} />
                <span>출조 일자 & 낚시 시간대</span>
              </span>
              <span className="text-[11px] font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800/60">
                ⏱️ 총 {formatDuration(durationMins)} 낚시
              </span>
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-medium text-xs">출조 일자 *</label>
              <input
                type="date"
                required
                value={catchDate}
                onChange={(e) => setCatchDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1 text-xs">낚시 시작 시각</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 text-xs">낚시 종료 시각</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800">
              <div>
                <label className="block text-slate-300 mb-1 font-medium text-xs">
                  {isHitless ? '대표 체류 시각 *' : '결정적 히트 시각 *'}
                </label>
                <input
                  type="time"
                  required
                  value={catchTime}
                  onChange={(e) => setCatchTime(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1 font-medium text-xs">총 낚시 시간 (분)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={durationMins}
                  onChange={(e) => setDurationMins(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  placeholder="직접 수정 가능"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* 낚시 장르 & 사용 채비 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium text-xs">낚시 방법</label>
              <select
                value={catchMethod}
                onChange={(e) => setCatchMethod(e.target.value as FishingMethod)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="LURE">루어 낚시</option>
                <option value="SURF">원투 낚시</option>
                <option value="FLOAT">찌 낚시</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium text-xs">사용 채비 / 미끼</label>
              <input
                type="text"
                value={lureBait}
                onChange={(e) => setLureBait(e.target.value)}
                placeholder="지그헤드, 청갯지렁이, 크릴 등"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* 당시 환경 자동 스냅샷 (Environment Snapshot) & 풍향 나침반 포함 */}
          <div className="p-3.5 bg-blue-950/40 border border-blue-800/60 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-blue-300 text-xs flex items-center gap-1.5">
                <Compass size={14} />
                <span>당시 해양·기상 환경 스냅샷 (통계 분석용)</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  handleAutoSyncEnvironment(
                    catchDate,
                    catchTime,
                    catchLat || spotLat,
                    catchLng || spotLng
                  )
                }
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-900/60 hover:bg-blue-800 text-[11px] text-blue-200 transition"
                title="입력된 날짜/시각/좌표로 환경 데이터 다시 가져오기"
              >
                <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
                <span>환경 다시 동기화</span>
              </button>
            </div>

            {/* 풍향(Wind Direction) 나침반 및 각도 선택기 */}
            <div className="p-2.5 rounded-lg bg-slate-900/90 border border-blue-900/50 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-400 flex items-center justify-center transition-transform duration-300"
                    style={{ transform: `rotate(${windDirection}deg)` }}
                    title={`풍향: ${windDirection}°`}
                  >
                    <ArrowUp size={14} className="text-cyan-300" />
                  </div>
                  <div>
                    <span className="text-slate-300 font-medium">당시 풍향: </span>
                    <strong className="text-cyan-300 font-mono font-bold">
                      {windDirection}° ({getCompassDirection(windDirection)})
                    </strong>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400">바람 불어오는 방향</span>
              </div>

              {/* 8방위 빠른 선택 칩 */}
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 pt-1">
                {WIND_DIR_PRESETS.map((p) => (
                  <button
                    key={p.deg}
                    type="button"
                    onClick={() => setWindDirection(p.deg)}
                    className={`px-1 py-1 rounded text-[10px] font-medium transition ${
                      Math.abs(windDirection - p.deg) < 22.5
                        ? 'bg-cyan-500 text-slate-950 font-bold ring-1 ring-cyan-300'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                    }`}
                  >
                    {p.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-slate-400 block mb-0.5">당시 물때</label>
                <input
                  type="text"
                  value={catchMul}
                  onChange={(e) => setCatchMul(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded p-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-0.5">당시 조석 상태</label>
                <input
                  type="text"
                  value={tideState}
                  onChange={(e) => setTideState(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded p-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-0.5">당시 표층 수온 (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={waterTemp}
                  onChange={(e) => setWaterTemp(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-850 border border-slate-700 rounded p-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-0.5">
                  당시 풍속 ({windUnit === 'knot' ? 'knot' : windUnit === 'kmh' ? 'km/h' : 'm/s'})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-850 border border-slate-700 rounded p-1.5 text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="text-slate-400 block mb-0.5">
                  당시 조류 속도 ({currentUnit === 'knot' ? 'knot' : currentUnit === 'cms' ? 'cm/s' : 'm/s'})
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.05"
                    value={simCurrentVel}
                    onChange={(e) => setSimCurrentVel(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-850 border border-slate-700 rounded p-1.5 text-white"
                  />
                  <span className="text-emerald-400 text-xs shrink-0 font-medium font-mono">
                    {formatCurrentVelocity(simCurrentVel, currentUnit)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 조과/현장 사진 & 촬영 메타데이터 */}
          <div className="p-3.5 bg-slate-800/40 border border-slate-700/60 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <label className="font-semibold text-cyan-300 text-xs">
                📸 {isHitless ? '현장 풍경/발판 사진 (선택)' : '조과 인증 사진 (EXIF 자동인식)'}
              </label>
              {(isAnalyzing || isSyncing) && (
                <span className="text-xs text-cyan-400 animate-pulse font-bold">
                  {isAnalyzing ? 'EXIF 분석 중...' : '환경 데이터 동기화 중...'}
                </span>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer text-slate-300"
            />
            {exifNotice && (
              <div className="text-xs text-emerald-400 font-medium bg-emerald-950/60 p-2 rounded border border-emerald-800/60 leading-relaxed">
                {exifNotice}
              </div>
            )}
            {photoUrl && (
              <div className="w-24 h-24 rounded-lg overflow-hidden border border-slate-700 mt-1">
                <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>

          {/* 입질 패턴 & 메모 */}
          <div>
            <label className="block text-slate-300 mb-1 font-medium text-xs">
              {isHitless ? '현장 상황 및 꽝 원인 분석 메모' : '히트 패턴 및 손맛 메모'}
            </label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder={
                isHitless
                  ? "예: 북서풍 8m/s로 너울 심함. 밑걸림 빈번하고 수온이 급락하여 바닥권 활성도 전무했음."
                  : "바닥을 긁는 도중 '툭' 하는 입질. 만조 1시간 전 와류에서 집중 발생."
              }
              className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 text-xs"
            />
          </div>

          {/* 하단 고정 액션 버튼 */}
          <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur -mx-6 -mb-6 p-4 border-t border-slate-800 flex justify-end gap-3 z-10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              취소
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 rounded-lg font-bold shadow-lg transition active:scale-95 ${
                isHitless
                  ? 'bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white shadow-rose-600/20'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-emerald-500/20'
              }`}
            >
              {isHitless ? '❌ 꽝(노피시) 기록 등록' : (editingLog ? '조과 수정 완료' : '조과 등록 완료')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};