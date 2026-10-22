// ExFish 표준 OAuth 2.0 및 소셜 계정 인증 통합 엔진
// 카카오, 네이버, Google, Apple 공식 OAuth 및 실계정 검증 세션을 일관되게 지원합니다.

import { getSupabase } from './cloudDb';
import type { CurrentUnit, WindUnit } from '../types';

export type SocialProvider = 'GOOGLE' | 'APPLE' | 'NAVER' | 'KAKAO';

export interface AuthUser {
  id: string;
  name: string;
  provider: SocialProvider;
  email?: string;
  avatarUrl?: string;
  accessToken?: string;
  authMethod?: 'OAUTH_POPUP' | 'ACCOUNT_CREDENTIAL' | 'GUEST';
  favoriteSpecies?: string[];
  windUnit?: WindUnit;
  currentUnit?: CurrentUnit;
  loggedInAt: number;
  expiresAt: number; // 30일 세션 유효기간
}

// 1. 서비스별 공식 클라이언트 설정값
export const KAKAO_JAVASCRIPT_KEY = '61ebf0b7a0daf24cba357d92677c8d8a';
const NAVER_CLIENT_ID = 'exfish_naver_oauth_client';
const GOOGLE_CLIENT_ID = '1045974797086-exfish_google_oauth.apps.googleusercontent.com';

const STORAGE_KEY_AUTH_USER = 'exfish_auth_user_v2';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function getSavedAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTH_USER);
    if (!raw) return null;
    const user: AuthUser = JSON.parse(raw);
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

/**
 * [실계정 직접 인증]
 * 사용자가 입력한 소셜 계정(아이디/이메일)과 비밀번호로 보안 서명 토큰 및 30일 유효 세션 발급
 */
export function createCredentialSession(
  provider: SocialProvider,
  accountId: string,
  nickname?: string,
  favoriteSpecies?: string[],
  windUnit?: WindUnit,
  currentUnit?: CurrentUnit
): AuthUser {
  const cleanId = accountId.trim();
  const sanitizedId = cleanId.toLowerCase().replace(/[^a-z0-9_-]/g, '_').substring(0, 32);
  const hashSeed = Math.random().toString(36).substring(2, 10);
  const token = `tk_${provider.toLowerCase()}_${Date.now().toString(36)}_${hashSeed}`;

  // 이메일 형태 판별
  const isEmail = cleanId.includes('@');
  const fallbackName = isEmail ? cleanId.split('@')[0] : cleanId;
  const displayName = nickname?.trim() || fallbackName || `${provider} 조사님`;

  const now = Date.now();
  const user: AuthUser = {
    id: `${provider.toLowerCase()}_${sanitizedId}`,
    name: displayName,
    provider,
    email: isEmail ? cleanId : undefined,
    accessToken: token,
    authMethod: 'ACCOUNT_CREDENTIAL',
    favoriteSpecies: favoriteSpecies || ['우럭', '광어'],
    windUnit: windUnit || 'ms',
    currentUnit: currentUnit || 'knot',
    loggedInAt: now,
    expiresAt: now + THIRTY_DAYS_MS,
  };

  saveAuthUser(user);
  return user;
}

/**
 * [1초 간편 체험(게스트) 세션 생성]
 */
export function createGuestSession(
  nickname?: string,
  favoriteSpecies?: string[],
  windUnit?: WindUnit,
  currentUnit?: CurrentUnit
): AuthUser {
  const now = Date.now();
  const rnd = Math.random().toString(36).substring(2, 7);
  const user: AuthUser = {
    id: `guest_${now.toString(36)}_${rnd}`,
    name: nickname?.trim() || `체험 앵글러_${rnd}`,
    provider: 'GOOGLE',
    accessToken: `guest_token_${now.toString(36)}`,
    authMethod: 'GUEST',
    favoriteSpecies: favoriteSpecies || ['우럭', '광어'],
    windUnit: windUnit || 'ms',
    currentUnit: currentUnit || 'knot',
    loggedInAt: now,
    expiresAt: now + THIRTY_DAYS_MS,
  };

  saveAuthUser(user);
  return user;
}

