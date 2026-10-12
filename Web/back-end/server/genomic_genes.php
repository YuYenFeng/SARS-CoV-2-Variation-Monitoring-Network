<?php
// genomic_genes.php — 基因體變異面板的基因選單 / Gene menu of the Genomic panel
// GET  country   國家，預設 Global / country, default Global
// 回傳 / Returns  ["All", "E", "M", "N", "S", …]
require_once dirname(__DIR__) . '/selectOptions.php';

try {
    send_json(getGenomicGeneOptions($pdo, param_str('country', 'Global')));
} catch (Throwable $e) {
    send_error($e, 'genomic_genes');
}
