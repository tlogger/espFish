// ExFish Android Native Bridge (Phase 2)
// 1. Fused Location GPS (Capacitor Geolocation + Fallback)
// 2. Screen Keep-Awake (화면 꺼짐 방지)
// 3. Haptics Feedback (미세조정 & 줌 & 위치 햅틱 진동)
// 4. Physical Volume Key Zoom (볼륨키 지도 줌 인/아웃)

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export interface NativeLocationResult {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * 네이티브 앱(Android/iOS) 런타임 여부 반환
 */
export function isNativePlatform(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

/**
 * 고정밀 GPS 위치 획득 (Android FusedLocationProviderClient 브릿지)
 * - 네이티브 앱: Capacitor Geolocation (권한 자동 확인 및 요청)
 * - 웹 브라우저: navigator.geolocation fallback
 */
export async function getNativeLocation(): Promise<NativeLocationResult> {
  if (isNativePlatform()) {
    try {
      // 1. 권한 확인 및 요청
      let perm = await Geolocation.checkPermissions();
      if (perm.location !== 'granted') {
        perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      }

      // 2. 고정밀 위치 요청
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 3000,
      });

      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy || 10,
      };
    } catch (err) {
      console.warn('Capacitor native geolocation error, falling back to navigator:', err);
    }
  }

  // Web Browser Fallback
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported in this environment.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 15,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
  });
}

// Web WakeLock Sentinel 참조
let webWakeLockSentinel: any = null;

/**
 * 화면 꺼짐 방지(Screen Keep-Awake) 활성화/비활성화
 * - 갯바위/방파제에서 낚싯대를 쥐고 거치된 화면을 상시 주시할 때 화면 꺼짐 방지
 */
export async function setScreenKeepAwake(enable: boolean): Promise<boolean> {
  try {
    if (isNativePlatform()) {
      if (enable) {
        await KeepAwake.keepAwake();
      } else {
        await KeepAwake.allowSleep();
      }
      return true;
    }

    // Web Browser Screen Wake Lock API Fallback
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      if (enable) {
        if (!webWakeLockSentinel) {
          webWakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          webWakeLockSentinel.addEventListener('release', () => {
            webWakeLockSentinel = null;
          });
        }
      } else {
        if (webWakeLockSentinel) {
          await webWakeLockSentinel.release();
          webWakeLockSentinel = null;
        }
      }
      return true;
    }
  } catch (err) {
    console.warn('Keep-Awake control failed:', err);
  }
  return false;
}

/**
 * 네이티브 햅틱 피드백 진동
 * - 볼륨키 조작, 1m 미세조정 넛지, 위치 획득 성공 시 촉각 피드백
 */
export async function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' = 'light'): Promise<void> {
  try {
    if (isNativePlatform()) {
      if (type === 'light') {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (type === 'medium') {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else if (type === 'heavy') {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else if (type === 'success') {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (type === 'warning') {
        await Haptics.notification({ type: NotificationType.Warning });
      }
      return;
    }

    // Web Vibration API Fallback
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (type === 'light') navigator.vibrate(12);
      else if (type === 'medium') navigator.vibrate(25);
      else if (type === 'heavy') navigator.vibrate(45);
      else if (type === 'success') navigator.vibrate([20, 40, 20]);
      else if (type === 'warning') navigator.vibrate([40, 60, 40]);
    }
  } catch {
    // Ignore unsupported vibration errors
  }
}

/**
 * 하드웨어 볼륨 키 지도 줌 인/아웃 커스텀 이벤트 리스너 등록
 * - Android MainActivity.java에서 전달하는 'exfish:volume-zoom' 이벤트 수신
 */
export function setupVolumeZoomListener(onZoom: (dir: 'in' | 'out') => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (e: Event) => {
    const customEvent = e as CustomEvent<{ dir: 'in' | 'out' }>;
    if (customEvent.detail && (customEvent.detail.dir === 'in' || customEvent.detail.dir === 'out')) {
      triggerHaptic('light');
      onZoom(customEvent.detail.dir);
    }
  };

  window.addEventListener('exfish:volume-zoom', handler);
  return () => {
    window.removeEventListener('exfish:volume-zoom', handler);
  };
}
