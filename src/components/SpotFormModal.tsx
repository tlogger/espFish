import React from 'react';
import type { FishingMethod, FishingSpot, SpotType } from '../types';
import { getCompassDirection } from '../utils/weatherApi';

interface SpotFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (spotData: {
    name: string;
    spot_type: SpotType;
    lat: number;
    lng: number;
    navi_name?: string;
    navi_url?: string;
    directions: string;
    photo_urls: string[];
    fishing_methods: FishingMethod[];
    target_species: string[];
    best_tides: string[];
    best_times: string[];
    description: string;
    casting_start_deg?: number;
    casting_end_deg?: number;
    casting_directions?: string[];
    is_public: boolean;
  }) => void;
  editingSpot?: FishingSpot | null;
  initialLat?: number;
  initialLng?: number;
  extractExifFromImage: (file: File) => Promise<{ lat?: number; lng?: number; dateTime?: string }>;
}

export const SpotFormModal: React.FC<SpotFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  editingSpot,
  initialLat,
  initialLng,
  extractExifFromImage,
}) => {
  const [name, setName] = React.useState('');
  const [spotType, setSpotType] = React.useState<SpotType>('BREAKWATER');
  const [lat, setLat] = React.useState<number>(37.2541);
  const [lng, setLng] = React.useState<number>(126.4982);
  const [naviName, setNaviName] = React.useState('');
  const [naviUrl, setNaviUrl] = React.useState('');
  const [directions, setDirections] = React.useState('');
  const [photoUrls, setPhotoUrls] = React.useState<string[]>([]);
  const [selectedMethods, setSelectedMethods] = React.useState<FishingMethod[]>(['LURE']);
  const [targetSpeciesText, setTargetSpeciesText] = React.useState('우럭, 광어');
  const [bestTidesText, setBestTidesText] = React.useState('7물, 8물 (사리), 중들물');
  const [bestTimesText, setBestTimesText] = React.useState('새벽 해창, 일몰 피딩');
  const [description, setDescription] = React.useState('');
  const [hasCastingRange, setHasCastingRange] = React.useState(true);
  const [castingStartDeg, setCastingStartDeg] = React.useState(45);
  const [castingEndDeg, setCastingEndDeg] = React.useState(135);
  const [isPublic, setIsPublic] = React.useState(true);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [exifSuccessMsg, setExifSuccessMsg] = React.useState('');

  // GPS 추출 확인 프롬프트 상태
  const [pendingGps, setPendingGps] = React.useState<{ lat: number; lng: number } | null>(null);

  React.useEffect(() => {
    if (editingSpot) {
      setName(editingSpot.name);
      setSpotType(editingSpot.spot_type);
      setLat(editingSpot.lat);
      setLng(editingSpot.lng);
      setNaviName(editingSpot.navi_name || '');
      setNaviUrl(editingSpot.navi_url || '');
      setDirections(editingSpot.directions || '');
      setPhotoUrls(editingSpot.photo_urls || []);
      setSelectedMethods(editingSpot.fishing_methods || ['LURE']);
      setTargetSpeciesText(editingSpot.target_species?.join(', ') || '');
      setBestTidesText(editingSpot.best_tides?.join(', ') || '');
      setBestTimesText(editingSpot.best_times?.join(', ') || '');
      setDescription(editingSpot.description || '');

      // 캐스팅 공략 각도 복원 (신규 각도 또는 레거시 8방위 변환)
      if (editingSpot.casting_start_deg !== undefined && editingSpot.casting_end_deg !== undefined) {
        setHasCastingRange(true);
        setCastingStartDeg(editingSpot.casting_start_deg);
        setCastingEndDeg(editingSpot.casting_end_deg);
      } else if (editingSpot.casting_directions && editingSpot.casting_directions.length > 0 && !editingSpot.casting_directions.includes('ALL')) {
        const legacyMap: Record<string, [number, number]> = {
          N: [315, 45], NE: [0, 90], E: [45, 135], SE: [90, 180],
          S: [135, 225], SW: [180, 270], W: [225, 315], NW: [270, 360]
        };
        const first = editingSpot.casting_directions[0];
        const mapped = legacyMap[first] || [45, 135];
        setHasCastingRange(true);
        setCastingStartDeg(mapped[0]);
        setCastingEndDeg(mapped[1]);
      } else {
        setHasCastingRange(false);
        setCastingStartDeg(45);
        setCastingEndDeg(135);
      }

      setIsPublic(editingSpot.is_public ?? true);
      setExifSuccessMsg('');
      setPendingGps(null);
    } else {
      if (initialLat) setLat(initialLat);
      if (initialLng) setLng(initialLng);
      setName('');
      setSpotType('BREAKWATER');
      setNaviName('');
      setNaviUrl('');
      setDirections('');
      setPhotoUrls([]);
      setSelectedMethods(['LURE']);
      setTargetSpeciesText('우럭, 광어');
      setBestTidesText('7물, 8물 (사리), 중들물');
      setBestTimesText('새벽 해창, 일몰 피딩');
      setDescription('');
      setHasCastingRange(true);
      setCastingStartDeg(45);
      setCastingEndDeg(135);
      setIsPublic(true);
      setExifSuccessMsg('');
      setPendingGps(null);
    }
  }, [editingSpot, initialLat, initialLng, isOpen]);

  if (!isOpen) return null;

  const handleMethodToggle = (method: FishingMethod) => {
    if (selectedMethods.includes(method)) {
      if (selectedMethods.length > 1) {
        setSelectedMethods(selectedMethods.filter((m) => m !== method));
      }
    } else {
      setSelectedMethods([...selectedMethods, method]);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsExtracting(true);
    setExifSuccessMsg('');
    setPendingGps(null);

    try {
      // 1. 브라우저 로컬 미리보기 생성
      const localUrl = URL.createObjectURL(file);
      setPhotoUrls((prev) => [...prev, localUrl]);

      // 2. EXIF GPS 분석
      const res = await extractExifFromImage(file);
      if (res.lat && res.lng) {
        setPendingGps({ lat: res.lat, lng: res.lng });
        setExifSuccessMsg(`📍 사진에서 GPS 좌표(위도 ${res.lat.toFixed(5)}, 경도 ${res.lng.toFixed(5)})가 감지되었습니다!`);
      } else {
        setExifSuccessMsg('ℹ️ 사진에 GPS 정보가 없어 현재 좌표를 유지합니다.');
      }
    } catch {
      setExifSuccessMsg('사진을 분석하는 중 오류가 발생했습니다.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleApplyPendingGps = (apply: boolean) => {
    if (apply && pendingGps) {
      setLat(pendingGps.lat);
      setLng(pendingGps.lng);
      setExifSuccessMsg(`✅ 포인트 좌표가 사진의 GPS(${pendingGps.lat.toFixed(5)}, ${pendingGps.lng.toFixed(5)})로 업데이트되었습니다.`);
    } else {
      setExifSuccessMsg('기존 좌표를 그대로 유지합니다.');
    }
    setPendingGps(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('포인트 이름을 입력해주세요.');
      return;
    }

    const species = targetSpeciesText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const tides = bestTidesText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const times = bestTimesText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    onSubmit({
      name,
      spot_type: spotType,
      lat: Number(lat),
      lng: Number(lng),
      navi_name: naviName.trim() || undefined,
      navi_url: naviUrl.trim() || undefined,
      directions,
      photo_urls: photoUrls.length > 0 ? photoUrls : ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80'],
      fishing_methods: selectedMethods,
      target_species: species,
      best_tides: tides,
      best_times: times,
      description,
      casting_start_deg: hasCastingRange ? Math.round(castingStartDeg) % 360 : undefined,
      casting_end_deg: hasCastingRange ? Math.round(castingEndDeg) % 360 : undefined,
      is_public: isPublic,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl text-white shadow-2xl p-6 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎣</span>
            <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              {editingSpot ? '낚시 포인트 수정' : '새 낚시 포인트 등록'}
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
          {/* 현장 사진 업로드 & EXIF GPS 감지 및 사용자 확인 */}
          <div className="p-3.5 bg-cyan-950/40 border border-cyan-800/60 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                📸 현장 사진 업로드 (스마트폰 GPS 자동 분석)
              </span>
              {isExtracting && <span className="text-xs text-cyan-400 animate-pulse font-bold">EXIF 분석 중...</span>}
            </div>
            <p className="text-xs text-slate-300">
              스마트폰으로 현장에서 촬영한 사진을 선택하면 <strong>EXIF GPS를 즉시 추출</strong>하여 좌표 변경 여부를 안내합니다.
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 cursor-pointer text-slate-300"
            />

            {/* GPS 추출 성공 시 사용자 승인 질문 박스 */}
            {pendingGps && (
              <div className="p-3 bg-amber-950/80 border border-amber-500/70 rounded-xl space-y-2 text-amber-200">
                <div className="font-bold flex items-center gap-1.5 text-xs text-amber-300">
                  <span>📍 사진의 GPS 위치로 포인트 좌표를 업데이트할까요?</span>
                </div>
                <div className="text-xs font-mono bg-black/40 p-2 rounded text-slate-200">
                  위도(Lat): {pendingGps.lat.toFixed(6)} / 경도(Lng): {pendingGps.lng.toFixed(6)}
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => handleApplyPendingGps(false)}
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                  >
                    아니오 (현재 좌표 유지)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPendingGps(true)}
                    className="px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold"
                  >
                    예, 이 좌표로 변경
                  </button>
                </div>
              </div>
            )}

            {exifSuccessMsg && !pendingGps && (
              <div className="text-xs text-emerald-400 font-medium bg-emerald-950/50 p-2 rounded border border-emerald-800/60">
                {exifSuccessMsg}
              </div>
            )}

            {/* 업로드된 사진 미리보기 */}
            {photoUrls.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pt-1">
                {photoUrls.map((url, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-700">
                    <img src={url} alt="upload" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPhotoUrls(photoUrls.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center hover:bg-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 포인트 명칭 및 지형 구분 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">포인트 이름 *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 영흥도 진두선착장 우측 갯바위"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">지형 구분 *</label>
              <select
                value={spotType}
                onChange={(e) => setSpotType(e.target.value as SpotType)}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="ROCK">갯바위 (Rock)</option>
                <option value="BREAKWATER">방파제 / 석축 (Breakwater)</option>
                <option value="BEACH">해변 / 백사장 (Beach)</option>
                <option value="PIER">선착장 / 기타 (Pier)</option>
              </select>
            </div>
          </div>

          {/* 위경도 좌표 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">위도 (Lat) *</label>
              <input
                type="number"
                step="any"
                required
                value={lat}
                onChange={(e) => setLat(parseFloat(e.target.value))}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">경도 (Lng) *</label>
              <input
                type="number"
                step="any"
                required
                value={lng}
                onChange={(e) => setLng(parseFloat(e.target.value))}
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* 네비 위치 지정 (String) & 현장 네비 위치 URL */}
          <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl space-y-2">
            <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
              <span>🚗 네비게이션 연동 설정 (카카오/네이버지도 길찾기)</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-300 text-xs mb-1">
                  네비 위치 지정 지명 (선택)
                </label>
                <input
                  type="text"
                  value={naviName}
                  onChange={(e) => setNaviName(e.target.value)}
                  placeholder="예: 진두선착장 공영주차장 (미입력시 포인트명 사용)"
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-xs mb-1">
                  현장 네비 위치 URL (선택)
                </label>
                <input
                  type="url"
                  value={naviUrl}
                  onChange={(e) => setNaviUrl(e.target.value)}
                  placeholder="예: https://kko.to/... 또는 네이버 지도 공유 URL"
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              * 네비 위치 지명을 입력하시면 카카오/네이버 길찾기 시 해당 주차장 명칭으로 안내됩니다.
            </p>
          </div>

          {/* 찾아가는 길 (Directions) */}
          <div>
            <label className="block text-slate-300 mb-1 font-medium">
              🚶 도보 진입로 & 진입 주의구간
            </label>
            <textarea
              rows={2}
              value={directions}
              onChange={(e) => setDirections(e.target.value)}
              placeholder="예: 공영주차장 주차 후 붉은 등대 방면 테트라포드 도보 5분 진입 (장화 착용 요망)"
              className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* 낚시 방법 선택 */}
          <div>
            <label className="block text-slate-300 mb-1.5 font-medium">주요 낚시 방법 (복수 선택 가능)</label>
            <div className="flex gap-2">
              {[
                { id: 'LURE', label: '루어 (Lure)' },
                { id: 'SURF', label: '원투 (Surf)' },
                { id: 'FLOAT', label: '찌낚시 (Float)' },
              ].map((m) => {
                const isSelected = selectedMethods.includes(m.id as FishingMethod);
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => handleMethodToggle(m.id as FishingMethod)}
                    className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    {isSelected ? '✓ ' : ''}{m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 대상어종 & 선호 물때 & 시간대 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">대상 어종 (쉼표 구분)</label>
              <input
                type="text"
                value={targetSpeciesText}
                onChange={(e) => setTargetSpeciesText(e.target.value)}
                placeholder="우럭, 감성돔, 농어, 무늬오징어"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1 font-medium">잘 잡히는 물때 (선호 물때)</label>
              <input
                type="text"
                value={bestTidesText}
                onChange={(e) => setBestTidesText(e.target.value)}
                placeholder="7물~9물 (사리), 초들물~중들물"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-medium">잘 잡히는 시간대 & 공략 메모</label>
            <input
              type="text"
              value={bestTimesText}
              onChange={(e) => setBestTimesText(e.target.value)}
              placeholder="새벽 해창(05:00~07:00), 해질녘 골든타임"
              className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400 mb-2"
            />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="수심 7~9m, 30m 전방 수중여 넘겨서 호핑 액션에 반응 좋음"
              className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* 캐스팅 공략 각도 레이더뷰 지정 (방위 대신 시작각~끝각 유효 범위 지정) */}
          <div className="p-3.5 bg-slate-800/60 border border-slate-700/80 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-slate-200 font-bold text-xs flex items-center gap-1.5">
                <span>🎯 캐스팅 방향</span>
              </label>
              <button
                type="button"
                onClick={() => setHasCastingRange(!hasCastingRange)}
                className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition cursor-pointer ${
                  hasCastingRange
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                    : 'bg-slate-750 hover:bg-slate-700 text-slate-400 border border-slate-650'
                }`}
              >
                {hasCastingRange ? '✓ 사용' : '미사용'}
              </button>
            </div>

            {hasCastingRange ? (
              <div className="space-y-3">
                {/* 레이더 뷰 SVG 및 실시간 시각화 */}
                {(() => {
                  const cx = 90;
                  const cy = 90;
                  const r = 70;
                  const span = castingEndDeg >= castingStartDeg
                    ? castingEndDeg - castingStartDeg
                    : 360 - castingStartDeg + castingEndDeg;

                  const rad1 = (castingStartDeg * Math.PI) / 180;
                  const rad2 = (castingEndDeg * Math.PI) / 180;
                  const x1 = cx + r * Math.sin(rad1);
                  const y1 = cy - r * Math.cos(rad1);
                  const x2 = cx + r * Math.sin(rad2);
                  const y2 = cy - r * Math.cos(rad2);
                  const largeArcFlag = span > 180 ? 1 : 0;
                  const sectorPath = `M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;

                  return (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 bg-slate-900/80 p-3 rounded-xl border border-slate-750">
                      {/* SVG 레이더 원형 뷰 (시작각, 종료각 텍스트 내부 통합) */}
                      <div className="relative shrink-0 flex items-center justify-center">
                        <svg
                          width="180"
                          height="180"
                          viewBox="0 0 180 180"
                          className="bg-slate-950 rounded-full border-2 border-slate-700 shadow-inner select-none cursor-crosshair"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const px = e.clientX - rect.left;
                            const py = e.clientY - rect.top;
                            const svgX = (px / rect.width) * 180;
                            const svgY = (py / rect.height) * 180;
                            const dx = svgX - cx;
                            const dy = svgY - cy;
                            const rad = Math.atan2(dx, -dy);
                            let deg = Math.round((rad * 180) / Math.PI);
                            if (deg < 0) deg += 360;
                            deg = deg % 360;

                            const d1 = Math.min(Math.abs(deg - castingStartDeg), 360 - Math.abs(deg - castingStartDeg));
                            const d2 = Math.min(Math.abs(deg - castingEndDeg), 360 - Math.abs(deg - castingEndDeg));
                            if (d1 <= d2) {
                              setCastingStartDeg(deg);
                            } else {
                              setCastingEndDeg(deg);
                            }
                          }}
                        >
                          <defs>
                            <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
                              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.15" />
                            </radialGradient>
                          </defs>

                          {/* 거리별 동심원 (30m, 60m, 100m) */}
                          <circle cx={cx} cy={cy} r="23" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
                          <circle cx={cx} cy={cy} r="46" fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3,3" />
                          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#475569" strokeWidth="1.2" />

                          {/* 십자 방위선 */}
                          <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#334155" strokeWidth="1" />
                          <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#334155" strokeWidth="1" />

                          {/* 방위 텍스트 */}
                          <text x={cx} y="14" fill="#38bdf8" fontSize="10" fontWeight="bold" textAnchor="middle">N</text>
                          <text x="170" y={cy + 3} fill="#94a3b8" fontSize="9" textAnchor="end">E</text>
                          <text x={cx} y="174" fill="#94a3b8" fontSize="9" textAnchor="middle">S</text>
                          <text x="10" y={cy + 3} fill="#94a3b8" fontSize="9" textAnchor="start">W</text>

                          {/* 유효 캐스팅 부채꼴 섹터 */}
                          <path
                            d={sectorPath}
                            fill="url(#radarGlow)"
                            stroke="#06b6d4"
                            strokeWidth="1.8"
                          />

                          {/* 시작각 핸들 (에메랄드 S) */}
                          <circle cx={x1} cy={y1} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                          {/* 끝각 핸들 (시안 E) */}
                          <circle cx={x2} cy={y2} r="5" fill="#06b6d4" stroke="#ffffff" strokeWidth="1.5" />

                          {/* 시작 각도 & 종료 각도 레이더 표시 내부에 표기 */}
                          <text x={cx} y={cy - 6} fill="#10b981" fontSize="11" fontWeight="bold" textAnchor="middle">
                            {castingStartDeg}°
                          </text>
                          <text x={cx} y={cy + 12} fill="#06b6d4" fontSize="11" fontWeight="bold" textAnchor="middle">
                            ~ {castingEndDeg}°
                          </text>
                        </svg>
                      </div>
                    </div>
                  );
                })()}

                {/* 슬라이더 컨트롤 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-emerald-400 font-medium">시작 {castingStartDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={castingStartDeg}
                      onChange={(e) => setCastingStartDeg(Number(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-cyan-400 font-medium">종료 {castingEndDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={castingEndDeg}
                      onChange={(e) => setCastingEndDeg(Number(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 빠른 방향 프리셋: 동, 서, 남, 북 및 60, 90, 120 극단적 단순화 */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 font-medium">⚡ 빠른 프리셋</span>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {[
                      { label: '동(E)', start: 45, end: 135 },
                      { label: '서(W)', start: 225, end: 315 },
                      { label: '남(S)', start: 135, end: 225 },
                      { label: '북(N)', start: 315, end: 45 },
                    ].map((p, idx) => (
                      <button
                        type="button"
                        key={`cardinal-${idx}`}
                        onClick={() => {
                          setCastingStartDeg(p.start);
                          setCastingEndDeg(p.end);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 text-xs font-bold transition"
                      >
                        {p.label}
                      </button>
                    ))}
                    <span className="text-slate-600 px-1">|</span>
                    {[
                      { label: '60°', delta: 30 },
                      { label: '90°', delta: 45 },
                      { label: '120°', delta: 60 },
                    ].map((a, idx) => (
                      <button
                        type="button"
                        key={`angle-${idx}`}
                        onClick={() => {
                          const span = castingEndDeg >= castingStartDeg
                            ? castingEndDeg - castingStartDeg
                            : 360 - castingStartDeg + castingEndDeg;
                          const center = (castingStartDeg + span / 2) % 360;
                          const s = (center - a.delta + 360) % 360;
                          const e = (center + a.delta) % 360;
                          setCastingStartDeg(s);
                          setCastingEndDeg(e);
                        }}
                        className="px-2.5 py-1 bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 rounded-md border border-cyan-800/60 text-xs font-bold transition"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-1">
                공략 각도가 설정되지 않았습니다. 특정 투척 방향 제한 없이 기본 포인트로 저장됩니다.
              </p>
            )}
          </div>

          {/* 공개 여부 설정 */}
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
            <div>
              <span className="font-medium text-slate-200">전체 공개 포인트로 등록</span>
              <p className="text-xs text-slate-400">체크 해제 시 나만 볼 수 있는 비공개 비밀 포인트가 됩니다.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
            </label>
          </div>

          {/* 버튼: 플로팅(sticky)되지 않고 모달 창 콘텐츠 가장 아래에 자연스럽게 위치 */}
          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold shadow-lg shadow-cyan-500/20 transition active:scale-95 cursor-pointer"
            >
              {editingSpot ? '수정' : '포인트 저장하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
