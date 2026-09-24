const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
function exists(rel){ return fs.existsSync(path.join(root, rel)); }
function read(rel){ return fs.readFileSync(path.join(root, rel), 'utf8'); }
const pkg = JSON.parse(read('package.json'));
const currentVersion = String(pkg.version || '');
const escapedVersion = currentVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const report = { passed:true, checks:[] };
function check(name, ok, details){ report.checks.push({ name, ok:!!ok, details }); if(!ok) report.passed=false; }
const js = read('src/app.bundle.js');
const html = read('index.html');
check('Produktionsbundle meldet package-Version', new RegExp("var KF_VERSION = '" + escapedVersion + "'").test(js), { version:currentVersion });
check('HTML-Titel ist auf package-Version aktualisiert', html.indexOf('KF_' + currentVersion) !== -1 || html.indexOf(currentVersion) !== -1, { version:currentVersion });
check('Architekturvertrag ist im Bundle vorhanden', /var KF_ARCHITECTURE = Object\.freeze/.test(js) && /sourceOfTruth/.test(js), {});
check('Matchhistorie-Zugriff nutzt playedMatchId zuerst', /function matchById\(world, matchId\)/.test(js) && /var direct = fixture\.playedMatchId \? \(idx\.matchById/.test(js), {});
check('Nicht geladene 0.5.0-Modulskelette sind nicht mehr im Produktions-src', !exists('src/app/app.js') && !exists('src/logic/world/createEmptyWorld.js') && !exists('src/views/startView.js'), {});
check('Alte Backup-Bundles sind nicht mehr im Produktions-src', !exists('src/app.bundle.js.bak') && !exists('src/app.bundle.js.pre0153') && !exists('src/styles/app.css.pre0153'), {});
const out = path.join(root, 'reports', 'current_architecture_guard_test.json');
fs.mkdirSync(path.dirname(out), { recursive:true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, metrics: report.metrics || {}, reportFile: (typeof outPath !== 'undefined' ? outPath : out) }, null, 2));
process.exit(report.passed ? 0 : 1);
