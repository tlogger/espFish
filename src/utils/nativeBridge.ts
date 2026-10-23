// ExFish Android Native Bridge (Phase 2 & Phase 3)
// 1. Fused Location GPS (Capacitor Geolocation + Fallback)
// 2. Screen Keep-Awake (화면 꺼짐 방지)
// 3. Haptics Feedback (미세조정 & 줌 & 위치 햅틱 진동)
// 4. Physical Volume Key Zoom (볼륨키 지도 줌 인/아웃)
// 5. Local Notifications & Emergency Tide Evacuation Engine (들물 탈출 긴급 알림 & 진동)

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapApp } from '@capacitor/app';
import { playEvacuationBeep, playEvacuationSiren } from './tideAlertSound';

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

// --------------------------------------------------------------------------
// Phase 3: 로컬 푸시 알림 및 들물 탈출 비상 골든타임 경보 엔진
// --------------------------------------------------------------------------

const TIDE_CHANNEL_ID = 'exfish_tide_emergency';
let isChannelInitialized = false;

/**
 * Android NotificationChannel 등록 (최고 중요도, 진동, 경보 LED)
 */
export async function initTideAlertChannel(): Promise<void> {
  if (isChannelInitialized || !isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: TIDE_CHANNEL_ID,
      name: '들물 긴급 대피 경보 (ExFish)',
      description: '갯바위/방파제 들물 고립 골든타임 비상 경보',
      importance: 5, // IMPORTANCE_HIGH / HEADS_UP (화면 상단 헤드업 알림 팝업)
      visibility: 1, // VISIBILITY_PUBLIC (잠금화면에서도 전체 표시)
      vibration: true,
      lights: true,
      lightColor: '#EF4444',
    });
    isChannelInitialized = true;
  } catch (err) {
    console.warn('Failed to initialize Android Notification Channel:', err);
  }
}

/**
 * 알림 권한 확인 및 요청 (Android 13+ POST_NOTIFICATIONS 및 Web Notification)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      await initTideAlertChannel();
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        perm = await LocalNotifications.requestPermissions();
      }
      return perm.display === 'granted';
    } catch (err) {
      console.warn('Native notification permission error:', err);
      return false;
    }
  }

  // Web Browser Notification API Fallback
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      const res = await Notification.requestPermission();
      return res === 'granted';
    }
  }
  return false;
}

/**
 * 갯바위 들물 탈출 비상 경보 즉각 발송
 * - 네이티브 로컬 알림 헤드업 팝업
 * - Web Audio API 고출력 사이렌/비프 사운드
 * - Haptic 진동 패턴
 */
export async function sendEmergencyEvacuationNotification(
  title: string,
  body: string,
  isUrgent: boolean = false
): Promise<void> {
  // 1. 소리 및 햅틱 진동 즉시 트리거 (앱 포그라운드 시 즉각 반응)
  if (isUrgent) {
    playEvacuationSiren(3);
    triggerHaptic('warning');
  } else {
    playEvacuationBeep();
    triggerHaptic('medium');
  }

  // 2. Android 네이티브 Local Notification 발송 (화면 꺼짐 및 백그라운드에서도 작동)
  if (isNativePlatform()) {
    try {
      await initTideAlertChannel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Date.now() / 1000) % 100000,
            title,
            body,
            channelId: TIDE_CHANNEL_ID,
            smallIcon: 'ic_launcher',
            extra: { type: 'tide_emergency', timestamp: Date.now() },
            ongoing: false,
            autoCancel: true,
          },
        ],
      });
      return;
    } catch (err) {
      console.warn('LocalNotifications.schedule failed:', err);
    }
  }

  // 3. Web Notification Fallback (PC 및 모바일 브라우저)
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'exfish-tide-alert',
      });
    } catch (e) {
      console.warn('Web notification failed:', e);
    }
  }
}

/**
 * 들물 골든타임 예정 시각에 정확히 울리는 예약 알람 등록
 */
export async function scheduleTideEvacuationAlarm(
  id: number,
  title: string,
  body: string,
  triggerDate: Date
): Promise<boolean> {
  if (triggerDate.getTime() <= Date.now()) {
    // 이미 지난 시간이면 즉시 발송
    sendEmergencyEvacuationNotification(title, body, true);
    return true;
  }

  if (isNativePlatform()) {
    try {
      await initTideAlertChannel();
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            schedule: { at: triggerDate, allowWhileIdle: true },
            channelId: TIDE_CHANNEL_ID,
            smallIcon: 'ic_launcher',
            extra: { scheduled: true, id },
          },
        ],
      });
      return true;
    } catch (err) {
      console.warn('Failed to schedule local notification:', err);
    }
  }
  return false;
}

/**
 * 예약된 들물 비상 알람 취소
 */
export async function cancelTideEvacuationAlarm(id: number): Promise<void> {
  if (isNativePlatform()) {
    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch (err) {
      console.warn('Failed to cancel local notification:', err);
    }
  }
}

/**
 * 6. Android 하드웨어 백 버튼 리스너 (요구사항 2: 모바일앱 백버튼 네비게이션)
 * - 팝업 모달 닫기 -> 미세조정 취소 -> 상세 서랍 닫기 -> 포인트 선택 해제 -> 기본 지도 뷰 순환
 * - 기본 지도 뷰 상태에서 2초 내에 두 번 누르면 앱 종료
 */
export function setupHardwareBackButtonListener(onBack: () => boolean): () => void {
  if (!isNativePlatform()) return () => {};

  let lastBackPressTime = 0;
  const listenerPromise = CapApp.addListener('backButton', () => {
    // onBack()이 true를 반환하면 내부 뷰/팝업을 닫았음을 의미함 (앱 종료 방지)
    const handled = onBack();
    if (!handled) {
      const now = Date.now();
      if (now - lastBackPressTime < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressTime = now;
        triggerHaptic('light');
      }
    }
  });

  return () => {
    listenerPromise.then((handle) => handle.remove()).catch(() => {});
  };
}

