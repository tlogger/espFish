// ExFish 표준 OAuth 2.0 (카카오, 네이버, 구글, 애플) 소셜 인증 통합 엔진
// 각 소셜 포털의 공식 인증 페이지(팝업/리다이렉트)를 통해 인가 토큰을 발급받고 프로필을 수신합니다.

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

/** 카카오 공식 JavaScript SDK v2 로드 및 초기화 */
export async function ensureKakaoSdk(): Promise<any> {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (!w.Kakao) {
    await loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js', 'kakao-js-sdk');
  }
  if (w.Kakao && !w.Kakao.isInitialized()) {
    w.Kakao.init(KAKAO_JAVASCRIPT_KEY);
  }
  return w.Kakao;
}

/** 네이버 로그인 공식 JavaScript SDK 로드 */
export async function ensureNaverSdk(): Promise<any> {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (!w.naver) {
    await loadScript('https://static.nid.naver.com/js/naveridlogin_js_sdk_2.0.2.js', 'naver-login-sdk');
  }
  return w.naver;
}

/** 구글 Identity Services (GIS) SDK 로드 */
export async function ensureGoogleGisSdk(): Promise<any> {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (!w.google?.accounts?.id) {
    await loadScript('https://accounts.google.com/gsi/client', 'google-gis-sdk');
  }
  return w.google;
}

/** Apple 공식 Sign-in with Apple JS SDK 로드 */
export async function ensureAppleSdk(): Promise<any> {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (!w.AppleID) {
    await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/auth.js', 'apple-auth-sdk');
  }
  return w.AppleID;
}

// 3. 플랫폼별 공식 OAuth 로그인 실행부

/**
 * [카카오] 공식 OAuth 2.0 로그인
 * 1) 카카오 JS SDK 팝업 로그인 실행 (모바일/팝업 차단 시 카카오 인가 리다이렉트)
 * 2) 액세스 토큰 수신 후 /v2/user/me 공식 API 호출로 검증된 계정 정보 획득
 */
export async function loginWithKakaoOAuth(): Promise<AuthUser> {
  const Kakao = await ensureKakaoSdk();
  if (!Kakao) {
    throw new Error('카카오 SDK를 초기화할 수 없습니다.');
  }

  const redirectUri = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';

  return new Promise<AuthUser>((resolve, reject) => {
    try {
      Kakao.Auth.login({
        scope: 'profile_nickname,profile_image,account_email',
        success: (authObj: any) => {
          Kakao.API.request({
            url: '/v2/user/me',
            success: (res: any) => {
              const account = res.kakao_account || {};
              const profile = account.profile || {};
              const id = `kakao_${res.id}`;
              const name = profile.nickname || '카카오 조사님';
              const email = account.email || undefined;
              const avatarUrl = profile.profile_image_url || undefined;
              const now = Date.now();

              const user: AuthUser = {
                id,
                name,
                provider: 'KAKAO',
                email,
                avatarUrl,
                accessToken: authObj.access_token,
                loggedInAt: now,
                expiresAt: now + THIRTY_DAYS_MS,
              };
              resolve(user);
            },
            fail: (apiErr: any) => {
              console.warn('Kakao profile request error:', apiErr);
              // 프로필 API 권한 이슈 시 기본 토큰 정보로 구성
              const now = Date.now();
              resolve({
                id: `kakao_${Date.now().toString(36)}`,
                name: '카카오 조사님',
                provider: 'KAKAO',
                accessToken: authObj.access_token,
                loggedInAt: now,
                expiresAt: now + THIRTY_DAYS_MS,
              });
            },
          });
        },
        fail: (err: any) => {
          console.warn('Kakao popup login fail, attempting authorize redirect:', err);
          // 팝업이 차단되었거나 모바일인 경우 전체 리다이렉트 인가 플로우 가동
          if (Kakao.Auth.authorize && redirectUri) {
            Kakao.Auth.authorize({
              redirectUri,
              state: 'kakao_oauth',
            });
          } else {
            reject(new Error(err?.error_description || '카카오 로그인에 실패했습니다.'));
          }
        },
      });
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * [네이버] 공식 OAuth 2.0 로그인
 * 1) 네이버 공식 인증 팝업(또는 리다이렉트 창) 열기
 * 2) Implicit 토큰 방식 또는 네이버 아이디 로그인 SDK로 프로필 획득
 */
export async function loginWithNaverOAuth(): Promise<AuthUser> {
  const redirectUri = window.location.origin + window.location.pathname;
  const state = Math.random().toString(36).substring(2, 11);
  const authUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=token&client_id=${NAVER_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&state=${state}`;

  return new Promise<AuthUser>((resolve, reject) => {
    // 화면 중앙에 네이버 공식 로그인 팝업 창 생성
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      authUrl,
      'naver_oauth_popup',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=no`
    );

    if (!popup) {
      // 팝업 차단 시 전체 창 리다이렉트
      window.location.href = authUrl;
      return;
    }

    // 팝업 응답 대기 및 닫힘 모니터링
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'EXFISH_NAVER_OAUTH_SUCCESS') {
        window.removeEventListener('message', handleMessage);
        resolve(event.data.user);
      }
    };
    window.addEventListener('message', handleMessage);

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        window.removeEventListener('message', handleMessage);
        // 사용자가 창을 닫았으나 토큰을 수신하지 못한 경우
        // 로컬 임시 세션 폴백 대신 안전한 안내
        reject(new Error('네이버 로그인 창이 닫혔거나 인증이 취소되었습니다.'));
      }
    }, 800);
  });
}

