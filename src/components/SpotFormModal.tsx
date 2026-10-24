import React from 'react';
import type { FishingMethod, FishingSpot, SpotType, SweetSpot } from '../types';

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
    use_sweet_spot?: boolean;
    sweet_spots?: SweetSpot[];
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

  // 5-7. Sweet Spot 기능 (default uncheck)
  const [useSweetSpot, setUseSweetSpot] = React.useState(false);
  const [sweetSpots, setSweetSpots] = React.useState<SweetSpot[]>([]);
  const [activeSweetSpotIdx, setActiveSweetSpotIdx] = React.useState<number>(0);
  const [radarMode, setRadarMode] = React.useState<'sweetspot' | 'casting'>('sweetspot');
  const isPointerDownRef = React.useRef(false);

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
      setDirections(editingSpot.directions || '');
      // Unsplash 기본 샘플 이미지 필터링 (사용자가 직접 올리지 않은 기본 사진 제외)
      setPhotoUrls(
        (editingSpot.photo_urls || []).filter((u) => !u.includes('images.unsplash.com'))
      );
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

      // 스위트 스팟 복원
      setUseSweetSpot(Boolean(editingSpot.use_sweet_spot));
      setSweetSpots(editingSpot.sweet_spots || []);

      setIsPublic(editingSpot.is_public ?? true);
      setExifSuccessMsg('');
      setPendingGps(null);
    } else {
      if (initialLat) setLat(initialLat);
      if (initialLng) setLng(initialLng);
      setName('');
      setSpotType('BREAKWATER');
      setNaviName('');
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
      setUseSweetSpot(false);
      setSweetSpots([]);
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

  // 스위트 스팟 관리 헬퍼
  const handleToggleSweetSpot = (checked: boolean) => {
    setUseSweetSpot(checked);
    if (checked && sweetSpots.length === 0) {
      setSweetSpots([
        {
          id: `ss-${Date.now()}-1`,
          direction: 90,
          distance: 35,
          radius: 5,
          memo: '',
        },
      ]);
      setActiveSweetSpotIdx(0);
      setRadarMode('sweetspot');
    }
  };

  const handleAddSweetSpot = () => {
    if (sweetSpots.length >= 3) return;
    const newIdx = sweetSpots.length;
    setSweetSpots((prev) => [
      ...prev,
      {
        id: `ss-${Date.now()}-${prev.length + 1}`,
        direction: (prev[prev.length - 1]?.direction + 45) % 360 || 90,
        distance: 40,
        radius: 5,
        memo: '',
      },
    ]);
    setActiveSweetSpotIdx(newIdx);
    setRadarMode('sweetspot');
  };

  const handleUpdateSweetSpot = (index: number, updates: Partial<SweetSpot>) => {
    setSweetSpots((prev) =>
      prev.map((ss, i) => (i === index ? { ...ss, ...updates } : ss))
    );
  };

  const handleDeleteSweetSpot = (index: number) => {
    setSweetSpots((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (activeSweetSpotIdx >= next.length) {
        setActiveSweetSpotIdx(Math.max(0, next.length - 1));
      }
      return next;
    });
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
      directions,
      photo_urls: photoUrls, // 파일 미선택 시 빈 배열 유지 (5-1 버그 수정)
      fishing_methods: selectedMethods,
      target_species: species,
      best_tides: tides,
      best_times: times,
      description,
      casting_start_deg: hasCastingRange ? Math.round(castingStartDeg) % 360 : undefined,
      casting_end_deg: hasCastingRange ? Math.round(castingEndDeg) % 360 : undefined,
      is_public: isPublic,
      use_sweet_spot: useSweetSpot,
      sweet_spots: useSweetSpot ? sweetSpots : undefined,
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
              사진의 EXIF로부터 GPS 추출합니다
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
                <option value="SEAWALL">석축 (Seawall)</option>
                <option value="BREAKWATER">방파제 (Breakwater)</option>
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

          {/* 길찾기 & 도보 진입로/주차 안내 통합 (요구사항 5-3, 5-4) */}
          <div className="p-3.5 bg-slate-800/60 border border-slate-700 rounded-xl space-y-2.5">
            <div className="text-xs font-bold text-amber-300">
              <span>길찾기</span>
            </div>
            <div>
              <label className="block text-slate-300 text-xs mb-1 font-medium">
                길찾기 지명(선택)
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
              <label className="block text-slate-300 text-xs mb-1 font-medium">
                도보 진입로 & 진입 주의구간
              </label>
              <textarea
                rows={2}
                value={directions}
                onChange={(e) => setDirections(e.target.value)}
                placeholder="예: 공영주차장 주차 후 붉은 등대 방면 테트라포드 도보 5분 진입 (장화 착용 요망)"
                className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 text-xs"
              />
            </div>
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

          {/* 🎯 통합 [캐스팅 방향 & 스위트 스팟 HUD] 단일 카드 */}
          <div className="p-3.5 bg-slate-800/80 border border-slate-700/80 rounded-2xl space-y-3.5 shadow-lg">
            {/* 상단 통합 헤더: 제목 + 토글 버튼들 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-750 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🎯</span>
                <div>
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <span>캐스팅 & 스위트 스팟</span>
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    레이더 뷰를 직접 터치/드래그하여 핫스팟과 공략 구역을 지정하세요
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* 캐스팅 구역 토글 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    (document.activeElement as HTMLElement)?.blur();
                    setHasCastingRange(!hasCastingRange);
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    hasCastingRange
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}
                >
                  {hasCastingRange ? '✓ 캐스팅구역' : '캐스팅구역 ✕'}
                </button>

                {/* 스위트 스팟 토글 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    (document.activeElement as HTMLElement)?.blur();
                    handleToggleSweetSpot(!useSweetSpot);
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer ${
                    useSweetSpot
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}
                >
                  {useSweetSpot ? '✓ 스위트스팟' : '스위트스팟 ✕'}
                </button>
              </div>
            </div>

            {/* 레이더 인터랙션 모드 셀렉터 (스위트 스팟과 캐스팅 구역이 모두 켜져 있을 때 직관 전환) */}
            {(hasCastingRange || useSweetSpot) && (
              <div className="flex items-center justify-between bg-slate-900/90 p-1 rounded-xl border border-slate-750 text-xs">
                {useSweetSpot && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      (document.activeElement as HTMLElement)?.blur();
                      setRadarMode('sweetspot');
                    }}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      radarMode === 'sweetspot'
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'text-amber-400/80 hover:text-amber-300'
                    }`}
                  >
                    <span>🎯 스위트 스팟 터치 입력</span>
                    {sweetSpots.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-amber-950/40 rounded-full">
                        #{activeSweetSpotIdx + 1}
                      </span>
                    )}
                  </button>
                )}

                {hasCastingRange && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      (document.activeElement as HTMLElement)?.blur();
                      setRadarMode('casting');
                    }}
                    className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      radarMode === 'casting'
                        ? 'bg-cyan-500 text-slate-950 shadow'
                        : 'text-cyan-400/80 hover:text-cyan-300'
                    }`}
                  >
                    <span>📐 캐스팅 부채꼴 구역</span>
                  </button>
                )}
              </div>
            )}

            {/* 대형 인터랙티브 레이더 뷰 (보는 곳이 곧 누르는 곳) */}
            {(() => {
              const cx = 100;
              const cy = 100;
              const r = 80;
              const maxDist = 150; // 최대 거리 150m 기준

              const span =
                castingEndDeg >= castingStartDeg
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

              // 레이더 포인터 터치/드래그 공통 계산기
              const processPointerCoord = (e: React.PointerEvent<SVGSVGElement>) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const px = e.clientX - rect.left;
                const py = e.clientY - rect.top;
                const svgX = (px / rect.width) * 200;
                const svgY = (py / rect.height) * 200;
                const dx = svgX - cx;
                const dy = svgY - cy;

                let deg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
                if (deg < 0) deg += 360;
                deg = deg % 360;

                const distPx = Math.sqrt(dx * dx + dy * dy);
                const distMeter = Math.min(
                  maxDist,
                  Math.max(1, Math.round((distPx / r) * maxDist))
                );

                if (radarMode === 'sweetspot' && useSweetSpot && sweetSpots.length > 0) {
                  handleUpdateSweetSpot(activeSweetSpotIdx, {
                    direction: deg,
                    distance: distMeter,
                  });
                } else if (radarMode === 'casting' && hasCastingRange) {
                  const d1 = Math.min(
                    Math.abs(deg - castingStartDeg),
                    360 - Math.abs(deg - castingStartDeg)
                  );
                  const d2 = Math.min(
                    Math.abs(deg - castingEndDeg),
                    360 - Math.abs(deg - castingEndDeg)
                  );
                  if (d1 <= d2) {
                    setCastingStartDeg(deg);
                  } else {
                    setCastingEndDeg(deg);
                  }
                }
              };

              return (
                <div className="flex flex-col items-center justify-center gap-2 bg-slate-900/90 p-3 rounded-2xl border border-slate-750">
                  <div className="relative shrink-0 flex items-center justify-center">
                    <svg
                      width="200"
                      height="200"
                      viewBox="0 0 200 200"
                      className="bg-slate-950 rounded-full border-2 border-slate-700 shadow-2xl select-none cursor-crosshair touch-none"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        (document.activeElement as HTMLElement)?.blur();
                        isPointerDownRef.current = true;
                        (e.currentTarget as Element).setPointerCapture(e.pointerId);
                        processPointerCoord(e);
                      }}
                      onPointerMove={(e) => {
                        if (!isPointerDownRef.current) return;
                        processPointerCoord(e);
                      }}
                      onPointerUp={(e) => {
                        isPointerDownRef.current = false;
                        try {
                          (e.currentTarget as Element).releasePointerCapture(e.pointerId);
                        } catch {}
                      }}
                      onPointerCancel={() => {
                        isPointerDownRef.current = false;
                      }}
                    >
                      <defs>
                        <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.15" />
                        </radialGradient>
                      </defs>

                      {/* 거리별 동심원 (30m, 60m, 100m, 150m) */}
                      <circle cx={cx} cy={cy} r={(30 / maxDist) * r} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="2,2" />
                      <circle cx={cx} cy={cy} r={(60 / maxDist) * r} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3,3" />
                      <circle cx={cx} cy={cy} r={(100 / maxDist) * r} fill="none" stroke="#334155" strokeWidth="1" strokeDasharray="3,3" />
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#475569" strokeWidth="1.2" />

                      {/* 동심원 거리 라벨 */}
                      <text x={cx + 2} y={cy - (30 / maxDist) * r + 8} fill="#64748b" fontSize="7">30m</text>
                      <text x={cx + 2} y={cy - (60 / maxDist) * r + 8} fill="#64748b" fontSize="7">60m</text>
                      <text x={cx + 2} y={cy - (100 / maxDist) * r + 8} fill="#64748b" fontSize="7">100m</text>
                      <text x={cx + 2} y={cy - r + 9} fill="#94a3b8" fontSize="8" fontWeight="bold">150m</text>

                      {/* 십자 방위선 */}
                      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#334155" strokeWidth="1" />
                      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="#334155" strokeWidth="1" />

                      {/* 방위 텍스트 */}
                      <text x={cx} y="14" fill="#38bdf8" fontSize="11" fontWeight="bold" textAnchor="middle">N</text>
                      <text x="188" y={cy + 4} fill="#94a3b8" fontSize="10" textAnchor="end">E</text>
                      <text x={cx} y="192" fill="#94a3b8" fontSize="10" textAnchor="middle">S</text>
                      <text x="12" y={cy + 4} fill="#94a3b8" fontSize="10" textAnchor="start">W</text>

                      {/* 유효 캐스팅 부채꼴 섹터 */}
                      {hasCastingRange && (
                        <g>
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
                        </g>
                      )}

                      {/* 스위트 스팟 오버레이 마커 렌더링 */}
                      {useSweetSpot &&
                        sweetSpots.map((ss, idx) => {
                          const isSelected = idx === activeSweetSpotIdx;
                          const ssDistRatio = (Math.min(ss.distance, maxDist) / maxDist) * r;
                          const ssRad = (ss.direction * Math.PI) / 180;
                          const ssX = cx + ssDistRatio * Math.sin(ssRad);
                          const ssY = cy - ssDistRatio * Math.cos(ssRad);
                          const ssR = Math.max((ss.radius / maxDist) * r, 5);

                          return (
                            <g
                              key={ss.id}
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveSweetSpotIdx(idx);
                                setRadarMode('sweetspot');
                              }}
                            >
                              {/* 스팟 타깃 반경 원 */}
                              <circle
                                cx={ssX}
                                cy={ssY}
                                r={ssR}
                                fill={isSelected ? '#f59e0b' : '#d97706'}
                                fillOpacity={isSelected ? 0.45 : 0.25}
                                stroke={isSelected ? '#fbbf24' : '#f59e0b'}
                                strokeWidth={isSelected ? 2 : 1.2}
                                strokeDasharray={isSelected ? 'none' : '2,2'}
                              />
                              {/* 중심 핀 포인트 */}
                              <circle
                                cx={ssX}
                                cy={ssY}
                                r={isSelected ? 3.5 : 2.5}
                                fill={isSelected ? '#ffffff' : '#fbbf24'}
                                stroke="#b45309"
                                strokeWidth="1"
                              />
                              {/* 핀 번호 뱃지 */}
                              <text
                                x={ssX}
                                y={ssY - ssR - 3}
                                fill={isSelected ? '#fef08a' : '#fbbf24'}
                                fontSize={isSelected ? '9' : '8'}
                                fontWeight="bold"
                                textAnchor="middle"
                              >
                                #{idx + 1}
                              </text>
                            </g>
                          );
                        })}

                      {/* 중앙 상태 표시 라벨 */}
                      {radarMode === 'sweetspot' && useSweetSpot && sweetSpots[activeSweetSpotIdx] ? (
                        <g>
                          <text x={cx} y={cy - 4} fill="#fbbf24" fontSize="11" fontWeight="bold" textAnchor="middle">
                            #{activeSweetSpotIdx + 1} 스팟
                          </text>
                          <text x={cx} y={cy + 10} fill="#fef08a" fontSize="10" textAnchor="middle">
                            {sweetSpots[activeSweetSpotIdx].direction}° · {sweetSpots[activeSweetSpotIdx].distance}m
                          </text>
                        </g>
                      ) : hasCastingRange ? (
                        <g>
                          <text x={cx} y={cy - 5} fill="#10b981" fontSize="10" fontWeight="bold" textAnchor="middle">
                            {castingStartDeg}°
                          </text>
                          <text x={cx} y={cy + 11} fill="#06b6d4" fontSize="10" fontWeight="bold" textAnchor="middle">
                            ~ {castingEndDeg}°
                          </text>
                        </g>
                      ) : null}
                    </svg>
                  </div>

                  {/* 안내 텍스트 */}
                  <span className="text-[10.5px] text-slate-400">
                    {radarMode === 'sweetspot' && useSweetSpot
                      ? '👆 레이더의 원하는 지점을 터치하거나 드래그하여 스팟 위치를 지정하세요'
                      : '👆 레이더의 가장자리를 터치하여 캐스팅 공략 각도를 지정하세요'}
                  </span>
                </div>
              );
            })()}

            {/* 스위트 스팟 인라인 컨트롤러 (Zero-Scroll: 레이더 바로 아래 일체화) */}
            {useSweetSpot && (
              <div className="space-y-2.5 pt-1 border-t border-slate-750">
                {/* 1. 스위트 스팟 칩 탭 리스트 (최대 3개) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {sweetSpots.map((ss, idx) => {
                    const isSelected = idx === activeSweetSpotIdx;
                    return (
                      <button
                        type="button"
                        key={ss.id}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          (document.activeElement as HTMLElement)?.blur();
                          setActiveSweetSpotIdx(idx);
                          setRadarMode('sweetspot');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/50'
                            : 'bg-slate-900 hover:bg-slate-850 text-amber-300 border border-amber-600/40'
                        }`}
                      >
                        <span>#{idx + 1}</span>
                        <span>{ss.direction}° / {ss.distance}m</span>
                        <span className="text-[10px] opacity-75 font-normal">({ss.radius}m)</span>
                      </button>
                    );
                  })}

                  {sweetSpots.length < 3 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        (document.activeElement as HTMLElement)?.blur();
                        handleAddSweetSpot();
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-dashed border-amber-500/50 text-amber-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                    >
                      <span>+ 스팟 추가</span>
                    </button>
                  )}
                </div>

                {/* 2. 현재 선택된 스팟의 인라인 편집 바 */}
                {sweetSpots[activeSweetSpotIdx] && (
                  <div className="p-3 bg-slate-900/90 border border-amber-500/40 rounded-xl space-y-2.5 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-amber-300 text-sm">
                          #{activeSweetSpotIdx + 1} 스위트 스팟
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-mono">
                          {sweetSpots[activeSweetSpotIdx].direction}° · {sweetSpots[activeSweetSpotIdx].distance}m
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSweetSpot(activeSweetSpotIdx)}
                        className="text-slate-400 hover:text-rose-400 text-xs px-2 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer flex items-center gap-1"
                      >
                        <span>🗑️ 삭제</span>
                      </button>
                    </div>

                    {/* 반경 원터치 조절 (슬라이더 대신 [-] [5m] [+] 직관 버튼 및 프리셋 칩) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300 font-medium text-[11px]">반경 (공략 영역 크기)</span>
                        <span className="text-amber-300 font-bold font-mono">
                          {sweetSpots[activeSweetSpotIdx].radius}m
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* 1m 단위 미세 증감 버튼 */}
                        <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.currentTarget.blur();
                              (document.activeElement as HTMLElement)?.blur();
                              const cur = sweetSpots[activeSweetSpotIdx].radius;
                              handleUpdateSweetSpot(activeSweetSpotIdx, {
                                radius: Math.max(1, cur - 1),
                              });
                            }}
                            className="px-2.5 py-1 text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <span className="px-2.5 py-1 text-amber-300 font-bold font-mono min-w-[36px] text-center">
                            {sweetSpots[activeSweetSpotIdx].radius}m
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.currentTarget.blur();
                              (document.activeElement as HTMLElement)?.blur();
                              const cur = sweetSpots[activeSweetSpotIdx].radius;
                              handleUpdateSweetSpot(activeSweetSpotIdx, {
                                radius: Math.min(20, cur + 1),
                              });
                            }}
                            className="px-2.5 py-1 text-slate-300 hover:text-white hover:bg-slate-800 transition font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        {/* 퀵 프리셋 칩 */}
                        <div className="flex items-center gap-1">
                          {[3, 5, 8, 10, 15].map((presetR) => (
                            <button
                              type="button"
                              key={`r-preset-${presetR}`}
                              onClick={(e) => {
                                e.currentTarget.blur();
                                (document.activeElement as HTMLElement)?.blur();
                                handleUpdateSweetSpot(activeSweetSpotIdx, { radius: presetR });
                              }}
                              className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                                sweetSpots[activeSweetSpotIdx].radius === presetR
                                  ? 'bg-amber-500 text-slate-950 shadow'
                                  : 'bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {presetR}m
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 스팟 메모 인풋 */}
                    <div>
                      <input
                        type="text"
                        value={sweetSpots[activeSweetSpotIdx].memo || ''}
                        onChange={(e) =>
                          handleUpdateSweetSpot(activeSweetSpotIdx, { memo: e.target.value })
                        }
                        placeholder="스팟 메모 (예: 40m 전방 수중여 턱, 브레이크라인)"
                        className="w-full bg-slate-950 border border-slate-750 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 캐스팅 공략 각도 컨트롤러 (슬라이더 및 퀵 프리셋) */}
            {hasCastingRange && (
              <div className="space-y-2.5 pt-1 border-t border-slate-750">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-cyan-400 font-bold flex items-center gap-1">
                    <span>📐 캐스팅 부채꼴 각도</span>
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    시작 <strong className="text-emerald-400">{castingStartDeg}°</strong> ~ 종료 <strong className="text-cyan-400">{castingEndDeg}°</strong>
                  </span>
                </div>

                {/* 슬라이더 컨트롤 (모바일 키보드 포커스 방지 적용) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-emerald-400 font-medium">시작각</span>
                      <span className="text-emerald-300 font-mono font-bold">{castingStartDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={castingStartDeg}
                      onPointerDown={() => (document.activeElement as HTMLElement)?.blur()}
                      onTouchStart={() => (document.activeElement as HTMLElement)?.blur()}
                      onChange={(e) => {
                        setCastingStartDeg(Number(e.target.value));
                        (document.activeElement as HTMLElement)?.blur();
                      }}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-cyan-400 font-medium">종료각</span>
                      <span className="text-cyan-300 font-mono font-bold">{castingEndDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={359}
                      value={castingEndDeg}
                      onPointerDown={() => (document.activeElement as HTMLElement)?.blur()}
                      onTouchStart={() => (document.activeElement as HTMLElement)?.blur()}
                      onChange={(e) => {
                        setCastingEndDeg(Number(e.target.value));
                        (document.activeElement as HTMLElement)?.blur();
                      }}
                      className="w-full accent-cyan-500 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 빠른 방향 프리셋: 동, 서, 남, 북 및 60, 90, 120 */}
                <div className="space-y-1.5 pt-0.5">
                  <span className="text-[11px] text-slate-400 font-medium">⚡ 빠른 각도 프리셋</span>
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
                        onClick={(e) => {
                          e.currentTarget.blur();
                          (document.activeElement as HTMLElement)?.blur();
                          setCastingStartDeg(p.start);
                          setCastingEndDeg(p.end);
                          setRadarMode('casting');
                        }}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md border border-slate-700 text-[11px] font-bold transition cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                    <span className="text-slate-600 px-0.5">|</span>
                    {[
                      { label: '60°', delta: 30 },
                      { label: '90°', delta: 45 },
                      { label: '120°', delta: 60 },
                    ].map((a, idx) => (
                      <button
                        type="button"
                        key={`angle-${idx}`}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          (document.activeElement as HTMLElement)?.blur();
                          const span =
                            castingEndDeg >= castingStartDeg
                              ? castingEndDeg - castingStartDeg
                              : 360 - castingStartDeg + castingEndDeg;
                          const center = (castingStartDeg + span / 2) % 360;
                          const s = (center - a.delta + 360) % 360;
                          const eTarget = (center + a.delta) % 360;
                          setCastingStartDeg(s);
                          setCastingEndDeg(eTarget);
                          setRadarMode('casting');
                        }}
                        className="px-2 py-0.5 bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 rounded-md border border-cyan-800/60 text-[11px] font-bold transition cursor-pointer"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 공개 여부 설정 (요구사항 5-6: '공개'로 변경 및 부가설명 삭제) */}
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
            <div>
              <span className="font-medium text-slate-200">공개</span>
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
