package com.cyclenav.app;

import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(BRouterPlugin.class);
    registerPlugin(OpenFilePlugin.class);
    super.onCreate(savedInstanceState);
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
}
