<script>
  import { fade } from 'svelte/transition';
  import * as store from '../store.js';
  import { ROUTE_STYLES } from '../router.js';
  import { CLASS_COLORS, CLASS_ORDER } from '../roadclass.js';
  import { fmtDist, fmtDuration } from '../geo.js';
  import { icon } from '../icons.js';
  import { t } from '../i18n.js';
  import { app } from '../state.svelte.js';

  // One route alternative: title and tags, time, distance, the road-class bar, the busy-road warning
  // and (on the chosen card) the weather advice. Taps are handled by `onclick(event, i)` in routing-ui.js.
  let { o, i, selected, onclick } = $props();
  let r = $derived(o.route);

  const CLASS_LABEL = { path: 'bike path', calm: 'quiet street', shared: 'shared road', busy: 'busy road', unpaved: 'unpaved', walk: 'walking' };

  let title = $derived({
    familiar: t('Your usual way'),
    custom: app.gpxRoute ? `GPX: ${app.gpxRoute.name}` : t('Your route'),
    calm: t(ROUTE_STYLES[store.activeBike().style]?.offroad ? 'Most off-road' : 'Calmest'),
    nostops: t('Fewest stops'),
  }[o.kind] || t(o.shortest ? 'Shorter' : 'Alternative'));

  let tags = $derived.by(() => {
    const out = [];
    if (o.kind === 'familiar') out.push({ text: r.saved && r.ridden === 1 ? t('saved by you') : t('ridden {0}×', r.ridden) });
    else if (o.familiar > 0.5) out.push({ text: t('{0}% familiar', Math.round(o.familiar * 100)) });
    const added = app.vias.filter(v => !v.gpx).length;
    if (o.kind === 'custom' && app.gpxRoute) out.push({ text: 'follows your GPX' });
    if (o.kind === 'custom' && added) out.push({ text: added > 1 ? t('{0} points added', added) : t('1 point added') });
    if (o.kind === 'nostops' || o.fewestStops) out.push({ text: `${o.kind === 'nostops' ? '' : `${t('Fewest stops')} · `}${r.stats.signals ? (r.stats.signals > 1 ? t('{0} traffic lights', r.stats.signals) : t('1 traffic light')) : t('No traffic lights')}` });
    if (o.fewestTurns) out.push({ text: 'fewest turns' });
    if (r.stats.busyShare > 0.08) out.push({ text: t('{0}% busy road', Math.round(r.stats.busyShare * 100)), warn: true });
    return out;
  });

  let meta = $derived.by(() => {
    const m = r.stats.meters && Object.keys(r.stats.meters).length ? [t('{0} turns', r.stats.turns)] : [t('{0}% bike paths/lanes', Math.round(r.stats.bikeShare * 100)), t('{0} turns', r.stats.turns)];
    if (r.stats.unpavedShare > 0.03) m.push(t('{0}% unpaved', Math.round(r.stats.unpavedShare * 100)));
    if (r.ascend > 15) m.push(`↑ ${r.ascend} m`);
    return m;
  });

  let wxa = $derived(selected && app.wxAdvice?._for === r ? app.wxAdvice : null);

  // road classes along the route: coloured bar, the three biggest shares, lights and risky crossings
  let meters = $derived(r.stats.meters);
  let total = $derived(meters ? CLASS_ORDER.reduce((a, k) => a + (meters[k] || 0), 0) : 0);
  let parts = $derived(total ? CLASS_ORDER.filter(k => meters[k] > 0).map(k => ({ k, pct: meters[k] / total * 100 })) : []);
  let txt = $derived(parts.filter(p => Math.round(p.pct) >= 3).sort((a, b) => b.pct - a.pct).slice(0, 3).map(p => `${Math.round(p.pct)}% ${t(CLASS_LABEL[p.k])}`).join(' · '));
  let extra = $derived.by(() => {
    const e = [];
    if (r.stats.signals) e.push(r.stats.signals > 1 ? t('{0} traffic lights', r.stats.signals) : t('1 traffic light'));
    if (r.stats.risky) e.push(r.stats.risky > 1 ? t('{0} risky crossings', r.stats.risky) : t('1 risky crossing'));
    return e;
  });
  let busy = $derived(total && r.longestBusy && meters.busy >= 200);

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
</script>

<button class="route-card" class:selected data-i={i} onclick={e => onclick(e, i)} in:fade|global={{ duration: reduced() ? 0 : 220 }}>
  {#if selected}
    <div class="rc-advice wx-{wxa?.kind || ''}" role="button" hidden={!wxa}>
      {#if wxa}<span class="wx-ic">{@html icon(wxa.icon, 22)}</span><span class="wx-tx">{wxa.text}{#if wxa.hint}<small>{wxa.hint}</small>{/if}</span>{/if}
    </div>
  {/if}
  <div class="rc-title">{title} {#each tags as g}<span class="tag" class:warn={g.warn}>{g.text}</span>{/each}</div>
  <div class="rc-time">{fmtDuration(o.time)}</div>
  <div class="rc-meta">{meta.join(' · ')}</div>
  <div class="rc-dist">{fmtDist(r.length)}</div>
  {#if !total}
    <div class="bar"><i class="b-bike" style="width:{r.stats.bikeShare * 100}%"></i><i style="flex:1"></i><i class="b-busy" style="width:{r.stats.busyShare * 100}%"></i></div>
  {:else}
    <div class="bar">{#each parts as p (p.k)}<i style="width:{p.pct}%;background:{CLASS_COLORS[p.k]}"></i>{/each}</div>
    <div class="rc-safety"><span>{txt}{#if extra.length}<br>{extra.join(' · ')}{/if}</span><span class="rc-legend" role="button" aria-label={t('Colour legend')}>?</span></div>
    {#if busy}
      <div class="rc-warn" role="button">{@html icon('warning', 16)} {t('{0} busy road without bike lane', fmtDist(meters.busy))}</div>
    {/if}
  {/if}
</button>
