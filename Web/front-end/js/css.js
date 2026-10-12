// ══════════════════════════════════════════════════════════════
// css.js
// CSS Rankings 頁（css.html）：CSS 搜尋與國家搜尋兩個分頁。
// The CSS Rankings page (css.html): the CSS search and Country search tabs.
//
// CSS 搜尋 / CSS search
//   左：全球排名清單（8 項指標）；中：此 CSS 的 SNV 與全球趨勢；右：全球排名雷達圖；
//   下：此 CSS 在各國的名次表，以及單一國家的曲線。
//   Left: Global ranking (8 metrics); middle: the CSS's SNVs and Global trend;
//   right: Global rank radar; bottom: the CSS ranked in each country, and the
//   curve in one country.
// 國家搜尋 / Country search
//   同樣的版面，但所有排名與曲線都以所選國家為範圍。
//   The same layout, but every rank and curve is measured inside one country.
//
// 每個面板上方都有 Pango / UID（國家搜尋另有國家）標籤，說明目前顯示的是哪個 CSS；
// 下載的圖片也會在上方寫出國家、Pango、UID。
// Every panel shows Pango / UID chips (plus the country in Country search) so it
// is always clear which CSS is shown; downloaded images repeat this in a header.
//
// API：/api/server/css.php（action 參數決定回傳內容 / the action parameter selects the data）
// 樣式 / Styles：css/css_country.css
// 匯出 / Exports：html2canvas（面板 PNG / panel PNG）、SheetJS（.xlsx）
//
// 內容 / Contents
//    1. 設定、中英切換        Settings and language helpers
//    2. 版權文字外掛          Credit plugin
//    3. 指標名稱與定義        Metric names and definitions
//    4. 小工具                Small helpers
//    5. 識別標籤              Identity chips
//    6. 畫面狀態              View state
//    7. 指標分頁按鈕          Rank tabs
//    8. 排名清單列            Rank rows
//    9. CSS 搜尋：全球排名    CSS search: Global ranking
//   10. CSS 搜尋：選擇 CSS    CSS search: selecting a CSS
//   11. 雷達圖                Radar
//   12. SNV 與基因體圖        SNVs and genome map
//   13. 趨勢曲線              Trend curves
//   14. CSS 搜尋：各國名次表  CSS search: country rank table
//   15. 國家搜尋              Country search
//   16. 下載                  Downloads
//   17. 初始化與語言切換      Start-up and language switch
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
// 1. 設定、中英切換 / Settings and language helpers
// ══════════════════════════════════════════════════════════════
const API = `/api/server/css.php`;

const GLOBAL = 'Global';

// 中英切換：tr('English', '中文')，語言由 /js/i18n.js 決定（預設英文）
// Language helper: tr('English', 'Chinese'); i18n.js decides the language (English by default)
const tr = (en, zh) => (window.L ? window.L(en, zh) : en);
// 依目前語言回傳對照表內容；用法和一般物件一樣（RANK_METRICS[col]、Object.entries…）
// A lookup table that returns the current language; used like a plain object
const biMap = (en, zh) => new Proxy(en, {
    get: (obj, key) => (typeof key === 'string' && key in obj ? tr(obj[key], zh[key]) : obj[key]),
});


// ══════════════════════════════════════════════════════════════
// 2. 版權文字外掛 / Credit plugin
// 畫在 canvas 上，下載的圖片也會有「©Academia Sinica, Taiwan」。
// Drawn on the canvas so downloaded images keep the "©Academia Sinica, Taiwan" credit.
// ══════════════════════════════════════════════════════════════
const CSS_ACADEMIA_CREDIT_PLUGIN = {
    id: 'academiaSinicaCreditCSS',
    afterDraw(chart) {
        const { ctx } = chart;
        if (!ctx) return;

        const text = '©Academia Sinica, Taiwan';
        const area = chart.chartArea || {};
        const right = Number.isFinite(area.right) ? area.right : (chart.width || 0) - 8;
        const bottom = Number.isFinite(area.bottom) ? area.bottom : (chart.height || 0) - 8;
        const x = Math.min((chart.width || right) - 6, right);
        const y = Math.min((chart.height || bottom) - 5, bottom + 34);

        ctx.save();
        ctx.font = '10px Arial, sans-serif';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, x, y);
        ctx.restore();
    },
};

if (typeof Chart !== 'undefined') {
    Chart.register(CSS_ACADEMIA_CREDIT_PLUGIN);
}

// ══════════════════════════════════════════════════════════════
// 3. 指標名稱與定義 / Metric names and definitions
// 分頁按鈕的短名稱、完整名稱、顏色、雷達圖下方的定義說明。
// Short tab labels, full names, colours and the definitions shown under the radar.
// ══════════════════════════════════════════════════════════════
const RANK_LABELS = biMap({
    rank_strain: 'Strain',
    rank_ld: 'LD',
    rank_s: 'S',
    rank_p: 'P',
    rank_del: 'Del',
    rank_3_month: '3 month',
    rank_1_month: '1 month',
    rank_14_day: '14 day',
}, {
    rank_strain: '株數', rank_ld: 'LD', rank_s: 'S', rank_p: 'P', rank_del: '缺失',
    rank_3_month: '3 個月', rank_1_month: '1 個月', rank_14_day: '14 天',
});
const RANK_METRICS = biMap({
    rank_strain: '# of strains',
    rank_ld: 'Linkage disequilibrium (LD)',
    rank_s: 'S gene mutation count',
    rank_p: 'Persistent index',
    rank_del: 'Deletion count',
    rank_3_month: 'Growth slope, 3 months',
    rank_1_month: 'Growth slope, 1 month',
    rank_14_day: 'Growth slope, 14 days',
}, {
    rank_strain: '株數',
    rank_ld: '連鎖不平衡（LD）',
    rank_s: 'S 基因突變數',
    rank_p: '持續指數',
    rank_del: '缺失數',
    rank_3_month: '成長斜率（3 個月）',
    rank_1_month: '成長斜率（1 個月）',
    rank_14_day: '成長斜率（14 天）',
});
const RANK_ACCENTS = {
    rank_strain:  { main: '#3b82f6', light: '#eff6ff', text: '#1d4ed8' },
    rank_ld:      { main: '#8b5cf6', light: '#f5f3ff', text: '#6d28d9' },
    rank_s:       { main: '#10b981', light: '#ecfdf5', text: '#047857' },
    rank_p:       { main: '#f59e0b', light: '#fffbeb', text: '#b45309' },
    rank_del:     { main: '#ef4444', light: '#fef2f2', text: '#b91c1c' },
    rank_3_month: { main: '#06b6d4', light: '#ecfeff', text: '#0e7490' },
    rank_1_month: { main: '#ec4899', light: '#fdf2f8', text: '#be185d' },
    rank_14_day:  { main: '#84cc16', light: '#f7fee7', text: '#4d7c0f' },
};
const MEDAL = ['#f59e0b', '#9ca3af', '#b45309'];

// 每個指標的一句話定義，顯示在雷達圖下方的「What each rank means」
// One-sentence definition of each metric, shown under the radar ("What each rank means")
const RANK_DEFINITIONS = biMap({
    rank_strain:  'Ranks preliminary SNV groups (PSGs) by the total number of carrier sequences (number of strains). A higher rank indicates that more sequences carry the PSG.',
    rank_ld:      'Ranks PSGs by the number of SNV tokens in the haplotype (LD). A higher rank indicates that the haplotype contains more variant sites.',
    rank_s:       'Ranks PSGs by the number of non-deletion variants in the S region (S count). A higher rank indicates more non-deletion variants in the spike region.',
    rank_p:       'Ranks PSGs by the persistence index (complete carriers / transitional carriers). A higher rank indicates a more clearly defined and stable PSG.',
    rank_del:     'Ranks PSGs by the number of deletion (gap) tokens (deletion count). A higher rank indicates more deletion variants in the PSG.',
    rank_3_month: 'Ranks PSGs by the cumulative increase over the most recent 90 days. A higher rank indicates a stronger upward trend over the past three months.',
    rank_1_month: 'Ranks PSGs by the cumulative increase over the most recent 30 days. A higher rank indicates a stronger upward trend over the past month.',
    rank_14_day:  'Ranks PSGs by the cumulative increase over the most recent 14 days. A higher rank indicates a stronger upward trend over the past two weeks.',
}, {
    rank_strain:  '依帶有該初步 SNV 組（PSG）的序列總數（株數）排名；名次越前面，表示帶有此 PSG 的序列越多。',
    rank_ld:      '依單倍型中的 SNV 數（LD）排名；名次越前面，表示單倍型包含越多變異位點。',
    rank_s:       '依 S 區域非缺失變異的數量（s count）排名；名次越前面，表示 Spike 區域的非缺失變異越多。',
    rank_p:       '依持續指數（完整帶原序列／過渡帶原序列）排名；名次越前面，表示此 PSG 定義越明確、越穩定。',
    rank_del:     '依缺失（gap）的數量（del_count）排名；名次越前面，表示此 PSG 的缺失變異越多。',
    rank_3_month: '依最近 90 天的累積增加量排名；名次越前面，表示過去三個月的上升趨勢越強。',
    rank_1_month: '依最近 30 天的累積增加量排名；名次越前面，表示過去一個月的上升趨勢越強。',
    rank_14_day:  '依最近 14 天的累積增加量排名；名次越前面，表示最近兩週的上升趨勢越強。',
});

