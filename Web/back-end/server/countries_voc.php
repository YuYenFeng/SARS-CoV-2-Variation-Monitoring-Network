<?php
// countries_voc.php — VOC 面板的國家選單 / Country menu of the VOC panel
// 回傳 / Returns  ["Global (1,234)", "Taiwan (567)", …]（依國名排序 / sorted by name）
require_once dirname(__DIR__) . '/selectOptions.php';

try {
    send_json(getVOCCountryOptions($pdo));
} catch (Throwable $e) {
    send_error($e, 'countries_voc');
}
