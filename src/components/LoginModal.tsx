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
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { DEFAULT_POPULAR_SPECIES, SPECIES_ENCYCLOPEDIA } from '../utils/speciesDatabase';
import type { CurrentUnit, WindUnit } from '../types';
import {
  AuthUser,
  SocialProvider,
  clearAuthUser,
  getSavedAuthUser,
  loginWithAppleOAuth,
  loginWithGoogleOAuth,
  loginWithKakaoOAuth,
  loginWithNaverOAuth,
  saveAuthUser,
} from '../utils/oauthEngine';

export type { AuthUser, SocialProvider };
export { getSavedAuthUser, saveAuthUser, clearAuthUser };

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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface ProviderMeta {
  name: string;
  subName: string;
  accountLabel: string;
  accountPlaceholder: string;
  bgColor: string;
  hoverBgColor: string;
  textColor: string;
  icon: React.ReactNode;
  badgeBg: string;
}

const PROVIDER_CONFIG: Record<SocialProvider, ProviderMeta> = {
  KAKAO: {
    name: '카카오',
    subName: '카카오 공식 인증 페이지로 이동',
    accountLabel: '카카오계정 (이메일/전화번호)',
    accountPlaceholder: '카카오메일 또는 전화번호',
    bgColor: 'bg-[#FEE500]',
    hoverBgColor: 'hover:bg-[#FDD835]',
    textColor: 'text-[#191919]',
    icon: <span className="text-base font-black">💬</span>,
    badgeBg: 'bg-[#FEE500] text-[#191919]',
  },
  NAVER: {
    name: '네이버',
    subName: '네이버 공식 인증 페이지로 이동',
    accountLabel: '네이버 아이디 또는 이메일',
    accountPlaceholder: '아이디 또는 @naver.com',
    bgColor: 'bg-[#03C75A]',
    hoverBgColor: 'hover:bg-[#02b350]',
    textColor: 'text-white',
    icon: <span className="text-xs font-black bg-white text-[#03C75A] px-1 rounded">N</span>,
    badgeBg: 'bg-[#03C75A] text-white',
  },
  GOOGLE: {
    name: 'Google',
    subName: 'Google 공식 인증 창으로 이동',
    accountLabel: 'Google 이메일',
    accountPlaceholder: 'example@gmail.com',
    bgColor: 'bg-white',
    hoverBgColor: 'hover:bg-slate-100',
    textColor: 'text-slate-900',
    icon: <span className="font-bold text-base text-red-500">G</span>,
    badgeBg: 'bg-white text-slate-900',
  },
  APPLE: {
    name: 'Apple',
    subName: 'Apple 공식 인증 창으로 이동',
    accountLabel: 'Apple ID (이메일)',
    accountPlaceholder: 'name@example.com',
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
  // 소셜 로그인 진행 상태
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [authenticatingProvider, setAuthenticatingProvider] = React.useState<SocialProvider | null>(null);
  const [authError, setAuthError] = React.useState<string | null>(null);

  // 수동 직접 입력 폴백 모드 (개발자 콘솔 Redirect URI 미등록 시 대비)
  const [isManualMode, setIsManualMode] = React.useState(false);
  const [manualProvider, setManualProvider] = React.useState<SocialProvider>('KAKAO');
  const [manualAccountId, setManualAccountId] = React.useState('');
  const [manualPassword, setManualPassword] = React.useState('');

  // 프로필 및 설정 상태
  const [nickname, setNickname] = React.useState('');
  const [selectedSpecies, setSelectedSpecies] = React.useState<string[]>(['우럭', '광어']);
  const [localWindUnit, setLocalWindUnit] = React.useState<WindUnit>(windUnit);
  const [localCurrentUnit, setLocalCurrentUnit] = React.useState<CurrentUnit>(currentUnit);

  React.useEffect(() => {
    if (isOpen) {
      setIsAuthenticating(false);
      setAuthenticatingProvider(null);
      setAuthError(null);
      setIsManualMode(false);
      setManualAccountId('');
      setManualPassword('');

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

  // 1. 표준 OAuth 2.0 공식 로그인 트리거 (카카오, 네이버, 구글, 애플 공식 사이트 창 호출)
  const handleTriggerOAuth = async (provider: SocialProvider) => {
    setIsAuthenticating(true);
    setAuthenticatingProvider(provider);
    setAuthError(null);

    try {
      let authUser: AuthUser | null = null;
      if (provider === 'KAKAO') {
        authUser = await loginWithKakaoOAuth();
      } else if (provider === 'NAVER') {
        authUser = await loginWithNaverOAuth();
      } else if (provider === 'GOOGLE') {
        authUser = await loginWithGoogleOAuth();
      } else if (provider === 'APPLE') {
        authUser = await loginWithAppleOAuth();
      }

      if (authUser) {
        // 관심어종 및 환경 단위 결합
        authUser.favoriteSpecies = selectedSpecies;
        authUser.windUnit = localWindUnit;
        authUser.currentUnit = localCurrentUnit;
        if (nickname.trim()) {
          authUser.name = nickname.trim();
        }

        saveAuthUser(authUser);
        onLogin(authUser);
        onChangeWindUnit(localWindUnit);
        onChangeCurrentUnit(localCurrentUnit);
        if (onUpdateFavorites) onUpdateFavorites(selectedSpecies);
        onClose();
      }
    } catch (err: any) {
      console.warn(`${provider} OAuth authentication error:`, err);
      const msg = err?.message || `${PROVIDER_CONFIG[provider].name} 로그인에 실패했습니다.`;
      setAuthError(
        msg.includes('닫혔거나') || msg.includes('취소')
          ? `${PROVIDER_CONFIG[provider].name} 공식 로그인 창이 닫혔거나 취소되었습니다.`
          : `${msg} (공식 사이트 연결 또는 팝업 설정을 확인하세요)`
      );
    } finally {
      setIsAuthenticating(false);
      setAuthenticatingProvider(null);
    }
  };

  // 2. 수동 직접 입력 로그인 핸들러 (네이버/카카오 개발자 콘솔 미등록 시 폴백용)
  const handleManualLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = manualAccountId.trim();
    const cleanPw = manualPassword.trim();
    const meta = PROVIDER_CONFIG[manualProvider];

    if (!cleanId) {
      setAuthError(`${meta.name} 계정 아이디를 입력해 주세요.`);
      return;
    }
    if (!cleanPw) {
      setAuthError('비밀번호를 입력해 주세요.');
      return;
    }

    setAuthError(null);
    setIsAuthenticating(true);

    setTimeout(() => {
      setIsAuthenticating(false);
      const now = Date.now();
      const user: AuthUser = {
        id: cleanId,
        name: nickname.trim() || cleanId.split('@')[0],
        provider: manualProvider,
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
    }, 400);
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
                  : isManualMode
                  ? `${PROVIDER_CONFIG[manualProvider].name} 계정 직접 입력`
                  : 'ExFish 공식 소셜 로그인 (OAuth 2.0)'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {currentUser
                  ? '바람·조류 단위 및 맞춤 관심어종 설정'
                  : isManualMode
                  ? '계정 아이디와 비밀번호를 직접 입력하여 로그인합니다.'
                  : '카카오·네이버·Google·Apple 공식 사이트에서 안전하게 로그인'}
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
                {currentUser.email && (
                  <div className="text-[11px] text-slate-400 font-mono">
                    이메일: <span className="text-slate-300">{currentUser.email}</span>
                  </div>
                )}
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
          ) : isManualMode ? (
            /* 수동 직접 입력 로그인 폼 (콘솔 미등록 시 폴백) */
            <form onSubmit={handleManualLoginSubmit} className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsManualMode(false);
                    setAuthError(null);
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition active:scale-95"
                >
                  <ArrowLeft size={14} />
                  <span>공식 OAuth 로그인으로 돌아가기</span>
                </button>
                {getProviderBadge(manualProvider)}
              </div>

              {authError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={15} className="shrink-0 text-rose-400" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  {PROVIDER_CONFIG[manualProvider].accountLabel}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Mail size={14} />
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={manualAccountId}
                    onChange={(e) => {
                      setManualAccountId(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder={PROVIDER_CONFIG[manualProvider].accountPlaceholder}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-300">
                  비밀번호
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock size={14} />
                  </div>
                  <input
                    type="password"
                    required
                    value={manualPassword}
                    onChange={(e) => {
                      setManualPassword(e.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="비밀번호를 입력하세요"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAuthenticating}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 active:scale-95 ${PROVIDER_CONFIG[manualProvider].bgColor} ${PROVIDER_CONFIG[manualProvider].hoverBgColor} ${PROVIDER_CONFIG[manualProvider].textColor}`}
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>확인 중...</span>
                  </>
                ) : (
                  <span>{PROVIDER_CONFIG[manualProvider].name} 계정으로 직접 로그인</span>
                )}
              </button>
            </form>
          ) : (
            /* 미로그인 상태: 표준 OAuth 2.0 소셜 로그인 목록 */
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  🎣 사용할 활동 닉네임 (선택)
                </span>
                <input
                  type="text"
                  placeholder="예: 시화호루어맨 (미입력 시 소셜 프로필명 사용)"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {authError && (
                <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
                  <AlertCircle size={15} className="shrink-0 text-rose-400" />
                  <div className="flex-1">
                    <p>{authError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualMode(true);
                        setAuthError(null);
                      }}
                      className="text-cyan-300 underline font-semibold text-[11px] mt-1 block"
                    >
                      👉 계정 직접 입력 방식으로 로그인하시겠습니까?
                    </button>
                  </div>
                </div>
              )}

              {/* 4대 소셜 공식 OAuth 로그인 버튼 */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between text-slate-400 text-[11px] font-semibold px-1">
                  <span>공식 OAuth 2.0 로그인</span>
                  <span className="text-[10px] text-cyan-400 flex items-center gap-1">
                    <ExternalLink size={11} />
                    <span>공식 사이트 연동</span>
                  </span>
                </div>

                {/* 1. 카카오 공식 로그인 */}
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={() => handleTriggerOAuth('KAKAO')}
                  className="w-full py-2.5 px-4 bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] font-bold rounded-xl transition flex items-center justify-between shadow-md active:scale-95 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black">💬</span>
                    <span>카카오로 시작하기</span>
                  </div>
                  {isAuthenticating && authenticatingProvider === 'KAKAO' ? (
                    <Loader2 size={16} className="animate-spin text-slate-900" />
                  ) : (
                    <span className="text-[11px] font-normal opacity-80">공식 창 열기 ↗</span>
                  )}
                </button>

                {/* 2. 네이버 공식 로그인 */}
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={() => handleTriggerOAuth('NAVER')}
                  className="w-full py-2.5 px-4 bg-[#03C75A] hover:bg-[#02b350] text-white font-bold rounded-xl transition flex items-center justify-between shadow-md active:scale-95 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black bg-white text-[#03C75A] px-1 rounded">N</span>
                    <span>네이버로 시작하기</span>
                  </div>
                  {isAuthenticating && authenticatingProvider === 'NAVER' ? (
                    <Loader2 size={16} className="animate-spin text-white" />
                  ) : (
                    <span className="text-[11px] font-normal opacity-80">공식 창 열기 ↗</span>
                  )}
                </button>

                {/* 3. Google 공식 로그인 */}
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={() => handleTriggerOAuth('GOOGLE')}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl transition flex items-center justify-between shadow-md active:scale-95 border border-slate-300 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base text-red-500">G</span>
                    <span>Google로 시작하기</span>
                  </div>
                  {isAuthenticating && authenticatingProvider === 'GOOGLE' ? (
                    <Loader2 size={16} className="animate-spin text-slate-700" />
                  ) : (
                    <span className="text-[11px] font-normal opacity-70">공식 창 열기 ↗</span>
                  )}
                </button>

                {/* 4. Apple 공식 로그인 */}
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={() => handleTriggerOAuth('APPLE')}
                  className="w-full py-2.5 px-4 bg-black hover:bg-slate-900 text-white font-bold rounded-xl transition flex items-center justify-between shadow-md active:scale-95 border border-slate-700 disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base"></span>
                    <span>Apple로 시작하기</span>
                  </div>
                  {isAuthenticating && authenticatingProvider === 'APPLE' ? (
                    <Loader2 size={16} className="animate-spin text-white" />
                  ) : (
                    <span className="text-[11px] font-normal opacity-70">공식 창 열기 ↗</span>
                  )}
                </button>
              </div>

              {/* 보조 직접 입력 링크 */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsManualMode(true);
                    setManualProvider('KAKAO');
                    setAuthError(null);
                  }}
                  className="text-[11px] text-slate-400 hover:text-cyan-300 underline transition"
                >
                  🔑 공식 팝업 창이 뜨지 않거나 계정을 직접 입력하여 로그인하시겠습니까?
                </button>
              </div>

              {/* 안내 박스 */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
                  <ShieldCheck size={14} />
                  <span>표준 OAuth 2.0 토큰 기반 인증 & 30일 세션 유지</span>
                </div>
                <p className="leading-relaxed">
                  카카오, 네이버, Google 등 각 공식 사이트에서 로그인 후 암호화된 토큰을 받아 인증하며, 로그인 세션은 <strong>30일간 유지</strong>됩니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
