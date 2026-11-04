package dev.nikzad.nikbrowser;

import android.Manifest;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.Log;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.webkit.URLUtil;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;
import org.mozilla.geckoview.WebResponse;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * NikBrowser — a dedicated Firefox-engine (GeckoView) browser with the
 * Multi-Account Switcher + Temp-Mail engine bundled as a privileged
 * built-in WebExtension (installed from APK assets at startup).
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "NikBrowser";
    private static final String EXT_URI = "resource://android/assets/extensions/nikmail/";
    private static final String EXT_ID = "nikmail@nikzad.dev";
    private static final String FALLBACK_HOME = "https://duckduckgo.com/";
    private static final int REQ_NOTIF = 41;

    private GeckoRuntime runtime;
    private GeckoView geckoView;
    private EditText urlBox;
    private ProgressBar progress;

    private final List<GeckoSession> tabs = new ArrayList<>();
    private final Map<GeckoSession, String> lastUrl = new HashMap<>();
    private final Map<GeckoSession, Boolean> canGoBackMap = new HashMap<>();
    private final Handler main = new Handler(Looper.getMainLooper());

    private GeckoSession attached;
    private String extBaseUri = null;
    private boolean firstTabLoaded = false;

    // ------------------------------------------------------------------ //

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        geckoView = findViewById(R.id.gecko_view);
        urlBox = findViewById(R.id.url_box);
        progress = findViewById(R.id.progress);

        askNotificationPermission();

        GeckoRuntimeSettings.Builder sb = new GeckoRuntimeSettings.Builder();
        sb.extensionsProcessEnabled(true);
        sb.consoleOutput(false);
        sb.remoteDebuggingEnabled(false);
        runtime = GeckoRuntime.create(this, sb.build());

        installBuiltInExtension();
        switchTo(createTab(null));

        // If the built-in extension is not ready shortly, show a normal home page.
        main.postDelayed(() -> {
            if (!firstTabLoaded && attached != null) {
                attached.loadUri(FALLBACK_HOME);
            }
        }, 5000);

        urlBox.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                navigateTo(urlBox.getText().toString());
                return true;
            }
            return false;
        });

        ImageButton back = findViewById(R.id.btn_back);
        ImageButton fwd = findViewById(R.id.btn_fwd);
        ImageButton reload = findViewById(R.id.btn_reload);
        ImageButton tabsBtn = findViewById(R.id.btn_tabs);
        ImageButton mailBtn = findViewById(R.id.btn_mail);

        back.setOnClickListener(v -> {
            if (attached != null && Boolean.TRUE.equals(canGoBackMap.get(attached))) {
                attached.goBack();
            }
        });
        fwd.setOnClickListener(v -> {
            if (attached != null) attached.goForward();
        });
        reload.setOnClickListener(v -> {
            if (attached != null) attached.reload();
        });
        tabsBtn.setOnClickListener(v -> showTabsDialog());
        mailBtn.setOnClickListener(v -> openMailPanel());
    }

    // ------------------------------------------------------------------ //
    // Built-in WebExtension (the whole multi-account + temp-mail engine)
    // ------------------------------------------------------------------ //

    private void installBuiltInExtension() {
        runtime.getWebExtensionController().ensureBuiltIn(EXT_URI, EXT_ID).then(
                (WebExtension ext) -> {
                    if (ext != null && ext.metaData != null) {
                        extBaseUri = ext.metaData.baseURI;
                        Log.i(TAG, "built-in extension ready: " + extBaseUri);
                        main.post(this::openMailPanel);
                    }
                    return null;
                },
                (Throwable ex) -> {
                    Log.w(TAG, "built-in extension failed", ex);
                    main.post(() -> Toast
                            .makeText(this, R.string.ext_failed, Toast.LENGTH_LONG)
                            .show());
                    return null;
                });
    }

    private String startUrl() {
        return extBaseUri != null ? extBaseUri + "popup.html" : null;
    }

    private void openMailPanel() {
        if (extBaseUri == null) {
            Toast.makeText(this, R.string.loading_home, Toast.LENGTH_SHORT).show();
            return;
        }
        if (attached != null) {
            attached.loadUri(startUrl());
        }
    }

    // ------------------------------------------------------------------ //
    // Tabs
    // ------------------------------------------------------------------ //

    private GeckoSession createTab(String url) {
        GeckoSession s = new GeckoSession();
        s.open(runtime);
        s.setProgressDelegate(new TabCallbacks());
        s.setNavigationDelegate(new TabCallbacks());
        s.setContentDelegate(new TabCallbacks());
        tabs.add(s);
        lastUrl.put(s, url == null ? "about:blank" : url);
        if (url != null) {
            s.loadUri(url);
        }
        return s;
    }

    private void switchTo(GeckoSession s) {
        if (attached != null && attached != s) {
            geckoView.releaseSession();
        }
        attached = s;
        geckoView.setSession(s);
        String u = lastUrl.get(s);
        urlBox.setText(u == null ? "" : u);
    }

    private void closeTab(GeckoSession s) {
        if (s == null) {
            return;
        }
        int idx = tabs.indexOf(s);
        tabs.remove(s);
        lastUrl.remove(s);
        if (attached == s) {
            geckoView.releaseSession();
            attached = null;
        }
        try {
            s.stop();
            s.close();
        } catch (Exception ignored) {
        }
        if (tabs.isEmpty()) {
            switchTo(createTab(startUrl()));
        } else {
            switchTo(tabs.get(Math.max(0, Math.min(idx, tabs.size() - 1))));
        }
    }

    private void showTabsDialog() {
        if (tabs.isEmpty()) {
            return;
        }
        String[] labels = new String[tabs.size()];
        for (int i = 0; i < tabs.size(); i++) {
            String u = lastUrl.get(tabs.get(i));
            labels[i] = (i + 1) + ". " + (TextUtils.isEmpty(u) ? "about:blank" : shorten(u));
        }
        new AlertDialog.Builder(this)
                .setTitle(R.string.tabs_btn)
                .setItems(labels, (d, w) -> switchTo(tabs.get(w)))
                .setNeutralButton(R.string.new_tab,
                        (d, w) -> switchTo(createTab(startUrl())))
                .setNegativeButton(R.string.close_tab,
                        (d, w) -> closeTab(attached))
                .show();
    }

    private static String shorten(String u) {
        if (u.length() > 48) {
            return u.substring(0, 45) + "…";
        }
        return u;
    }

    // ------------------------------------------------------------------ //
    // Navigation helpers
    // ------------------------------------------------------------------ //

    private void navigateTo(String input) {
        if (attached == null || TextUtils.isEmpty(input)) {
            return;
        }
        String t = input.trim();
        String u;
        if (t.startsWith("http://") || t.startsWith("https://")
                || t.startsWith("about:") || t.startsWith("moz-extension://")
                || t.startsWith("resource://") || t.startsWith("data:")) {
            u = t;
        } else if (t.contains(".") && !t.contains(" ")) {
            u = "https://" + t;
        } else {
            u = "https://duckduckgo.com/?q=" + Uri.encode(t);
        }
        attached.loadUri(u);
    }

    @Override
    public void onBackPressed() {
        if (attached != null && Boolean.TRUE.equals(canGoBackMap.get(attached))) {
            attached.goBack();
            return;
        }
        if (tabs.size() > 1) {
            closeTab(attached);
            return;
        }
        super.onBackPressed();
    }

    // ------------------------------------------------------------------ //
    // Session delegates (single shared instance, methods are defensive)
    // ------------------------------------------------------------------ //

    private class TabCallbacks implements
            GeckoSession.ProgressDelegate,
            GeckoSession.NavigationDelegate,
            GeckoSession.ContentDelegate {

        // ---- ProgressDelegate ----
        public void onLocationChange(GeckoSession session, String url) {
            updateUrl(session, url);
        }

        public void onLocationChange(GeckoSession session, String url,
                                     List<String> permissionsList) {
            updateUrl(session, url);
        }

        public void onPageStarted(GeckoSession session, String url) {
            if (session == attached) {
                progress.setVisibility(View.VISIBLE);
            }
        }

        public void onPageStop(GeckoSession session, boolean success) {
            if (session == attached) {
                progress.setVisibility(View.GONE);
            }
        }

        // ---- NavigationDelegate ----
        public void onCanGoBack(GeckoSession session, boolean canGoBack) {
            canGoBackMap.put(session, canGoBack);
        }

        public GeckoResult<GeckoSession> onNewSession(GeckoSession parent, String uri) {
            return GeckoResult.fromValue(createTab(uri));
        }

        public void onExternalResponse(GeckoSession session, WebResponse response) {
            try {
                DownloadManager dm =
                        (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null || response == null || TextUtils.isEmpty(response.uri)) {
                    return;
                }
                DownloadManager.Request req =
                        new DownloadManager.Request(Uri.parse(response.uri));
                req.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                String name = URLUtil.guessFileName(response.uri, null, null);
                req.setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS, name);
                if (response.headers != null) {
                    String cookie = response.headers.get("Cookie");
                    if (TextUtils.isEmpty(cookie)) {
                        cookie = response.headers.get("cookie");
                    }
                    if (!TextUtils.isEmpty(cookie)) {
                        req.addRequestHeader("Cookie", cookie);
                    }
                    String ua = response.headers.get("User-Agent");
                    if (!TextUtils.isEmpty(ua)) {
                        req.addRequestHeader("User-Agent", ua);
                    }
                }
                dm.enqueue(req);
                Toast.makeText(MainActivity.this,
                        R.string.download_started, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Log.w(TAG, "download failed", e);
            }
        }

        // ---- ContentDelegate ----
        public void onTitleChange(GeckoSession session, String title) {
            if (TextUtils.isEmpty(title)) {
                return;
            }
            String u = lastUrl.get(session);
            if (session == attached && !TextUtils.isEmpty(u)) {
                // keep URL box stable; titles are only used for the tabs dialog
            }
        }
    }

    private void updateUrl(GeckoSession session, String url) {
        if (url == null) {
            return;
        }
        lastUrl.put(session, url);
        if (session == attached) {
            urlBox.setText(url);
        }
    }

    // ------------------------------------------------------------------ //
    // Android 13+ notification permission (for OTP alerts)
    // ------------------------------------------------------------------ //

    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        REQ_NOTIF);
            }
        }
    }
}
