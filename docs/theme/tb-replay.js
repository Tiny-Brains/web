// Put a playable replay in a book page.
//
//   <div class="tb-replay" data-src="tutorials/2-fight.json" data-turn="3" data-height="320"></div>
//   <div class="tb-replay" data-src="tutorials/board-basic-tiny-2p.json" data-view="map"></div>
//
// `data-view="map"` draws the replay's BOARD on its own -- the viewer's map visual: the board at
// turn zero under its name, its player count and its size, with no seats, no transport and nothing
// to zoom. It takes its own height from the board's shape, so it ignores `data-height`.
//
// The viewer is the cartridge's own bundle, vendored into src/viz/ -- so a lesson shows what the
// engine does, re-simulated in the browser from the same component digest that recorded it. A
// diagram of a rule can be wrong about the rule; this cannot.
//
// mdBook loads `additional-js` as a classic script, so the module is pulled in with a dynamic
// import. It is loaded once and only if a page actually has a replay on it: the component is a
// quarter of a megabyte and most pages do not want it.
(function () {
  "use strict";

  function root() {
    // mdBook defines this on every page; the fallback is for a page opened on its own.
    return typeof path_to_root === "string" ? path_to_root : "";
  }

  // AGAINST THE PAGE, NOT AGAINST THIS FILE. `path_to_root` is relative to the page, and a bare
  // relative specifier in the dynamic import below is not: a classic script loaded from a URL
  // resolves its imports against ITS OWN url, which is theme/tb-replay-<hash>.js. On a chapter two
  // levels deep that turned "../../viz/viz.js" into /viz/viz.js -- off the book entirely, where the
  // site's SPA fallback answered with HTML and every replay on the page fell back to its sentence.
  // Resolving explicitly against document.baseURI is what makes path_to_root mean what it says.
  function fromPage(relative) {
    return new URL(root() + relative, document.baseURI).href;
  }

  // mdBook's five themes, sorted into the two the viewer knows. The viewer's chrome otherwise
  // answers `prefers-color-scheme`, which is the operating system's opinion and not the reader's:
  // a book left on `coal` while the machine is in light mode would carry a white player.
  var DARK = { coal: 1, navy: 1, ayu: 1 };

  function bookTheme() {
    var cls = document.documentElement.className.split(/\s+/);
    for (var i = 0; i < cls.length; i++) if (DARK[cls[i]]) return "dark";
    return "light";
  }

  // The viewer reads `data-tb-theme` in CSS alone, so following the theme switch is an attribute
  // write. Re-mounting would decode the whole match again to change a colour.
  function dress(els) {
    var t = bookTheme();
    els.forEach(function (el) {
      el.dataset.tbTheme = t;
    });
  }

  function fallback(el, message) {
    el.innerHTML =
      '<p style="margin:0;padding:12px;border:1px solid currentColor;border-radius:6px;opacity:.7">' +
      message +
      "</p>";
  }

  function boot() {
    var slots = Array.prototype.slice.call(document.querySelectorAll(".tb-replay"));
    if (!slots.length) return;

    import(fromPage("viz/viz.js"))
      .then(function (viz) {
        slots.forEach(function (el) {
          var src = el.dataset.src;
          if (!src) return fallback(el, "This replay has no data-src.");
          if (el.dataset.view === "map" && viz.mountMap) {
            fetch(fromPage(src))
              .then(function (r) {
                return r.json();
              })
              .then(function (env) {
                return viz.mountMap(el, env.map, {});
              })
              .catch(function (e) {
                fallback(el, "This board could not be drawn: " + e.message);
              });
            return;
          }
          var opts = {};
          ["turn", "from", "to", "zoom", "speed"].forEach(function (k) {
            if (el.dataset[k] != null) opts[k] = Number(el.dataset[k]);
          });
          if (el.dataset.centre) opts.centre = el.dataset.centre.split(",").map(Number);
          if (el.dataset.autoplay === "true") opts.autoplay = true;
          if (el.dataset.height) el.style.height = el.dataset.height + "px";
          else el.style.height = "360px";

          viz.mount(el, fromPage(src), opts).catch(function (e) {
            fallback(el, "This replay could not be loaded: " + e.message);
          });
        });

        dress(slots);
        new MutationObserver(function () {
          dress(slots);
        }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      })
      .catch(function (e) {
        slots.forEach(function (el) {
          // The prose above every slot says what the replay shows, so a page without the viewer is
          // still a page that teaches the rule. That is why the fallback is a sentence and not a
          // broken frame.
          fallback(el, "The replay viewer could not be loaded (" + e.message + ").");
        });
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
