<?php
/* =====================================================================
   common.php
   後端共用：資料庫連線、讀取網址參數、回傳 JSON、錯誤處理。
   Shared backend code: database connection, reading URL parameters,
   sending JSON and handling errors.

   位置 / Location：/api/common.php
   由 chartData.php、selectOptions.php、healthz.php、server/css.php 載入。
   Loaded by chartData.php, selectOptions.php, healthz.php and server/css.php.

   資料庫設定在網站根目錄外的 config/db.php（提供 $pdo）。
   The database settings live outside the web root in config/db.php (provides $pdo).
   ===================================================================== */

require_once dirname(__DIR__, 2) . '/config/db.php';

/* ---------- 查詢 / Queries ---------- */

// 執行一段 SQL，回傳所有列（關聯陣列）
// Run one SQL statement and return all rows as associative arrays
function run_query(PDO $pdo, string $sql, array $params = []): array {
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/* ---------- 網址參數 / URL parameters ---------- */

// 文字參數：沒給或空白時用預設值 / Text parameter; default when missing or blank
function param_str(string $key, string $default = ''): string {
    $v = isset($_GET[$key]) ? trim((string)$_GET[$key]) : '';
    return $v !== '' ? $v : $default;
}

// 數字參數 / Number parameter
function param_float(string $key, float $default): float {
    $v = param_str($key);
    return is_numeric($v) ? (float)$v : $default;
}

function param_int(string $key, int $default): int {
    $v = param_str($key);
    return is_numeric($v) ? (int)$v : $default;
}

// 逗號分隔的清單，例如 variants=Omicron,Delta → ['Omicron', 'Delta']
// Comma-separated list, e.g. variants=Omicron,Delta → ['Omicron', 'Delta']
function param_list(string $key, array $default): array {
    $v = param_str($key);
    if ($v === '') return $default;
    return array_values(array_filter(array_map('trim', explode(',', $v)), 'strlen'));
}

/* ---------- 回傳 / Responses ---------- */

// 送出 JSON 並結束 / Send JSON and stop
function send_json($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    $json = json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES |
        JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE
    );
    echo $json === false ? '{"ok":false,"error":"JSON encode failed"}' : $json;
    exit;
}

// 發生錯誤：詳細原因寫進伺服器的 error log，前端只收到一般訊息（不洩漏資料庫細節）
// On error: the details go to the server's error log; the browser only gets a
// general message (no database details are exposed)
function send_error(Throwable $e, string $where): void {
    error_log("[api] {$where}: " . $e->getMessage());
    send_json(['ok' => false, 'error' => 'DB query failed'], 500);
}
