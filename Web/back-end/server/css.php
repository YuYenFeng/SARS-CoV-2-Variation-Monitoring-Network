<?php
/* =====================================================================
   css.php
   CSS Rankings 頁（css.html / js/css.js）的 API。只讀現有資料表，不改資料庫結構。
   API for the CSS Rankings page (css.html / js/css.js). Read-only; the
   database structure is not changed.

   mode 參數決定回傳內容 / The mode parameter selects the data
     meta           國家搜尋的國家清單（含序列數） / country list for Country search (with sequence counts)
     global_ranks   全球排名；rank、topN / Global ranking; rank, topN
     scope_ranks    某國排名；scope、rank、topN / ranking in one country; scope, rank, topN
     snv            某 CSS 的 SNV 與全球名次；hap_id / a CSS's SNVs and Global ranks; hap_id
     country_ranks  某 CSS 在各國的名次；hap_id / a CSS's ranks in every country; hap_id
     smooth         某 CSS 在某國的每日曲線；hap_id、scope、date_from、date_to
                    a CSS's daily curve in one country; hap_id, scope, date_from, date_to

   css_rank.scope 是來源檔名的後綴：CSS_rank_Global → Global、CSS_rank_Taiwan → Taiwan。
   css_rank.scope is the source file suffix: CSS_rank_Global → Global, CSS_rank_Taiwan → Taiwan.

   描述單一 CSS 的回應都附 pango、uid；描述單一國家的都附 scope、country，
   前端不必再查一次就能標示每張圖。
   Responses about one CSS carry pango and uid, and responses about one
   country carry scope and country, so the front end can label every figure
   without a second request.

   內容 / Contents
     1. 設定 / Settings     2. 小工具 / Helpers     3. 各 mode / Modes
   ===================================================================== */

require_once dirname(__DIR__) . '/common.php';


/* =====================================================================
   1. 設定 / Settings
   ===================================================================== */
const GLOBAL_SCOPE   = 'Global';
const GLOBAL_COUNTRY = 'Global';

// 每個名次欄位對應的數值欄位；也是 rank 參數的白名單
// The metric column behind each rank column; also the whitelist for the rank parameter
const RANK_MAP = [
    'rank_strain'  => 'n_strains',
    'rank_ld'      => 'ld',
    'rank_s'       => 's_count',
    'rank_p'       => 'persistent_index',
    'rank_del'     => 'del_count',
    'rank_3_month' => 'slope_3_month',
    'rank_1_month' => 'slope_1_month',
    'rank_14_day'  => 'slope_14_day',
];

// 找出同一個 CSS 的條件：nt_hash 走索引縮小範圍，nt_haplotype 再精確比對
// Same-CSS filter: nt_hash narrows via an index, nt_haplotype confirms exactly
const NT_FILTER = 'h.nt_hash = UNHEX(MD5(?)) AND h.nt_haplotype = ?';

const HAPLOTYPE_COLUMNS = 'hap_id, uid, pango, pango_prop, first_appear_date, nt_haplotype, aa_haplotype, nt_hash';


/* =====================================================================
   2. 小工具 / Helpers
   ===================================================================== */

// 同一段 SQL 在一次請求中只 prepare 一次
// Each SQL statement is prepared only once per request
function q(PDO $pdo, string $sql, array $params = []): array {
    static $cache = [];
    $key = md5($sql);
    if (!isset($cache[$key])) {
        $cache[$key] = $pdo->prepare($sql);
    }
    $st = $cache[$key];
    $st->execute($params);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $st->closeCursor();
    return $rows;
}

// 請求本身有問題（找不到 CSS、國家…）：回傳 ok: false 與原因
// A problem with the request (CSS or country not found, …): ok: false with the reason
function fail(string $error): void {
    send_json(['ok' => false, 'error' => $error]);
}

// topN：數字或 all（0 = 全部，最多 5000） / topN: a number or all (0 = all, at most 5000)

