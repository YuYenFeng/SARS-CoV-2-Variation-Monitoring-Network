/* =====================================================================
   chart-i18n.js
   Chart.js 圖表文字的中英切換（要在 Chart.js 與 i18n.js 之後載入）。
   English / Chinese switch for Chart.js text (load after Chart.js and i18n.js).

   各圖表程式一律用英文設定標題、副標、座標軸與資料名稱；這個外掛在每次
   繪圖前依目前語言換成中文（或換回英文），切換語言時自動重畫所有圖表。
   Chart code always sets titles, subtitles, axes and dataset names in English;
   this plugin swaps them to Chinese (or back) before every draw, and redraws
   every chart when the language changes.

   新增翻譯 / Adding a translation
     固定文字加在 DICT；含變數（日期、數字）的文字加在 PATTERNS。
     Fixed text goes in DICT; text with variables (dates, numbers) goes in PATTERNS.
   ===================================================================== */
(function () {
  if (typeof Chart === 'undefined') return;

  // 固定文字：'English': '中文' / Fixed text: 'English': 'Chinese'
  var DICT = {
    'Date': '日期',
    'Variation frequency (%)': '變異頻率 (%)',
    'Number of daily samples': '每日樣本數',
    'Strain type proportion (%)': '病毒株類型比例 (%)',
    'Proportion (%)': '比例 (%)',
    'Sample Size': '每日樣本數',
    'VOC:Sublineage': '變異株:譜系',
    'Sublineage frequency (%)': '譜系頻率 (%)',
    'Select at least one VOC to view sublineage frequencies': '請至少選擇一個變異株，以檢視譜系頻率',
    'VOC frequency (%)': '變異株頻率 (%)',
    'Others': '其他',
    'No data available for this date': '此日期沒有資料',

    // 國家視窗四張圖的標題與副標（對應主頁四個功能）
    // Titles and subtitles of the four charts in the country modal
    'Six Strain Types': '六型病毒株',
    'Strain type proportions and daily sample sizes': '病毒株類型比例與每日樣本數',
    'Emerging Genomic Variation': '新興基因體變異',
    'Variant of Concern (VOC) Tracking': '關注變異株（VOC）追蹤',
    'VOC frequencies and daily sample sizes': '變異株頻率與每日樣本數',
    'Sublineage frequencies by VOC: Omicron': '變異株：譜系頻率（Omicron）'
  };

  // 含變數的文字：[英文規則, 中文寫法] / Text with variables: [English regex, Chinese]
  var PATTERNS = [
    [/^Spike protein: top 10 variations on (.+) \(latest AF: (.+)\)$/, '刺突蛋白：$1 頻率前 10 名的變異（最新 AF：$2）'],
    [/^Spike protein: top 10 variations \(latest AF: (.+)\)$/, '刺突蛋白：頻率前 10 名的變異（最新 AF：$1）']
  ];

  function lang() { return window.siteLang ? window.siteLang.get() : 'en'; }

  // 英文顯示用語：程式裡的資料名稱維持不變（其他程式靠它判斷資料種類），
  // 畫面上改顯示和座標軸一致的說法。
  // English display text: the dataset name in the code stays the same (other
  // code relies on it), but the screen shows wording consistent with the axes.
  var EN_DISPLAY = {
    'Sample Size': 'Daily sample size'
  };

  function tr(text) {
    if (typeof text !== 'string') return text;
    if (lang() !== 'zh') {
      return Object.prototype.hasOwnProperty.call(EN_DISPLAY, text) ? EN_DISPLAY[text] : text;
    }
    if (Object.prototype.hasOwnProperty.call(DICT, text)) return DICT[text];
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i][0].test(text)) return text.replace(PATTERNS[i][0], PATTERNS[i][1]);
    }
    return text;
  }
  window.trChart = tr;

  // 把 obj[key] 換成目前語言；保留原本的英文，切回英文時還原。
  // 若程式重新設定了英文（和上次翻譯結果不同），就以新的英文為準。
  function swap(obj, key) {
    if (!obj || typeof obj[key] !== 'string') return;
    var store = obj.__i18n || (obj.__i18n = {});
    var cur = obj[key];
    if (!(key in store) || cur !== store[key].shown) store[key] = { en: cur };
    var out = tr(store[key].en);
    store[key].shown = out;
    obj[key] = out;
  }

  Chart.register({
    id: 'siteI18n',
    beforeUpdate: function (chart) {
      var o = chart.options || {};
      var scales = o.scales || {};
      Object.keys(scales).forEach(function (k) { if (scales[k]) swap(scales[k].title, 'text'); });
      if (o.plugins) {
        swap(o.plugins.title, 'text');
        swap(o.plugins.subtitle, 'text');
        swap(o.plugins, 'noDataText');
      }
    }
  });

  // 圖例：資料名稱（例如 Sample Size）只在顯示時翻譯，不改動 dataset.label，
  // 避免影響程式裡用 label 判斷資料種類的地方。
  var legendLabels = Chart.defaults.plugins.legend.labels;
  var origGenerate = legendLabels.generateLabels;
  legendLabels.generateLabels = function (chart) {
    return origGenerate.call(this, chart).map(function (item) {
      item.text = tr(item.text);
      return item;
    });
  };

  // 沒有自訂 tooltip 的圖表（例如六型病毒株）：翻譯「資料名稱: 數值」的名稱部分
  var tipCallbacks = Chart.defaults.plugins.tooltip.callbacks;
  var origLabel = tipCallbacks && tipCallbacks.label;
  if (typeof origLabel === 'function') tipCallbacks.label = function (ctx) {
    var out = origLabel.call(this, ctx);
    var name = ctx.dataset && ctx.dataset.label;
    if (typeof out === 'string' && name && out.indexOf(name) === 0) {
      out = tr(name) + out.slice(name.length);
    }
    return out;
  };

  window.addEventListener('sitelangchange', function () {
    Object.values(Chart.instances || {}).forEach(function (chart) {
      try { chart.update('none'); } catch (e) {}
    });
    // 國家下拉選單的分組標題
    var word = window.L('Countries', '國家');
    document.querySelectorAll('optgroup').forEach(function (g) {
      g.label = g.label.replace(/Countries|國家/, word);
    });
  });
})();