const axis = (rank, val, en, zh) => ({ rank, val, get label() { return tr(en, zh); } });
const RADAR_AXES = [
    axis('rank_strain',  'val_strain',  'Strain', '株數'),
    axis('rank_ld',      'val_ld',      'LD',     'LD'),
    axis('rank_s',       'val_s',       'S',      'S'),
    axis('rank_p',       'val_p',       'P',      'P'),
    axis('rank_del',     'val_del',     'Del',    '缺失'),
    axis('rank_3_month', 'val_3_month', '3M',     '3月'),
    axis('rank_1_month', 'val_1_month', '1M',     '1月'),
    axis('rank_14_day',  'val_14_day',  '14D',    '14天'),
];

const SNV_GENE_COLOR_MAP = {
    'rgb(132,214,200)':'nsp1','rgb(255,148,1)':'nsp2','rgb(1,176,243)':'nsp3',
    'rgb(113,48,158)':'nsp4','rgb(191,226,186)':'nsp5','rgb(132,60,12)':'nsp6',
    'rgb(248,2,3)':'nsp7','rgb(181,148,19)':'nsp8','rgb(182,199,229)':'nsp9',
    'rgb(249,203,177)':'nsp10','rgb(30,78,124)':'nsp12','rgb(253,125,112)':'nsp13',
    'rgb(175,171,170)':'nsp14','rgb(255,236,107)':'nsp15','rgb(238,114,238)':'nsp16',
    'rgb(190,186,219)':'S','rgb(83,130,52)':'ORF3a','rgb(161,77,215)':'E',
    'rgb(252,178,103)':'M','rgb(184,129,196)':'ORF6','rgb(49,122,165)':'ORF7a',
    'rgb(191,0,0)':'ORF7b','rgb(255,47,151)':'ORF8','rgb(141,211,200)':'N',
    'rgb(255,145,0)':'ORF10',
};
const COLOR_BY_GENE = Object.fromEntries(Object.entries(SNV_GENE_COLOR_MAP).map(([c, g]) => [g, c]));
const GENE_ORDER = ['nsp1','nsp2','nsp3','nsp4','nsp5','nsp6','nsp7','nsp8','nsp9','nsp10',
    'nsp12','nsp13','nsp14','nsp15','nsp16','S','ORF3a','E','M','ORF6','ORF7a','ORF7b','ORF8','N','ORF10'];

// ══════════════════════════════════════════════════════════════
// 4. 小工具 / Small helpers
// ══════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const spinner = t => `<div class="d-flex align-items-center gap-2 text-muted small py-2"><div class="spinner-border spinner-border-sm" role="status"></div>${esc(t)}</div>`;
const errBox = t => `<div class="text-danger small py-2">${esc(t)}</div>`;
const note = t => `<div class="text-muted small py-2">${esc(t)}</div>`;
const fmt = v => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(4);
};
const rankOf = (row, col) => {
    const r = parseInt(row?.[col]);
    return Number.isFinite(r) && r > 0 ? r : null;
};
const scopeLabel = s => String(s ?? '').replaceAll('_', ' ');
const fileSafe = s => String(s ?? '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'css';

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    if (!text.trim()) throw new Error(`API returned an empty response (HTTP ${res.status})`);
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        console.error('Invalid JSON response:', text);
        throw new Error(`API returned invalid JSON (HTTP ${res.status})`);
    }
    if (!res.ok && json.ok !== false) throw new Error(`HTTP ${res.status}`);
    return json;
}

// 所有圖表集中管理：同一個面板重畫時先銷毀舊圖
// One registry for every chart: a panel destroys its old chart before redrawing
const charts = Object.create(null);
function drawChart(key, canvasId, config) {
    charts[key]?.destroy();
    const canvas = $(canvasId);
    if (!canvas) return null;
    charts[key] = new Chart(canvas.getContext('2d'), config);
    return charts[key];
}
function clearChart(key) {
    charts[key]?.destroy();
    delete charts[key];
}

// 進行中的請求集中管理：快速連點時，新的請求會取消舊的
// One registry for in-flight requests: a new click cancels the slower old request
const aborters = Object.create(null);
function freshSignal(key) {
    aborters[key]?.abort();
    aborters[key] = new AbortController();
    return aborters[key].signal;
}
const isAbort = err => err?.name === 'AbortError';

// ══════════════════════════════════════════════════════════════
// 5. 識別標籤 / Identity chips
// 每個面板上方的 Pango、UID、國家標籤。
// The Pango, UID and country chips at the top of each panel.
// ══════════════════════════════════════════════════════════════
const hapPango = hap => hap?.pango || '(no pango)';
const hapUid = hap => hap?.uid || hap?.mutation_set || '—';

function identityStrip({ hap = null, country = '', extra = [] } = {}) {
    const chips = [];
    if (hap) {
        chips.push(`<span class="id-chip pango"><span class="id-key">Pango</span><span class="id-val">${esc(hapPango(hap))}</span></span>`);
        chips.push(`<span class="id-chip uid"><span class="id-key">UID</span><span class="id-val">${esc(hapUid(hap))}</span></span>`);
    }
    if (country) {
        chips.push(`<span class="id-chip country"><span class="id-key">${tr('Country', '國家')}</span><span class="id-val">${esc(scopeLabel(country))}</span></span>`);
    }
    extra.filter(Boolean).forEach(t => {
        chips.push(`<span class="id-chip"><span class="id-val">${esc(t)}</span></span>`);
    });
    return `<div class="id-strip">${chips.join('')}</div>`;
}

function paintIdentity(targetId, opts) {
    const el = $(targetId);
    if (!el) return;
    if (!opts) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }
    el.innerHTML = identityStrip(opts);
    el.style.display = 'block';
}

// ══════════════════════════════════════════════════════════════
// 6. 畫面狀態 / View state
// ══════════════════════════════════════════════════════════════
const cssView = {
    hapId: 0,
    hap: null,             // { hap_id, pango, uid }
    country: '',
    rank: 'rank_strain',
    topN: '10',
    rankCache: {},
    countryRows: [],
    countryNames: [],   // 完整國家清單（含此 CSS 沒有資料的國家）
    totalCss: 0,        // 每個國家都有的 CSS 總數（由 mode=snv 的 total_css 提供）
};

const ctryView = {
    hapId: 0,
    hap: null,
    scope: '',            // 由 loadMeta() 填入第一個國家
    scopeOptions: [],
    rank: 'rank_strain',
    topN: 'all',
    rows: [],
    row: null,
    totalCss: 1,
    allCache: {},
    metaLoaded: false,
};

const smoothRanges = { global: {}, cssCountry: {}, search: {} };

// ══════════════════════════════════════════════════════════════
// 7. 指標分頁按鈕 / Rank tabs
// ══════════════════════════════════════════════════════════════
function buildTabButtons(containerId, onClick) {
    const wrap = $(containerId);
    if (!wrap) return;
    wrap.innerHTML = '';
    Object.entries(RANK_LABELS).forEach(([col, label]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rank-tab';
        btn.dataset.col = col;
        btn.textContent = label;
        btn.title = RANK_METRICS[col];
        btn.addEventListener('click', () => onClick(col));
        wrap.appendChild(btn);
    });
}

function paintTabButtons(containerId, col) {
    const wrap = $(containerId);
    if (!wrap) return;
    const acc = RANK_ACCENTS[col];
    wrap.querySelectorAll('.rank-tab').forEach(btn => {
        const on = btn.dataset.col === col;
        btn.classList.toggle('active', on);
        btn.style.background = on ? acc.main : '';
        btn.style.borderColor = on ? acc.main : '';
    });
}

function paintMetricLabel(labelId, col, scope) {
    const el = $(labelId);
    if (!el) return;
    el.innerHTML = tr(
        `Sorted by <b>${esc(RANK_METRICS[col] ?? col)}</b> in <b>${esc(scopeLabel(scope))}</b>. Rank 1 = highest.`,
        `依 <b>${esc(RANK_METRICS[col] ?? col)}</b> 在 <b>${esc(scopeLabel(scope))}</b> 排序，第 1 名為最高。`);
}

// ══════════════════════════════════════════════════════════════
// 8. 排名清單列 / Rank rows
// 兩個分頁共用同一種清單樣式。
// Both tabs use the same list style.
// ══════════════════════════════════════════════════════════════
function rankRowHtml(row, activeCol, selectedHapId) {
    const acc = RANK_ACCENTS[activeCol];
    const rv = parseInt(row.rank_value);
    const badge = rv >= 1 && rv <= 3 ? MEDAL[rv - 1] : acc.main;
    const uid = row.mutation_set || '';
    return `<div class="rank-row ${parseInt(row.hap_id) === selectedHapId ? 'selected' : ''}"
                 data-hap-id="${parseInt(row.hap_id)}" data-uid="${esc(uid)}"
                 title="Pango ${esc(row.pango || '(no pango)')} · UID ${esc(uid)}">
        <div class="rank-badge" style="background:${badge};">#${rv}</div>
        <div class="rank-info">
            <div class="rank-pango">${esc(row.pango || '(no pango)')}</div>
            <div class="rank-uid">UID ${esc(uid || '—')}</div>
        </div>
        <div class="rank-metric" style="color:${acc.text};">${fmt(row.metric_value)}</div>
    </div>`;
}

