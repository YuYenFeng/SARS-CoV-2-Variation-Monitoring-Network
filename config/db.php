<?php
/* =====================================================================
   db.php
   資料庫連線：建立 $pdo 給所有 API 使用（由 api/common.php 載入）。
   Database connection: creates $pdo for every API (loaded by api/common.php).

   位置 / Location：網站根目錄外的 config/db.php，瀏覽器無法直接開啟。
   Outside the web root (config/db.php), so browsers cannot open it.

   連線設定讀環境變數（在 Apache 的 SetEnv 或 php-fpm 的 env[] 設定），
   帳號密碼不寫在程式裡；沒設定時用括號內的預設值。
   Settings come from environment variables (Apache SetEnv or php-fpm env[]),
   so no username or password is stored in the code; the defaults apply when
   a variable is not set.
     DB_HOST     (127.0.0.1)   DB_PORT    (3306)
     DB_NAME     (sars_cov_2026)
     DB_USER     DB_PASS
     DB_CHARSET  (utf8mb4)
   ===================================================================== */
declare(strict_types=1);

$host    = getenv('DB_HOST') ?: '127.0.0.1';
$port    = getenv('DB_PORT') ?: '3306';
$db      = getenv('DB_NAME') ?: 'sars_cov_2026';
$user    = getenv('DB_USER') ?: '';
$pass    = getenv('DB_PASS') ?: '';
$charset = getenv('DB_CHARSET') ?: 'utf8mb4';

// 寫 localhost 時 PDO 會改用 Unix socket，這裡固定走 TCP
// With "localhost" PDO switches to a Unix socket; force TCP instead
if ($host === 'localhost') {
    $host = '127.0.0.1';
}

$dsn = "mysql:host={$host};port={$port};dbname={$db};charset={$charset}";

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,   // 錯誤時丟出例外 / throw on errors
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,         // 每列是關聯陣列 / rows as associative arrays
    PDO::ATTR_EMULATE_PREPARES   => false,                    // 用 MySQL 真正的 prepared statement / real prepared statements
    PDO::ATTR_STRINGIFY_FETCHES  => false,                    // 數字維持數字型別 / keep numbers as numbers
    PDO::ATTR_TIMEOUT            => 5,                        // 連線逾時（秒） / connection timeout (seconds)
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (PDOException $e) {
    // 詳細原因只寫進伺服器 log（不含密碼），前端只收到一般訊息
    // Details go to the server log only (no password); the browser gets a general message
    error_log('[db] DSN=' . $dsn);
    error_log('[db] connection failed: ' . $e->getMessage());

    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    die(json_encode(['ok' => false, 'error' => 'Database connection failed'], JSON_UNESCAPED_UNICODE));
}