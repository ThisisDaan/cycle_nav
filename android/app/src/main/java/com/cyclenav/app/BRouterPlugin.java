package com.cyclenav.app;

import android.app.ActivityManager;
import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import btools.router.FormatJson;
import btools.router.OsmNodeNamed;
import btools.router.OsmTrack;
import btools.router.RoutingContext;
import btools.router.RoutingEngine;
import btools.router.RoutingParamCollector;

/** Embedded BRouter: offline routing on downloaded .rd5 segments. */
@CapacitorPlugin(name = "BRouter")
public class BRouterPlugin extends Plugin {
  private static final String SEGMENT_URL = "https://brouter.de/brouter/segments4/";

  private final ExecutorService routePool = Executors.newSingleThreadExecutor();
  private final ExecutorService downloadPool = Executors.newCachedThreadPool();

  private File baseDir() {
    File d = new File(getContext().getFilesDir(), "brouter");
    d.mkdirs();
    return d;
  }

  private File segmentsDir() {
    File d = new File(baseDir(), "segments4");
    d.mkdirs();
    return d;
  }

  private static boolean validName(String n) {
    return n != null && n.matches("[EW]\\d{1,3}_[NS]\\d{1,2}");
  }

  private File profileDir() throws Exception {
    File dir = new File(getContext().getCacheDir(), "brouter-profiles");
    dir.mkdirs();
    File lookups = new File(dir, "lookups.dat");
    if (!lookups.exists()) {
      try (InputStream in = getContext().getAssets().open("brouter/lookups.dat");
           OutputStream out = new FileOutputStream(lookups)) {
        copy(in, out);
      }
    }
    return dir;
  }

  private static void copy(InputStream in, OutputStream out) throws Exception {
    byte[] buf = new byte[64 * 1024];
    int n;
    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
  }

  private File writeProfile(String text) throws Exception {
    File dir = profileDir();
    File f = new File(dir, "p" + Integer.toHexString(text.hashCode()) + "_" + text.length() + ".brf");
    if (!f.exists()) {
      try (OutputStream out = new FileOutputStream(f)) {
        out.write(text.getBytes(StandardCharsets.UTF_8));
      }
      File[] all = dir.listFiles((d, n) -> n.endsWith(".brf"));
      if (all != null && all.length > 24) {
        Arrays.sort(all, Comparator.comparingLong(File::lastModified));
        for (int i = 0; i < all.length - 24; i++) if (!all[i].equals(f)) all[i].delete();
      }
    }
    return f;
  }

  @PluginMethod
  public void route(final PluginCall call) {
    routePool.execute(() -> {
      try {
        JSArray lonlats = call.getArray("lonlats");
        String profile = call.getString("profile");
        if (lonlats == null || lonlats.length() < 2 || profile == null) {
          call.reject("lonlats (2+) and profile required");
          return;
        }
        StringBuilder ll = new StringBuilder();
        for (int i = 0; i < lonlats.length(); i++) {
          JSONArray p = lonlats.getJSONArray(i);
          if (i > 0) ll.append('|');
          ll.append(p.getDouble(0)).append(',').append(p.getDouble(1));
        }
        File profileFile = writeProfile(profile);

        RoutingParamCollector pc = new RoutingParamCollector();
        List<OsmNodeNamed> wps = pc.getWayPointList(ll.toString());

        RoutingContext rc = new RoutingContext();
        int mc = ((ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE)).getMemoryClass();
        rc.memoryclass = Math.max(64, Math.min(128, mc / 2));
        rc.localFunction = profileFile.getPath();

        // Same knobs the web request uses.
        Map<String, String> params = new HashMap<>();
        Integer alt = call.getInt("alternativeidx", 0);
        params.put("alternativeidx", String.valueOf(alt == null ? 0 : alt));
        params.put("timode", "2");
        params.put("format", "geojson");
        JSObject extra = call.getObject("params");
        if (extra != null) {
          Iterator<String> it = extra.keys();
          while (it.hasNext()) {
            String k = it.next();
            params.put(k.startsWith("profile:") ? k : "profile:" + k, String.valueOf(extra.get(k)));
          }
        }
        pc.setParams(rc, wps, params);

        RoutingEngine engine = new RoutingEngine(null, null, segmentsDir(), wps, rc, 0);
        engine.quite = true;
        engine.doRun(60000);
        if (engine.getErrorMessage() != null) {
          call.reject(engine.getErrorMessage().trim());
          return;
        }
        OsmTrack track = engine.getFoundTrack();
        if (track == null) {
          call.reject("no route found");
          return;
        }
        JSObject ret = new JSObject();
        ret.put("geojson", new FormatJson(rc).format(track));
        call.resolve(ret);
      } catch (Throwable e) {
        call.reject(String.valueOf(e.getMessage() != null ? e.getMessage() : e));
      }
    });
  }

  @PluginMethod
  public void listSegments(PluginCall call) {
    JSArray arr = new JSArray();
    File[] files = segmentsDir().listFiles((d, n) -> n.endsWith(".rd5"));
    if (files != null) {
      Arrays.sort(files);
      for (File f : files) {
        JSObject o = new JSObject();
        o.put("name", f.getName().substring(0, f.getName().length() - 4));
        o.put("size", f.length());
        arr.put(o);
      }
    }
    JSObject ret = new JSObject();
    ret.put("segments", arr);
    call.resolve(ret);
  }

  @PluginMethod
  public void deleteSegment(PluginCall call) {
    String name = call.getString("name");
    if (!validName(name)) {
      call.reject("invalid segment name");
      return;
    }
    new File(segmentsDir(), name + ".rd5").delete();
    call.resolve();
  }

  @PluginMethod
  public void downloadSegment(final PluginCall call) {
    final String name = call.getString("name");
    if (!validName(name)) {
      call.reject("invalid segment name");
      return;
    }
    downloadPool.execute(() -> {
      File part = new File(segmentsDir(), name + ".rd5.part");
      HttpURLConnection conn = null;
      try {
        conn = (HttpURLConnection) new URL(SEGMENT_URL + name + ".rd5").openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty("User-Agent", "CycleNav");
        if (conn.getResponseCode() != 200) {
          call.reject("HTTP " + conn.getResponseCode());
          return;
        }
        long total = conn.getContentLengthLong();
        long loaded = 0, lastEmit = 0;
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part)) {
          byte[] buf = new byte[64 * 1024];
          int n;
          while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            loaded += n;
            long now = System.currentTimeMillis();
            if (now - lastEmit > 250) {
              lastEmit = now;
              emitProgress(name, loaded, total);
            }
          }
        }
        if (total > 0 && loaded != total) throw new java.io.IOException("incomplete download");
        File dest = new File(segmentsDir(), name + ".rd5");
        dest.delete();
        if (!part.renameTo(dest)) throw new java.io.IOException("rename failed");
        emitProgress(name, loaded, total > 0 ? total : loaded);
        JSObject ret = new JSObject();
        ret.put("name", name);
        ret.put("size", dest.length());
        call.resolve(ret);
      } catch (Throwable e) {
        part.delete();
        call.reject(String.valueOf(e.getMessage() != null ? e.getMessage() : e));
      } finally {
        if (conn != null) conn.disconnect();
      }
    });
  }

  private void emitProgress(String name, long loaded, long total) {
    JSObject ev = new JSObject();
    ev.put("name", name);
    ev.put("loaded", loaded);
    ev.put("total", total);
    notifyListeners("segmentProgress", ev);
  }
}
