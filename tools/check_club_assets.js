#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const CLUB_DB = path.join(ROOT, 'data', 'db3_vereine', 'db3_vereine_final.json');
const db = JSON.parse(fs.readFileSync(CLUB_DB, 'utf8'));
const clubs = Array.isArray(db.clubs) ? db.clubs : [];

function exists(rel) {
  return Boolean(rel) && fs.existsSync(path.join(ROOT, rel));
}

const missingCrests = [];
const missingHome = [];
const missingAway = [];
for (const club of clubs) {
  const base = { clubId: club.clubId, clubName: club.clubName, leagueKey: club.leagueKey };
  if (!exists(club.crestAsset)) missingCrests.push({ ...base, asset: club.crestAsset });
  if (!exists(club.homeKitAsset)) missingHome.push({ ...base, asset: club.homeKitAsset });
  if (!exists(club.awayKitAsset)) missingAway.push({ ...base, asset: club.awayKitAsset });
}

const summary = {
  totalClubs: clubs.length,
  crests: { present: clubs.length - missingCrests.length, missing: missingCrests.length },
  homeKits: { present: clubs.length - missingHome.length, missing: missingHome.length },
  awayKits: { present: clubs.length - missingAway.length, missing: missingAway.length },
  missingCrests,
  missingHomeKits: missingHome,
  missingAwayKits: missingAway
};
console.log(JSON.stringify(summary, null, 2));

if (process.argv.includes('--strict') && (missingCrests.length || missingHome.length || missingAway.length)) process.exit(1);
