<?php
/* =====================================================================
   healthz.php
   健康檢查：確認 PHP 能連上資料庫。正常時回傳 { ok: true, info: {…} }。
   Health check: confirms PHP can reach the database. Returns { ok: true, info: {…} }.
   位置 / Location：/api/healthz.php
   ===================================================================== */

require_once __DIR__ . '/common.php';

try {
    $info = $pdo->query('SELECT DATABASE() AS db, VERSION() AS version')->fetch(PDO::FETCH_ASSOC);
    send_json(['ok' => true, 'info' => $info]);
} catch (Throwable $e) {
    send_error($e, 'healthz');
}
