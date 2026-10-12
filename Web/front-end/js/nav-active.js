/* =====================================================================
   nav-active.js
   1. 在導覽列標示目前所在的頁面。
      Highlights the current page in the navbar.
   2. 在 /doc/ 文章頁的標題左邊加上「Back」返回首頁按鈕。
      Adds a "Back" button (to the home page) left of the title on /doc/ article pages.

   載入方式 / How to load
     放在每一頁 </body> 前面（需要導覽列已經存在）：
     Put it right before </body> (the navbar must already exist):
       <script src="/js/nav-active.js"></script>

   樣式 / Styles
     .is-current、.doc-back、.doc-title-row 的樣式都在 site.css。
     Styles for .is-current, .doc-back and .doc-title-row live in site.css.
   ===================================================================== */
(function () {

  /* ---------- 1. 標示目前頁面 / Mark the current page ----------
     /doc/ 底下的文章歸在 Home。
     Articles under /doc/ belong to Home. */
  var path = location.pathname;
  var target = (path === '/' || path === '' || path.indexOf('/doc/') === 0)
    ? '/index.html'
    : path;

  document.querySelectorAll('header .nav-link[href^="/"]').forEach(function (a) {
    a.removeAttribute('aria-current');
    if (a.getAttribute('href') === target) {
      a.classList.add('is-current');
      a.setAttribute('aria-current', 'page');
    }
  });


  /* ---------- 2. 文章頁的返回按鈕 / Back button on article pages ---------- */
  if (path.indexOf('/doc/') !== 0) return;

  var main = document.querySelector('main');
  if (!main) return;

  // 中英雙語文章的 <main> 底下有 <div data-l="en"> 和 <div data-l="zh"> 兩個區塊，
  // 兩個區塊各加一個按鈕。
  // Bilingual articles have <div data-l="en"> and <div data-l="zh"> inside <main>;
  // each block gets its own button.
  var scopes = main.querySelectorAll(':scope > [data-l]');
  if (!scopes.length) scopes = [main];

  var BUTTON_HTML =
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
      '<path fill-rule="evenodd" d="M15 8a.5.5 0 0 1-.5.5H2.707l3.147 3.146a.5.5 0 0 1-.708.708l-4-4a.5.5 0 0 1 0-.708l4-4a.5.5 0 1 1 .708.708L2.707 7.5H14.5A.5.5 0 0 1 15 8"/>' +
    '</svg>Back';

  Array.prototype.forEach.call(scopes, function (scope) {
    // 頁面已經自己放了返回按鈕（例如 20201230.html）就跳過
    // Skip blocks that already have their own back button (e.g. 20201230.html)
    if (scope.querySelector('.doc-back')) return;

    var heading = scope.querySelector('h1, h3');
    if (!heading) return;

    var back = document.createElement('a');
    back.href = '/index.html';
    back.className = 'doc-back';
    back.innerHTML = BUTTON_HTML;

    // 右邊放一個看不見、同寬的佔位，讓標題保持置中
    // An invisible spacer of the same width on the right keeps the title centred
    var spacer = document.createElement('span');
    spacer.className = 'doc-back doc-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    spacer.innerHTML = BUTTON_HTML;

    // 用 .container 包住，讓按鈕左緣對齊文章內文
    // Wrapped in .container so the button lines up with the article text
    var row = document.createElement('div');
    row.className = 'container doc-title-row';
    heading.parentNode.insertBefore(row, heading);
    row.appendChild(back);
    row.appendChild(heading);
    row.appendChild(spacer);
  });
})();