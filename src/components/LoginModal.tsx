import React from 'react';
import {
  LogIn,
  User as UserIcon,
  X,
  Mail,
  Hash,
  Check,
  Heart,
  Sparkles,
  Wind,
  Waves,
  Compass,
  ShieldCheck,
  LogOut,
  AlertCircle,
} from 'lucide-react';
import { DEFAULT_POPULAR_SPECIES, SPECIES_ENCYCLOPEDIA } from '../utils/speciesDatabase';
import type { CurrentUnit, WindUnit } from '../types';

export interface AuthUser {
  id: string; // 닉네임 또는 계정 ID
  email: string; // 사용자 이메일
  name: string; // 표시용 닉네임
  favoriteSpecies?: string[]; // 사용자가 설정한 관심 대상어 목록 (예: ['우럭', '광어'])
  windUnit?: WindUnit;
  currentUnit?: CurrentUnit;
  loggedInAt?: number;
  expiresAt?: number; // 30일간 유효
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onLogin: (user: AuthUser) => void;
  onLogout: () => void;
  onUpdateFavorites?: (favorites: string[]) => void;
  windUnit: WindUnit;
  currentUnit: CurrentUnit;
  onChangeWindUnit: (unit: WindUnit) => void;
  onChangeCurrentUnit: (unit: CurrentUnit) => void;
}

const STORAGE_KEY_AUTH_USER = 'exfish_auth_user_v2';
const LEGACY_STORAGE_KEY = 'espfish_auth_user';
const STORAGE_SAVED_CREDS = 'exfish_saved_login_credentials';
const COOKIE_LOGIN_EMAIL = 'exfish_saved_email';
const COOKIE_LOGIN_NICKNAME = 'exfish_saved_nickname';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** 쿠키 저장 헬퍼 (로그아웃 후에도 보전) */
export function setCookie(name: string, value: string, days: number = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

/** 쿠키 취득 헬퍼 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const matches = document.cookie.match(
    new RegExp('(?:^|; )' + encodeURIComponent(name).replace(/[\-\.\+\*]/g, '\\$&') + '=([^;]*)')
  );
  return matches ? decodeURIComponent(matches[1]) : null;
}

/** 이메일 & 닉네임 쿠키 및 로컬스토리지 영구 보전 */
export function saveRememberedCredentials(email: string, nickname: string) {
  try {
    if (email) setCookie(COOKIE_LOGIN_EMAIL, email, 365);
    if (nickname) setCookie(COOKIE_LOGIN_NICKNAME, nickname, 365);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_SAVED_CREDS, JSON.stringify({ email, nickname }));
    }
  } catch (e) {}
}

/** 보전된 이메일 & 닉네임 취득 */
export function getRememberedCredentials(): { email: string; nickname: string } {
  let email = getCookie(COOKIE_LOGIN_EMAIL) || '';
  let nickname = getCookie(COOKIE_LOGIN_NICKNAME) || '';
  if ((!email || !nickname) && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_SAVED_CREDS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!email && parsed.email) email = parsed.email;
        if (!nickname && (parsed.nickname || parsed.name)) nickname = parsed.nickname || parsed.name;
      }
    } catch (e) {}
  }
  return { email, nickname };
}

export function getSavedAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTH_USER) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const user: AuthUser = JSON.parse(raw);
    if (!user.name) {
      user.name = user.id;
    }

    // 30일 세션 만료 검증
    if (user.expiresAt && Date.now() > user.expiresAt) {
      localStorage.removeItem(STORAGE_KEY_AUTH_USER);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return null;
    }
    return user;
  } catch (e) {
    console.warn('Failed to parse auth user:', e);
  }
  return null;
}

export function saveAuthUser(user: AuthUser): void {
  try {
    if (!user.expiresAt) {
      user.expiresAt = Date.now() + THIRTY_DAYS_MS;
    }
    localStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(user));
    // 이메일 및 닉네임 쿠키 영구 보전
    saveRememberedCredentials(user.email, user.name || user.id);
  } catch (e) {
    console.error('Failed to save auth user:', e);
  }
}