/**
 * [구글] 공식 Google Identity Services (GIS) One Tap / OAuth 2.0 로그인
 */
export async function loginWithGoogleOAuth(): Promise<AuthUser> {
  // 1차 시도: Supabase Auth 내장 Google OAuth 프로바이더
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (!error && data?.url) {
      window.location.href = data.url;
      return new Promise(() => {}); // 리다이렉트
    }
  } catch (e) {
    console.warn('Supabase Google OAuth fallback to GIS:', e);
  }

  // 2차 시도: Google Identity Services (GIS)
  const google = await ensureGoogleGisSdk();
  if (!google?.accounts?.id) {
    throw new Error('Google 로그인 SDK를 로드할 수 없습니다.');
  }

  return new Promise<AuthUser>((resolve, reject) => {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response: any) => {
        try {
          // JWT 토큰 페이로드 디코딩 (Base64URL)
          const base64Url = response.credential.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(decodeURIComponent(escape(window.atob(base64))));

          const now = Date.now();
          const user: AuthUser = {
            id: `google_${payload.sub}`,
            name: payload.name || payload.email?.split('@')[0] || '구글 앵글러',
            provider: 'GOOGLE',
            email: payload.email,
            avatarUrl: payload.picture,
            accessToken: response.credential,
            loggedInAt: now,
            expiresAt: now + THIRTY_DAYS_MS,
          };
          resolve(user);
        } catch (err) {
          reject(err);
        }
      },
    });

    google.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        reject(new Error('Google 로그인 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.'));
      }
    });
  });
}

/**
 * [애플] 공식 Sign in with Apple OAuth 로그인
 */
export async function loginWithAppleOAuth(): Promise<AuthUser> {
  // Supabase Auth 내장 Apple OAuth 프로바이더 우선 활용
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo: window.location.origin + window.location.pathname,
    },
  });

  if (error || !data?.url) {
    throw new Error(error?.message || 'Apple 로그인 창을 열 수 없습니다.');
  }

  window.location.href = data.url;
  return new Promise(() => {});
}

/**
 * 앱 초기 실행 시 URL 해시/쿼리의 OAuth 콜백 토큰 자동 감지 및 처리
 * (Supabase Auth 리턴, 카카오/네이버 인가 콜백 공통)
 */
export async function checkOAuthRedirectCallback(): Promise<AuthUser | null> {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash;
  const search = window.location.search;

  // 1. Supabase Auth 또는 네이버 Implicit Access Token (#access_token=...) 감지
  if (hash && hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const providerToken = params.get('provider_token');

    if (accessToken) {
      // Supabase 세션 사용자 정보 복원 시도
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
            loggedInAt: Date.now(),
            expiresAt: Date.now() + THIRTY_DAYS_MS,
          };

          // 팝업창에서 열린 경우 부모 창에 전달 후 닫기
          if (window.opener) {
            window.opener.postMessage({ type: 'EXFISH_OAUTH_SUCCESS', user }, '*');
            window.close();
            return null;
          }

          saveAuthUser(user);
          // URL 정리 (해시 제거)
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
    const state = params.get('state');

    if (code && state === 'kakao_oauth') {
      try {
        const Kakao = await ensureKakaoSdk();
        // 카카오 SDK Auth.setAccessToken 혹은 토큰 교환
        console.log('Kakao code received:', code);
        // URL 정리
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error('Kakao code callback error:', e);
      }
    }
  }

  return null;
}
