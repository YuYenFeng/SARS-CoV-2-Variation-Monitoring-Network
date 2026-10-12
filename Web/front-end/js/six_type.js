/* =====================================================================
   six_type.js
   Tracking 頁「Six Strain Types（六型病毒株）」面板。
   The "Six Strain Types" panel on the Tracking page.

   畫面 / What it draws
     - lineChart：各病毒株類型的每日比例（折線，左軸）與每日樣本數（長條，右軸）
       Daily proportion of each strain type (lines, left axis) and the daily
       sample size (bars, right axis)
     - barChart：所選日期各類型的比例（橫向長條），可用滑桿或播放鍵切換日期
       Proportion of each type on the selected date (horizontal bars); the
       slider and play button change the date
     - 下方 Type I–VI 標籤：滑鼠移過去切換定義圖
       Type I–VI labels at the bottom: hovering switches the definition image

   給其他檔案使用 / Used by other files
     - updateChart(country, 'world1')：地圖國家視窗的 world1（word_country.js）
       Draws world1 in the map's country modal (word_country.js)
     - backgroundColor：白底外掛，voc.js、css.js 也會用到
       White-background plugin, also used by voc.js and css.js

   API
     /api/server/countries_strainType.php      國家清單 / country list
     /api/server/sixtype_series.php?country=   每日各類型比例 / daily type proportions

   內容 / Contents
     1. 狀態與顏色            State and colours
     2. Chart.js 外掛         Chart.js plugins
     3. 下載與列印            Download and print
     4. 初始化                Start-up
     5. 國家選單              Country menu
     6. 折線圖（含 world1）   Line chart (and world1)
     7. 每日橫向長條圖        Daily horizontal bar chart
     8. Type 定義圖           Type definition images
     9. 小工具                Helpers
   ===================================================================== */


/* =====================================================================
   1. 狀態與顏色 / State and colours
   ===================================================================== */
const SIX_API = '/api/server';

let mainChart = null;      // 面板折線圖 / panel line chart (#lineChart)
let barChart  = null;      // 面板每日長條圖 / panel daily bar chart (#barChart)
let world1    = null;      // 地圖國家視窗的小圖 / small chart in the map modal (#world1)

// 每日長條圖的播放狀態 / Play state of the daily bar chart
let barDates      = [];    // 所有日期 / all dates
let barTypeMap    = {};    // 各類型每日比例 / daily proportion of each type
let barFrameIndex = 0;     // 目前顯示第幾天 / index of the date shown
let isBarPlaying  = false;
let barPlayTimer  = null;

// 目前面板顯示的國家（下載圖片時寫在標題列）
// Country shown in the panel (written in the header band of downloads)
let sixCurrentCountry = '';

// 各類型固定顏色 / Fixed colour for each type
const TYPE_COLORS = Object.freeze({
  'Type-I':   '#FF40FF',
  'Type-II':  '#FF0000',
  'Type-III': '#00B0F0',
  'Type-IV':  '#00B050',
  'Type-V':   '#FF9300',
  'Type-VI':  '#0000FF',
  'Others':   '#A52A2A'
});