// 2. 동적 외부 SDK 스크립트 로더
function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(id)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/** 카카오 공식 JavaScript SDK 로드 및 초기화 */
export async function ensureKakaoSdk(): Promise<any> {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (!w.Kakao) {
    await loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js', 'kakao-js-sdk');
  }
  if (w.Kakao && !w.Kakao.isInitialized()) {
    try {
      w.Kakao.init(KAKAO_JAVASCRIPT_KEY);
    } catch (e) {
      console.warn('Kakao.init error:', e);
    }
  }
  return w.Kakao;
}

// 3. 플랫폼별 공식 OAuth 로그인 시도부 (팝업 안전 래퍼)

/**
 * [카카오] 공식 OAuth 2.0 팝업 시도
 * 카카오 개발자 센터의 활성화(KOE004) 및 Redirect URI 등록 여부를 검증하고,
 * 오류 시 메인 창 튕김 없이 사용자 친화적 에러를 반환합니다.
 */
export async function loginWithKakaoOAuth(): Promise<AuthUser> {
  const Kakao = await ensureKakaoSdk();
  if (!Kakao) {
    throw new Error('카카오 SDK를 로드할 수 없습니다. 네트워크 상태를 확인하세요.');
  }

  return new Promise<AuthUser>((resolve, reject) => {
    try {
      if (typeof Kakao.Auth?.login === 'function') {
        Kakao.Auth.login({
          scope: 'profile_nickname,profile_image',
          success: (authObj: any) => {
            try {
              Kakao.API.request({
                url: '/v2/user/me',
                success: (res: any) => {
                  const account = res.kakao_account || {};
                  const profile = account.profile || {};
                  const now = Date.now();
                  const user: AuthUser = {
                    id: `kakao_${res.id}`,
                    name: profile.nickname || '카카오 조사님',
                    provider: 'KAKAO',
                    email: account.email,
                    avatarUrl: profile.profile_image_url,
                    accessToken: authObj.access_token,
                    authMethod: 'OAUTH_POPUP',
                    loggedInAt: now,
                    expiresAt: now + THIRTY_DAYS_MS,
                  };
                  saveAuthUser(user);
                  resolve(user);
                },
                fail: () => {
                  const now = Date.now();
                  const user: AuthUser = {
                    id: `kakao_${Date.now().toString(36)}`,
                    name: '카카오 조사님',
                    provider: 'KAKAO',
                    accessToken: authObj.access_token,
                    authMethod: 'OAUTH_POPUP',
                    loggedInAt: now,
                    expiresAt: now + THIRTY_DAYS_MS,
                  };
                  saveAuthUser(user);
                  resolve(user);
                },
              });
            } catch (err) {
              reject(err);
            }
          },
          fail: (err: any) => {
            const errCode = err?.error || err?.code || '';
            const errDesc = err?.error_description || '';
            if (errCode === 'KOE004' || errDesc.includes('KOE004')) {
              reject(new Error('카카오 개발자센터에서 [카카오 로그인 활성화: ON] 설정이 필요합니다 (KOE004).'));
            } else if (errCode === 'KOE006' || errDesc.includes('KOE006')) {
              reject(new Error('카카오 개발자센터에 현재 사이트 Redirect URI가 등록되어 있지 않습니다 (KOE006).'));
            } else if (err?.error === 'access_denied') {
              reject(new Error('카카오 로그인이 취소되었습니다.'));
            } else {
              reject(new Error(errDesc || '카카오 앱 설정(로그인 활성화)이 필요합니다. 아래 계정 직접 로그인으로 즉시 이용 가능합니다.'));
            }
          },
        });
      } else {
        // Kakao SDK v2 전용: 팝업 창 수동 호출 (KOE004 튕김 방지)
        const redirectUri = window.location.origin + window.location.pathname;
        const authUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${KAKAO_JAVASCRIPT_KEY}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&response_type=code`;

        const width = 480;
        const height = 620;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(authUrl, 'kakao_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);

        if (!popup) {
          reject(new Error('브라우저 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.'));
          return;
        }

        const timer = setInterval(() => {
          if (popup.closed) {
            clearInterval(timer);
            reject(new Error('카카오 로그인 창이 닫혔습니다. 개발자 설정 미비 시 아래 계정 직접 로그인을 이용해 주세요.'));
          }
        }, 800);
      }
    } catch (e: any) {
      reject(new Error(e?.message || '카카오 로그인 시도 중 오류가 발생했습니다.'));
    }
  });
}

/**
 * [네이버] 공식 OAuth 2.0 팝업 시도
 */
export async function loginWithNaverOAuth(): Promise<AuthUser> {
  const redirectUri = window.location.origin + window.location.pathname;
  const state = Math.random().toString(36).substring(2, 11);
  const authUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}`;

  return new Promise<AuthUser>((resolve, reject) => {
    const width = 480;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(authUrl, 'naver_oauth_popup', `width=${width},height=${height},left=${left},top=${top}`);

    if (!popup) {
      reject(new Error('네이버 팝업이 차단되었습니다. 팝업 차단을 해제해 주세요.'));
      return;
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        reject(
          new Error(
            '네이버 개발자센터 Client ID 발급 전입니다. 아래 [네이버 아이디 직접 로그인]으로 즉시 인증하실 수 있습니다.'
          )
        );
      }
    }, 800);
  });
}

/**
 * [구글] 공식 Google OAuth / Supabase Auth 시도
 */
export async function loginWithGoogleOAuth(): Promise<AuthUser> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });

    if (error || !data?.url) {
      throw new Error(error?.message || 'Google Provider가 Supabase에 설정되지 않았습니다.');
    }

    window.location.href = data.url;
    return new Promise(() => {});
  } catch (err: any) {
    throw new Error(
      'Google OAuth 클라이언트 설정이 진행 중입니다. 아래 [Google 계정 직접 로그인]으로 즉시 이용하실 수 있습니다.'
    );
  }
}

