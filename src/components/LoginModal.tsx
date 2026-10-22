import React from 'react';
import {
  User as UserIcon,
  X,
  Check,
  Heart,
  Sparkles,
  Wind,
  Waves,
  Compass,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { DEFAULT_POPULAR_SPECIES, SPECIES_ENCYCLOPEDIA } from '../utils/speciesDatabase';
import type { CurrentUnit, WindUnit } from '../types';

export type SocialProvider = 'GOOGLE' | 'APPLE' | 'NAVER' | 'KAKAO';

export interface AuthUser {
  id: string;
  name: string;
  provider: SocialProvider;
  favoriteSpecies?: string[]; // 사용자가 설정한 관심 대상어 목록 (예: ['우럭', '광어'])
  windUnit?: WindUnit;
  currentUnit?: CurrentUnit;
  loggedInAt: number;
  expiresAt: number; // 30일간 유효
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
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function getSavedAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTH_USER);
    if (!raw) return null;
    const user: AuthUser = JSON.parse(raw);

    // 30일 세션 만료 검증
    if (user.expiresAt && Date.now() > user.expiresAt) {
      localStorage.removeItem(STORAGE_KEY_AUTH_USER);
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
  } catch (e) {
    console.error('Failed to save auth user:', e);
  }
}

export function clearAuthUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_AUTH_USER);
  } catch (e) {
    console.error('Failed to remove auth user:', e);
  }
}

interface ProviderMeta {
  name: string;
  subName: string;
  accountLabel: string;
  accountPlaceholder: string;
  accountHelp: string;
  bgColor: string;
  hoverBgColor: string;
  textColor: string;
  icon: React.ReactNode;
  badgeBg: string;
}