function rankListLegend(activeCol, scope, shown) {
    return `<div class="list-legend">
        <span><span class="legend-key">#</span> ${tr(`rank in ${esc(scopeLabel(scope))}`, `在 ${esc(scopeLabel(scope))} 的名次`)}</span>
        <span><span class="legend-key">${tr('value', '數值')}</span> ${esc(RANK_METRICS[activeCol] ?? '')}</span>
        <span>${tr(`${shown.toLocaleString()} CSS listed`, `列出 ${shown.toLocaleString()} 個 CSS`)}</span>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// 9. CSS 搜尋：全球排名 / CSS search: Global ranking
// ══════════════════════════════════════════════════════════════
async function loadRank(col, preserveSelection = true) {
    cssView.rank = col;
    paintTabButtons('rankTabs', col);
    paintMetricLabel('rankMetricLabel', col, GLOBAL);

    const key = `${col}|${cssView.topN}`;
    if (cssView.rankCache[key]) {
        renderRankList(cssView.rankCache[key]);
        await ensureSelectedGlobalVisible(col, preserveSelection);
        return;
    }

    $('rankList').innerHTML = spinner(tr('Loading rankings…', '排名載入中…'));
    try {
        const json = await fetchJson(`${API}?mode=global_ranks&rank=${encodeURIComponent(col)}&topN=${encodeURIComponent(cssView.topN)}`);
        if (!json.ok) throw new Error(json.error ?? 'Global rank error');
        const rows = json.data?.[col] ?? [];
        cssView.rankCache[key] = rows;
        renderRankList(rows);

        if (!cssView.hapId && rows[0]) {
            selectCss(parseInt(rows[0].hap_id), rows[0]);
        } else {
            await ensureSelectedGlobalVisible(col, preserveSelection);
        }
    } catch (err) {
        console.error(err);
        $('rankList').innerHTML = errBox(err.message || tr('Rankings failed to load.', '排名載入失敗。'));
    }
}

// 某個指標的完整排名，抓一次後快取
// The complete ranking for one metric, fetched once and cached
async function allRankRows(col) {
    const key = `${col}|all`;
    if (!cssView.rankCache[key]) {
        try {
            const json = await fetchJson(`${API}?mode=global_ranks&rank=${encodeURIComponent(col)}&topN=all`);
            cssView.rankCache[key] = json.ok ? (json.data?.[col] ?? []) : [];
        } catch (err) {
            console.error(err);
            return [];
        }
    }
    return cssView.rankCache[key];
}

// 某指標前 10 名的 CSS，在另一指標常常不在前 10 名。
// 清單維持使用者選的筆數，並把已選的 CSS 釘在清單下方，切換指標時選擇不會消失。
// A CSS in the Top 10 of one metric is often outside the Top 10 of another.
// The list keeps the requested length and pins the selected CSS below it,
// so the selection survives a metric switch.
async function ensureSelectedGlobalVisible(col, preserveSelection) {
    if (!preserveSelection || !cssView.hapId) return;

    const shown = cssView.rankCache[`${col}|${cssView.topN}`] ?? [];
    if (shown.some(r => parseInt(r.hap_id) === cssView.hapId)) {
        centerRow('rankList', cssView.hapId);
        return;
    }
    const wanted = cssView.hapId;
    const row = (await allRankRows(col)).find(r => parseInt(r.hap_id) === wanted) || null;
    // 這段請求進行中，使用者可能又切換了指標
    // The metric may have been switched again while this request was running
    if (cssView.rank !== col || cssView.hapId !== wanted) return;
    pinSelectedRow({
        listId: 'rankList',
        col,
        row,
        hap: cssView.hap,
        hapId: cssView.hapId,
        onPick: picked => selectCss(parseInt(picked.hap_id), picked),
    });
}

function pinSelectedRow({ listId, col, row, hap, hapId, onPick }) {
    const list = $(listId);
    if (!list) return;
    list.querySelector('.rank-pinned')?.remove();

    const rankNote = row
        ? tr(`Your selected CSS, below the list above — it ranks #${parseInt(row.rank_value).toLocaleString()} by ${RANK_METRICS[col]}.`,
             `你選擇的 CSS（不在上方清單內）：依「${RANK_METRICS[col]}」排名第 ${parseInt(row.rank_value).toLocaleString()} 名。`)
        : tr(`Your selected CSS, below the list above — it has no rank for ${RANK_METRICS[col]}.`,
             `你選擇的 CSS（不在上方清單內）：沒有「${RANK_METRICS[col]}」的排名。`);

    const wrap = document.createElement('div');
    wrap.className = 'rank-pinned';
    wrap.innerHTML = `
        <div class="rank-extra-label">${esc(rankNote)}</div>
        ${row ? rankRowHtml(row, col, hapId) : `
            <div class="rank-row selected">
                <div class="rank-badge no-rank">—</div>
                <div class="rank-info">
                    <div class="rank-pango">${esc(hapPango(hap))}</div>
                    <div class="rank-uid">UID ${esc(hapUid(hap))}</div>
                </div>
                <div class="rank-metric no-rank">${tr('no rank', '無排名')}</div>
            </div>`}`;
    list.appendChild(wrap);

    if (row && onPick) {
        wrap.querySelector('.rank-row')?.addEventListener('click', () => onPick(row));
    }
}

function renderRankList(rows) {
    const list = $('rankList');
    if (!rows.length) {
        list.innerHTML = note(tr('No CSS has a rank for this metric.', '沒有 CSS 有此指標的排名。'));
        return;
    }
    list.innerHTML = rankListLegend(cssView.rank, GLOBAL, rows.length)
        + rows.map(r => rankRowHtml(r, cssView.rank, cssView.hapId)).join('');

    list.querySelectorAll('.rank-row').forEach(el => {
        el.addEventListener('click', () => {
            const hapId = parseInt(el.dataset.hapId);
            selectCss(hapId, rows.find(r => parseInt(r.hap_id) === hapId) || null);
        });
    });
}

function centerRow(listId, hapId, behavior = 'auto') {
    if (!hapId) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const list = $(listId);
        const row = list?.querySelector(`.rank-row[data-hap-id="${hapId}"]`);
        if (!list || !row) return;
        const offset = (row.getBoundingClientRect().top - list.getBoundingClientRect().top) + row.offsetHeight / 2;
        const target = list.scrollTop + offset - list.clientHeight / 2;
        const top = Math.min(Math.max(0, target), Math.max(0, list.scrollHeight - list.clientHeight));
        if (typeof list.scrollTo === 'function') list.scrollTo({ top, behavior });
        else list.scrollTop = top;
    }));
}

// ══════════════════════════════════════════════════════════════
// 10. CSS 搜尋：選擇 CSS / CSS search: selecting a CSS
// 選擇後同時更新 SNV、雷達圖、趨勢曲線與各國名次表。
// A selection updates the SNVs, radar, trend curves and country ranks.
// ══════════════════════════════════════════════════════════════
function selectCss(hapId, row = null) {
    if (!hapId) return;
    cssView.hapId = hapId;
    // 先用清單列的資料顯示標籤，SNV 回傳後再補完整
    // Show the chips from the list row now; the SNV response fills in the rest
    cssView.hap = {
        hap_id: hapId,
        pango: row?.pango ?? cssView.hap?.pango ?? '',
        uid: row?.mutation_set ?? cssView.hap?.uid ?? '',
    };
    paintCssContext();

    $('rankList')?.querySelectorAll('.rank-row').forEach(el => {
        el.classList.toggle('selected', parseInt(el.dataset.hapId) === hapId);
    });

    loadCssSnvAndRadar(hapId);
    loadSmooth('global', { hapId, country: GLOBAL, hap: cssView.hap, resetDates: true });
    loadCountryRanks(hapId);
}

// CSS 搜尋頁最上方的藍色資訊列
// The blue bar at the top of the CSS search tab
function paintCssContext() {
    const el = $('cssContextIdentity');
    if (!el) return;
    el.innerHTML = cssView.hap
        ? identityStrip({ hap: cssView.hap })
        : `<span class="context-empty">${tr('Pick a CSS in the ranking list.', '請從排名清單選擇一個 CSS。')}</span>`;
}

async function loadCssSnvAndRadar(hapId) {
    const signal = freshSignal('cssSnv');
    // 先換標籤，避免請求較慢時畫面還留著上一個 CSS 的名稱
    // Update the chips first so a slow request never leaves the previous CSS's name on screen
    paintIdentity('snvCssMeta', { hap: cssView.hap });
    $('snvList').innerHTML = spinner(tr('Loading SNVs…', 'SNV 載入中…'));
    $('radarBody').innerHTML = spinner(tr('Loading ranks…', '名次載入中…'));

    try {
        const json = await fetchJson(`${API}?mode=snv&hap_id=${hapId}`, { signal });
        if (!json.ok) throw new Error(json.error ?? 'SNV error');

        cssView.hap = json.haplotype ?? cssView.hap;
        paintCssContext();
        paintIdentity('snvCssMeta', { hap: cssView.hap, extra: [tr(`${(json.data?.length ?? 0).toLocaleString()} SNVs`, `${(json.data?.length ?? 0).toLocaleString()} 個 SNV`)] });
        renderSnvInto('snvList', 'snvSvgContainer', json.data ?? []);
        cssView.totalCss = Math.max(0, parseInt(json.total_css) || 0);
        paintCountryRankIdentity();
        renderRadarPanel({
            bodyId: 'radarBody',
            canvasId: 'radarCanvas',
            tableId: 'radarTable',
            chartKey: 'cssRadar',
            rank: json.rank,
            totalCss: json.total_css,
            hap: cssView.hap,
            country: GLOBAL,
            showCountry: false,
        });
    } catch (err) {
        if (isAbort(err)) return;
        console.error(err);
        $('snvList').innerHTML = errBox(err.message || tr('SNVs failed to load.', 'SNV 載入失敗。'));
        $('radarBody').innerHTML = errBox(err.message || tr('Ranks failed to load.', '名次載入失敗。'));
    }
}

