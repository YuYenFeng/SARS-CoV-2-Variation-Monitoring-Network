# SARS-CoV-2-Variation-Monitoring-Network

This platform analyzes GISAID whole-genome sequences to track SARS-CoV-2 variants by country or worldwide. Users can follow the spread of variants, mutations across viral genes such as the S gene, and time-lapse trends of specific mutation sites.

The interface is bilingual (English / Traditional Chinese) and has four modules:
 
| Module | Description |
|---|---|
| **Six Strain Types** | Daily proportion of the six major SARS-CoV-2 strain types, with a time-lapse world map |
| **Emerging Genomic Variation** | Daily frequency of variations by gene, filtered by latest allele frequency, with the top 15 variations per day |
| **VOC Tracking** | Daily frequency of variants of concern and their sublineages, top 10 sublineages per day, and cumulative sequence counts |
| **CSS Rankings** | Correlated SNV sets (CSS) ranked by strain count, linkage, S-gene mutations, persistence, growth and deletions, with smoothed prevalence curves |

## References

The analyses used in this monitoring network are described in:

1. Yang H-C, et al. **Analysis of genomic distributions of SARS-CoV-2 reveals a dominant strain type with strong allelic associations.** *Proceedings of the National Academy of Sciences* 117(48), 30679–30686 (2020). [doi:10.1073/pnas.2007840117](https://doi.org/10.1073/pnas.2007840117)
2. Yang H-C, et al. **Subtyping of major SARS-CoV-2 variants reveals different transmission dynamics based on 10 million genomes.** *PNAS Nexus* 1(4), pgac181 (2022). [doi:10.1093/pnasnexus/pgac181](https://doi.org/10.1093/pnasnexus/pgac181)

Sequence data are from [GISAID](https://gisaid.org/). Only aggregated results are stored in the database; no individual sequences are included in this repository.

## Requirements

### Server

| Software | Version | Notes |
|---|---|---|
| Linux | Ubuntu 24.04.3 LTS | Other distributions should also work |
| Apache HTTP Server | 2.4.58 (prefork MPM) | Modules: `mod_php`, `mod_headers`, `mod_alias` |
| PHP | 8.3.6 | Extensions: `pdo_mysql`, `mysqlnd` |
| MySQL | 8.0.46 | 8.0 or later required; MariaDB is **not** supported (requires `utf8mb4_0900_ai_ci` and window functions) |

Versions listed are those used on the production server.

```bash
sudo apt update
sudo apt install apache2 php libapache2-mod-php php-mysql mysql-server
sudo a2enmod headers
```

### Front-end libraries

Bootstrap is included in this repository. The other libraries are loaded from CDNs, so nothing else needs to be downloaded.

| Library | Version | Purpose |
|---|---|---|
| Bootstrap | 5.3.6 | Layout and UI components |
| Chart.js | 4.1.1 / 4.4.0 | Line, bar, polar-area and radar charts |
| chartjs-adapter-date-fns | 3.0.0 | Time axes |
| chartjs-plugin-datalabels | 2.2.0 | Value labels on bars |
| noUiSlider | 15.8.1 | Allele-frequency range slider |
| jsPDF | 2.5.1 | PDF export of charts |
| html2canvas | 1.4.1 | PNG export of panels |
| SheetJS (xlsx) | 0.18.5 | Excel export of rank tables |

Bootstrap is served locally; the other libraries are loaded from public CDNs (jsDelivr, cdnjs).

## Repository structure
 
```
SARS-CoV-2-Variation-Monitoring-Network/
├── README.md
├── config/
│   └── db.php                     # Database connection (reads environment variables)
├── Data/
│   └── sars_covid.sql             # Database schema (structure only, no data)
└── Web/
    ├── back-end/                  # PHP API, served at /api
    │   ├── common.php             # Shared helpers: query, parameters, JSON output
    │   ├── chartData.php          # Chart data queries for all modules
    │   ├── selectOptions.php      # Country and gene menu options
    │   ├── healthz.php            # Health check
    │   └── server/                # API endpoints
    │       ├── sixtype_series.php
    │       ├── genomic_series.php
    │       ├── genomic_histogram_top15.php
    │       ├── genomic_genes.php
    │       ├── voc_series.php
    │       ├── voc_series2.php
    │       ├── voc_histogram_top10.php
    │       ├── voc_radar.php
    │       ├── css.php
    │       ├── countries_strainType.php
    │       ├── countries_genomic.php
    │       └── countries_voc.php
    └── front-end/                 # Static website (document root)
        ├── index.html             # Home page and news
        ├── tracking.html          # World map, Six Strain Types, Genomic Variation, VOC
        ├── css.html               # CSS Rankings
        ├── about.html             # About
        ├── bootstrap-5.3.6-dist/  # Bootstrap (local copy)
        ├── css/                   # Stylesheets
        ├── js/
        │   ├── i18n.js            # English / Chinese switch
        │   ├── chart-i18n.js      # Chart text translation
        │   ├── index.js           # News list on the home page
        │   ├── tracking.js        # Tracking page layout and navigation
        │   ├── word_country.js    # World map and country charts
        │   ├── six_type.js        # Six Strain Types
        │   ├── genomic_variation.js  # Emerging Genomic Variation
        │   ├── voc.js             # VOC Tracking
        │   ├── css.js             # CSS Rankings
        │   └── nav-active.js      # Highlights the current menu item
        ├── doc/                   # News articles, images and index.json
        └── image/                 # Maps, icons and figures
```
