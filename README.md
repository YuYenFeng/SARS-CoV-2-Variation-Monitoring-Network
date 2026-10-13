# SARS-CoV-2-Variation-Monitoring-Network

This platform analyzes whole-genome sequences from GISAID to track SARS-CoV-2 variants by country or worldwide. It presents daily proportions of six major strain types, emerging genomic variations, variants of concern (VOCs) and their sublineages, and rankings of correlated SNV sets (CSSs), along with articles on notable variants.

**Website:** <https://covid19.shlab.duckdns.org/>

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
 
## System architecture
 
The system is a three-tier web application. Static files and PHP endpoints are served by the same Apache instance; the PHP directory is mapped to `/api` with an `Alias`, so the front end and the API share one origin.
 
| Tier | Implementation |
|---|---|
| Presentation | Static HTML5 pages with vanilla JavaScript (ES2020), Bootstrap and Chart.js |
| Application | PHP REST-style endpoints returning JSON (read-only, `GET`) |
| Data | MySQL relational database |
 
```
Browser ──HTTP──▶ Apache 2.4 (mod_php)
                   ├── /         → static front end (HTML, CSS, JS, SVG)
                   └── /api/...  → PHP endpoints ──PDO──▶ MySQL 8.0
```
 
## Requirements
 
### Server
 
| Software | Version | Notes |
|---|---|---|
| Linux | Ubuntu 24.04.3 LTS | Runs in a Docker container; other distributions should also work |
| Apache HTTP Server | 2.4.58 (prefork MPM) | Modules: `mod_php`, `mod_headers`, `mod_alias` |
| PHP | 8.3.6 | Extensions: `pdo_mysql`, `mysqlnd` |
| MySQL | 8.0.46 | 8.0 or later required; MariaDB is **not** supported (requires `utf8mb4_0900_ai_ci` and window functions) |
 
Versions listed are those used on the production server.
 
### Front-end libraries
 
Bootstrap is included in this repository. The other libraries are loaded from CDNs, so nothing else needs to be downloaded.
 
| Library | Version | Source | Purpose |
|---|---|---|---|
| Bootstrap | 5.3.6 | Included (`Web/front-end/bootstrap-5.3.6-dist/`) | Layout and UI components |
| Chart.js | 4.1.1 (`tracking.html`), 4.4.0 (`css.html`) | jsDelivr | Line, bar, polar-area and radar charts |
| chartjs-adapter-date-fns | 3.0.0 | jsDelivr | Time axes |
| chartjs-plugin-datalabels | 2.2.0 | jsDelivr | Value labels on bars |
| noUiSlider | 15.8.1 | jsDelivr | Allele-frequency range slider |
| jsPDF | 2.5.1 | cdnjs | PDF export of charts |
| html2canvas | 1.4.1 | cdnjs | PNG export of panels |
| SheetJS (xlsx) | 0.18.5 | cdnjs | Excel export of rank tables |
 
## Installation
 
**1. Install the server software**
 
```bash
sudo apt update
sudo apt install apache2 php libapache2-mod-php php-mysql mysql-server
sudo a2enmod headers
```
 
**2. Create the database** from the schema (structure only):
 
```bash
mysql -u root -p -e "CREATE DATABASE sars_cov_2026 CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
mysql -u root -p sars_cov_2026 < Data/sars_covid.sql
```
 
**3. Create a read-only account** for the web application:
 
```sql
CREATE USER 'web_reader'@'127.0.0.1' IDENTIFIED BY '<password>';
GRANT SELECT ON sars_cov_2026.* TO 'web_reader'@'127.0.0.1';
```
 
## Configuration
 
### MySQL
 
`/etc/mysql/mysql.conf.d/mysqld.cnf`
 
```ini
bind-address = 127.0.0.1    # local TCP connections only
```
 
### Apache virtual host
 
Serve `Web/front-end` as the document root and map `Web/back-end` to `/api`. Keep `config/` outside the web root.
 
```apache
<VirtualHost *:80>
    DocumentRoot /path/to/Web/front-end
    <Directory /path/to/Web/front-end>
        Options -Indexes +FollowSymLinks
        Require all granted
    </Directory>
 
    Alias /api /path/to/Web/back-end
    <Directory /path/to/Web/back-end>
        Options -Indexes
        Require all granted
    </Directory>
 
    <FilesMatch "\.(js|css|json)$">
        Header set Cache-Control "no-cache"
    </FilesMatch>
</VirtualHost>
```
 
### Database credentials
 
Credentials are supplied as environment variables in a root-only Apache configuration file, so no password is stored in the source code.
 
```apache
SetEnv DB_HOST 127.0.0.1
SetEnv DB_PORT 3306
SetEnv DB_NAME sars_cov_2026
SetEnv DB_USER web_reader
SetEnv DB_PASS <password>
```
 
The connection file (`config/db.php`) reads these variables. PDO is configured with exceptions on error, native (non-emulated) prepared statements and a 5-second connection timeout.
 
### PHP
 
`/etc/php/8.3/apache2/php.ini`
 
```ini
display_errors     = Off
log_errors         = On
max_execution_time = 120
```
 
Endpoints that return large time series raise `memory_limit` to 512 MB at run time.
 
### Start and check
 
```bash
sudo service mysql start
sudo service apache2 restart
curl http://localhost/api/healthz.php      # {"ok":true,...}
```
 
## Database
 
The schema is in `Data/sars_covid.sql`.
 
| Module | Tables |
|---|---|
| Shared | `country_sample` |
| Six Strain Types | `straintype` |
| Emerging Genomic Variation | `data_nt_info`, `genomic`, `daily_sample` |
| VOC Tracking | `voc_data`, `voc_data_sub`, `voc_data_info` |
| CSS Rankings | `css_rank`, `css_haplotype`, `css_snv`, `css_smooth`, `css_country` |
 
Queries use common table expressions and window functions (`ROW_NUMBER()`, `MAX() OVER`) for daily top-N rankings and per-date sample sizes, which requires MySQL 8.0 or later.
 
## API
 
All endpoints accept `GET` parameters and return JSON. Proportions are returned as percentages (0–100, two decimal places).
 
| Endpoint | Parameters | Returns |
|---|---|---|
| `/api/server/sixtype_series.php` | `country` | Daily proportion of six strain types and daily sample size |
| `/api/server/genomic_series.php` | `country`, `gene`, `afMin`, `afMax` | Daily frequency of variations within a latest allele-frequency range |
| `/api/server/genomic_histogram_top15.php` | `country`, `gene`, `afMin`, `afMax` | Fifteen most frequent variations per day |
| `/api/server/voc_series.php` | `country` | Daily VOC frequencies and sample size |
| `/api/server/voc_series2.php` | `country`, `variants`, `afMin`, `afMax` | Daily sublineage frequencies of selected VOCs |
| `/api/server/voc_histogram_top10.php` | `country`, `variants`, `minSample` | Ten most prevalent sublineages per day |
| `/api/server/voc_radar.php` | `country` | Cumulative sequence counts per VOC and sublineage |
| `/api/server/css.php` | `mode` (`meta`, `global_ranks`, `scope_ranks`, `snv`, `country_ranks`, `smooth`) | CSS rankings, SNVs and smoothed prevalence curves |
| `/api/server/countries_*.php`, `genomic_genes.php` | `country` | Options for country and gene menus |
| `/api/healthz.php` | — | Health check |
 
User input reaches SQL only through bound parameters; identifiers such as rank columns are restricted to fixed whitelists. Database errors are written to the server log and are not exposed to clients.
 
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