// ══════════════════════════════════════════════════════════════
// 11. 雷達圖 / Radar
// 兩個分頁共用；下方附可收合的指標定義。
// Shared by both tabs, with a collapsible list of metric definitions below.
// ══════════════════════════════════════════════════════════════
function rankDefinitionsBlock() {
    return `
        <details class="rank-def-box">
            <summary>${tr('What each rank means', '各項排名的意義')}</summary>
            <table class="rank-def-table">
                <thead><tr><th>${tr('Rank', '排名')}</th><th>${tr('Definition', '定義')}</th></tr></thead>
                <tbody>
                    ${RADAR_AXES.map(a => `<tr>
                        <td class="rd-name">${esc(RANK_LABELS[a.rank] ?? a.label)}</td>
                        <td class="rd-desc">${esc(RANK_DEFINITIONS[a.rank] ?? '')}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </details>`;
}

// 雷達圖下載用：每張雷達圖目前的國家與 CSS
// For radar downloads: the country and CSS currently shown in each radar
const radarExportInfo = {};

function renderRadarPanel({ bodyId, canvasId, tableId, chartKey, rank, totalCss, hap, country, showCountry = true }) {
    const body = $(bodyId);
    if (!body) return;

    if (!rank) {
        clearChart(chartKey);
        body.innerHTML = identityStrip({ hap, country: showCountry ? country : '' })
            + note(tr(`No rank data for this CSS in ${scopeLabel(country)}.`, `此 CSS 在 ${scopeLabel(country)} 沒有排名資料。`));
        return;
    }

    const TOTAL = Math.max(1, parseInt(totalCss) || 1);
    const ranks = RADAR_AXES.map(a => rankOf(rank, a.rank));
    const vals = RADAR_AXES.map(a => rank[a.val] ?? null);
    const plot = ranks.map(r => (r ? Math.max(0, TOTAL - r + 1) : 0));

    body.innerHTML = `
        ${identityStrip({ hap, country: showCountry ? country : '' })}
        <div class="chart-box radar-box"><canvas id="${canvasId}"></canvas></div>
        <div class="figure-legend">${tr(
            `Each spoke represents one metric. A point near the <b>outer edge</b> indicates rank 1 (best),
            and a point near the <b>centre</b> indicates rank ${TOTAL.toLocaleString()} (last) among the
            ${TOTAL.toLocaleString()} CSSs in ${esc(scopeLabel(country))}. An empty spoke indicates no rank.`,
            `每一條軸是一項指標。點越靠近<b>外圈</b>表示第 1 名（最佳）；
            越靠近<b>中心</b>表示在 ${esc(scopeLabel(country))} 的 ${TOTAL.toLocaleString()} 個 CSS 中排第 ${TOTAL.toLocaleString()} 名（最後）。沒有點表示無排名。`)}
        </div>
        <table class="radar-table" id="${tableId}">
            <thead><tr><th>${tr('Metric', '指標')}</th><th>${tr('Value', '數值')}</th><th>${tr('Rank', '名次')}</th></tr></thead>
            <tbody>
                ${RADAR_AXES.map((a, i) => `<tr>
                    <td class="rt-name" title="${esc(RANK_METRICS[a.rank])}">${esc(a.label)}</td>
                    <td class="rt-value">${fmt(vals[i])}</td>
                    <td class="rt-rank">${ranks[i] ? `#${ranks[i].toLocaleString()}` : '—'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        ${rankDefinitionsBlock()}`;

    // 畫面上不放標題與圖例；下載時才在圖片上方寫國家、Pango、UID
    // No title or legend on screen; downloads add the country, Pango and UID on top
    radarExportInfo[chartKey] = { canvas: canvasId, hap, country: scopeLabel(country) || GLOBAL };
    drawChart(chartKey, canvasId, {
        type: 'radar',
        data: {
            labels: RADAR_AXES.map(a => a.label),
            datasets: [{
                label: tr(`${hapPango(hap)} in ${scopeLabel(country)}`, `${hapPango(hap)}（${scopeLabel(country)}）`),
                data: plot,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.15)',
                borderWidth: 2,
                pointBackgroundColor: '#3b82f6',
                pointRadius: 3,
                pointHoverRadius: 5,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: 2 },
            plugins: {
                title: { display: false },
                subtitle: { display: false },
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: items => RANK_METRICS[RADAR_AXES[items[0].dataIndex].rank],
                        label(ctx) {
                            const i = ctx.dataIndex;
                            return ranks[i]
                                ? tr(`Rank #${ranks[i].toLocaleString()} of ${TOTAL.toLocaleString()} — value ${fmt(vals[i])}`,
                                     `第 ${ranks[i].toLocaleString()} 名（共 ${TOTAL.toLocaleString()}）— 數值 ${fmt(vals[i])}`)
                                : tr('No rank', '無排名');
                        },
                    },
                },
            },
            scales: {
                r: {
                    min: 0,
                    max: TOTAL,
                    ticks: {
                        stepSize: Math.max(1, Math.round(TOTAL / 4)),
                        callback: v => (v === 0 ? '' : `#${Math.round(TOTAL - v + 1)}`),
                        font: { size: 8 }, color: '#94a3b8', backdropColor: 'transparent', maxTicksLimit: 5,
                    },
                    pointLabels: { font: { size: 10, weight: '600' }, color: '#475569' },
                    grid: { color: '#e2e8f0' },
                    angleLines: { color: '#e2e8f0' },
                },
            },
        },
    });
}

