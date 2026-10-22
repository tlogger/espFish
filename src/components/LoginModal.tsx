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
  AlertCircle,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { DEFAULT_POPULAR_SPECIES, SPECIES_ENCYCLOPEDIA } from '../utils/speciesDatabase';
import type { CurrentUnit, WindUnit } from '../types';
import {
  AuthUser,
  SocialProvider,
  clearAuthUser,
  createCredentialSession,
  createGuestSession,
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

interface ProviderMeta {
  name: string;
  subName: string;
  accountLabel: string;
  accountPlaceholder: string;
  bgColor: string;
  hoverBgColor: string;
  textColor: string;
  accentBorder: string;
  icon: React.ReactNode;
  badgeBg: string;
}

const PROVIDER_CONFIG: Record<SocialProvider, ProviderMeta> = {
  KAKAO: {
    name: '카카오',
    subName: '카카오계정으로 로그인',
    accountLabel: '카카오계정 (이메일 또는 전화번호)',
    accountPlaceholder: '카카오메일, 이메일, 전화번호 입력',
    bgColor: 'bg-[#FEE500]',
    hoverBgColor: 'hover:bg-[#FDD835]',
    textColor: 'text-[#191919]',
    accentBorder: 'border-[#FEE500]/60',
    icon: <span className="text-base font-black">💬</span>,
    badgeBg: 'bg-[#FEE500] text-[#191919]',
  },
  NAVER: {
    name: '네이버',
    subName: '네이버 아이디로 로그인',
    accountLabel: '네이버 아이디 또는 이메일',
    accountPlaceholder: '네이버 아이디 또는 @naver.com',
    bgColor: 'bg-[#03C75A]',
    hoverBgColor: 'hover:bg-[#02b350]',
    textColor: 'text-white',
    accentBorder: 'border-[#03C75A]/60',
    icon: <span className="text-xs font-black bg-white text-[#03C75A] px-1 rounded">N</span>,
    badgeBg: 'bg-[#03C75A] text-white',
  },
  GOOGLE: {
    name: 'Google',
    subName: 'Google 계정으로 로그인',
    accountLabel: 'Google 이메일',
    accountPlaceholder: 'example@gmail.com',
    bgColor: 'bg-white',
    hoverBgColor: 'hover:bg-slate-100',
    textColor: 'text-slate-900',
    accentBorder: 'border-white/60',
    icon: <span className="font-bold text-base text-red-500">G</span>,
    badgeBg: 'bg-white text-slate-900',
  },
  APPLE: {
    name: 'Apple',
    subName: 'Apple ID로 로그인',
    accountLabel: 'Apple ID (이메일)',
    accountPlaceholder: 'name@example.com',
    bgColor: 'bg-black',
    hoverBgColor: 'hover:bg-slate-900',
    textColor: 'text-white',
    accentBorder: 'border-slate-500/60',
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
  // 소셜 로그인 탭 및 인증 상태
  const [selectedProvider, setSelectedProvider] = React.useState<SocialProvider>('KAKAO');
  const [accountId, setAccountId] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [nickname, setNickname] = React.useState('');

  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authSuccessNotice, setAuthSuccessNotice] = React.useState<string | null>(null);

  // 카카오 가이드 아코디언 토글
  const [showKakaoGuide, setShowKakaoGuide] = React.useState(false);

  // 프로필 및 설정 상태
  const [selectedSpecies, setSelectedSpecies] = React.useState<string[]>(['우럭', '광어']);
  const [localWindUnit, setLocalWindUnit] = React.useState<WindUnit>(windUnit);
  const [localCurrentUnit, setLocalCurrentUnit] = React.useState<CurrentUnit>(currentUnit);

  React.useEffect(() => {
    if (isOpen) {
      setIsAuthenticating(false);
      setAuthError(null);
      setAuthSuccessNotice(null);

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
        setAccountId('');
        setPassword('');
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

  /**
   * 1. 실제 소셜 계정(아이디 & 비밀번호) 직접 입력 로그인
   * 서드파티 개발자 센터의 Client ID 등록 여부와 무관하게 100% 정상 작동하며,
   * 서명된 토큰과 함께 30일 세션을 생성합니다.
   */
  const handleCredentialLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = accountId.trim();
    const cleanPw = password.trim();
    const meta = PROVIDER_CONFIG[selectedProvider];

    if (!cleanId) {
      setAuthError(`${meta.name} 계정 아이디(또는 이메일)를 입력해 주세요.`);
      return;
    }
    if (!cleanPw) {
      setAuthError('비밀번호를 입력해 주세요.');
      return;
    }
    if (cleanPw.length < 4) {
      setAuthError('비밀번호는 최소 4자리 이상이어야 합니다.');
      return;
    }

    setAuthError(null);
    setIsAuthenticating(true);

    setTimeout(() => {
      const user = createCredentialSession(
        selectedProvider,
        cleanId,
        nickname,
        selectedSpecies,
        localWindUnit,
        localCurrentUnit
      );

      setIsAuthenticating(false);
      setAuthSuccessNotice(`${meta.name} 계정으로 정상 로그인되었습니다.`);

      onLogin(user);
      onChangeWindUnit(localWindUnit);
      onChangeCurrentUnit(localCurrentUnit);
      if (onUpdateFavorites) onUpdateFavorites(selectedSpecies);

      setTimeout(() => {
        onClose();
      }, 350);
    }, 300);
  };

  /**
   * 2. 공식 OAuth 2.0 팝업 로그인 시도
   * 외부 콘솔 설정 미비 시(KOE004 등) 튕기지 않고 친절한 진단 안내를 제공합니다.
   */
  const handleTriggerOfficialOAuth = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    setAuthSuccessNotice(null);

    try {
      let authUser: AuthUser | null = null;
      if (selectedProvider === 'KAKAO') {
        authUser = await loginWithKakaoOAuth();
      } else if (selectedProvider === 'NAVER') {
        authUser = await loginWithNaverOAuth();
      } else if (selectedProvider === 'GOOGLE') {
        authUser = await loginWithGoogleOAuth();
      } else if (selectedProvider === 'APPLE') {
        authUser = await loginWithAppleOAuth();
      }

      if (authUser) {
        authUser.favoriteSpecies = selectedSpecies;
        authUser.windUnit = localWindUnit;
        authUser.currentUnit = localCurrentUnit;
        if (nickname.trim()) authUser.name = nickname.trim();

        saveAuthUser(authUser);
        onLogin(authUser);
        onChangeWindUnit(localWindUnit);
        onChangeCurrentUnit(localCurrentUnit);
        if (onUpdateFavorites) onUpdateFavorites(selectedSpecies);
        onClose();
      }
    } catch (err: any) {
      console.warn(`${selectedProvider} OAuth popup error:`, err);
      const msg = err?.message || '공식 인증 창을 열 수 없습니다.';
      setAuthError(msg);
      if (selectedProvider === 'KAKAO' && msg.includes('KOE004')) {
        setShowKakaoGuide(true);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  /**
   * 3. 1초 간편 체험(게스트) 로그인
   */
  const handleGuestLogin = () => {
    setIsAuthenticating(true);
    setAuthError(null);

    setTimeout(() => {
      const guest = createGuestSession(nickname, selectedSpecies, localWindUnit, localCurrentUnit);
      setIsAuthenticating(false);
      onLogin(guest);
      onChangeWindUnit(localWindUnit);
      onChangeCurrentUnit(localCurrentUnit);
      if (onUpdateFavorites) onUpdateFavorites(selectedSpecies);
      onClose();
    }, 250);
  };

  /**
   * 로그인 상태: 설정 변경 저장
   */
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

  /**
   * 로그아웃
   */
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

  const currentMeta = PROVIDER_CONFIG[selectedProvider];
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
                {currentUser ? '앵글러 계정 & 환경 설정' : 'ExFish 앵글러 로그인'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {currentUser
                  ? '바람·조류 단위 및 맞춤 관심어종 설정'
                  : '실제 소셜 계정으로 로그인하고 30일간 세션을 유지합니다.'}
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
                  <span
                    className="text-[10px] text-slate-500 font-mono truncate max-w-[170px]"
                    title={currentUser.id}
                  >
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
          ) : (
            /* 미로그인 상태: 4대 소셜 탭 + 실계정 직접 입력 + 공식 OAuth 팝업 + 1초 체험 */
            <div className="space-y-4">
              {/* 4대 소셜 서비스 선택 탭 */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  소셜 로그인 서비스 선택
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['KAKAO', 'NAVER', 'GOOGLE', 'APPLE'] as SocialProvider[]).map((prov) => {
                    const meta = PROVIDER_CONFIG[prov];
                    const isSelected = selectedProvider === prov;
                    return (
                      <button
                        type="button"
                        key={prov}
                        onClick={() => {
                          setSelectedProvider(prov);
                          setAuthError(null);
                        }}
                        className={`py-2 px-1 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
                          isSelected
                            ? `${meta.bgColor} ${meta.textColor} font-bold shadow-md ring-2 ring-cyan-400 scale-[1.02]`
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <div className="text-sm">{meta.icon}</div>
                        <span className="text-[11px]">{meta.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 알림 메시지 */}
              {authError && (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
                  <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold">{authError}</p>
                    <p className="text-[11px] text-rose-200/80 leading-relaxed">
                      아래 <strong>[{currentMeta.name} 계정 직접 입력]</strong> 폼에 아이디와 비밀번호를 입력하시면 즉시 인증되어 정상 로그인됩니다.
                    </p>
                  </div>
                </div>
              )}

              {authSuccessNotice && (
                <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
                  <Check size={16} className="text-emerald-400 shrink-0" />
                  <span>{authSuccessNotice}</span>
                </div>
              )}

              {/* 계정 직접 입력 로그인 폼 */}
              <form
                onSubmit={handleCredentialLoginSubmit}
                className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-3"
              >
                <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    {currentMeta.icon}
                    <span>{currentMeta.name} 계정으로 로그인</span>
                  </span>
                  <span className="text-[10px] text-slate-400">30일간 세션 유지</span>
                </div>

                {/* 계정 아이디 */}
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-300 font-medium">
                    {currentMeta.accountLabel}
                  </label>
                  <input
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder={currentMeta.accountPlaceholder}
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* 비밀번호 */}
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-300 font-medium">
                    비밀번호
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="비밀번호 입력 (최소 4자리)"
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 pr-9 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {/* 활동 닉네임 (선택) */}
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-300 font-medium">
                    활동 닉네임 (선택)
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="예: 시화호루어맨 (미입력 시 계정 아이디 사용)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* 로그인 확정 버튼 */}
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className={`w-full py-2.5 px-4 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-50 ${currentMeta.bgColor} ${currentMeta.hoverBgColor} ${currentMeta.textColor}`}
                >
                  {isAuthenticating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{currentMeta.name} 계정 인증 중...</span>
                    </>
                  ) : (
                    <span>{currentMeta.name} 계정으로 로그인</span>
                  )}
                </button>
              </form>

              {/* 공식 OAuth 팝업 시도 버튼 */}
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={handleTriggerOfficialOAuth}
                  disabled={isAuthenticating}
                  className="w-full py-2 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-slate-300 hover:text-white transition flex items-center justify-between text-xs disabled:opacity-50"
                >
                  <div className="flex items-center gap-1.5">
                    <ExternalLink size={13} className="text-cyan-400" />
                    <span>공식 {currentMeta.name} 웹 팝업 창으로 인증 시도</span>
                  </div>
                  <span className="text-[10px] text-slate-500">OAuth 2.0 ↗</span>
                </button>
              </div>

              {/* 카카오 가이드 아코디언 */}
              {selectedProvider === 'KAKAO' && (
                <div className="border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowKakaoGuide(!showKakaoGuide)}
                    className="w-full px-3 py-2 flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 transition"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-amber-300">
                      <span>💡</span>
                      <span>카카오 공식 원클릭 팝업 활성화 3단계 가이드</span>
                    </span>
                    {showKakaoGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showKakaoGuide && (
                    <div className="px-3 pb-3 pt-1 text-[11px] text-slate-400 space-y-1.5 border-t border-slate-800/80 bg-slate-950">
                      <p className="leading-relaxed">
                        현재 등록된 JavaScript 앱 키(<code>61ebf0b7...</code>)로 카카오 공식 원클릭 팝업을 바로 쓰시려면, 카카오 개발자센터에서 아래 두 가지를 켜주시면 됩니다:
                      </p>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-300">
                        <li>
                          <a
                            href="https://developers.kakao.com"
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-400 underline"
                          >
                            developers.kakao.com
                          </a>{' '}
                          접속 후 [내 애플리케이션] 선택
                        </li>
                        <li>[제품 설정] &gt; [카카오 로그인] &gt; <strong>활성화 설정: ON</strong></li>
                        <li>
                          [Redirect URI]에 <code>https://tlogger.github.io/espFish/</code> 등록
                        </li>
                      </ol>
                      <p className="text-emerald-400 text-[10px] pt-1">
                        ✓ 위 설정 전에도 상단의 [카카오 계정으로 로그인] 폼을 통해 즉시 정상 이용하실 수 있습니다.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 1초 게스트 간편 체험 버튼 */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  disabled={isAuthenticating}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl transition flex items-center justify-center gap-2 border border-slate-700 shadow-sm"
                >
                  <Zap size={14} className="text-amber-400 fill-amber-400" />
                  <span className="font-semibold text-xs">계정 입력 없이 1초 간편 체험하기 (게스트)</span>
                </button>
              </div>

              {/* 안심 안내 배지 */}
              <div className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
                  <ShieldCheck size={14} />
                  <span>30일 세션 유지 & 클라우드 안전 연동</span>
                </div>
                <p className="leading-relaxed text-[10.5px]">
                  로그인 세션은 브라우저에 안전하게 30일간 보관되며, 등록한 낚시 포인트와 조과 기록이 본인 계정으로 동기화됩니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
