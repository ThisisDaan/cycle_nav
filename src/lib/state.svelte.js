// Shared app state. Every variable that more than one module reads or writes lives here, so
// modules do `app.from = x` instead of calling setters, and components can react to it.
//
// All fields are $state.raw: they hold Leaflet layers, route objects with big coordinate arrays,
// the navigation session, or places compared by identity (ME). Raw state tracks reassignment only
// and never wraps values in a deep proxy, so `app.options[app.selected]`, `nav !== session` and
// `place === ME` behave exactly as with plain variables. In-place edits (vias.push) do not notify.

export const ME = { isMe: true, name: 'My location' };

class AppState {
  // planner / route
  from = $state.raw(ME);
  to = $state.raw(null);
  vias = $state.raw([]);          // points the user added to shape the route
  options = $state.raw([]);       // route alternatives
  selected = $state.raw(0);
  pendingPlan = $state.raw(false);
  gpxRoute = $state.raw(null);    // { name, vias } when following a GPX file
  restoreSel = $state.raw(null);  // route index to reselect after a restored plan
  resumeNav = $state.raw(null);   // saved ride waiting for its route before navigation restarts
  routeLayer = $state.raw();
  viaLayer = $state.raw();
  startMarker = $state.raw();
  // navigation / position
  nav = $state.raw(null);         // active navigation / recording session
  me = $state.raw(null);          // last fix: { latlng, accuracy, heading, speed, time }
  simulating = $state.raw(false);
  // map / sheets
  userRot = $state.raw(0);        // planner rotation chosen by two-finger twist
  lastCtx = $state.raw(0);
  pinLayer = $state.raw();
  pickRect = $state.raw(null);
  place = $state.raw(null);       // tapped place card: { latlng, name, sub, tags, loading, fade, station }
  routeMsg = $state.raw(null);    // route sheet status while planning: { spin, text }; null shows the hint
  cardsOn = $state.raw(true);     // false while a fresh plan is being fetched (hides the old cards)
  wxAdvice = $state.raw(null);    // ride weather advice for the chosen route / here
  bikeMenu = $state.raw({ open: false, anchor: null, items: [] });    // popover menus, see Bike/NearbyMenu
  nearbyMenu = $state.raw({ open: false, anchor: null, items: [] });
  // drag controllers of the bottom sheets ({ go, toggle }), attached by <Sheet>
  sheetCtl = $state.raw(null);
  navCtl = $state.raw(null);
}

export const app = new AppState();

// Close the bike menu (the items stay so the pop-out can still show them). true if it was open.
export function closeBikeMenu() {
  if (!app.bikeMenu.open) return false;
  app.bikeMenu = { ...app.bikeMenu, open: false };
  return true;
}