// ══════════════════════════════════════════════════════════════
// 12. SNV 與基因體圖 / SNVs and genome map
// 兩個分頁共用。有 SNV 的基因在基因體圖上浮起並顯示全彩。
// Shared by both tabs. Genes carrying SNVs are raised and shown in full colour.
// ══════════════════════════════════════════════════════════════
function renderSnvInto(listId, svgContainerId, rows) {
    if (!rows.length) {
        resetSvgHighlight(svgContainerId);
        $(listId).innerHTML = note(tr('No SNV records for this CSS.', '此 CSS 沒有 SNV 紀錄。'));
        return;
    }

    const geneMap = {};
    rows.forEach(r => {
        const raw = r.gene || '—';
        const gene = raw.replace(/\s*\(.*\)\s*$/, '').trim() || raw;
        (geneMap[gene] ||= []).push({ snv: r.snv, aa: r.aa_change || '', raw });
    });
    highlightSvgGenes(svgContainerId, new Set(Object.keys(geneMap)));

    const sorted = Object.keys(geneMap).sort((a, b) => {
        const ia = GENE_ORDER.indexOf(a), ib = GENE_ORDER.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    $(listId).innerHTML = sorted.map(gene => {
        const color = COLOR_BY_GENE[gene] ?? '#94a3b8';
        const list = geneMap[gene];
        return `<div class="snv-gene-block">
            <div class="snv-gene-header">
                <div class="snv-gene-dot" style="background:${color};"></div>
                <span class="snv-gene-name">${esc(gene)}</span>
                <span class="snv-gene-count">${tr(`${list.length} SNV${list.length > 1 ? 's' : ''}`, `${list.length} 個 SNV`)}</span>
            </div>
            <div class="snv-items">${list.map(s => {
                const sub = s.raw && s.raw !== gene ? `<em>${esc(s.raw)}</em> ` : '';
                return `<span class="snv-chip">${sub}${esc(s.snv)}${s.aa ? `<span>${esc(s.aa)}</span>` : ''}</span>`;
            }).join('')}</div>
        </div>`;
    }).join('');
}

async function loadGenomeSvg(containerId) {
    const c = $(containerId);
    if (!c) return;
    try {
        const res = await fetch('/image/css_country/mutation_name.svg');
        c.innerHTML = await res.text();
        const svg = c.querySelector('svg');
        if (!svg) return;
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.querySelectorAll('rect').forEach(rect => {
            const fill = (rect.style.fill || rect.getAttribute('fill') || '').replace(/\s/g, '');
            const gene = SNV_GENE_COLOR_MAP[fill];
            if (gene) rect.setAttribute('data-gene', gene);
        });
    } catch {
        c.innerHTML = errBox(tr('Genome map failed to load.', '基因體圖載入失敗。'));
    }
}

function geneGroup(rect) {
    let el = rect.parentElement;
    while (el && el.tagName?.toLowerCase() === 'g') {
        if (el.querySelector('text')) return el;
        el = el.parentElement;
    }
    return rect.parentElement;
}

function highlightSvgGenes(containerId, active) {
    document.querySelectorAll(`#${containerId} svg rect[data-gene]`).forEach(rect => {
        const g = geneGroup(rect);
        if (!g) return;
        // 樣式在 css_country.css 的 .snv-gene-on / .snv-gene-off
        // Styles: .snv-gene-on / .snv-gene-off in css_country.css
        const on = active.has(rect.getAttribute('data-gene'));
        g.classList.toggle('snv-gene-on', on);
        g.classList.toggle('snv-gene-off', !on);
    });
}

function resetSvgHighlight(containerId) {
    document.querySelectorAll(`#${containerId} svg rect[data-gene]`).forEach(rect => {
        const g = geneGroup(rect);
        if (!g) return;
        g.classList.remove('snv-gene-on', 'snv-gene-off');
    });
}

// ══════════════════════════════════════════════════════════════
// 13. 趨勢曲線 / Trend curves
// 三個面板共用同一個載入函式：全球趨勢、CSS 搜尋的單一國家、國家搜尋。
// One loader for three panels: the Global trend, the one-country curve and the Country search curve.
// ══════════════════════════════════════════════════════════════
const SMOOTH_PANELS = {
    // showCountry：全球面板一定是 Global，不需要寫國家；兩個國家面板一定要寫出國家
    // showCountry: the Global panel is always Global, so no country is named; the two
    // country panels always name theirs
    global: {
        body: 'globalSmoothBody', meta: 'globalSmoothCssMeta', datePrefix: 'globalSmooth',
        canvas: 'globalSmoothCanvas', chartKey: 'globalSmooth', abortKey: 'globalSmooth',
        showCountry: false,
    },
    cssCountry: {
        body: 'smoothBody', meta: 'smoothCssMeta', datePrefix: 'smooth',
        canvas: 'smoothCanvas', chartKey: 'cssCountrySmooth', abortKey: 'cssCountrySmooth',
        showCountry: true,
    },
    search: {
        body: 'countrySmoothBody', meta: 'countrySmoothCssMeta', datePrefix: 'countrySmooth',
        canvas: 'countrySmoothCanvas', chartKey: 'searchSmooth', abortKey: 'searchSmooth',
        showCountry: true,
    },
};

function setDateRange(prefix, rows, store) {
    if (!rows.length) return;
    store.from = rows[0].collection_date;
    store.to = rows[rows.length - 1].collection_date;
    const from = $(`${prefix}DateFrom`), to = $(`${prefix}DateTo`);
    if (from) { from.min = store.from; from.max = store.to; from.value = store.from; }
    if (to) { to.min = store.from; to.max = store.to; to.value = store.to; }
}

async function loadSmooth(panelKey, { hapId, country, hap = null, resetDates = false }) {
    const p = SMOOTH_PANELS[panelKey];
    if (!p || !hapId || !country) return;

    const signal = freshSignal(p.abortKey);
    if (hap) paintIdentity(p.meta, { hap, country: p.showCountry ? country : '' });
    $(p.body).innerHTML = spinner(tr(`Loading ${scopeLabel(country)} curve…`, `${scopeLabel(country)} 曲線載入中…`));

    const from = resetDates ? '' : ($(`${p.datePrefix}DateFrom`)?.value || '');
    const to = resetDates ? '' : ($(`${p.datePrefix}DateTo`)?.value || '');
    let url = `${API}?mode=smooth&hap_id=${hapId}&scope=${encodeURIComponent(country)}`;
    if (from) url += `&date_from=${encodeURIComponent(from)}`;
    if (to) url += `&date_to=${encodeURIComponent(to)}`;

    try {
        const json = await fetchJson(url, { signal });
        if (!json.ok) throw new Error(json.error ?? 'Smooth error');

        const shownHap = json.haplotype ?? hap;
        const shownCountry = json.country || scopeLabel(country);
        const rows = json.data ?? [];

        paintIdentity(p.meta, { hap: shownHap, country: p.showCountry ? shownCountry : '' });

        if (!rows.length) {
            clearChart(p.chartKey);
            $(p.body).innerHTML = note(tr(`No sequences of this CSS were reported in ${scopeLabel(shownCountry)}.`, `${scopeLabel(shownCountry)} 沒有此 CSS 的序列紀錄。`));
            return;
        }
        if (resetDates) setDateRange(p.datePrefix, rows, smoothRanges[panelKey]);

        $(p.body).innerHTML = `
            <div class="chart-box smooth-box"><canvas id="${p.canvas}"></canvas></div>
            <div class="figure-legend">
                <span class="legend-swatch swatch-bars"></span>
                ${tr('<b>Bars</b> daily sequence count of this CSS', '<b>長條</b> 此 CSS 的每日序列數')}
                &nbsp;&nbsp;
                <span class="legend-swatch swatch-line"></span>
                ${tr('<b>Line</b> share of this CSS among all sequences', '<b>折線</b> 此 CSS 占所有序列的比例')}
                &nbsp;— ${tr(
                    `${p.showCountry ? `in <b>${esc(scopeLabel(shownCountry))}</b>, ` : ''}${rows.length.toLocaleString()} days
                from ${esc(rows[0].collection_date)} to ${esc(rows[rows.length - 1].collection_date)}.`,
                    `${p.showCountry ? `<b>${esc(scopeLabel(shownCountry))}</b>，` : ''}${esc(rows[0].collection_date)} 至 ${esc(rows[rows.length - 1].collection_date)}，共 ${rows.length.toLocaleString()} 天。`)}
            </div>`;
        smoothExportInfo[panelKey] = {
            canvas: p.canvas,
            hap: shownHap,
            country: scopeLabel(shownCountry || country) || GLOBAL,
            from: rows[0].collection_date,
            to: rows[rows.length - 1].collection_date,
        };
        makeSmoothChart(p.canvas, p.chartKey, rows);
    } catch (err) {
        if (isAbort(err)) return;
        console.error(err);
        $(p.body).innerHTML = errBox(err.message || tr('Curve failed to load.', '曲線載入失敗。'));
    }
}

// 曲線圖下載用：每個面板目前顯示的國家、CSS 與日期區間
// For curve downloads: the country, CSS and date range shown in each panel
const smoothExportInfo = {};

// 畫面上的曲線圖不放標題（面板上方已有 Pango / UID 標籤）；
// 下載時才把國家、Pango、UID、日期區間畫在圖片上方。
// No title on screen (the panel already shows Pango / UID chips);
// downloads add the country, Pango, UID and date range on top.
function makeSmoothChart(canvasId, chartKey, rows) {
    const labels = rows.map(r => r.collection_date);
    const counts = rows.map(r => (r.cnt == null ? null : +r.cnt));
    const props = rows.map(r => (r.smoothed_proportion == null ? null : +r.smoothed_proportion));

    return drawChart(chartKey, canvasId, {
        data: {
            labels,
            datasets: [
                {
                    type: 'bar', label: tr('Count', '數量'), data: counts,
                    yAxisID: 'yCount', order: 2,
                    backgroundColor: 'rgba(59,130,246,0.28)', borderColor: '#3b82f6', borderWidth: 1,
                },
                {
                    type: 'line', label: tr('Proportion', '比例'), data: props,
                    yAxisID: 'yProp', order: 1,
                    borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2,
                    pointRadius: 0, pointHoverRadius: 4, spanGaps: true, tension: 0.3,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { bottom: 6 } },
            interaction: { mode: 'index', intersect: false },
            plugins: {
                title: { display: false },
                subtitle: { display: false },
                legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            const v = ctx.parsed.y;
                            if (v == null) return null;
                            return ctx.dataset.yAxisID === 'yCount'
                                ? `${tr('Count', '數量')}: ${Number(v).toLocaleString()}`
                                : `${tr('Proportion', '比例')}: ${(v * 100).toFixed(2)}%`;
                        },
                    },
                },
            },
            scales: {
                x: { ticks: { maxTicksLimit: 12, font: { size: 10 } } },
                // 左軸：比例；右軸：序列數 / Left axis: proportion; right axis: sequence count
                yProp: {
                    type: 'linear', position: 'left', min: 0,
                    title: { display: true, text: tr('Proportion', '比例'), font: { size: 11 } },
                    ticks: { font: { size: 10 }, callback: v => `${(v * 100).toFixed(0)}%` },
                },
                yCount: {
                    type: 'linear', position: 'right',
                    title: { display: true, text: tr('Count', '數量'), font: { size: 11 } },
                    ticks: { font: { size: 10 } },
                    grid: { drawOnChartArea: false },
                },
            },
        },
    });
}

// ══════════════════════════════════════════════════════════════
// 14. CSS 搜尋：各國名次表 / CSS search: country rank table
// 所選 CSS 在每個國家的 8 項名次。
// The selected CSS's eight ranks in every country.
// ══════════════════════════════════════════════════════════════
const countryRowByName = name => cssView.countryRows.find(r => r.country === name) || null;

// 株數（# of strains）；值可能是帶千分位的字串，先清掉非數字字元再比較
// Number of strains; the value may be a string with thousands separators, so strip non-digits first
const strainCountOf = row => {
    const n = parseFloat(String(row?.val_strain ?? '').replace(/[^\d.eE+-]/g, ''));
    return Number.isFinite(n) ? n : -1;
};
const scopeForCountry = name => countryRowByName(name)?.country_scope || String(name ?? '').replaceAll(' ', '_');

async function loadCountryRanks(hapId) {
    const signal = freshSignal('countryRanks');
    $('ctryRankBody').innerHTML = spinner(tr('Loading country ranks…', '各國名次載入中…'));
    $('ctryCountrySelect').disabled = true;
    paintIdentity('ctryRankCssMeta', { hap: cssView.hap });

    try {
        const json = await fetchJson(`${API}?mode=country_ranks&hap_id=${hapId}`, { signal });
        if (!json.ok) throw new Error(json.error ?? 'Country rank error');
        cssView.countryRows = json.data ?? [];

        if (!cssView.countryRows.length) {
            $('ctryRankBody').innerHTML = note(tr('This CSS has no per-country rank data.', '此 CSS 沒有各國的排名資料。'));
            $('ctryCountrySelect').innerHTML = '';
            return;
        }

        // 每個國家都有全部的 CSS，所以清單列出所有國家；此 CSS 在該國沒有資料時以 — 呈現
        // Every country has all CSSs, so every country is listed; — means no data for this CSS there
        await loadMeta();
        const metaNames = (ctryView.scopeOptions ?? []).map(x => x.label).filter(Boolean);
        const names = [...new Set([...cssView.countryRows.map(r => r.country), ...metaNames])]
            .sort((a, b) => a.localeCompare(b));
        cssView.countryNames = names;

        // 預設國家：此 CSS 株數最多的國家；都沒有株數時改用 rank_strain 最前面的國家
        // Default country: the one with the most strains of this CSS; otherwise the best rank_strain
        const best = cssView.countryRows.slice().sort((a, b) => {
            const diff = strainCountOf(b) - strainCountOf(a);
            if (diff !== 0) return diff;
            const ra = rankOf(a, 'rank_strain') ?? Infinity;
            const rb = rankOf(b, 'rank_strain') ?? Infinity;
            if (ra !== rb) return ra - rb;
            return a.country.localeCompare(b.country);
        })[0];
        const keep = cssView.keepCountry;
        cssView.keepCountry = '';
        cssView.country = (keep && names.includes(keep)) ? keep : (best?.country || names[0]);

        const select = $('ctryCountrySelect');
        select.innerHTML = names.map(c =>
            `<option value="${esc(c)}">${esc(c)}${countryRowByName(c) ? '' : tr(' (no data)', '（無資料）')}</option>`
        ).join('');
        select.value = cssView.country;
        select.disabled = false;

        renderCountryRanks(true);
        loadSmooth('cssCountry', {
            hapId: cssView.hapId,
            country: scopeForCountry(cssView.country),
            hap: cssView.hap,
            resetDates: true,
        });
    } catch (err) {
        if (isAbort(err)) return;
        console.error(err);
        $('ctryRankBody').innerHTML = errBox(err.message || tr('Country ranks failed to load.', '各國名次載入失敗。'));
    }
}

