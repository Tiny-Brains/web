// Every word the book's own chrome says, in every language the book is built in: the bar's labels,
// the keyboard help, the language picker, and the sentences theme/tb-replay.js and
// theme/tb-studio.js write when a viewer or the Studio cannot load.
//
// THE CHAPTERS ARE TRANSLATED BY po/<tag>.po; these few strings are not chapters, and mdBook's
// template has no words of its own to swap, so they live here and theme/tb-site.js lays them over
// the bar from the page's <html lang> once it loads. The English of this table is also what
// theme/index.hbs carries, and what a reader with JavaScript off is left with. English is the
// schema: a key a language lacks is said in English.
//
// A language is a block here, a po/<tag>.po, and a line in theme/head.hbs.
window.tbWords = (function () {
  "use strict";

  var T = {
    "en-GB": {
      language: "Language",
      toc: "Toggle Table of Contents",
      search: "Search (`/`)",
      searchToggle: "Toggle Searchbar",
      searchPlaceholder: "Search this book ...",
      toLight: "Switch to the light theme",
      toDark: "Switch to the dark theme",
      home: "TinyBrains home",
      discord: "Chat on Discord",
      source: "Git repository",
      prev: "Previous chapter",
      next: "Next chapter",
      help: "Keyboard shortcuts",
      helpChapters: "Press <kbd>←</kbd> or <kbd>→</kbd> to navigate between chapters",
      helpSearch: "Press <kbd>S</kbd> or <kbd>/</kbd> to search in the book",
      helpShow: "Press <kbd>?</kbd> to show this help",
      helpHide: "Press <kbd>Esc</kbd> to hide this help",
      replayNoSrc: "This replay has no data-src.",
      boardFailed: "This board could not be drawn: {error}",
      replayFailed: "This replay could not be loaded: {error}",
      viewerFailed: "The replay viewer could not be loaded ({error}).",
      studioLoading: "Loading DataLogic Studio&hellip;",
      studioWaits: "DataLogic Studio loads here when this part of the page scrolls into view.",
      studioFailed: "DataLogic Studio could not be loaded here ({error}). The link below opens it on its own site.",
    },
    "zh-CN": {
      language: "语言",
      toc: "显示或隐藏目录",
      search: "搜索（/）",
      searchToggle: "打开或关闭搜索栏",
      searchPlaceholder: "搜索本指南…",
      toLight: "切换到浅色主题",
      toDark: "切换到深色主题",
      home: "TinyBrains 首页",
      discord: "在 Discord 上交流",
      source: "源代码仓库",
      prev: "上一章",
      next: "下一章",
      help: "键盘快捷键",
      helpChapters: "按 <kbd>←</kbd> 或 <kbd>→</kbd> 切换章节",
      helpSearch: "按 <kbd>S</kbd> 或 <kbd>/</kbd> 在本指南中搜索",
      helpShow: "按 <kbd>?</kbd> 显示此帮助",
      helpHide: "按 <kbd>Esc</kbd> 关闭此帮助",
      replayNoSrc: "这个回放没有 data-src。",
      boardFailed: "无法绘制这张地图：{error}",
      replayFailed: "无法加载这个回放：{error}",
      viewerFailed: "无法加载回放查看器（{error}）。",
      studioLoading: "正在加载 DataLogic Studio…",
      studioWaits: "页面滚动到这里时，DataLogic Studio 会在此处加载。",
      studioFailed: "无法在此处加载 DataLogic Studio（{error}）。下方的链接会在它自己的网站上打开它。",
    },
  };

  function fill(s, vars) {
    return s.replace(/\{(\w+)\}/g, function (whole, k) {
      return vars && Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : whole;
    });
  }

  return {
    of: T,
    // The sentence for `key` in the page's language, else in English; `vars` fill its {slots}.
    say: function (key, vars) {
      var lang = document.documentElement.lang;
      var s = (T[lang] && T[lang][key]) || T["en-GB"][key] || key;
      return vars ? fill(s, vars) : s;
    },
  };
})();
