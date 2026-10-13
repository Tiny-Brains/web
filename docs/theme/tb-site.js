// The bar: its words in the page's language, the language picker, and the theme switch.
//
// THE BAR'S WORDS. theme/index.hbs carries them in English, which is what a reader with JavaScript
// off is left with; this lays the page's language (<html lang>, set by the build) over them from
// theme/tb-words.js, the one table of everything the chrome says. The chapters themselves are
// translated at build time by po/<tag>.po and need nothing from here.
//
// THE LANGUAGE PICKER: one entry per language the book is built in (theme/head.hbs's table), each a
// link to this same chapter in that language's tree, the current one marked. Choosing one stores
// the application's `tb.lang`, so the site follows the book -- and head.hbs's forward brings the
// reader back to that language from any English link -- exactly as the application's own switch
// does the other way round. It is a link and not a button because the other language is another
// address: it can be opened in a new tab, and it works as a link does.
//
// THE THEME SWITCH -- one button, sun or moon, wired to mdBook's own theme machinery.
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
// is the application's key, as `tb.lang` is. This file writes it on every switch and index.hbs
// reads it before the first paint, so a reader who picks light here gets light on /leaderboard and
// the other way round. `mdbook-theme` is kept in step for book.js's benefit; it is not the source
// of truth.
//
// The same observer mirrors the class onto `data-theme`, which is what theme/tokens.css needs: it
// imports the application's stylesheet rather than copying it, and that stylesheet keys its two
// palettes on the attribute. index.hbs does the first one; this does every one after.
(function () {
  "use strict";

  function say(key, vars) {
    return window.tbWords ? window.tbWords.say(key, vars) : key;
  }

  function label(el, text) {
    if (!el) return;
    el.setAttribute("title", text);
    el.setAttribute("aria-label", text);
  }

  function relabel() {
    label(document.getElementById("mdbook-sidebar-toggle"), say("toc"));
    var search = document.getElementById("mdbook-search-toggle");
    if (search) {
      search.setAttribute("title", say("search"));
      search.setAttribute("aria-label", say("searchToggle"));
    }
    var bar = document.getElementById("mdbook-searchbar");
    if (bar) bar.setAttribute("placeholder", say("searchPlaceholder"));
    label(document.getElementById("tb-home"), say("home"));
    label(document.getElementById("tb-discord"), say("discord"));
    label(document.getElementById("tb-source"), say("source"));
    Array.prototype.forEach.call(document.querySelectorAll("a.previous"), function (a) {
      label(a, say("prev"));
    });
    Array.prototype.forEach.call(document.querySelectorAll("a.next"), function (a) {
      label(a, say("next"));
    });
    var help = document.getElementById("mdbook-help-popup");
    if (help) {
      var title = help.querySelector(".mdbook-help-title");
      if (title) title.textContent = say("help");
      // The lines in the order index.hbs writes them; the search line is there only when the
      // build has a search.
      var lines = [say("helpChapters")].concat(bar ? [say("helpSearch")] : [], [say("helpShow"), say("helpHide")]);
      Array.prototype.forEach.call(help.querySelectorAll("p"), function (p, i) {
        if (lines[i]) p.innerHTML = lines[i];
      });
    }
  }

  function picker() {
    var book = window.tbBook;
    var row = document.querySelector("#mdbook-menu-bar .right-buttons");
    if (!book || !row) return;
    var tags = Object.keys(book.languages);
    if (tags.length < 2) return;
    // This chapter's address inside its tree, and the English tree every other tree sits in.
    var root = new URL(book.root || "./", location.href);
    var page = location.pathname.slice(root.pathname.length) + location.search + location.hash;
    var english = book.language === book.default ? root : new URL("../", root);
    var box = document.createElement("div");
    box.id = "tb-lang";
    box.setAttribute("role", "group");
    box.setAttribute("aria-label", say("language"));
    tags.forEach(function (tag) {
      var el;
      if (tag === book.language) {
        el = document.createElement("span");
        el.setAttribute("aria-current", "page");
      } else {
        el = document.createElement("a");
        el.href = new URL(page, tag === book.default ? english : new URL(tag + "/", english)).href;
        el.hreflang = tag;
        el.addEventListener("click", function () {
          try {
            localStorage.setItem("tb.lang", tag);
          } catch (e) {
            // Not remembering is a smaller failure than not switching.
          }
        });
      }
      el.lang = tag;
      el.textContent = book.languages[tag];
      box.appendChild(el);
    });
    row.insertBefore(box, row.firstChild);
  }

  function theme() {
    var button = document.getElementById("tb-theme-switch");
    if (!button) return;

    // What is on is read from the html element rather than remembered here: book.js is what writes
    // the class, and it also writes it on load before this script runs.
    function current() {
      return document.documentElement.classList.contains("light") ? "light" : "navy";
    }

    function relabelTheme() {
      label(button, say(current() === "light" ? "toDark" : "toLight"));
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

    relabelTheme();
    // book.js swaps the class on <html>, so that is what the label follows -- the same attribute
    // watch theme/tb-replay.js uses to re-dress the viewer.
    new MutationObserver(function () {
      relabelTheme();
      sync();
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  function boot() {
    relabel();
    picker();
    theme();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