// 不在上表的類型：依名稱算出固定的備用顏色
// Types not in the table get a stable fallback colour based on their name
const FALLBACK_COLORS = ['#6b7280', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#22c55e', '#d946ef'];

function colorFor(typeName) {
  if (TYPE_COLORS[typeName]) return TYPE_COLORS[typeName];
  let h = 0;
  for (const ch of typeName) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  return FALLBACK_COLORS[Math.abs(h) % FALLBACK_COLORS.length];
}


/* =====================================================================
   2. Chart.js 外掛 / Chart.js plugins
   ===================================================================== */

// 右下角版權文字（options.plugins.credit.text）
// Credit text at the bottom right (options.plugins.credit.text)
const creditPlugin = {
  id: 'credit',
  afterDraw(chart, args, options) {
    if (!options?.text) return;
    const { ctx, chartArea: { bottom, right } } = chart;
    ctx.save();
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'right';
    ctx.fillText(options.text, right, bottom + 45);
    ctx.restore();
  }
};

// 白色背景：下載的 PNG / JPEG 不會是透明或黑底
// White background so downloaded PNG / JPEG files are not transparent or black
const backgroundColor = {
  id: 'customCanvasBackgroundColor',
  beforeDraw(chart, args, options) {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = options?.color || '#FFFFFF';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  }
};

Chart.register(creditPlugin, backgroundColor);
if (typeof ChartDataLabels !== 'undefined') Chart.register(ChartDataLabels);


/* =====================================================================
   3. 下載與列印 / Download and print
   下載的圖片上方加一條白底標題列：國家名稱；每日長條圖再加日期。
   Downloads get a white header band with the country; the daily bar chart
   also shows the date.
   ===================================================================== */

// 用 Blob 下載（data URL 太大時瀏覽器會擋）
// Download through a Blob (browsers block very large data URLs)
function saveCanvas_six(canvas, mime, filename) {
  const trigger = (url, revoke) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    if (revoke) setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  if (typeof canvas.toBlob === 'function') {
    canvas.toBlob(blob => {
      if (blob) trigger(URL.createObjectURL(blob), true);
      else trigger(canvas.toDataURL(mime), false);
    }, mime);
  } else {
    trigger(canvas.toDataURL(mime), false);
  }
}

function currentCountry_six() {
  const sel = document.getElementById('countrySelect');
  return sixCurrentCountry || (sel && sel.value) || '';
}

// 每日長條圖目前的日期 / Date currently shown in the daily bar chart
function currentBarDate_six() {
  const lbl = document.getElementById('barDateLabel');
  return (lbl && lbl.textContent.trim()) || barDates[barFrameIndex] || '';
}

// 匯出用畫布：原圖上方加標題列 / Export canvas: chart with a header band on top
function exportCanvas_six(canvasId) {
  const src = document.getElementById(canvasId);
  if (!src) return null;
  const country = currentCountry_six();
  const date = canvasId === 'barChart' ? currentBarDate_six() : '';
  if (!country && !date) return src;

  const scale   = src.width / (src.clientWidth || src.width) || 1;  // devicePixelRatio
  const titlePx = Math.round(20 * scale);
  const datePx  = Math.round(15 * scale);
  const pad     = Math.round(titlePx * 0.7);
  const band    = pad * 2 + titlePx + (date ? Math.round(datePx * 1.5) : 0);

  const out = document.createElement('canvas');
  out.width  = src.width;
  out.height = src.height + band;
  const ctx  = out.getContext('2d');
  const font = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#212529';
  ctx.font = `bold ${titlePx}px ${font}`;
  ctx.fillText(country, out.width / 2, pad);
  if (date) {
    ctx.fillStyle = '#555';
    ctx.font = `${datePx}px ${font}`;
    ctx.fillText(date, out.width / 2, pad + Math.round(titlePx * 1.3));
  }
  ctx.drawImage(src, 0, band);
  return out;
}

// 檔名含國家（每日長條圖再加日期），例如 strain_types_daily_Taiwan_2021-05-01.png
// File name with the country (and the date for the daily chart)
function fileName_six(base, ext) {
  const safe = (t) => String(t).replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '');
  const parts = [base, safe(currentCountry_six())];
  if (base === 'strain_types_daily') parts.push(safe(currentBarDate_six()));
  return `${parts.filter(Boolean).join('_')}.${ext}`;
}

function downloadCanvas_six(mime, filename, canvasId) {
  const canvas = exportCanvas_six(canvasId);
  if (canvas) saveCanvas_six(canvas, mime, filename);
}

function printCanvas_six(canvasId) {
  const canvas = exportCanvas_six(canvasId);
  if (!canvas) return;
  const win = window.open();
  if (win) win.document.write(`<img src="${canvas.toDataURL()}" style="max-width:100%" onload="window.print();window.close()">`);
}

function downloadPdf_six(canvasId, filename) {
  const canvas = exportCanvas_six(canvasId);
  if (!canvas || typeof jspdf === 'undefined') return;
  const pdf = new jspdf.jsPDF('landscape');
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const ratio = Math.min((pw - 20) / canvas.width, (ph - 20) / canvas.height);
  const w = canvas.width * ratio;
  const h = canvas.height * ratio;
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, (ph - h) / 2, w, h);
  pdf.save(filename);
}