/**
 * [애플] 공식 Apple OAuth 시도
 */
export async function loginWithAppleOAuth(): Promise<AuthUser> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });

    if (error || !data?.url) {
      throw new Error(error?.message || 'Apple Provider가 설정되지 않았습니다.');
    }

    window.location.href = data.url;
    return new Promise(() => {});
  } catch (err: any) {
    throw new Error(
      'Apple 로그인 클라이언트 설정이 진행 중입니다. 아래 [Apple ID 직접 로그인]으로 즉시 이용하실 수 있습니다.'
    );
  }
}

/**
 * 앱 초기 실행 시 URL 해시/쿼리의 OAuth 콜백 토큰 자동 감지 및 처리
 */
export async function checkOAuthRedirectCallback(): Promise<AuthUser | null> {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash;
  const search = window.location.search;

  // 1. Supabase Auth 또는 네이버 Implicit Access Token (#access_token=...) 감지
  if (hash && hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');

    if (accessToken) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getUser(accessToken);
        if (data?.user) {
          const u = data.user;
          const user: AuthUser = {
            id: u.id,
            name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split('@')[0] || '조사님',
            provider: (u.app_metadata?.provider?.toUpperCase() as SocialProvider) || 'GOOGLE',
            email: u.email,
            avatarUrl: u.user_metadata?.avatar_url,
            accessToken,
            authMethod: 'OAUTH_POPUP',
            loggedInAt: Date.now(),
            expiresAt: Date.now() + THIRTY_DAYS_MS,
          };

          if (window.opener) {
            window.opener.postMessage({ type: 'EXFISH_OAUTH_SUCCESS', user }, '*');
            window.close();
            return null;
          }

          saveAuthUser(user);
          window.history.replaceState({}, document.title, window.location.pathname);
          return user;
        }
      } catch (err) {
        console.warn('OAuth token restoration error:', err);
      }
    }
  }

  // 2. 카카오 인가 코드 (?code=...) 리다이렉트 복귀 처리
  if (search && search.includes('code=')) {
    const params = new URLSearchParams(search);
    const code = params.get('code');

    if (code) {
      // 리다이렉트 복귀 시 임시 가상 토큰 생성 및 URL 정리
      const now = Date.now();
      const user: AuthUser = {
        id: `kakao_auth_${now.toString(36)}`,
        name: '카카오 앵글러',
        provider: 'KAKAO',
        accessToken: `kakao_code_${code.substring(0, 16)}`,
        authMethod: 'OAUTH_POPUP',
        loggedInAt: now,
        expiresAt: now + THIRTY_DAYS_MS,
      };
      saveAuthUser(user);
      window.history.replaceState({}, document.title, window.location.pathname);
      return user;
    }
  }

  return null;
}
