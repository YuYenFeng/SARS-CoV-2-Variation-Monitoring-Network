<?php
/* =====================================================================
   selectOptions.php
   Tracking 頁各面板下拉選單的資料。
   Data for the drop-down menus of the Tracking page panels.

   函式 / Functions                 API（server/）             選單 / Menu
     getStrainTypeCountryOptions    countries_strainType.php   六型病毒株：國家 / Six Strain Types: country
     getGenomicCountryOptions       countries_genomic.php      基因體變異：國家 / Genomic: country
     getGenomicGeneOptions          genomic_genes.php          基因體變異：基因 / Genomic: gene
     getVOCCountryOptions           countries_voc.php          VOC：國家 / VOC: country

   國家選單回傳 "國名 (樣本數)"，例如 "Taiwan (1,234)"；樣本數取自 country_sample。
   Country menus return "Country (samples)", e.g. "Taiwan (1,234)", with the
   sample count from country_sample.
   ===================================================================== */

require_once __DIR__ . '/common.php';

// country_sample 中各面板的樣本數欄位（白名單，只有這些欄位會放進 SQL）
// Sample-count column per panel in country_sample (whitelist: only these reach the SQL)
const COUNTRY_SAMPLE_COLUMNS = [
    'strainType' => 'strainType_total_Sample',
    'genomic'    => 'genomic_total_Sample',
    'voc'        => 'voc_total_Sample',
];

// 有資料（樣本數 > 0）的國家，依國名排序，格式 "Taiwan (1,234)"
// Countries with data (samples > 0), sorted by name, as "Taiwan (1,234)"
function countryOptions(PDO $pdo, string $panel): array {
    $col = COUNTRY_SAMPLE_COLUMNS[$panel];
    $rows = run_query($pdo, "
      SELECT Country, {$col} AS n
      FROM sars_cov_2026.country_sample
      WHERE {$col} > 0
      ORDER BY Country ASC
    ");
    return array_map(
        static fn($r) => $r['Country'] . ' (' . number_format((int)$r['n']) . ')',
        $rows
    );
}

function getStrainTypeCountryOptions(PDO $pdo): array { return countryOptions($pdo, 'strainType'); }
function getGenomicCountryOptions(PDO $pdo): array    { return countryOptions($pdo, 'genomic'); }
function getVOCCountryOptions(PDO $pdo): array        { return countryOptions($pdo, 'voc'); }

// 某國有資料的基因，'All' 放第一個：['All', 'E', 'M', 'N', 'S', …]
// （前端會再依基因體順序排列並加上全名）
// Genes with data in a country, 'All' first: ['All', 'E', 'M', 'N', 'S', …]
// (the front end re-orders them along the genome and adds full names)
function getGenomicGeneOptions(PDO $pdo, string $country = 'Global'): array {
    $rows = run_query($pdo, "
      SELECT DISTINCT TRIM(Gene) AS Gene
      FROM sars_cov_2026.data_nt_info
      WHERE Country = ? AND Gene IS NOT NULL AND TRIM(Gene) <> ''
      ORDER BY Gene
    ", [$country]);
    return array_merge(['All'], array_column($rows, 'Gene'));
}