// 下載選單：-six 是折線圖，-sixBar 是每日長條圖。
// 綁在 document 上，不受 DOMContentLoaded 時間影響。
// Download menus: -six is the line chart, -sixBar the daily bar chart.
// Bound on document so it works regardless of DOMContentLoaded timing.
document.addEventListener('click', (e) => {
  const el = e.target.closest(
    '#printChart-six, #downloadPNG-six, #downloadJPEG-six, #downloadPDF-six,' +
    '#printChart-sixBar, #downloadPNG-sixBar, #downloadJPEG-sixBar, #downloadPDF-sixBar'
  );
  if (!el) return;
  e.preventDefault();

  const isBar    = el.id.endsWith('sixBar');
  const canvasId = isBar ? 'barChart' : 'lineChart';
  const name     = isBar ? 'strain_types_daily' : 'strain_types_curve';

  if (el.id.startsWith('printChart'))        printCanvas_six(canvasId);
  else if (el.id.startsWith('downloadPNG'))  downloadCanvas_six('image/png',  fileName_six(name, 'png'), canvasId);
  else if (el.id.startsWith('downloadJPEG')) downloadCanvas_six('image/jpeg', fileName_six(name, 'jpg'), canvasId);
  else if (el.id.startsWith('downloadPDF'))  downloadPdf_six(canvasId, fileName_six(name, 'pdf'));
});


/* =====================================================================
   4. 初始化 / Start-up
   ===================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  // 建立國家選單後，先畫預設國家（Global）
  // Build the country menu, then draw the default country (Global)
  const defaultCountry = await buildCountrySelect();
  if (defaultCountry) updateChart(defaultCountry, 'lineChart');

  // 播放 / 暫停每日長條圖 / Play or pause the daily bar chart
  const playBtn = document.getElementById('toggleBarPlay');
  if (playBtn) {
    playBtn.type = 'button';
    playBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (isBarPlaying) stopBarAnimation();
      else startBarAnimation();
    });
  }

  // 拖曳滑桿切換日期 / Drag the slider to change the date
  const slider = document.getElementById('progressSlider');
  if (slider) {
    slider.addEventListener('input', function () {
      barFrameIndex = +this.value;
      if (barDates.length) updateBarChart(barDates[barFrameIndex], barTypeMap);
    });
  }

  setupHoverPreview();

  // 面板打開或視窗改變大小時，重新計算圖表尺寸
  // Resize the charts when the panel opens or the window changes size
  const resizeCharts = () => {
    if (mainChart) mainChart.resize();
    if (barChart) barChart.resize();
  };
  document.getElementById('six')?.addEventListener('shown.bs.offcanvas', resizeCharts);
  window.addEventListener('resize', debounce(resizeCharts, 150));
});


/* =====================================================================
   5. 國家選單 / Country menu
   API 回傳 ["Global (1,234)", "Taiwan (567)", ...]；Global 放最上面，
   其他國家放在「Countries」群組。
   The API returns ["Global (1,234)", "Taiwan (567)", ...]; Global goes
   first and the other countries go in a "Countries" group.
   ===================================================================== */
