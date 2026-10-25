<script>
  import { untrack } from 'svelte';

  // A small menu anchored to a button, with the pop-in / pop-out animation. The caller owns `open`
  // (closing on map tap and the back button stays in the app code); the menu stays in the DOM
  // while it plays the pop-out.
  //   anchor  the button it grows from, measured each time it opens
  //   side    'above' = opens upwards from the anchor's left edge (bike menu, in the route sheet);
  //           'beside' = lines up with the anchor's top, at the right edge of the screen (Find nearby)
  let { id, class: cls = '', role = undefined, open, anchor = null, side = 'above', children } = $props();
  let shown = $state(false), leaving = $state(false), el = $state(null), timer = 0;

  $effect(() => {
    if (open) { clearTimeout(timer); leaving = false; shown = true; return; }
    untrack(() => {
      if (!shown || leaving) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { shown = false; return; }
      leaving = true;
      timer = setTimeout(() => { shown = false; leaving = false; }, 160);
    });
  });

  // position once the element exists (the beside variant needs its height to stay on screen)
  $effect(() => {
    if (!el || !open || !anchor) return;
    const r = anchor.getBoundingClientRect();
    if (side === 'above') {
      Object.assign(el.style, { top: 'auto', bottom: `${innerHeight - r.top + 8}px`, left: `${r.left}px`, right: 'auto' });
    } else {
      el.style.top = `${Math.max(8, Math.min(r.top, innerHeight - el.offsetHeight - 12))}px`;
    }
  });
</script>

{#if shown}
  <div {id} class="popover {cls}" class:leaving {role} bind:this={el}>
    {@render children?.()}
  </div>
{/if}
