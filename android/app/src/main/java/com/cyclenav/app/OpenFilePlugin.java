package com.cyclenav.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Hands files opened with Cycle Nav from other apps ("Open with", share) to the web code.
// The file that launched the app waits in `pending` until the page asks for it with take();
// files opened while the app runs are sent as "file" events.
@CapacitorPlugin(name = "OpenFile")
public class OpenFilePlugin extends Plugin {
  private static OpenFilePlugin instance;
  private static JSObject pending;

  @Override
  public void load() { instance = this; }

  static synchronized void deliver(String name, String text) {
    JSObject f = new JSObject();
    f.put("name", name);
    f.put("text", text);
    if (instance != null && instance.hasListeners("file")) instance.notifyListeners("file", f);
    else pending = f;
  }

  @PluginMethod
  public void take(PluginCall call) {
    JSObject f;
    synchronized (OpenFilePlugin.class) { f = pending; pending = null; }
    call.resolve(f != null ? f : new JSObject());
  }
}