// 國家數與每國 CSS 數是固定的，寫在面板標題；下方標籤只放 Pango / UID
// The country count and CSSs per country are fixed and go in the panel title; the chips show only Pango / UID
function paintCountryRankIdentity() {
    if (!cssView.countryNames?.length) return;
    const total = Number(cssView.totalCss) || 0;
    const nCountries = cssView.countryNames.length.toLocaleString();
    const title = $('ctryRankTitle');
    if (title) {
        // 雙語 span 一起放，切換語言時不必重畫
        // Both language spans are included, so no redraw is needed on a language switch
        const en = total > 1
            ? `This CSS, ranked in each of ${nCountries} countries (${total.toLocaleString()} CSSs per country)`
            : `This CSS, ranked in each of ${nCountries} countries`;
        const zh = total > 1
            ? `此 CSS 在 ${nCountries} 個國家的排名（每個國家共 ${total.toLocaleString()} 個 CSS）`
            : `此 CSS 在 ${nCountries} 個國家的排名`;
        title.innerHTML = `<span data-l="en">${esc(en)}</span><span data-l="zh">${esc(zh)}</span>`;
    }
    paintIdentity('ctryRankCssMeta', { hap: cssView.hap });
}

function renderCountryRanks(centerSelected = false) {
    const body = $('ctryRankBody');
    // 這不是國家排名，而是同一個 CSS 在各國的名次，所以依國名字母排序。
    // 所有國家都列出；此 CSS 在該國沒有資料時每格顯示 —。
    // This is not a ranking of countries but one CSS looked up country by country,
    // so the order is alphabetical. Every country is listed; — means no data.
    const names = cssView.countryNames?.length
        ? cssView.countryNames
        : cssView.countryRows.map(r => r.country).sort((a, b) => a.localeCompare(b));
    const rows = names.map(name => countryRowByName(name) || { country: name });

    if (!rows.length) {
        body.innerHTML = note(tr('No country rank data.', '沒有各國排名資料。'));
        return;
    }

    paintCountryRankIdentity();

    body.innerHTML = `
        <div class="figure-legend" id="ctryRankHead">${tr(
            `Each row is a country. Each cell shows this CSS's rank <b>within that country</b>
            (a number sign, #, marks the rank; #1 is the highest), with the metric value below it.
            A dash (—) means that the country has no record of this CSS.
            By default, the country with the most strains carrying this CSS is selected.
            Click any row to show that country's curve on the right.`,
            `每一列是一個國家，每格顯示此 CSS <b>在該國內</b>的名次（# 表示名次，#1 為最高），下方是指標數值。
            破折號（—）表示該國沒有此 CSS 的紀錄。
            預設選取帶有此 CSS 株數最多的國家；點選任一列，即可在右側畫出該國的曲線。`)}
        </div>
        <div id="ctryRankTableWrap">
            <table class="country-rank-table">
                <thead>
                    <tr>
                        <th class="country-col">${tr('Country', '國家')}</th>
                        ${RADAR_AXES.map(a => `<th title="${esc(RANK_METRICS[a.rank])}">${esc(a.label)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr data-country="${esc(r.country)}" class="${r.country === cssView.country ? 'selected-country' : ''}">
                            <td class="country-col">${esc(r.country)}</td>
                            ${RADAR_AXES.map(a => {
                                const rk = rankOf(r, a.rank);
                                return `<td>${rk
                                    ? `<div class="country-rank-number">#${rk.toLocaleString()}</div><div class="country-rank-value">${fmt(r[a.val])}</div>`
                                    : '—'}</td>`;
                            }).join('')}
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>`;

    body.querySelectorAll('tr[data-country]').forEach(tr =>
        tr.addEventListener('click', () => pickCountry(tr.dataset.country, false))
    );

    if (centerSelected) centerSelectedCountry();
}

function centerSelectedCountry() {
    if (!cssView.country) return;
    requestAnimationFrame(() => {
        const wrap = $('ctryRankTableWrap');
        const row = wrap?.querySelector(`tr[data-country="${CSS.escape(cssView.country)}"]`);
        if (wrap && row) {
            wrap.scrollTop = Math.max(0, row.offsetTop - wrap.clientHeight / 2 + row.offsetHeight / 2);
        }
    });
}

function pickCountry(country, center = false) {
    if (!country) return;
    cssView.country = country;
    if ($('ctryCountrySelect')) $('ctryCountrySelect').value = country;

    $('ctryRankBody')?.querySelectorAll('tr[data-country]').forEach(tr =>
        tr.classList.toggle('selected-country', tr.dataset.country === country)
    );
    if (center) centerSelectedCountry();

    loadSmooth('cssCountry', {
        hapId: cssView.hapId,
        country: scopeForCountry(country),
        hap: cssView.hap,
        resetDates: true,
    });
}

// ══════════════════════════════════════════════════════════════
// 15. 國家搜尋 / Country search
// ══════════════════════════════════════════════════════════════
async function loadMeta() {
    if (ctryView.metaLoaded) return;
    try {
        const json = await fetchJson(`${API}?mode=meta`);
        if (!json.ok) throw new Error(json.error ?? 'Meta error');

        const options = (json.scope_options
            ?? (json.scopes ?? []).map(scope => ({ scope, label: scopeLabel(scope), sample: 0 })))
            .filter(x => x.scope !== GLOBAL);          // Country search 不列 Global

        // 下拉選單依國名排序；預設國家另外取序列數最多者
        // The menu is sorted by name; the default country is the one with the most sequences
        const ordered = [...options].sort((a, b) => a.label.localeCompare(b.label));
        ctryView.scopeOptions = ordered;

        const select = $('countrySearchSelect');
        if (select) {
            select.innerHTML = ordered.map(x => {
                const n = Number(x.sample) || 0;
                const label = n > 0 ? `${x.label} (${n.toLocaleString()})` : x.label;
                return `<option value="${esc(x.scope)}">${esc(label)}</option>`;
            }).join('');
        }

        // 預設國家：序列數最多；下拉選單本身仍依國名排序
        // Default country: the most sequences; the menu itself stays sorted by name
        const fallback = [...options].sort((a, b) => {
            const diff = (Number(b.sample) || 0) - (Number(a.sample) || 0);
            return diff !== 0 ? diff : a.label.localeCompare(b.label);
        })[0];
        if (fallback) {
            ctryView.scope = fallback.scope;
            if (select) select.value = fallback.scope;
        }
        ctryView.metaLoaded = true;
    } catch (err) {
        console.error(err);
    }
}

function showSearchPane(which) {
    const cssOn = which === 'css';
    $('cssSearchPane').classList.toggle('show', cssOn);
    $('cssSearchPane').classList.toggle('active', cssOn);
    $('countrySearchPane').classList.toggle('show', !cssOn);
    $('countrySearchPane').classList.toggle('active', !cssOn);
    $('css-search-tab').classList.toggle('active', cssOn);
    $('country-search-tab').classList.toggle('active', !cssOn);
    $('css-search-tab').setAttribute('aria-selected', cssOn ? 'true' : 'false');
    $('country-search-tab').setAttribute('aria-selected', cssOn ? 'false' : 'true');

    if (!cssOn) initCountrySearch();
    // 在隱藏時量的 canvas 尺寸不對，切換分頁後重新量一次
    // A canvas sized while hidden is wrong, so re-measure after the tab switch
    requestAnimationFrame(() => Object.values(charts).forEach(c => c?.resize()));
}

async function initCountrySearch() {
    await loadMeta();
    buildTabButtons('countryCssRankTabs', col => loadCountryScopeRanks(col, true));
    paintTabButtons('countryCssRankTabs', ctryView.rank);
    paintMetricLabel('countryCssRankMetricLabel', ctryView.rank, ctryView.scope);

    if (!$('countryCssRankList').dataset.loaded) {
        if ($('countrySearchSelect') && ctryView.scope) {
            $('countrySearchSelect').value = ctryView.scope;
        }
        await loadCountryScopeRanks(ctryView.rank, false);
    }
}

// 國家搜尋頁最上方的橘色資訊列
// The amber bar at the top of the Country search tab
function paintCountryContext() {
    const el = $('countryContextIdentity');
    if (!el) return;
    el.innerHTML = identityStrip({
        country: ctryView.scope,
        hap: ctryView.hap,
        extra: ctryView.totalCss > 1 ? [tr(`${ctryView.totalCss.toLocaleString()} CSS in this country`, `此國家共 ${ctryView.totalCss.toLocaleString()} 個 CSS`)] : [],
    });
}

// 某國某指標的完整排名，抓一次後快取
// The complete ranking for one country and metric, fetched once and cached
async function allScopeRankRows(scope, col) {
    const key = `${scope}|${col}`;
    if (!ctryView.allCache[key]) {
        try {
            const json = await fetchJson(`${API}?mode=scope_ranks&scope=${encodeURIComponent(scope)}&rank=${encodeURIComponent(col)}&topN=all`);
            ctryView.allCache[key] = json.ok ? (json.data ?? []) : [];
        } catch (err) {
            console.error(err);
            return [];
        }
    }
    return ctryView.allCache[key];
}

async function loadCountryScopeRanks(col, preserveSelection = true) {
    ctryView.rank = col;
    paintTabButtons('countryCssRankTabs', col);

    const wantedHapId = preserveSelection ? ctryView.hapId : null;
    const firstScope = ctryView.scopeOptions[0]?.scope || '';
    ctryView.scope = ($('countrySearchSelect')?.value || ctryView.scope || firstScope).trim();
    if (!ctryView.scope) return;
    ctryView.topN = $('countryCssTopN')?.value || 'all';

    paintMetricLabel('countryCssRankMetricLabel', col, ctryView.scope);
    paintCountryContext();
    $('countryCssRankList').innerHTML = spinner(tr(`Loading ${scopeLabel(ctryView.scope)} ranks…`, `${scopeLabel(ctryView.scope)} 排名載入中…`));

    try {
        const json = await fetchJson(`${API}?mode=scope_ranks&scope=${encodeURIComponent(ctryView.scope)}&rank=${encodeURIComponent(col)}&topN=${encodeURIComponent(ctryView.topN)}`);
        if (!json.ok) throw new Error(json.error ?? 'Country search error');

        if (json.scope) ctryView.scope = json.scope;
        if ($('countrySearchSelect')) $('countrySearchSelect').value = ctryView.scope;

        ctryView.rows = json.data ?? [];
        ctryView.totalCss = Math.max(1, parseInt(json.total_css) || ctryView.rows.length || 1);

        paintCountryContext();
        paintMetricLabel('countryCssRankMetricLabel', col, ctryView.scope);

        // 和全球清單相同：維持選的筆數，已選的 CSS 排名較後面時釘在清單下方
        // Same rule as the Global list: keep the requested Top-N and pin the selected CSS below it
        const chosen = wantedHapId
            ? ctryView.rows.find(r => parseInt(r.hap_id) === parseInt(wantedHapId))
            : null;

        $('countryCssRankList').dataset.loaded = '1';
        renderCountryCssRankList();

        if (chosen) {
            selectCountrySearchCss(parseInt(chosen.hap_id), chosen);
        } else if (!wantedHapId) {
            const first = ctryView.rows[0] || null;
            if (first) {
                selectCountrySearchCss(parseInt(first.hap_id), first);
            } else {
                renderCountrySearchRadar(null);
            }
        } else {
            const full = await allScopeRankRows(ctryView.scope, col);
            const row = full.find(r => parseInt(r.hap_id) === parseInt(wantedHapId)) || null;
            if (ctryView.rank !== col || ctryView.hapId !== parseInt(wantedHapId)) return;
            if (row) ctryView.row = row;
            pinSelectedRow({
                listId: 'countryCssRankList',
                col,
                row,
                hap: ctryView.hap,
                hapId: ctryView.hapId,
                onPick: picked => selectCountrySearchCss(parseInt(picked.hap_id), picked),
            });
            renderCountrySearchRadar(ctryView.row);
        }
    } catch (err) {
        console.error(err);
        $('countryCssRankList').innerHTML = errBox(err.message || tr('Country search failed.', '國家搜尋失敗。'));
        renderCountrySearchRadar(null);
    }
}

function renderCountryCssRankList() {
    const list = $('countryCssRankList');
    if (!ctryView.rows.length) {
        list.innerHTML = note(tr(`No CSS is ranked for this metric in ${scopeLabel(ctryView.scope)}.`, `${scopeLabel(ctryView.scope)} 沒有 CSS 有此指標的排名。`));
        return;
    }
    list.innerHTML = `<div class="list-country-head">${tr(`Ranking inside <b>${esc(scopeLabel(ctryView.scope))}</b>`, `<b>${esc(scopeLabel(ctryView.scope))}</b> 內的排名`)}</div>`
        + rankListLegend(ctryView.rank, ctryView.scope, ctryView.rows.length)
        + ctryView.rows.map(r => rankRowHtml(r, ctryView.rank, ctryView.hapId)).join('');

    list.querySelectorAll('.rank-row').forEach(el => el.addEventListener('click', () => {
        const hapId = parseInt(el.dataset.hapId);
        selectCountrySearchCss(hapId, ctryView.rows.find(r => parseInt(r.hap_id) === hapId) || null);
    }));
}

function renderCountrySearchRadar(row) {
    renderRadarPanel({
        bodyId: 'countryRadarBody',
        canvasId: 'countryRadarCanvas',
        tableId: 'countryRadarTable',
        chartKey: 'countryRadar',
        rank: row,
        totalCss: ctryView.totalCss,
        hap: ctryView.hap,
        country: ctryView.scope,
    });
}

function selectCountrySearchCss(hapId, row = null) {
    if (!hapId) return;
    ctryView.hapId = hapId;
    ctryView.row = row || ctryView.rows.find(r => parseInt(r.hap_id) === hapId) || null;
    ctryView.hap = {
        hap_id: hapId,
        pango: ctryView.row?.pango ?? ctryView.hap?.pango ?? '',
        uid: ctryView.row?.mutation_set ?? ctryView.hap?.uid ?? '',
    };

    $('countryCssRankList').querySelectorAll('.rank-row').forEach(el =>
        el.classList.toggle('selected', parseInt(el.dataset.hapId) === hapId)
    );
    centerRow('countryCssRankList', hapId, 'smooth');

    paintCountryContext();
    renderCountrySearchRadar(ctryView.row);
    loadCountrySearchSnv(hapId);
    loadSmooth('search', { hapId, country: ctryView.scope, hap: ctryView.hap, resetDates: true });
}

async function loadCountrySearchSnv(hapId) {
    const signal = freshSignal('countrySnv');
    paintIdentity('countrySnvCssMeta', { hap: ctryView.hap });
    $('countrySnvList').innerHTML = spinner(tr('Loading SNVs…', 'SNV 載入中…'));
    try {
        const json = await fetchJson(`${API}?mode=snv&hap_id=${hapId}`, { signal });
        if (!json.ok) throw new Error(json.error ?? 'SNV error');
        ctryView.hap = json.haplotype ?? ctryView.hap;
        paintCountryContext();
        paintIdentity('countrySnvCssMeta', {
            hap: ctryView.hap,
            extra: [tr(`${(json.data?.length ?? 0).toLocaleString()} SNVs`, `${(json.data?.length ?? 0).toLocaleString()} 個 SNV`)],
        });
        renderSnvInto('countrySnvList', 'countrySnvSvgContainer', json.data ?? []);
    } catch (err) {
        if (isAbort(err)) return;
        console.error(err);
        $('countrySnvList').innerHTML = errBox(err.message || tr('SNVs failed to load.', 'SNV 載入失敗。'));
    }
}

// ══════════════════════════════════════════════════════════════
// 16. 下載 / Downloads
// 圖表：PNG，上方加國家、Pango、UID 標題列；SNV 面板與排名清單：整個面板截圖（含捲動區）；
// 各國名次表：Excel。
// Charts: PNG with a country / Pango / UID header; SNV panel and ranking list: a
// snapshot of the whole panel (including the scrolled part); country ranks: Excel.
// ══════════════════════════════════════════════════════════════
function makeDownloadBtn(title, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'panel-download';
    btn.title = title;
    btn.innerHTML = `<img src="/image/download.svg" width="17" height="17" alt="download">`;
    btn.addEventListener('click', onClick);
    return btn;
}

function saveCanvasAsPNG(canvas, filename) {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${filename || 'panel'}.png`;
    a.click();
}

// 下載圖表：圖片上方置中加標題列（國家、Pango + UID，曲線圖再加日期區間）
// Chart download: a centred header with the country and Pango + UID (plus the date range for curves)
function downloadSmoothPNG(panelKey, filename) {
    const info = smoothExportInfo[panelKey];
    if (!info) return;
    exportChartWithHeader(info.canvas, [
        { text: info.country, size: 18, weight: '700', color: '#212529' },
        { text: `${hapPango(info.hap)}    UID ${hapUid(info.hap)}`, size: 14, weight: '700', color: '#1d4ed8' },
        { text: tr(`${info.from} to ${info.to}`, `${info.from} 至 ${info.to}`), size: 13, weight: '400', color: '#555' },
    ], `${filename}_${fileSafe(info.from)}_${fileSafe(info.to)}`);
}

function downloadRadarPNG(chartKey, filename) {
    const info = radarExportInfo[chartKey];
    if (!info) return;
    exportChartWithHeader(info.canvas, [
        { text: info.country, size: 18, weight: '700', color: '#212529' },
        { text: `${hapPango(info.hap)}    UID ${hapUid(info.hap)}`, size: 14, weight: '700', color: '#1d4ed8' },
    ], filename);
}

function exportChartWithHeader(canvasId, lines, filename) {
    const src = $(canvasId);
    if (!src) return;
    const scale = src.width / (src.clientWidth || src.width) || 1;
    const font = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const pad = Math.round(12 * scale);
    const lineH = lines.map(l => Math.round(l.size * 1.45 * scale));
    const band = pad * 2 + lineH.reduce((a, b) => a + b, 0);

    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height + band;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let y = pad;
    lines.forEach((l, i) => {
        ctx.font = `${l.weight} ${Math.round(l.size * scale)}px ${font}`;
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, out.width / 2, y);
        y += lineH[i];
    });
    ctx.drawImage(src, 0, band);
    saveCanvasAsPNG(out, filename);
}

// 下載整個面板，包含捲動區下方看不到的部分
// Download a whole panel, including anything hidden below its scroll area
async function downloadFullPanelPNG(panelId, scrollId, filename) {
    const source = $(panelId);
    if (!source || typeof html2canvas === 'undefined') return;

    const clone = source.cloneNode(true);
    const exportWidth = Math.max(Math.ceil(source.getBoundingClientRect().width || 900), 1000);
    Object.assign(clone.style, {
        position: 'fixed', left: '-10000px', top: '0',
        width: `${exportWidth}px`, background: '#fff', zIndex: '-1',
    });
    ['height', 'min-height', 'max-height'].forEach(p => clone.style.setProperty(p, p === 'height' ? 'auto' : (p === 'min-height' ? '0' : 'none'), 'important'));
    clone.style.setProperty('overflow', 'visible', 'important');

    // 下載按鈕不放進圖片 / Download buttons are not part of the image
    clone.querySelectorAll('.panel-download').forEach(el => el.remove());

    const unclip = el => {
        if (!el) return;
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('min-height', '0', 'important');
        el.style.setProperty('max-height', 'none', 'important');
        el.style.setProperty('overflow', 'visible', 'important');
    };
    unclip(clone.querySelector(`#${scrollId}`));
    clone.querySelectorAll('.snv-svg-wrap').forEach(unclip);

    document.body.appendChild(clone);
    try {
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const width = Math.ceil(clone.scrollWidth);
        const height = Math.ceil(clone.scrollHeight);
        const canvas = await html2canvas(clone, {
            backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false,
            width, height, windowWidth: width, windowHeight: height, scrollX: 0, scrollY: 0,
        });
        saveCanvasAsPNG(canvas, filename);
    } finally {
        clone.remove();
    }
}

// 各國名次表下載成 Excel（.xlsx）：最上方寫 Pango 與 UID，
// 下面每一列是一個國家，每項指標各有「名次」與「數值」兩欄。
// Country ranks as Excel (.xlsx): Pango and UID at the top, then one row per
// country with a rank and a value column for each metric.
function downloadCountryRankXLSX(filename) {
    if (typeof XLSX === 'undefined') return;
    const names = cssView.countryNames?.length
        ? cssView.countryNames
        : cssView.countryRows.map(r => r.country).sort((a, b) => a.localeCompare(b));
    if (!names.length) return;

    const num = v => {
        const n = parseFloat(String(v ?? '').replace(/,/g, ''));
        return Number.isFinite(n) ? n : '';
    };
    const header = [tr('Country', '國家')];
    RADAR_AXES.forEach(a => header.push(tr(`${a.label} rank`, `${a.label} 名次`), tr(`${a.label} value`, `${a.label} 數值`)));

    const aoa = [
        ['Pango', hapPango(cssView.hap)],
        ['UID', hapUid(cssView.hap)],
        [],
        header,
        ...names.map(name => {
            const r = countryRowByName(name) || {};
            const row = [name];
            RADAR_AXES.forEach(a => row.push(rankOf(r, a.rank) ?? '', rankOf(r, a.rank) ? num(r[a.val]) : ''));
            return row;
        }),
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 26 }, ...RADAR_AXES.flatMap(() => [{ wch: 11 }, { wch: 12 }])];
    ws['!freeze'] = { xSplit: 1, ySplit: 4 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Country ranks');
    XLSX.writeFile(wb, `${filename}.xlsx`);
}

function attachDownload(hostId, title, run) {
    const host = $(hostId);
    if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    host.appendChild(makeDownloadBtn(title, run));
}

const cssFileTag = () => fileSafe(`${hapPango(cssView.hap)}_${hapUid(cssView.hap)}`);
const ctryFileTag = () => fileSafe(`${hapPango(ctryView.hap)}_${hapUid(ctryView.hap)}`);

// ══════════════════════════════════════════════════════════════
// 17. 初始化與語言切換 / Start-up and language switch
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    buildTabButtons('rankTabs', col => loadRank(col, true));
    loadGenomeSvg('snvSvgContainer');
    loadGenomeSvg('countrySnvSvgContainer');
    paintCssContext();
    paintCountryContext();

    $('css-search-tab')?.addEventListener('click', () => showSearchPane('css'));
    $('country-search-tab')?.addEventListener('click', () => showSearchPane('country'));

    $('rankTopN')?.addEventListener('change', e => { cssView.topN = e.target.value; loadRank(cssView.rank, true); });
    $('ctryCountrySelect')?.addEventListener('change', e => pickCountry(e.target.value, true));

    $('globalSmoothDateApply')?.addEventListener('click', () =>
        loadSmooth('global', { hapId: cssView.hapId, country: GLOBAL, hap: cssView.hap }));
    $('globalSmoothDateReset')?.addEventListener('click', () =>
        loadSmooth('global', { hapId: cssView.hapId, country: GLOBAL, hap: cssView.hap, resetDates: true }));

    $('smoothDateApply')?.addEventListener('click', () =>
        loadSmooth('cssCountry', { hapId: cssView.hapId, country: scopeForCountry(cssView.country), hap: cssView.hap }));
    $('smoothDateReset')?.addEventListener('click', () =>
        loadSmooth('cssCountry', { hapId: cssView.hapId, country: scopeForCountry(cssView.country), hap: cssView.hap, resetDates: true }));

    $('countrySearchSelect')?.addEventListener('change', () => loadCountryScopeRanks(ctryView.rank, false));
    $('countryCssTopN')?.addEventListener('change', () => loadCountryScopeRanks(ctryView.rank, true));
    $('countrySmoothDateApply')?.addEventListener('click', () =>
        loadSmooth('search', { hapId: ctryView.hapId, country: ctryView.scope, hap: ctryView.hap }));
    $('countrySmoothDateReset')?.addEventListener('click', () =>
        loadSmooth('search', { hapId: ctryView.hapId, country: ctryView.scope, hap: ctryView.hap, resetDates: true }));

    attachDownload('snvDownloadBtn', tr('Download the CSS SNV panel as PNG', '下載 CSS SNV 面板（PNG）'),
        () => downloadFullPanelPNG('snvPanel', 'snvList', `${cssFileTag()}_snvs`));
    attachDownload('radarDownloadBtn', tr('Download the Global rank radar as PNG', '下載全球排名雷達圖（PNG）'),
        () => downloadRadarPNG('cssRadar', `${cssFileTag()}_Global_radar`));
    attachDownload('globalSmoothDownloadBtn', tr('Download the Global trend as PNG', '下載全球趨勢（PNG）'),
        () => downloadSmoothPNG('global', `${cssFileTag()}_Global_trend`));
    attachDownload('ctryRankDownloadBtn', tr('Download the country rank table as Excel (.xlsx)', '下載各國名次表（Excel .xlsx）'),
        () => downloadCountryRankXLSX(`${cssFileTag()}_country_ranks`));
    attachDownload('smoothDownloadBtn', tr('Download this country curve as PNG', '下載此國家的曲線（PNG）'),
        () => downloadSmoothPNG('cssCountry', `${cssFileTag()}_${fileSafe(cssView.country)}_curve`));

    attachDownload('countrySnvDownloadBtn', tr('Download the CSS SNV panel as PNG', '下載 CSS SNV 面板（PNG）'),
        () => downloadFullPanelPNG('countrySnvPanel', 'countrySnvList', `${ctryFileTag()}_snvs`));
    attachDownload('countrySmoothDownloadBtn', tr('Download this country curve as PNG', '下載此國家的曲線（PNG）'),
        () => downloadSmoothPNG('search', `${ctryFileTag()}_${fileSafe(ctryView.scope)}_curve`));
    attachDownload('countryRadarDownloadBtn', tr('Download this country rank radar as PNG', '下載此國家的排名雷達圖（PNG）'),
        () => downloadRadarPNG('countryRadar', `${ctryFileTag()}_${fileSafe(ctryView.scope)}_radar`));
    attachDownload('countryRankDownloadBtn', tr('Download the ranking list as PNG', '下載排名清單（PNG）'),
        () => downloadFullPanelPNG('countryCssRankPanel', 'countryCssRankList', `${fileSafe(ctryView.scope)}_ranking`));

    applyOptionText();
    loadRank(cssView.rank, false);
});