function parseTopN(): int {
    $raw = trim((string)($_GET['topN'] ?? '10'));
    if (strtolower($raw) === 'all' || (int)$raw <= 0) return 0;
    return min(5000, (int)$raw);
}

function requestedRankColumn(): string {
    $col = trim((string)($_GET['rank'] ?? 'rank_strain'));
    // 只有 RANK_MAP 的鍵會放進 SQL / Only RANK_MAP keys ever reach the SQL
    return isset(RANK_MAP[$col]) ? $col : 'rank_strain';
}

// 每個排名查詢都回傳 8 組名次與數值：rank_strain + val_strain, …
// The eight rank/value pairs every rank query returns: rank_strain + val_strain, …
function rankValueColumns(): string {
    $parts = [];
    foreach (RANK_MAP as $rankCol => $valCol) {
        $alias = 'val_' . substr($rankCol, 5);
        $parts[] = "MIN(NULLIF(r.{$rankCol},0)) AS {$rankCol}";
        $parts[] = "MAX(r.{$valCol}) AS {$alias}";
    }
    return implode(",\n            ", $parts);
}

// scope 用底線（United_States），也接受空格寫法（United States）
// Scopes use underscores (United_States); the readable form is accepted too
function resolveScopeName(PDO $pdo, string $scope): ?string {
    $scope = trim($scope);
    if ($scope === '') return null;

    $candidates = array_values(array_unique([
        $scope,
        str_replace(' ', '_', $scope),
        str_replace('_', ' ', $scope),
    ]));
    $holders = implode(',', array_fill(0, count($candidates), '?'));

    $rows = q($pdo, "SELECT scope FROM css_rank WHERE scope IN ({$holders}) LIMIT 1", $candidates);
    return $rows ? (string)$rows[0]['scope'] : null;
}

// 網址的 hap_id（或 uid）指定的 CSS / The CSS named by hap_id (or uid) in the URL
function selectedHaplotype(PDO $pdo): array {
    $hapId = (int)($_GET['hap_id'] ?? 0);
    $uid = trim((string)($_GET['uid'] ?? ''));

    if ($hapId > 0) {
        $rows = q($pdo, 'SELECT ' . HAPLOTYPE_COLUMNS . ' FROM css_haplotype WHERE hap_id = ? LIMIT 1', [$hapId]);
        if ($rows) return $rows[0];
        fail("hap_id not found / 找不到 hap_id: {$hapId}");
    }

    if ($uid !== '') {
        $rows = q($pdo, 'SELECT ' . HAPLOTYPE_COLUMNS . ' FROM css_haplotype WHERE uid = ? LIMIT 1', [$uid]);
        if ($rows) return $rows[0];
        fail("uid not found / 找不到 uid: {$uid}");
    }

    fail('hap_id is required / 缺少 hap_id');
}

// 取前 N 個「名次」而不是前 N 列：同名次的 CSS 會全部保留
// Cut at the Nth distinct rank, not the Nth row, so tied CSSs stay together
function trimTopByRank(array $rows, string $rankKey, int $topN): array {
    if ($topN <= 0) return $rows;
    $out = [];
    $seen = [];
    foreach ($rows as $row) {
        $rank = $row[$rankKey] ?? null;
        if ($rank === null || (int)$rank <= 0) continue;
        $key = (string)$rank;
        if (!isset($seen[$key])) {
            if (count($seen) >= $topN) break;
            $seen[$key] = true;
        }
        $out[] = $row;
    }
    return $out;
}