async function buildCountrySelect() {
  const select = document.getElementById('countrySelect');
  if (!select) return null;

  try {
    const res = await fetch(`${SIX_API}/countries_strainType.php`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const list = await res.json();
    select.innerHTML = '';

    // "Country (1,234)" → { country, sample }
    const items = list.map(s => {
      const m = /^(.+?)\s*\(([\d,]+)\)\s*$/.exec(String(s));
      return {
        country: m ? m[1].trim() : String(s).trim(),
        sample:  m ? Number(m[2].replace(/,/g, '')) : 0
      };
    });

    // value 只放國名，顯示文字加上樣本數 / value is the name; the text adds the sample count
    const makeOption = ({ country, sample }) => {
      const opt = document.createElement('option');
      opt.value = country;
      opt.text  = `${country} (${sample.toLocaleString('en-US')})`;
      return opt;
    };

    const L = window.L || ((en) => en);
    const globalItems  = items.filter(it => it.country === 'Global');
    const countryItems = items.filter(it => it.country !== 'Global');

    globalItems.forEach(it => {
      const opt = makeOption(it);
      opt.style.fontWeight = '700';
      select.appendChild(opt);
    });

    if (countryItems.length) {
      const group = document.createElement('optgroup');
      group.label = globalItems.length
        ? `──────────  ${L('Countries', '國家')}  ──────────`
        : L('Countries', '國家');
      countryItems.forEach(it => group.appendChild(makeOption(it)));
      select.appendChild(group);
    }

    // 預設 Global，沒有就選第一個 / Default to Global, otherwise the first option
    const defaultCountry = globalItems.length ? 'Global' : (select.options[0]?.value || null);
    if (defaultCountry) select.value = defaultCountry;

    select.addEventListener('change', () => updateChart(select.value, 'lineChart'));
    return defaultCountry;
  } catch (err) {
    console.error('Failed to load the strain type country list:', err);
    return null;
  }
}


/* =====================================================================
   6. 折線圖（含 world1） / Line chart (and world1)
   canvasId = 'lineChart'：面板的圖，同時重建每日長條圖
                            panel chart; also rebuilds the daily bar chart
   canvasId = 'world1'   ：地圖國家視窗的小圖 / small chart in the map modal
   ===================================================================== */
async function updateChart(country, canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // 面板的圖只跟著面板自己的選單；地圖視窗帶別的國家進來時忽略
  // The panel chart follows only the panel menu; ignore other countries from the map
  if (canvasId === 'lineChart') {
    const panelCountry = document.getElementById('countrySelect')?.value;
    if (panelCountry && panelCountry !== country) return;
  }

  try {
    const res = await fetch(`${SIX_API}/sixtype_series.php?country=${encodeURIComponent(country)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();

    // 整理成：日期清單、各類型每日比例、每日樣本數
    // Collect: dates, daily proportion of each type, daily sample size
    const dateSet = new Set();
    const typeMap = {};
    const sampleByDate = {};

    rows.forEach(row => {
      const date = String(row.Date ?? row.DateValue ?? '').split('T')[0];
      const type = row.Type ?? row.TypeName;
      if (!date || !type) return;

      // 有 Proportion_pct（0–100）就直接用，否則 Proportion（0–1）× 100
      // Use Proportion_pct (0–100) if present, otherwise Proportion (0–1) × 100
      const proportion = row.Proportion_pct != null
        ? Number(row.Proportion_pct)
        : (Number(row.Proportion) || 0) * 100;

      // 同一天的樣本數只記一次 / Record the sample size once per date
      if (!(date in sampleByDate)) sampleByDate[date] = Number(row.Sample ?? row.SampleSize) || 0;
      dateSet.add(date);

      if (!typeMap[type]) typeMap[type] = { label: type, data: {}, color: colorFor(type) };
      typeMap[type].data[date] = proportion;
    });

    const labels = Array.from(dateSet).sort();

    // 每日樣本數（長條，右軸）+ 各類型比例（折線，左軸）
    // Daily sample size (bars, right axis) + type proportions (lines, left axis)
    // 註：'Sample Size' 這個名稱 word_country.js 會用來判斷資料種類，畫面上由
    //     chart-i18n.js 顯示為「Daily sample size／每日樣本數」。
    // Note: word_country.js relies on the name 'Sample Size'; chart-i18n.js
    //       displays it as "Daily sample size".
    const datasets = [{
      type: 'bar',
      label: 'Sample Size',
      data: labels.map(d => sampleByDate[d] || 0),
      backgroundColor: '#d5d8dc',
      yAxisID: 'y1'
    }];
    for (const t in typeMap) {
      datasets.push({
        type: 'line',
        label: typeMap[t].label,
        data: labels.map(d => typeMap[t].data[d] ?? 0),
        borderColor: typeMap[t].color,
        backgroundColor: typeMap[t].color,
        yAxisID: 'y',
        spanGaps: true,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2
      });
    }

    if (canvasId === 'lineChart') {
      sixCurrentCountry = country;
      destroyIfExists(mainChart);
      mainChart = createTimeLineChart(canvas, labels, datasets);
      initBarChart(labels, typeMap);
    } else if (canvasId === 'world1') {
      destroyIfExists(world1);
      world1 = createTimeLineChart(canvas, labels, datasets);
    }
  } catch (err) {
    console.error('Failed to load strain type data:', err);
  }
}

function createTimeLineChart(canvas, labels, datasets) {
  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'month',
            tooltipFormat: 'yyyy-MM-dd',
            displayFormats: { month: "MMM ''yy" }
          },
          title: { display: true, text: 'Date' },
          ticks: { maxTicksLimit: 6, maxRotation: 0 }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Strain type proportion (%)' },
          min: 0,
          max: 100
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Number of daily samples' },
          grid: { drawOnChartArea: false }
        }
      },
      plugins: {
        legend: { position: 'top' },
        datalabels: { display: false },
        credit: { text: '©Academia Sinica, Taiwan' }
      }
    },
    plugins: [creditPlugin, backgroundColor]
  });
}


/* =====================================================================
   7. 每日橫向長條圖 / Daily horizontal bar chart
   ===================================================================== */

// 換國家時重設：回到第一天、停止播放 / On a new country: back to day 1, stop playing
function initBarChart(labels, typeMap) {
  stopBarAnimation();
  barDates      = labels;
  barTypeMap    = typeMap;
  barFrameIndex = 0;

  const slider = document.getElementById('progressSlider');
  if (slider) {
    slider.max = Math.max(0, barDates.length - 1);
    slider.value = 0;
  }
  updateBarChart(barDates[barFrameIndex], barTypeMap);
}

// 顯示某一天各類型的比例 / Show each type's proportion on one date
function updateBarChart(date, typeMap) {
  const dateLabel = document.getElementById('barDateLabel');
  if (dateLabel) dateLabel.textContent = date ?? '';

  const labels = [];
  const data   = [];
  const colors = [];
  for (const t in typeMap) {
    labels.push(typeMap[t].label);
    data.push(typeMap[t].data[date] || 0);
    colors.push(typeMap[t].color);
  }
  const dataset = { label: date, data, backgroundColor: colors };

  // 已有圖就只換資料 / Reuse the chart if it exists
  if (barChart) {
    barChart.data.labels = labels;
    barChart.data.datasets[0] = dataset;
    barChart.update();
    return;
  }

  const canvas = document.getElementById('barChart');
  if (!canvas) return;

  barChart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [dataset] },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: {
          min: 0,
          max: 100,
          title: { display: true, text: 'Strain type proportion (%)' }
        }
      },
      plugins: {
        legend: { display: false },
        // 長條末端顯示百分比 / Percentage at the end of each bar
        datalabels: (typeof ChartDataLabels !== 'undefined') ? {
          anchor: 'end',
          align: 'right',
          color: '#000',
          font: { weight: 'bold' },
          formatter: v => `${(+v).toFixed(1)}%`
        } : undefined,
        credit: { text: '©Academia Sinica, Taiwan' }
      }
    },
    plugins: [creditPlugin, backgroundColor]
  });
}

// 每 60 毫秒前進一天，到最後一天自動停止
// Advance one day every 60 ms; stop at the last day
function startBarAnimation() {
  stopBarAnimation();
  if (barFrameIndex >= barDates.length - 1) barFrameIndex = 0;  // 已在最後一天就從頭播 / restart from day 1
  isBarPlaying = true;
  const btn = document.getElementById('toggleBarPlay');
  if (btn) btn.textContent = '⏸';

  barPlayTimer = setInterval(() => {
    barFrameIndex++;
    if (barFrameIndex >= barDates.length) {
      barFrameIndex = barDates.length - 1;
      stopBarAnimation();
      return;
    }
    updateBarChart(barDates[barFrameIndex], barTypeMap);
    const slider = document.getElementById('progressSlider');
    if (slider) slider.value = barFrameIndex;
  }, 60);
}

function stopBarAnimation() {
  if (barPlayTimer) clearInterval(barPlayTimer);
  barPlayTimer = null;
  isBarPlaying = false;
  const btn = document.getElementById('toggleBarPlay');
  if (btn) btn.textContent = '▶';
}


/* =====================================================================
   8. Type 定義圖 / Type definition images
   滑鼠移到 Type I–VI 標籤時，下方換成該類型的定義圖。
   Hovering a Type I–VI label shows that type's definition image below.
   ===================================================================== */
function setupHoverPreview() {
  const labels = document.querySelectorAll('.hover-label');
  const previewImage = document.getElementById('previewImage');
  if (!labels.length || !previewImage) return;

  labels.forEach(label => {
    label.addEventListener('mouseenter', () => {
      labels.forEach(l => l.classList.remove('active-hover'));
      label.classList.add('active-hover');
      const img = label.getAttribute('data-img');
      if (img) {
        previewImage.src = `/image/${img}`;
        previewImage.alt = label.textContent.trim();
      }
    });
  });
}


/* =====================================================================
   9. 小工具 / Helpers
   ===================================================================== */
function destroyIfExists(chart) {
  if (chart && typeof chart.destroy === 'function') chart.destroy();
}

function debounce(fn, wait = 200) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}