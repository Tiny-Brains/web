// The bar's theme switch -- one button, sun or moon, wired to mdBook's own theme machinery.
//
// mdBook's five-theme paintbrush popup is hidden (tinybrains.css §4) rather than removed, because
// book.js holds references to it and is where all the real work happens: swapping the html class,
// enabling the right syntax stylesheet, storing the choice. So this button does not set a theme. It
// clicks the button in that popup, and book.js does exactly what it does for its own control.
//
// WHICH GLYPH SHOWS IS CSS, not this file -- both are in the markup and the theme class picks one,
// so the button is right on the first paint. What is left here is the click and the label, and the
// label is the part a screen reader has instead of the glyph.
//
// THE CHOICE IS THE SITE'S, NOT THE BOOK'S. The book is served at tinybrains.dev/docs, on the
// application's own origin, so the two share one localStorage -- and `tb.theme` ('dark' | 'light')
// is the application's key. This file writes it on every switch and index.hbs reads it before the
// first paint, so a reader who picks light here gets light on /leaderboard and the other way round.
// `mdbook-theme` is kept in step for book.js's benefit; it is not the source of truth.
//
// The same observer mirrors the class onto `data-theme`, which is what theme/tokens.css needs: it
// imports the application's stylesheet rather than copying it, and that stylesheet keys its two
// palettes on the attribute. index.hbs does the first one; this does every one after.
(function () {
  "use strict";

  var SAYS = {
    navy: "Switch to the light theme", // shown while the book is dark
    light: "Switch to the dark theme",
  };

  function boot() {
    var button = document.getElementById("tb-theme-switch");
    if (!button) return;

    // What is on is read from the html element rather than remembered here: book.js is what writes
    // the class, and it also writes it on load before this script runs.
    function current() {
      return document.documentElement.classList.contains("light") ? "light" : "navy";
    }

    function label() {
      var says = SAYS[current()];
      button.setAttribute("aria-label", says);
      button.setAttribute("title", says);
    }

    button.addEventListener("click", function () {
      var next = current() === "light" ? "navy" : "light";
      var target = document.getElementById("mdbook-theme-" + next);
      if (target) target.click();
    });

    // The palette the application's tokens read, and the choice the application stores. Both
    // follow the class, because book.js is what writes the class and it writes it for its own
    // control as well as for the button above.
    function sync() {
      var now = current();
      document.documentElement.dataset.theme = now === "light" ? "light" : "dark";
      try {
        localStorage.setItem("tb.theme", now === "light" ? "light" : "dark");
      } catch (e) {
        // Not remembering is a smaller failure than not switching -- the application's own
        // lib/theme.ts says the same thing about the same key.
      }
    }

    label();
    // book.js swaps the class on <html>, so that is what the label follows -- the same attribute
    // watch theme/tb-replay.js uses to re-dress the viewer.
    new MutationObserver(function () {
      label();
      sync();
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