// 某範圍內的排名：每個 nt_haplotype 一列 / Ranking in one scope: one row per nt_haplotype
function scopeRankRows(PDO $pdo, string $scope, string $rankCol, int $topN): array {
    $valCol = RANK_MAP[$rankCol];
    $rankCols = rankValueColumns();

    $rows = q($pdo, "
        SELECT
            MIN(h.hap_id) AS hap_id,
            MIN(h.uid) AS mutation_set,
            MIN(h.pango) AS pango,
            MIN(h.first_appear_date) AS first_appear_date,
            MIN(r.group_name) AS group_name,
            {$rankCols},
            MIN(NULLIF(r.{$rankCol},0)) AS rank_value,
            MAX(r.{$valCol}) AS metric_value
        FROM css_rank r
        JOIN css_haplotype h ON h.hap_id = r.hap_id
        WHERE r.scope = ?
        GROUP BY h.nt_haplotype
        HAVING rank_value IS NOT NULL
        ORDER BY rank_value ASC, hap_id ASC
        LIMIT 30000
    ", [$scope]);

    return trimTopByRank($rows, 'rank_value', $topN);
}

// 某範圍內的 CSS 總數 / Number of CSSs in one scope
function scopeTotalCss(PDO $pdo, string $scope): int {
    $rows = q($pdo, '
        SELECT COUNT(DISTINCT h.nt_haplotype) AS n
        FROM css_rank r
        JOIN css_haplotype h ON h.hap_id = r.hap_id
        WHERE r.scope = ?
    ', [$scope]);
    return (int)($rows[0]['n'] ?? 0);
}

// 某 CSS 在某範圍內的 8 項名次 / The eight ranks of one CSS in one scope
function rankForNt(PDO $pdo, string $scope, string $nt): ?array {
    $rankCols = rankValueColumns();
    $rows = q($pdo, "
        SELECT {$rankCols}, MIN(r.group_name) AS group_name
        FROM css_rank r
        JOIN css_haplotype h ON h.hap_id = r.hap_id
        WHERE r.scope = ? AND " . NT_FILTER . "
    ", [$scope, $nt, $nt]);

    if (!$rows) return null;
    $row = $rows[0];
    foreach (array_keys(RANK_MAP) as $col) {
        if (($row[$col] ?? null) !== null) return $row;
    }
    return null;
}

// 某 CSS 的 SNV / The SNVs of one CSS
function snvsForNt(PDO $pdo, string $nt): array {
    return q($pdo, '
        SELECT DISTINCT s.snv, s.gene, s.aa_change
        FROM css_snv s
        JOIN css_haplotype h ON h.hap_id = s.hap_id
        WHERE ' . NT_FILTER . '
        ORDER BY s.gene ASC, s.snv ASC
    ', [$nt, $nt]);
}

// css_smooth 的曲線可能存在同一 nt_haplotype 的另一個 hap_id 底下，找出有資料的那個
// css_smooth may store the curve under a sibling hap_id of the same nt_haplotype; find the one with data
function chooseSmoothHapId(PDO $pdo, array $hap, int $countryId): int {
    $hapId = (int)$hap['hap_id'];
    if (q($pdo, 'SELECT 1 FROM css_smooth WHERE hap_id = ? AND country_id = ? LIMIT 1', [$hapId, $countryId])) {
        return $hapId;
    }

    $nt = (string)$hap['nt_haplotype'];
    $rows = q($pdo, '
        SELECT s.hap_id, COUNT(*) AS n
        FROM css_smooth s
        JOIN css_haplotype h ON h.hap_id = s.hap_id
        WHERE s.country_id = ? AND ' . NT_FILTER . '
        GROUP BY s.hap_id
        ORDER BY n DESC, s.hap_id ASC
        LIMIT 1
    ', [$countryId, $nt, $nt]);

    return $rows ? (int)$rows[0]['hap_id'] : $hapId;
}

// 把 scope（或舊的 country= 參數）轉成 [country_id, country]
// Turn a scope (or the older country= parameter) into [country_id, country]
function resolveCountryId(PDO $pdo, ?string $resolvedScope, string $countryInput, string $nt): array {
    if ($resolvedScope !== null) {
        // 優先取在該範圍內真的有此 CSS 的國家 / Prefer the country that carries this CSS in that scope
        $rows = q($pdo, '
            SELECT r.country_id, c.country, COUNT(*) AS n
            FROM css_rank r
            JOIN css_country c ON c.country_id = r.country_id
            JOIN css_haplotype h ON h.hap_id = r.hap_id
            WHERE r.scope = ? AND ' . NT_FILTER . '
            GROUP BY r.country_id, c.country
            ORDER BY n DESC
            LIMIT 1
        ', [$resolvedScope, $nt, $nt]);

        // 此 CSS 不在該範圍：仍用 scope 對應國家 / CSS absent from the scope: the scope still names the country
        if (!$rows) {
            $rows = q($pdo, '
                SELECT r.country_id, c.country, COUNT(*) AS n
                FROM css_rank r
                JOIN css_country c ON c.country_id = r.country_id
                WHERE r.scope = ?
                GROUP BY r.country_id, c.country
                ORDER BY n DESC
                LIMIT 1
            ', [$resolvedScope]);
        }
        if (!$rows) fail("No country_id for scope / scope 無法對應 country_id: {$resolvedScope}");
        return [(int)$rows[0]['country_id'], (string)$rows[0]['country']];
    }

    $candidates = array_values(array_unique([
        $countryInput,
        str_replace('_', ' ', $countryInput),
        str_replace(' ', '_', $countryInput),
    ]));
    $holders = implode(',', array_fill(0, count($candidates), '?'));
    $rows = q($pdo, "SELECT country_id, country FROM css_country WHERE country IN ({$holders}) LIMIT 1", $candidates);
    if (!$rows) fail("country not found / 找不到 country: {$countryInput}");
    return [(int)$rows[0]['country_id'], (string)$rows[0]['country']];
}


/* =====================================================================
   3. 各 mode / Modes
   ===================================================================== */
try {
    $mode = trim((string)($_GET['mode'] ?? 'global_ranks'));
    $topN = parseTopN();

    if ($mode === 'meta') {
        // 國家搜尋只列國家（Global 有自己的分頁）。sample 取 country_sample.css_max_Sample，
        // country_sample 還沒更新時改用 MAX(n_strains)。
        // Country search lists countries only (Global has its own tab). sample is
        // country_sample.css_max_Sample, or MAX(n_strains) if country_sample is not updated yet.
        $scopeRows = q($pdo, "
            SELECT r.scope,
                   COALESCE(cs.css_max_Sample, MAX(r.n_strains)) AS sample
            FROM css_rank r
            LEFT JOIN country_sample cs
              ON cs.Country COLLATE utf8mb4_0900_ai_ci
               = REPLACE(r.scope, '_', ' ') COLLATE utf8mb4_0900_ai_ci
            WHERE r.scope <> ?
            GROUP BY r.scope, cs.css_max_Sample
            ORDER BY r.scope
        ", [GLOBAL_SCOPE]);

        send_json([
            'ok' => true,
            'global_scope' => GLOBAL_SCOPE,
            'scopes' => array_column($scopeRows, 'scope'),
            'scope_options' => array_map(
                static fn($r) => [
                    'scope'  => $r['scope'],
                    'label'  => str_replace('_', ' ', $r['scope']),
                    'sample' => (int)$r['sample'],
                ],
                $scopeRows
            ),
        ]);
    }

    if ($mode === 'global_ranks') {
        if (resolveScopeName($pdo, GLOBAL_SCOPE) === null) {
            fail('Global scope not found / 找不到 Global scope');
        }
        $rankCol = requestedRankColumn();
        send_json([
            'ok' => true,
            'scope' => GLOBAL_SCOPE,
            'scope_label' => GLOBAL_SCOPE,
            'rank' => $rankCol,
            'topN' => $topN,
            'total_css' => scopeTotalCss($pdo, GLOBAL_SCOPE),
            'data' => [$rankCol => scopeRankRows($pdo, GLOBAL_SCOPE, $rankCol, $topN)],
        ]);
    }

    if ($mode === 'scope_ranks') {
        $scopeInput = trim((string)($_GET['scope'] ?? GLOBAL_SCOPE));
        $scope = resolveScopeName($pdo, $scopeInput);
        if ($scope === null) fail("scope not found / 找不到 scope: {$scopeInput}");

        $rankCol = requestedRankColumn();
        send_json([
            'ok' => true,
            'scope' => $scope,
            'scope_label' => str_replace('_', ' ', $scope),
            'rank' => $rankCol,
            'topN' => $topN,
            'total_css' => scopeTotalCss($pdo, $scope),
            'data' => scopeRankRows($pdo, $scope, $rankCol, $topN),
        ]);
    }

    // 以下都是描述單一 CSS / Everything below describes one CSS
    $hap = selectedHaplotype($pdo);
    $hapId = (int)$hap['hap_id'];
    $nt = (string)$hap['nt_haplotype'];

    if ($mode === 'snv') {
        send_json([
            'ok' => true,
            'hap_id' => $hapId,
            'uid' => $hap['uid'],
            'pango' => $hap['pango'],
            'scope' => GLOBAL_SCOPE,
            'scope_label' => GLOBAL_SCOPE,
            'haplotype' => $hap,
            'rank' => rankForNt($pdo, GLOBAL_SCOPE, $nt),
            'total_css' => scopeTotalCss($pdo, GLOBAL_SCOPE),
            'data' => snvsForNt($pdo, $nt),
        ]);
    }

    if ($mode === 'country_ranks') {
        $rankCols = rankValueColumns();
        $rows = q($pdo, "
            SELECT
                r.scope AS country_scope,
                REPLACE(r.scope, '_', ' ') AS country,
                MAX(r.n_strains) AS n_strains,
                MIN(r.first_appear_date) AS first_appear_date,
                MIN(r.group_name) AS group_name,
                {$rankCols}
            FROM css_rank r
            JOIN css_haplotype h ON h.hap_id = r.hap_id
            WHERE r.scope <> ? AND " . NT_FILTER . "
            GROUP BY r.scope
            ORDER BY country ASC
        ", [GLOBAL_SCOPE, $nt, $nt]);

        send_json([
            'ok' => true,
            'hap_id' => $hapId,
            'uid' => $hap['uid'],
            'pango' => $hap['pango'],
            'haplotype' => $hap,
            'n_countries' => count($rows),
            'data' => $rows,
        ]);
    }

    if ($mode === 'smooth') {
        $scopeInput = trim((string)($_GET['scope'] ?? ''));
        $countryInput = trim((string)($_GET['country'] ?? GLOBAL_COUNTRY));

        $resolvedScope = null;
        if ($scopeInput !== '') {
            $resolvedScope = resolveScopeName($pdo, $scopeInput);
            if ($resolvedScope === null) fail("scope not found / 找不到 scope: {$scopeInput}");
        }
        [$countryId, $country] = resolveCountryId($pdo, $resolvedScope, $countryInput, $nt);

        $smoothHapId = chooseSmoothHapId($pdo, $hap, $countryId);

        $where = 's.hap_id = ? AND s.country_id = ?';
        $params = [$smoothHapId, $countryId];
        $dateFrom = trim((string)($_GET['date_from'] ?? ''));
        $dateTo = trim((string)($_GET['date_to'] ?? ''));
        if ($dateFrom !== '') { $where .= ' AND s.collection_date >= ?'; $params[] = $dateFrom; }
        if ($dateTo !== '')   { $where .= ' AND s.collection_date <= ?'; $params[] = $dateTo; }

        $rows = q($pdo, "
            SELECT s.collection_date, s.cnt, s.total, s.proportion, s.smoothed_proportion
            FROM css_smooth s
            WHERE {$where}
            ORDER BY s.collection_date ASC
        ", $params);

        send_json([
            'ok' => true,
            'hap_id' => $hapId,
            'smooth_hap_id' => $smoothHapId,
            'uid' => $hap['uid'],
            'pango' => $hap['pango'],
            'country' => str_replace('_', ' ', $country),
            'scope' => $resolvedScope,
            'scope_label' => str_replace('_', ' ', (string)($resolvedScope ?? $country)),
            'n_points' => count($rows),
            'haplotype' => $hap,
            'data' => $rows,
        ]);
    }

    fail("unknown mode / 未知的 mode: {$mode}");

} catch (Throwable $e) {
    send_error($e, 'css');
}
