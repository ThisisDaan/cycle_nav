<script>
  import { bottomSheet } from '../sheet.js';

  // A bottom sheet. The rest of the app shows and hides it by toggling `hidden` on the element
  // (found by id as before); this component provides the markup, the slide-in/out animation and,
  // when `drag` is given, the drag-to-collapse behaviour from sheet.js.
  //   drag(el)  returns the options for bottomSheet() ({ grips, scroller, isCollapsed, apply, ... })
  //   onctl(c)  receives the controller ({ go, toggle })
  //   Adding the `leaving` class plays the slide-out (the caller hides the sheet afterwards).
  let { id, class: cls = '', drag = null, onctl = null, children } = $props();
  let el = $state(null);

  $effect(() => {
    if (!el || !drag) return;
    onctl?.(bottomSheet({ el, ...drag(el) }));
  });
</script>

<section {id} class="{cls} sheet-motion" bind:this={el} hidden>
  {@render children?.()}
</section>

<style>
  @keyframes sheet-in { from { transform: translateY(28px); opacity: 0; } }
  @keyframes sheet-out { to { transform: translateY(40px); opacity: 0; } }
  .sheet-motion:not([hidden]) { animation: sheet-in .32s cubic-bezier(.2, .8, .2, 1); }
  .sheet-motion:global(.leaving) { animation: sheet-out .22s ease-in forwards; pointer-events: none; }
  @media (prefers-reduced-motion: reduce) {
    .sheet-motion:not([hidden]) { animation: none; }
    .sheet-motion:global(.leaving) { animation-duration: 1ms; }
  }
</style>
