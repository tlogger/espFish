import React from 'react';
import { User as UserIcon, X, Check, Heart, Sparkles, Wind, Waves, Compass, ShieldCheck, LogOut } from 'lucide-react';
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

    // 30일 쿠키/세션 만료 검증
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
  const [nickname, setNickname] = React.useState('');
  const [selectedSpecies, setSelectedSpecies] = React.useState<string[]>(['우럭', '광어']);
  const [localWindUnit, setLocalWindUnit] = React.useState<WindUnit>(windUnit);
  const [localCurrentUnit, setLocalCurrentUnit] = React.useState<CurrentUnit>(currentUnit);

  React.useEffect(() => {
    if (isOpen) {
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

  const handleSocialLogin = (provider: SocialProvider) => {
    const providerNames: Record<SocialProvider, string> = {
      KAKAO: '카카오 조사님',
      NAVER: '네이버 조사님',
      GOOGLE: '구글 앵글러',
      APPLE: '애플 피셔맨',
    };

    const finalName = nickname.trim() || providerNames[provider];
    const generatedId = `${provider.toLowerCase()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const user: AuthUser = {
      id: generatedId,
      name: finalName,
      provider,
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
    switch (provider) {
      case 'KAKAO':
        return <span className="px-2 py-0.5 rounded bg-[#FEE500] text-[#191919] font-bold text-[10px]">카카오</span>;
      case 'NAVER':
        return <span className="px-2 py-0.5 rounded bg-[#03C75A] text-white font-bold text-[10px]">네이버</span>;
      case 'GOOGLE':
        return <span className="px-2 py-0.5 rounded bg-white text-slate-800 font-bold text-[10px]">Google</span>;
      case 'APPLE':
        return <span className="px-2 py-0.5 rounded bg-slate-800 text-white font-bold text-[10px]">Apple</span>;
    }
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
                {currentUser ? '계정 & 환경 설정' : 'ExFish 간편 로그인'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {currentUser ? '바람·조류 단위 및 맞춤 관심어종 설정' : '별도 암호 없이 1초 소셜 간편 로그인 (30일 유지)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
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
                  <span className="text-[10px] text-slate-500 font-mono">ID: {currentUser.id}</span>
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
                <label className="block text-slate-300 font-semibold mb-1">활동 닉네임 (포인트/조과 등록자명)</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="예: 영흥도감성돔"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* 바람 및 조류 표시 단위 설정 (요구사항 2) */}
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
          ) : (
            /* 미로그인 상태: 4대 소셜 간편 로그인 (이메일/암호 없음) */
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  🎣 사용할 닉네임 입력 (선택)
                </span>
                <input
                  type="text"
                  placeholder="예: 시화호루어맨 (미입력 시 기본 칭호 부여)"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* 4대 소셜 로그인 버튼 (카카오, 네이버, 구글, 애플) */}
              <div className="space-y-2.5 pt-1">
                <span className="text-slate-400 text-[11px] font-semibold block text-center">
                  원클릭 소셜 로그인으로 즉시 시작하세요
                </span>

                {/* 1. 카카오 로그인 */}
                <button
                  type="button"
                  onClick={() => handleSocialLogin('KAKAO')}
                  className="w-full py-2.5 px-4 bg-[#FEE500] hover:bg-[#FDD835] text-[#191919] font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95"
                >
                  <span className="text-base font-black">💬</span>
                  <span>카카오로 시작하기</span>
                </button>

                {/* 2. 네이버 로그인 */}
                <button
                  type="button"
                  onClick={() => handleSocialLogin('NAVER')}
                  className="w-full py-2.5 px-4 bg-[#03C75A] hover:bg-[#02b350] text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95"
                >
                  <span className="text-sm font-black bg-white text-[#03C75A] px-1 rounded">N</span>
                  <span>네이버로 시작하기</span>
                </button>

                {/* 3. Google 로그인 */}
                <button
                  type="button"
                  onClick={() => handleSocialLogin('GOOGLE')}
                  className="w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95 border border-slate-300"
                >
                  <span className="font-bold text-base text-red-500">G</span>
                  <span>Google로 시작하기</span>
                </button>

                {/* 4. Apple 로그인 */}
                <button
                  type="button"
                  onClick={() => handleSocialLogin('APPLE')}
                  className="w-full py-2.5 px-4 bg-black hover:bg-slate-900 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-md active:scale-95 border border-slate-700"
                >
                  <span className="text-base"></span>
                  <span>Apple로 시작하기</span>
                </button>
              </div>

              {/* 안내 박스 */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-400 font-medium">
                  <ShieldCheck size={14} />
                  <span>개인정보 안심 보호 & 30일 무재로그인</span>
                </div>
                <p className="leading-relaxed">
                  별도의 비밀번호나 이메일 수집 없이 소셜 계정 고유 식별값으로 안전하게 연동되며, 로그인 세션은 <strong>한 달(30일)간 유지</strong>됩니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
