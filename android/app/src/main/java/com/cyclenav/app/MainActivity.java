package com.cyclenav.app;

import android.content.Intent;
import android.database.Cursor;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BRouterPlugin.class);
    registerPlugin(OpenFilePlugin.class);
    super.onCreate(savedInstanceState);
    if (savedInstanceState == null) openFile(getIntent());
    // Let the in-app Saved drawer's left-edge swipe and index tabs win over the system Back gesture (Android caps this at 200dp tall).
    if (Build.VERSION.SDK_INT >= 29) {
      final View root = getWindow().getDecorView();
      root.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
        float d = getResources().getDisplayMetrics().density;
        int h = b - t, strip = (int) (28 * d), tall = (int) (200 * d);
        int top = Math.max(0, (h - tall) / 2);
        java.util.List<Rect> rects = new java.util.ArrayList<>();
        rects.add(new Rect(0, top, strip, top + tall));
        // Landscape: the Saved tabs sit at the right edge of the 356dp left column.
        if (r - l > h) { int x = (int) (356 * d); rects.add(new Rect(x, top, x + (int) (80 * d), top + tall)); }
        root.setSystemGestureExclusionRects(rects);
      });
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    openFile(intent);
  }

  // A .gpx opened with Cycle Nav ("Open with" in a file manager, browser download, or shared from
  // another app): read it off the main thread and pass it to the page.
  private void openFile(Intent intent) {
    if (intent == null) return;
    Uri uri = null;
    if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
    else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    if (uri == null) return;
    final Uri src = uri;
    new Thread(() -> {
      try (InputStream in = getContentResolver().openInputStream(src)) {
        if (in == null) return;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n, total = 0;
        while ((n = in.read(buf)) > 0) {
          total += n;
          if (total > 30 * 1024 * 1024) return; // not a route file
          out.write(buf, 0, n);
        }
        String text = new String(out.toByteArray(), StandardCharsets.UTF_8);
        if (!text.contains("<gpx")) return;
        OpenFilePlugin.deliver(displayName(src), text);
      } catch (Exception ignored) { }
    }).start();
  }

  private String displayName(Uri uri) {
    try (Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
      if (c != null && c.moveToFirst()) return c.getString(0);
    } catch (Exception ignored) { }
    String last = uri.getLastPathSegment();
    return last != null ? last : "";
  }
}
