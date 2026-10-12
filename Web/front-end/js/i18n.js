/* =====================================================================
   i18n.js
   全站中英文切換（預設英文）。
   Site-wide English / Chinese switch (English by default).

   載入方式 / How to load
     放在每一頁的 <head> 裡，才不會先閃出另一種語言：
     Put it in the <head> of every page so the other language never flashes:
       <script src="/js/i18n.js"></script>

   內容寫法 / Writing bilingual content
     短句 Short text：<span data-l="en">English</span><span data-l="zh">中文</span>
     整段 Whole block：<div data-l="en">…</div><div data-l="zh">…</div>
     沒有 data-l 的內容，兩種語言都會顯示。
     Content without data-l is shown in both languages.

   提供給其他 JS 使用 / Exposed for other scripts
     window.L('English', '中文')  依目前語言回傳文字 / returns text for the current language
     window.siteLang.get()        目前語言 'en' | 'zh' / current language
     window.siteLang.set('zh')    切換語言 / switch language
     'sitelangchange' 事件        切換時觸發，detail.lang = 'en' | 'zh'
                                  fired on window after every switch

   其他 / Notes
     - 切換按鈕會自動插入導覽列（Smart Health Lab 左邊），樣式在 site.css。
       The toggle button is inserted into the navbar (left of Smart Health Lab);
       its style lives in site.css.
     - 使用者的選擇存在 localStorage，換頁後保留。
       The choice is saved in localStorage and kept across pages.
     - 同一網站的其他分頁或 iframe 會透過 storage 事件同步語言。
       Other tabs and iframes of the site follow along through the storage event.
   ===================================================================== */
(function () {
  var KEY = 'site-lang';
  var html = document.documentElement;


  /* ---------- 讀寫使用者的選擇 / Read and save the user's choice ---------- */
  function readLang() {
    try { return localStorage.getItem(KEY) === 'zh' ? 'zh' : 'en'; }
    catch (e) { return 'en'; }
  }
  function saveLang(l) {
    try { localStorage.setItem(KEY, l); } catch (e) {}
  }

  var lang = readLang();


  /* ---------- 隱藏另一種語言 / Hide the other language ----------
     這兩條規則必須在頁面畫出來之前生效，所以直接由 JS 插入，
     不放在 site.css（有些頁面，例如 css.html，也沒有載入 site.css）。
     These two rules must apply before the page is drawn, so they are
     injected here instead of site.css (some pages, e.g. css.html, do not
     load site.css). */
  var style = document.createElement('style');
  style.textContent =
    'html:not([data-lang="zh"]) [data-l="zh"]{display:none!important}' +
    'html[data-lang="zh"] [data-l="en"]{display:none!important}';
  (document.head || html).appendChild(style);

  // 清掉舊版 Google 翻譯留下的 cookie，避免頁面被自動機器翻譯
  // Remove the cookie left by the old Google Translate widget
  document.cookie = 'googtrans=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';


  /* ---------- 切換按鈕 / Toggle button ---------- */
  var ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">' +
    '<path d="M4.545 6.714 4.11 8H3l1.862-5h1.284L8 8H6.833l-.435-1.286zm1.634-.736L5.5 3.956h-.049l-.679 2.022z"/>' +
    '<path d="M0 2a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-3H2a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zm7.138 9.995q.289.451.63.846c-.748.575-1.673 1.001-2.768 1.292.178.217.451.635.555.867 1.125-.359 2.08-.844 2.886-1.494.777.665 1.739 1.165 2.93 1.472.133-.254.414-.673.629-.89-1.125-.253-2.057-.694-2.82-1.284.681-.747 1.222-1.651 1.621-2.757H14V8h-3v1.047h.765c-.318.844-.74 1.546-1.272 2.13a6 6 0 0 1-.415-.492 2 2 0 0 1-.94.31"/>' +
    '</svg>';

  // 按鈕顯示「要切換過去的語言」
  // The button shows the language you will switch to
  function updateButton() {
    var btn = document.getElementById('langToggle');
    if (!btn) return;
    var toZh = lang === 'en';
    btn.innerHTML = ICON + '<span>' + (toZh ? '中文' : 'English') + '</span>';
    btn.title = toZh ? '切換為中文' : 'Switch to English';
    btn.setAttribute('aria-label', btn.title);
  }

  // 把按鈕插入導覽列，放在最後一個項目（Smart Health Lab）前面
  // Insert the button before the last navbar item (Smart Health Lab)
  function injectButton() {
    if (document.getElementById('langToggle')) return;
    var ul = document.querySelector('#navbarSupportedContent .navbar-nav');
    if (!ul) return;   // 沒有導覽列的頁面（例如 iframe）不需要按鈕 / no navbar, no button

    var li = document.createElement('li');
    li.className = 'nav-item d-flex align-items-center';

    var btn = document.createElement('button');
    btn.id = 'langToggle';
    btn.type = 'button';
    btn.className = 'lang-toggle';
    btn.addEventListener('click', function () { setLang(lang === 'zh' ? 'en' : 'zh'); });
    li.appendChild(btn);

    ul.insertBefore(li, ul.lastElementChild);
    updateButton();
  }


  /* ---------- 套用與切換語言 / Apply and switch language ---------- */

  // 套用到頁面（不存檔、不發事件）
  // Apply to the page only (no saving, no event)
  function apply(l) {
    lang = l;
    html.setAttribute('data-lang', l);
    html.setAttribute('lang', l === 'zh' ? 'zh-Hant' : 'en');
    updateButton();
  }

  // 通知其他 JS 重畫文字（圖表、下拉選單等）
  // Tell other scripts to refresh their text (charts, menus, …)
  function announce() {
    try {
      window.dispatchEvent(new CustomEvent('sitelangchange', { detail: { lang: lang } }));
    } catch (e) {}
  }

  // 切換語言：套用、存檔並通知
  // Switch language: apply, save and notify
  function setLang(l) {
    l = l === 'zh' ? 'zh' : 'en';
    if (l === lang) return;
    saveLang(l);
    apply(l);
    announce();
  }

  apply(lang);

  window.L = function (en, zh) { return lang === 'zh' && zh != null ? zh : en; };
  window.siteLang = {
    get: function () { return lang; },
    set: setLang
  };

  // 其他分頁或 iframe 改了語言時，這一頁跟著換
  // Follow language changes made in another tab or iframe
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var next = e.newValue === 'zh' ? 'zh' : 'en';
    if (next === lang) return;
    apply(next);
    announce();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();