import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { CatchLog, CurrentUnit, FishingMethod, TideDayInfo, WeatherData, WindUnit } from '../types';
import { syncCatchEnvironment } from '../utils/catchSync';
import { formatCurrentVelocity, formatWindSpeed } from '../utils/weatherApi';

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
  const [catchTime, setCatchTime] = React.useState('16:30');
  const [catchLat, setCatchLat] = React.useState<number | undefined>();
  const [catchLng, setCatchLng] = React.useState<number | undefined>();

  // 당시 환경 스냅샷 필드 (풍속 및 조류 속도 기본 단위 m/s)
  const [catchMul, setCatchMul] = React.useState(currentTide?.mulText || '8물');
  const [tideState, setTideState] = React.useState('중들물 (조류 왕성)');
  const [waterTemp, setWaterTemp] = React.useState(currentWaterTemp || 18.0);
  const [windSpeed, setWindSpeed] = React.useState(currentWeather?.windSpeed || 2.5);
  const [simCurrentVel, setSimCurrentVel] = React.useState<number>(currentVelocity);
  const [photoUrl, setPhotoUrl] = React.useState('');
  const [memo, setMemo] = React.useState('');
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [exifNotice, setExifNotice] = React.useState('');

  React.useEffect(() => {
    if (editingLog) {
      setFishSpecies(editingLog.fish_species);
      setFishCount(editingLog.fish_count);
      setFishSize(editingLog.fish_size_cm);
      setCatchMethod(editingLog.catch_method);
      setLureBait(editingLog.lure_bait || '');
      setCatchDate(editingLog.catch_date);
      setCatchTime(editingLog.catch_time);
      setCatchLat(editingLog.lat);
      setCatchLng(editingLog.lng);
      setCatchMul(editingLog.catch_mul);
      setTideState(editingLog.tide_state);
      setWaterTemp(editingLog.water_temp);
      setWindSpeed(editingLog.wind_speed);
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
      setCatchTime('16:30');
      setCatchLat(spotLat);
      setCatchLng(spotLng);
      if (currentTide) setCatchMul(currentTide.mulText);
      if (currentWaterTemp) setWaterTemp(currentWaterTemp);
      if (currentWeather) setWindSpeed(currentWeather.windSpeed);
      if (currentVelocity) setSimCurrentVel(currentVelocity);
      setPhotoUrl('');
      setMemo('');
      setExifNotice('');
    }
  }, [editingLog, currentTide, currentWaterTemp, currentWeather, currentVelocity, spotLat, spotLng, isOpen]);

  if (!isOpen) return null;

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
      alert('잡은 어종을 입력해주세요.');
      return;
    }

    onSaveLog({
      spot_id: spotId,
      user_id: 'user-me',
      user_name: '나의 조행기록',
      catch_date: catchDate,
      catch_time: catchTime,
      fish_species: fishSpecies,
      fish_size_cm: fishSize ? Number(fishSize) : undefined,
      fish_count: Number(fishCount),
      catch_method: catchMethod,
      lure_bait: lureBait,
      catch_mul: catchMul,
      tide_state: tideState,
      water_temp: Number(waterTemp),
      wind_speed: Number(windSpeed),
      current_velocity: Number(simCurrentVel),
      lat: catchLat,
      lng: catchLng,
      photo_url: photoUrl || 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=600&q=80',
      memo,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg text-white shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐟</span>
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

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {/* 조과 사진 및 촬영일시 / GPS 자동 추출 */}
          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <label className="font-semibold text-cyan-300 text-xs">
                📸 조과 인증 사진 (날짜 · 시각 · GPS 좌표 자동 인식)
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

          {/* 출조 날짜 & 잡은 시각 & 동기화 버튼 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">출조 일자 *</label>
              <input
                type="date"
                required
                value={catchDate}
                onChange={(e) => setCatchDate(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">히트 시각 *</label>
              <input
                type="time"
                required
                value={catchTime}
                onChange={(e) => setCatchTime(e.target.value)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* GPS 히트 좌표 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium text-xs">
                히트 위치 위도(Lat)
              </label>
              <input
                type="number"
                step="any"
                value={catchLat ?? ''}
                onChange={(e) => setCatchLat(e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="사진 EXIF 또는 포인트 좌표"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium text-xs">
                히트 위치 경도(Lng)
              </label>
              <input
                type="number"
                step="any"
                value={catchLng ?? ''}
                onChange={(e) => setCatchLng(e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="사진 EXIF 또는 포인트 좌표"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* 어종 & 마릿수 & 체장 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">잡은 어종 *</label>
              <input
                type="text"
                required
                value={fishSpecies}
                onChange={(e) => setFishSpecies(e.target.value)}
                placeholder="감성돔, 우럭 등"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">체장 (cm)</label>
              <input
                type="number"
                step="0.5"
                value={fishSize ?? ''}
                onChange={(e) => setFishSize(e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="선택 (예: 35)"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">마릿수 *</label>
              <input
                type="number"
                min="1"
                required
                value={fishCount}
                onChange={(e) => setFishCount(parseInt(e.target.value))}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* 낚시 장르 & 사용 채비 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">낚시 방법</label>
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
              <label className="block text-slate-300 mb-1 font-medium">사용 채비 / 미끼</label>
              <input
                type="text"
                value={lureBait}
                onChange={(e) => setLureBait(e.target.value)}
                placeholder="지그헤드, 청갯지렁이, 크릴 등"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* 당시 환경 자동 스냅샷 (Environment Snapshot) & 수동 재동기화 버튼 */}
          <div className="p-3.5 bg-blue-950/40 border border-blue-800/60 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-blue-300 text-xs flex items-center gap-1.5">
                🌡️ 당시 환경 스냅샷 (히트 시점 데이터 연동)
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
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-slate-400 block mb-0.5">당시 물때</label>
                <input
                  type="text"
                  value={catchMul}
                  onChange={(e) => setCatchMul(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-0.5">당시 조석 상태</label>
                <input
                  type="text"
                  value={tideState}
                  onChange={(e) => setTideState(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-0.5">당시 표층 수온 (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={waterTemp}
                  onChange={(e) => setWaterTemp(parseFloat(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
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
                  onChange={(e) => setWindSpeed(parseFloat(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-white"
                  />
                  <span className="text-emerald-400 text-xs shrink-0 font-medium">
                    {formatCurrentVelocity(simCurrentVel, currentUnit)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-medium">히트 패턴 및 메모</label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="바닥을 긁는 도중 '툭' 하는 입질. 만조 1시간 전 와류에서 집중 발생."
              className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* 버튼: 모바일 화면에서 하단에 고정(sticky)되어 항상 저장/취소 가능하도록 개선 */}
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
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold shadow-lg shadow-emerald-500/20 transition active:scale-95"
            >
              {editingLog ? '조과 수정 완료' : '조과 등록 완료'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
