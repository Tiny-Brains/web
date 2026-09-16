// Put DataLogic Studio in a book page, beside the adapter example it shows.
//
//   {{#studio studio/baseline-in.json embed}}
//
// studio/studio.py turns that directive into the example's code, this slot, and a link:
//
//   <div class="tb-studio-embed" data-src="models/adapters/studio/baseline-in.json" data-url="…"></div>
//
// The Studio is datalogic-rs's own mdBook embed -- the expression, the document it runs against, the
// result, and the flow diagram with its step-through debugger. It is loaded from the Studio's own
// site rather than vendored, because it is the same build the "Open in DataLogic Studio" link under
// every example opens: the page and the link cannot show two different Studios. It is five
// megabytes, so it is fetched only on a page that has a slot, and only once a slot scrolls near.
//
// NOTHING HERE IS THE REFEREE, although it is now the same ENGINE: the ladder evaluates an adapter
// with datalogic-rs too. What still differs is objects (the Studio treats a multi-key one as a
// literal and a node refuses one), the operation count, and tensors, which are shown and not run.
// models/adapters/studio.md lists it. The prose around every slot has to stand without it.
(function () {
  "use strict";

  var BASE = "https://goplasmatic.github.io/datalogic-rs/assets/";

  function root() {
    return typeof path_to_root === "string" ? path_to_root : "";
  }

  // Against the page, not against this file: tb-replay.js has the story of what the other way costs.
  function fromPage(relative) {
    return new URL(root() + relative, document.baseURI).href;
  }

  var DARK = { coal: 1, navy: 1, ayu: 1 };

  function bookTheme() {
    var cls = document.documentElement.className.split(/\s+/);
    for (var i = 0; i < cls.length; i++) if (DARK[cls[i]]) return "dark";
    return "light";
  }

  var embed = null;

  function load() {
    if (embed) return embed;
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = BASE + "datalogic-embed.css";
    document.head.appendChild(css);
    // An ES module: wasm-bindgen finds its WASM through import.meta.url, which a classic script does
    // not have. It defines window.DataLogicEmbed as a side effect of loading.
    embed = import(BASE + "datalogic-embed.js").then(function () {
      if (!window.DataLogicEmbed) throw new Error("the bundle defined no DataLogicEmbed");
      return window.DataLogicEmbed;
    });
    return embed;
  }

  function note(el, message) {
    el.innerHTML = '<p class="tb-studio-note">' + message + "</p>";
  }

  var mounted = [];

  function render(api, el, ex) {
    api.renderWidget(el, {
      logic: ex.logic,
      data: ex.data,
      templating: ex.templating !== false,
      height: (el.dataset.height || "600") + "px",
      theme: bookTheme(),
    });
  }

  function mount(el) {
    note(el, "Loading DataLogic Studio&hellip;");
    Promise.all([
      load(),
      fetch(fromPage(el.dataset.src)).then(function (r) {
        if (!r.ok) throw new Error(el.dataset.src + " answered " + r.status);
        return r.json();
      }),
    ])
      .then(function (got) {
        el.innerHTML = "";
        render(got[0], el, got[1]);
        mounted.push({ el: el, ex: got[1] });
      })
      .catch(function (e) {
        // The link under the slot opens the same Studio on its own site, so a failure here costs
        // the reader a click and not the example.
        note(
          el,
          "DataLogic Studio could not be loaded here (" +
            e.message +
            "). The link below opens it on its own site."
        );
      });
  }

  // The widget takes its theme when it mounts and keeps it, so following the book's switch means
  // mounting again. That resets the debugger, which is a smaller cost than a white Studio on a
  // navy page.
  var shown = null;

  function follow() {
    var t = bookTheme();
    if (t === shown) return;
    shown = t;
    var api = window.DataLogicEmbed;
    if (!api || !mounted.length) return;
    api.cleanup();
    mounted.forEach(function (m) {
      render(api, m.el, m.ex);
    });
  }

  function boot() {
    var slots = Array.prototype.slice.call(document.querySelectorAll(".tb-studio-embed"));
    if (!slots.length) return;
    shown = bookTheme();
    slots.forEach(function (el) {
      el.classList.add("tb-studio-live");
      note(el, "DataLogic Studio loads here when this part of the page scrolls into view.");
    });

    if (!("IntersectionObserver" in window)) {
      slots.forEach(mount);
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            mount(e.target);
          });
        },
        { rootMargin: "400px 0px" }
      );
      slots.forEach(function (el) {
        io.observe(el);
      });
    }

    new MutationObserver(follow).observe(document.documentElement, {
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
