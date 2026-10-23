package com.tlogger.exfish;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (bridge != null && bridge.getWebView() != null) {
            WebView webView = bridge.getWebView();
            WebSettings settings = webView.getSettings();
            settings.setGeolocationEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setSupportMultipleWindows(true);

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    // Automatically grant geolocation permission for https://localhost (Capacitor Origin)
                    callback.invoke(origin, true, false);
                }
            });

            // 카카오맵 외부 앱/웹 링크 및 Intent 스킴을 안드로이드 시스템 브라우저/카카오맵 앱으로 안전하게 연결
            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri uri = request.getUrl();
                    String url = uri.toString();
                    if (url.startsWith("https://localhost") || url.startsWith("http://localhost")) {
                        return false;
                    }
                    if (url.startsWith("kakaomap:") || url.startsWith("kakaonavi:") || url.startsWith("intent:") ||
                        url.startsWith("https://map.kakao.com") || url.startsWith("http://map.kakao.com") ||
                        url.startsWith("https://map.naver.com") || url.startsWith("http://map.naver.com")) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                            return true;
                        } catch (Exception e) {
                            // If app scheme fails, fallback to web
                            if (url.startsWith("intent:")) {
                                try {
                                    Intent parsed = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                                    String fallbackUrl = parsed.getStringExtra("browser_fallback_url");
                                    if (fallbackUrl != null) {
                                        Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackUrl));
                                        startActivity(webIntent);
                                        return true;
                                    }
                                } catch (Exception ignored) {}
                            }
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }

    /**
     * Physical Volume Key Mapping for Field Fishing (Phase 2):
     * When fishing on rocks or breakwaters with wet/slimy hands,
     * Hardware Volume Keys trigger Map Zoom In / Out directly!
     */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('exfish:volume-zoom', { detail: { dir: 'in' } }));",
                    null
                );
                return true; // Consume event to prevent OS volume HUD from blocking map
            }
        } else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('exfish:volume-zoom', { detail: { dir: 'out' } }));",
                    null
                );
                return true; // Consume event
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