export function clearAuthUser(): void {
  try {
    // 세션만 삭제하고, 이메일과 닉네임 쿠키/스토리지는 재로그인을 위해 보전
    localStorage.removeItem(STORAGE_KEY_AUTH_USER);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to remove auth user:', e);
  }
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  onLogout,
  onUpdateFavorites,
  windUnit,
  currentUnit,
  onChangeWindUnit,
  onChangeCurrentUnit,
}) => {
  const [email, setEmail] = React.useState(() => getRememberedCredentials().email);
  const [userId, setUserId] = React.useState(() => getRememberedCredentials().nickname);
  const [error, setError] = React.useState('');

  // 프로필 및 설정 상태
  const [selectedSpecies, setSelectedSpecies] = React.useState<string[]>(['우럭', '광어']);
  const [localWindUnit, setLocalWindUnit] = React.useState<WindUnit>(windUnit);
  const [localCurrentUnit, setLocalCurrentUnit] = React.useState<CurrentUnit>(currentUnit);

  React.useEffect(() => {
    if (isOpen) {
      setError('');
      if (currentUser) {
        setEmail(currentUser.email || '');
        setUserId(currentUser.id || currentUser.name || '');
        setSelectedSpecies(
          currentUser.favoriteSpecies && currentUser.favoriteSpecies.length > 0
            ? currentUser.favoriteSpecies
            : ['우럭', '광어']
        );
        setLocalWindUnit(currentUser.windUnit || windUnit);
        setLocalCurrentUnit(currentUser.currentUnit || currentUnit);
      } else {
        // 로그아웃 상태에서 로그인 모달 열릴 때: 쿠키/로컬스토리지에 보전된 이메일과 닉네임 자동 복원
        const remembered = getRememberedCredentials();
        setEmail(remembered.email || '');
        setUserId(remembered.nickname || '');
        setSelectedSpecies(['우럭', '광어']);
        setLocalWindUnit(windUnit);
        setLocalCurrentUnit(currentUnit);
      }
    }
  }, [isOpen, currentUser, windUnit, currentUnit]);

  if (!isOpen) return null;

  const handleToggleSpecies = (spName: string) => {
    if (selectedSpecies.includes(spName)) {
      if (selectedSpecies.length > 1) {
        setSelectedSpecies(selectedSpecies.filter((s) => s !== spName));
      } else {
        alert('최소 1개 이상의 관심 대상어를 선택해 주세요.');
      }
    } else {
      setSelectedSpecies([...selectedSpecies, spName]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedId = userId.trim();

    if (!trimmedEmail) {
      setError('이메일을 입력해 주세요.');
      return;
    }
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setError('올바른 이메일 형식을 입력해 주세요 (예: user@example.com).');
      return;
    }
    if (!trimmedId) {
      setError('아이디 / 닉네임을 입력해 주세요.');
      return;
    }

    const now = Date.now();
    const user: AuthUser = {
      id: trimmedId,
      name: trimmedId,
      email: trimmedEmail,
      favoriteSpecies: selectedSpecies,
      windUnit: localWindUnit,
      currentUnit: localCurrentUnit,
      loggedInAt: now,
      expiresAt: now + THIRTY_DAYS_MS,
    };

    saveAuthUser(user);
    onLogin(user);
    onChangeWindUnit(localWindUnit);
    onChangeCurrentUnit(localCurrentUnit);
    if (onUpdateFavorites) onUpdateFavorites(selectedSpecies);
    onClose();
  };

  const handleSaveSettings = () => {
    if (!currentUser) return;
    const trimmedId = userId.trim() || currentUser.id;
    const trimmedEmail = email.trim() || currentUser.email;

    const updated: AuthUser = {
      ...currentUser,
      id: trimmedId,
      name: trimmedId,
      email: trimmedEmail,
      favoriteSpecies: selectedSpecies,
      windUnit: localWindUnit,
      currentUnit: localCurrentUnit,
    };
    saveAuthUser(updated);
    onChangeWindUnit(localWindUnit);
    onChangeCurrentUnit(localCurrentUnit);
    if (onUpdateFavorites) onUpdateFavorites(selectedSpecies);
    onLogin(updated);
    alert('계정 및 환경 설정이 성공적으로 저장되었습니다.');
    onClose();
  };

  const handleLogoutClick = () => {
    clearAuthUser();
    onLogout();
    onClose();
  };

  const expiryDateStr = currentUser?.expiresAt
    ? new Date(currentUser.expiresAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl text-slate-100 flex flex-col max-h-[92vh] overflow-hidden my-4">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
              <UserIcon size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {currentUser ? '환경 설정' : 'ExFish 앵글러 로그인'}
              </h2>
              {!currentUser && (
                <p className="text-[11px] text-slate-400">
                  비밀번호 없이 Email과 닉네임만으로 간편 접속
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle size={15} className="shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {currentUser ? (
            /* 로그인 완료 상태: 계정 정보 및 단위/어종 설정 */
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">활동 닉네임 / ID:</span>
                  <span className="font-bold text-cyan-400 text-sm">{currentUser.id}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">이메일:</span>
                  <span className="font-mono text-slate-200">{currentUser.email}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/80">
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={13} className="text-emerald-400" />
                    로그인 세션 유효기간:
                  </span>
                  <span className="text-emerald-300 font-medium">{expiryDateStr}까지 (30일)</span>
                </div>
              </div>

              {/* 닉네임 수정 */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  활동 닉네임 (포인트/조과 등록자명 수정)
                </label>
                <input
                  type="text"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="예: 영흥도감성돔"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* 바람 및 조류 표시 단위 설정 */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                <div className="font-bold text-cyan-300 flex items-center gap-1.5 text-xs">
                  <Compass size={14} className="text-cyan-400" />
                  <span>해양 기상 표시 단위 설정</span>
                </div>

                {/* 바람 단위 */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Wind size={12} className="text-amber-400" /> 바람 풍속 단위:
                    </span>
                    <span className="font-mono text-cyan-300 font-bold">{localWindUnit}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'ms', label: 'm/s' },
                      { id: 'knot', label: 'knot' },
                      { id: 'kmh', label: 'km/h' },
                    ].map((w) => (
                      <button
                        type="button"
                        key={w.id}
                        onClick={() => setLocalWindUnit(w.id as WindUnit)}
                        className={`py-1.5 px-2 rounded-lg border text-center text-xs font-medium transition ${
                          localWindUnit === w.id
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 조류 단위 */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Waves size={12} className="text-blue-400" /> 조류 유속 단위:
                    </span>
                    <span className="font-mono text-cyan-300 font-bold">{localCurrentUnit}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'knot', label: 'knot' },
                      { id: 'ms', label: 'm/s' },
                      { id: 'cms', label: 'cm/s' },
                    ].map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setLocalCurrentUnit(c.id as CurrentUnit)}
                        className={`py-1.5 px-2 rounded-lg border text-center text-xs font-medium transition ${
                          localCurrentUnit === c.id
                            ? 'bg-blue-500/20 border-blue-400 text-blue-300 font-bold'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 관심 대상어종 선택 섹션 */}
              <div className="p-3.5 bg-slate-950/80 border border-cyan-500/30 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-300 flex items-center gap-1.5 text-xs">
                    <Heart size={14} className="text-rose-400 fill-rose-400" />
                    <span>나의 관심 대상어종 (다중 선택)</span>
                  </span>
                  <span className="text-[11px] text-cyan-400 font-mono">
                    {selectedSpecies.length}종 선택됨
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  선택한 대상 어종에 따라 입질 지수 실시간 계산
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1 max-h-40 overflow-y-auto">
                  {DEFAULT_POPULAR_SPECIES.map((sp) => {
                    const isSelected = selectedSpecies.includes(sp);
                    const ecology = SPECIES_ENCYCLOPEDIA[sp];
                    const isTastiest = ecology?.tastiestMonths?.includes(new Date().getMonth() + 1);
                    return (
                      <button
                        type="button"
                        key={sp}
                        onClick={() => handleToggleSpecies(sp)}
                        className={`p-2 rounded-lg border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-cyan-950/80 border-cyan-400 text-white shadow-sm ring-1 ring-cyan-500/40'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-xs">
                          <span className="flex items-center gap-1">
                            {sp}
                            {isTastiest && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-500/40 font-bold" title="지금 제철 꿀맛">
                                🍽️제철
                              </span>
                            )}
                          </span>
                          {isSelected && <Check size={12} className="text-cyan-400" />}
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {ecology ? `${ecology.activityName.split(' ')[0]} · ${ecology.categoryName.split('(')[0]}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 하단 버튼 그룹 */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="flex-1 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition shadow flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={14} />
                  <span>저장</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="py-2.5 px-4 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  <LogOut size={14} />
                  <span>로그아웃</span>
                </button>
              </div>
            </div>
          ) : (
            /* 미로그인 상태: Email & 닉네임 간편 로그인 폼 */
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                  <Mail size={13} className="text-cyan-400" />
                  <span>이메일 (Email)</span>
                </label>
                <input
                  type="email"
                  placeholder="예: fisher@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                  <Hash size={13} className="text-cyan-400" />
                  <span>아이디 / 닉네임 (ID)</span>
                </label>
                <input
                  type="text"
                  placeholder="예: 바다의루크"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
                  <ShieldCheck size={14} />
                  <span>패스워드 없는 간편 로그인 & 30일 세션 유지</span>
                </div>
                <p className="leading-relaxed">
                  별도의 복잡한 패스워드 없이 <strong>Email</strong>과 <strong>닉네임</strong>만으로 즉시 로그인되며, 등록하신 포인트 및 조과의 작성자로 연동됩니다. 로그인 상태는 <strong>30일간 유지</strong>됩니다.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition shadow-md shadow-cyan-600/20 flex items-center justify-center gap-1.5 active:scale-95"
              >
                <LogIn size={15} />
                <span>로그인하기</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