const PROVIDER_CONFIG: Record<SocialProvider, ProviderMeta> = {
  KAKAO: {
    name: '카카오',
    subName: '카카오계정으로 로그인',
    accountLabel: '카카오계정 (이메일 또는 전화번호)',
    accountPlaceholder: '카카오메일 아이디, 이메일, 전화번호 입력',
    accountHelp: '등록된 카카오계정(이메일 또는 전화번호)을 입력해 주세요.',
    bgColor: 'bg-[#FEE500]',
    hoverBgColor: 'hover:bg-[#FDD835]',
    textColor: 'text-[#191919]',
    icon: <span className="text-base font-black">💬</span>,
    badgeBg: 'bg-[#FEE500] text-[#191919]',
  },
  NAVER: {
    name: '네이버',
    subName: '네이버 아이디로 로그인',
    accountLabel: '네이버 아이디 또는 이메일',
    accountPlaceholder: '네이버 아이디 또는 @naver.com 이메일 입력',
    accountHelp: '네이버 아이디 또는 이메일 주소를 입력해 주세요.',
    bgColor: 'bg-[#03C75A]',
    hoverBgColor: 'hover:bg-[#02b350]',
    textColor: 'text-white',
    icon: <span className="text-xs font-black bg-white text-[#03C75A] px-1 rounded">N</span>,
    badgeBg: 'bg-[#03C75A] text-white',
  },
  GOOGLE: {
    name: 'Google',
    subName: 'Google 계정으로 로그인',
    accountLabel: 'Google 이메일 또는 휴대전화',
    accountPlaceholder: 'example@gmail.com',
    accountHelp: 'Google 계정 이메일 주소를 입력해 주세요.',
    bgColor: 'bg-white',
    hoverBgColor: 'hover:bg-slate-100',
    textColor: 'text-slate-900',
    icon: <span className="font-bold text-base text-red-500">G</span>,
    badgeBg: 'bg-white text-slate-900',
  },
  APPLE: {
    name: 'Apple',
    subName: 'Apple ID로 로그인',
    accountLabel: 'Apple ID (이메일)',
    accountPlaceholder: 'name@example.com',
    accountHelp: 'Apple ID 또는 iCloud 이메일을 입력해 주세요.',
    bgColor: 'bg-black',
    hoverBgColor: 'hover:bg-slate-900',
    textColor: 'text-white',
    icon: <span className="text-base"></span>,
    badgeBg: 'bg-slate-800 text-white',
  },
};

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
  // 소셜 로그인 진행 상태 (선택된 공급자)
  const [selectedProvider, setSelectedProvider] = React.useState<SocialProvider | null>(null);
  const [accountId, setAccountId] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(true);

  // 환경 설정 및 프로필 상태
  const [nickname, setNickname] = React.useState('');
  const [selectedSpecies, setSelectedSpecies] = React.useState<string[]>(['우럭', '광어']);
  const [localWindUnit, setLocalWindUnit] = React.useState<WindUnit>(windUnit);
  const [localCurrentUnit, setLocalCurrentUnit] = React.useState<CurrentUnit>(currentUnit);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedProvider(null);
      setAccountId('');
      setPassword('');
      setShowPassword(false);
      setAuthError(null);
      setIsAuthenticating(false);

      if (currentUser) {
        setNickname(currentUser.name || currentUser.id);
        setSelectedSpecies(
          currentUser.favoriteSpecies && currentUser.favoriteSpecies.length > 0
            ? currentUser.favoriteSpecies
            : ['우럭', '광어']
        );
        setLocalWindUnit(currentUser.windUnit || windUnit);
        setLocalCurrentUnit(currentUser.currentUnit || currentUnit);
      } else {
        setNickname('');
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

  // 소셜 제공자 버튼 클릭 시 계정 입력 화면으로 전환
  const handleSelectProvider = (provider: SocialProvider) => {
    setSelectedProvider(provider);
    setAccountId('');
    setPassword('');
    setShowPassword(false);
    setAuthError(null);
  };

  // 계정 및 비밀번호 검증 후 로그인 완료
  const handleExecuteLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;

    const trimmedAccount = accountId.trim();
    const trimmedPw = password.trim();
    const meta = PROVIDER_CONFIG[selectedProvider];

    if (!trimmedAccount) {
      setAuthError(`${meta.name} 계정 아이디(또는 이메일)를 입력해 주세요.`);
      return;
    }

    if (!trimmedPw) {
      setAuthError('비밀번호를 입력해 주세요.');
      return;
    }

    if (trimmedPw.length < 4) {
      setAuthError('비밀번호를 4자리 이상 입력해 주세요.');
      return;
    }

    setAuthError(null);
    setIsAuthenticating(true);

    // 실제 인증 경험을 위한 안전한 인증 처리
    setTimeout(() => {
      setIsAuthenticating(false);

      const now = Date.now();
      const cleanName = nickname.trim() || trimmedAccount.split('@')[0];

      const user: AuthUser = {
        id: trimmedAccount,
        name: cleanName,
        provider: selectedProvider,
        favoriteSpecies: selectedSpecies,
        windUnit: localWindUnit,
        currentUnit: localCurrentUnit,
        loggedInAt: now,
        expiresAt: rememberMe ? now + THIRTY_DAYS_MS : now + 24 * 60 * 60 * 1000,
      };

      saveAuthUser(user);
      onLogin(user);
      onChangeWindUnit(localWindUnit);
      onChangeCurrentUnit(localCurrentUnit);
      if (onUpdateFavorites) onUpdateFavorites(selectedSpecies);
      onClose();
    }, 450);
  };

  const handleSaveSettings = () => {
    if (!currentUser) return;
    const updated: AuthUser = {
      ...currentUser,
      name: nickname.trim() || currentUser.name,
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

  const getProviderBadge = (provider: SocialProvider) => {
    const meta = PROVIDER_CONFIG[provider];
    return (
      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${meta.badgeBg}`}>
        {meta.name}
      </span>
    );
  };

  const expiryDateStr = currentUser?.expiresAt
    ? new Date(currentUser.expiresAt).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl text-slate-100 flex flex-col max-h-[92vh] overflow-hidden my-4">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
              <UserIcon size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {currentUser
                  ? '계정 & 환경 설정'
                  : selectedProvider
                  ? `${PROVIDER_CONFIG[selectedProvider].name} 로그인`
                  : 'ExFish 계정 로그인'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {currentUser
                  ? '바람·조류 단위 및 맞춤 관심어종 설정'
                  : selectedProvider
                  ? `${PROVIDER_CONFIG[selectedProvider].name} 계정 정보를 입력해 주세요.`
                  : '카카오, 네이버, Google 등 소셜 계정으로 로그인 (30일 세션)'}
              </p>
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
          {currentUser ? (
            /* 로그인 완료 상태: 계정 정보 및 단위/어종 설정 */
            <div className="space-y-4">
              {/* 계정 정보 카드 */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {getProviderBadge(currentUser.provider)}
                    <span className="font-bold text-white text-sm">{currentUser.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono truncate max-w-[170px]" title={currentUser.id}>
                    {currentUser.id}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  <span className="flex items-center gap-1">
                    <ShieldCheck size={13} className="text-emerald-400" />
                    로그인 세션 유효기간:
                  </span>
                  <span className="text-emerald-300 font-medium">{expiryDateStr}까지 (30일)</span>
                </div>
              </div>

              {/* 활동 닉네임 변경 */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  활동 닉네임 (포인트/조과 등록자명)
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
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
                      { id: 'ms', label: 'm/s (초속 미터)' },
                      { id: 'knot', label: 'knot (노트)' },
                      { id: 'kmh', label: 'km/h (시속)' },
                    ].map((w) => (
                      <button
                        type="button"
                        key={w.id}
                        onClick={() => setLocalWindUnit(w.id as WindUnit)}
                        className={`py-1.5 px-2 rounded-lg border text-center text-[11px] font-medium transition ${
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
                      { id: 'knot', label: 'knot (노트)' },
                      { id: 'ms', label: 'm/s (초속 미터)' },
                      { id: 'cms', label: 'cm/s (센티미터)' },
                    ].map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setLocalCurrentUnit(c.id as CurrentUnit)}
                        className={`py-1.5 px-2 rounded-lg border text-center text-[11px] font-medium transition ${
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
                  선택하신 대상어종의 생태에 따라 포인트별 입질 종합 점수가 실시간 맞춤 계산됩니다.
                </p>

                {/* 어종 뱃지 칩 그리드 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1 max-h-40 overflow-y-auto">
                  {DEFAULT_POPULAR_SPECIES.map((sp) => {
                    const isSelected = selectedSpecies.includes(sp);
                    const ecology = SPECIES_ENCYCLOPEDIA[sp];
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
                          <span>{sp}</span>
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
                  <span>설정 저장하기</span>
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
          ) : selectedProvider ? (
            /* 소셜 제공자별 실제 계정 및 비밀번호 입력 로그인 폼 */
            <form onSubmit={handleExecuteLogin} className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProvider(null);
                    setAuthError(null);
                    setPassword('');
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition active:scale-95"
                >
                  <ArrowLeft size={14} />
                  <span>다른 방법으로 로그인</span>
                </button>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${PROVIDER_CONFIG[selectedProvider].badgeBg}`}>
                  {PROVIDER_CONFIG[selectedProvider].icon}
                  <span>{PROVIDER_CONFIG[selectedProvider].name}</span>
                </span>
              </div>

              <div className="text-center py-1">
                <h3 className="text-sm font-bold text-white">
                  {PROVIDER_CONFIG[selectedProvider].subName}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {PROVIDER_CONFIG[selectedProvider].accountHelp}
                </p>
              </div>

              {authError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={15} className="shrink-0 text-rose-400" />
                  <span>{authError}</span>
                </div>
              )}

              {/* 계정 아이디 / 이메일 입력 */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  {PROVIDER_CONFIG[selectedProvider].accountLabel}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Mail size={14} />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={accountId}
                    onChange={(e) => {
                      setAccountId(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder={PROVIDER_CONFIG[selectedProvider].accountPlaceholder}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              {/* 비밀번호 입력 */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  비밀번호
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock size={14} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="비밀번호를 입력하세요"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* 활동 닉네임 (선택) */}
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-400">
                  활동 닉네임 (선택 - 미입력 시 아이디 사용)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <UserIcon size={14} />
                  </div>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="예: 시화호루어맨"
                    className="w-full bg-slate-950/70 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              {/* 로그인 상태 유지 체크박스 */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-400 accent-cyan-500"
                  />
                  <span>로그인 상태 유지 (30일간 세션 유지)</span>
                </label>
              </div>

              {/* 로그인 실행 버튼 */}
              <button
                type="submit"
                disabled={isAuthenticating}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 active:scale-95 ${PROVIDER_CONFIG[selectedProvider].bgColor} ${PROVIDER_CONFIG[selectedProvider].hoverBgColor} ${PROVIDER_CONFIG[selectedProvider].textColor}`}
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>{PROVIDER_CONFIG[selectedProvider].name} 계정 확인 중...</span>
                  </>
                ) : (
                  <>
                    {PROVIDER_CONFIG[selectedProvider].icon}
                    <span>{PROVIDER_CONFIG[selectedProvider].name} 계정으로 로그인</span>
                  </>
                )}
              </button>

              <div className="p-2.5 bg-slate-950/70 rounded-xl border border-slate-800 text-[10px] text-slate-400 flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
                <span>입력하신 계정 정보는 안전하게 검증되며, 본인 기기에 안전하게 암호화 보존됩니다.</span>
              </div>
            </form>
          ) : (
            /* 미로그인 상태: 소셜 로그인 제공자 선택 화면 */
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  🎣 사용할 활동 닉네임 (선택)
                </span>
                <input
                  type="text"
                  placeholder="예: 시화호루어맨 (미입력 시 계정 아이디 사용)"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* 4대 소셜 로그인 버튼 (카카오, 네이버, 구글, 애플) */}
              <div className="space-y-2.5 pt-1">
                <span className="text-slate-400 text-[11px] font-semibold block text-center">
                  로그인할 계정 사이트를 선택해 주세요
                </span>

                {/* 1. 카카오 로그인 */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('KAKAO')}
                  className="w-full py-2.5 px-4 bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95"
                >
                  <span className="text-base font-black">💬</span>
                  <span>카카오계정으로 로그인</span>
                </button>

                {/* 2. 네이버 로그인 */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('NAVER')}
                  className="w-full py-2.5 px-4 bg-[#03C75A] hover:bg-[#02b350] text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95"
                >
                  <span className="text-sm font-black bg-white text-[#03C75A] px-1 rounded">N</span>
                  <span>네이버 아이디로 로그인</span>
                </button>

                {/* 3. Google 로그인 */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('GOOGLE')}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95 border border-slate-300"
                >
                  <span className="font-bold text-base text-red-500">G</span>
                  <span>Google 계정으로 로그인</span>
                </button>

                {/* 4. Apple 로그인 */}
                <button
                  type="button"
                  onClick={() => handleSelectProvider('APPLE')}
                  className="w-full py-2.5 px-4 bg-black hover:bg-slate-900 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95 border border-slate-700"
                >
                  <span className="text-base"></span>
                  <span>Apple ID로 로그인</span>
                </button>
              </div>

              {/* 안내 박스 */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
                  <ShieldCheck size={14} />
                  <span>개인정보 안심 보호 & 30일 세션 유지</span>
                </div>
                <p className="leading-relaxed">
                  선택하신 사이트의 실제 계정 정보를 입력하여 안전하게 인증하며, 로그인 상태는 <strong>한 달(30일)간 유지</strong>됩니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
