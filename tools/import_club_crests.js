#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLUB_DB = path.join(ROOT, 'data', 'db3_vereine', 'db3_vereine_final.json');

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ẞ/g, 'SS')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/æ/g, 'ae')
    .replace(/Æ/g, 'AE')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function walkPngs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPngs(full, out);
    else if (entry.isFile() && /\.png$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function usage() {
  console.log('Usage: node tools/import_club_crests.js <source-folder> [--dry-run] [--require-all]');
  console.log('The source folder may contain country/league subfolders. PNG files are matched to clubName by a Unicode-safe normalized filename.');
}

const args = process.argv.slice(2);
const sourceArg = args.find(arg => !arg.startsWith('--'));
if (!sourceArg) {
  usage();
  process.exit(2);
}

const dryRun = args.includes('--dry-run');
const requireAll = args.includes('--require-all');
const sourceDir = path.resolve(process.cwd(), sourceArg);
if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
  console.error(`Source folder not found: ${sourceDir}`);
  process.exit(2);
}

const db = JSON.parse(fs.readFileSync(CLUB_DB, 'utf8'));
const clubs = Array.isArray(db.clubs) ? db.clubs : [];
const sourceFiles = walkPngs(sourceDir);
const byNormalizedName = new Map();

for (const file of sourceFiles) {
  const stem = path.basename(file, path.extname(file));
  const key = normalizeName(stem);
  const list = byNormalizedName.get(key) || [];
  list.push(file);
  byNormalizedName.set(key, list);
}

const imported = [];
const missing = [];
const ambiguous = [];
const usedFiles = new Set();

for (const club of clubs) {
  const key = normalizeName(club.clubName);
  const candidates = byNormalizedName.get(key) || [];
  if (candidates.length === 0) {
    missing.push({ clubId: club.clubId, clubName: club.clubName, leagueKey: club.leagueKey });
    continue;
  }
  if (candidates.length > 1) {
    ambiguous.push({ clubId: club.clubId, clubName: club.clubName, candidates });
    continue;
  }

  const source = candidates[0];
  const target = path.join(ROOT, club.crestAsset || `assets/clubs/${club.clubId}/crest.png`);
  imported.push({ clubId: club.clubId, clubName: club.clubName, source: path.relative(sourceDir, source), target: path.relative(ROOT, target) });
  usedFiles.add(path.resolve(source));

  if (!dryRun) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

const unmatched = sourceFiles
  .filter(file => !usedFiles.has(path.resolve(file)))
  .map(file => path.relative(sourceDir, file));

const report = {
  generatedAt: new Date().toISOString(),
  sourceDir,
  dryRun,
  totalClubs: clubs.length,
  sourcePngFiles: sourceFiles.length,
  imported: imported.length,
  missing: missing.length,
  ambiguous: ambiguous.length,
  unmatchedSourceFiles: unmatched.length,
  missingClubs: missing,
  ambiguousClubs: ambiguous,
  unmatchedFiles: unmatched
};

console.log(JSON.stringify(report, null, 2));

if (ambiguous.length > 0 || (requireAll && missing.length > 0)) process.exit(1);
