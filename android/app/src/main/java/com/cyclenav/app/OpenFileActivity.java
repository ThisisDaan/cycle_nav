package com.cyclenav.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

// The invisible doorway for files opened with Cycle Nav ("Open with" in a file manager, a browser
// download, shared from another app). File managers like Files by Google start the app "for a
// result", which makes Android put it inside the file manager's own window, whatever the launch
// mode says. So this reads the file (while we still have permission to), hands it to the page and
// brings up Cycle Nav in its own window, then closes.
public class OpenFileActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    Intent intent = getIntent();
    Uri uri = null;
    if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
    else if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
    if (uri != null) {
      String text = read(uri);
      // not a GPX: the page says so instead of opening to nothing
      OpenFilePlugin.deliver(displayName(uri), text.contains("<gpx") ? text : "");
    }
    Intent open = new Intent(this, MainActivity.class)
      .setAction(Intent.ACTION_MAIN)
      .addCategory(Intent.CATEGORY_LAUNCHER)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
    startActivity(open);
    finish();
    overridePendingTransition(0, 0);
  }

  private String read(Uri uri) {
    try (InputStream in = getContentResolver().openInputStream(uri)) {
      if (in == null) return "";
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buf = new byte[16384];
      int n, total = 0;
      while ((n = in.read(buf)) > 0) {
        total += n;
        if (total > 30 * 1024 * 1024) return ""; // far too big for a route file
        out.write(buf, 0, n);
      }
      return new String(out.toByteArray(), StandardCharsets.UTF_8);
    } catch (Exception e) {
      return "";
    }
  }

  private String displayName(Uri uri) {
    try (Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
      if (c != null && c.moveToFirst()) return c.getString(0);
    } catch (Exception ignored) { }
    String last = uri.getLastPathSegment();
    return last != null ? last : "";
  }
}
