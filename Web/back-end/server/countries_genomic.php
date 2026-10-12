<?php
// countries_genomic.php — 基因體變異 面板的國家選單 / Country menu of the Genomic panel
// 回傳 / Returns  ["Global (1,234)", "Taiwan (567)", …]（依國名排序 / sorted by name）
require_once dirname(__DIR__) . '/selectOptions.php';

try {
    send_json(getGenomicCountryOptions($pdo));
} catch (Throwable $e) {
    send_error($e, 'countries_genomic');
}
