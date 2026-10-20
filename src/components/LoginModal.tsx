import React from 'react';
import { LogIn, User as UserIcon, X, Mail, Hash, Check, Heart, Sparkles } from 'lucide-react';
import { DEFAULT_POPULAR_SPECIES, SPECIES_ENCYCLOPEDIA } from '../utils/speciesDatabase';

export interface AuthUser {
  id: string;
  email: string;
  favoriteSpecies?: string[]; // 사용자가 설정한 관심 대상어 목록 (예: ['우럭', '풀치(갈치)', '주꾸미'])
}

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  onLogin: (user: AuthUser) => void;
  onLogout: () => void;
  onUpdateFavorites?: (favorites: string[]) => void;
}

const STORAGE_KEY_AUTH_USER = 'expfish_auth_user';

export function getSavedAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTH_USER);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to parse auth user:', e);
  }
  return null;
}

export function saveAuthUser(user: AuthUser): void {
  try {
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
}) => {
  const [email, setEmail] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [selectedSpecies, setSelectedSpecies] = React.useState<string[]>(['우럭', '광어']);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      if (currentUser) {
        setEmail(currentUser.email);
        setUserId(currentUser.id);
        setSelectedSpecies(
          currentUser.favoriteSpecies && currentUser.favoriteSpecies.length > 0
            ? currentUser.favoriteSpecies
            : ['우럭', '광어']
        );
      } else {
        setEmail('');
        setUserId('');
        setSelectedSpecies(['우럭', '광어']);
      }
      setError('');
    }
  }, [isOpen, currentUser]);

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

  const handleSaveFavoritesOnly = () => {
    if (!currentUser) return;
    const updated: AuthUser = {
      ...currentUser,
      favoriteSpecies: selectedSpecies,
    };
    saveAuthUser(updated);
    if (onUpdateFavorites) onUpdateFavorites(selectedSpecies);
    onLogin(updated);
    alert('나의 관심 대상어가 저장되었습니다. 입질 지수가 맞춤 갱신됩니다.');
    onClose();
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
      setError('아이디(닉네임)를 입력해 주세요.');
      return;
    }

    const user: AuthUser = {
      email: trimmedEmail,
      id: trimmedId,
      favoriteSpecies: selectedSpecies,
    };
    saveAuthUser(user);
    onLogin(user);
    onClose();
  };

  const handleLogoutClick = () => {
    clearAuthUser();
    onLogout();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl text-slate-100 flex flex-col max-h-[92vh] overflow-hidden my-4">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
              <UserIcon size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {currentUser ? '회원 정보 & 관심 대상어 설정' : 'ExFish 간편 로그인'}
              </h2>
              <p className="text-[11px] text-slate-400">
                관심 대상어에 맞춘 실시간 입질 지수 제공
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
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {currentUser ? (
            <div className="space-y-4">
              {/* 계정 정보 박스 */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">로그인 계정 ID:</span>
                  <span className="font-bold text-cyan-400">{currentUser.id}</span>
                </div>
                <div className="flex justify-between items-center text-slate-300">
                  <span className="text-slate-400">이메일:</span>
                  <span className="font-mono text-slate-200">{currentUser.email}</span>
                </div>
              </div>

              {/* 관심 대상어 선택 섹션 */}
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
                  선택하신 대상어종의 <strong>생태(야행성/주행성, 활성수온, 선호 조류, 서식처)</strong>에 따라 포인트별 입질 종합 점수가 실시간 맞춤 계산됩니다.
                </p>

                {/* 어종 뱃지 칩 그리드 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
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
                  onClick={handleSaveFavoritesOnly}
                  className="flex-1 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition shadow flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={14} />
                  <span>관심 대상어 저장</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className="py-2.5 px-4 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 font-bold rounded-xl transition"
                >
                  로그아웃
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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

              {/* 회원가입/로그인 시 초기 관심 대상어 선택 */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1">
                  <Heart size={13} className="text-rose-400" /> 초기 관심 대상어종 (다중 선택)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                  {DEFAULT_POPULAR_SPECIES.slice(0, 9).map((sp) => {
                    const isSelected = selectedSpecies.includes(sp);
                    return (
                      <button
                        type="button"
                        key={sp}
                        onClick={() => handleToggleSpecies(sp)}
                        className={`py-1 px-2 rounded border text-xs font-medium transition text-left truncate ${
                          isSelected
                            ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}{sp}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                💡 별도의 비밀번호 없이 Email과 ID만으로 포인트/조과 작성자 및 맞춤형 입질 지수가 연동됩니다.
              </p>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition shadow-md shadow-cyan-600/20 flex items-center justify-center gap-1.5"
              >
                <LogIn size={15} />
                <span>로그인하고 맞춤 입질 지수 보기</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
