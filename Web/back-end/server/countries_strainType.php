<?php
// countries_strainType.php — 六型病毒株 面板的國家選單 / Country menu of the Six Strain Types panel
// 回傳 / Returns  ["Global (1,234)", "Taiwan (567)", …]（依國名排序 / sorted by name）
require_once dirname(__DIR__) . '/selectOptions.php';

try {
    send_json(getStrainTypeCountryOptions($pdo));
} catch (Throwable $e) {
    send_error($e, 'countries_strainType');
}