// <option> 不能放雙語 span：有 data-zh 的元素，依語言換文字
// <option> cannot hold language spans: elements with data-zh swap their text instead
function applyOptionText() {
    document.querySelectorAll('[data-zh]').forEach(el => {
        if (el.dataset.en == null) el.dataset.en = el.textContent;
        el.textContent = tr(el.dataset.en, el.dataset.zh);
    });
}

// 切換語言：用目前的選擇重新畫一次（排名清單有快取，SNV 與曲線會重新查詢）
// Language switch: redraw with the current selection (rankings are cached; SNVs and curves are re-fetched)
window.addEventListener('sitelangchange', () => {
    applyOptionText();
    buildTabButtons('rankTabs', col => loadRank(col, true));
    paintCssContext();
    loadRank(cssView.rank, true);
    if (cssView.hapId) {
        cssView.keepCountry = cssView.country;
        selectCss(cssView.hapId);
    }

    if ($('countryCssRankList')?.dataset.loaded) {
        buildTabButtons('countryCssRankTabs', col => loadCountryScopeRanks(col, true));
        paintTabButtons('countryCssRankTabs', ctryView.rank);
        paintMetricLabel('countryCssRankMetricLabel', ctryView.rank, ctryView.scope);
        renderCountryCssRankList();
        if (ctryView.hapId) selectCountrySearchCss(ctryView.hapId, ctryView.row);
    } else {
        paintCountryContext();
    }
});