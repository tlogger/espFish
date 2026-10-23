package com.tlogger.exfish;

import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (bridge != null && bridge.getWebView() != null) {
            WebSettings settings = bridge.getWebView().getSettings();
            settings.setGeolocationEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setSupportMultipleWindows(true);

            bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    // Automatically grant geolocation permission for https://localhost (Capacitor Origin)
                    callback.invoke(origin, true, false);
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
