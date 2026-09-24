#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const db=JSON.parse(fs.readFileSync(path.join(ROOT,'data','db3_vereine','db3_vereine_final.json'),'utf8'));
const clubs=Array.isArray(db.clubs)?db.clubs:[];
function exists(rel){return Boolean(rel)&&fs.existsSync(path.join(ROOT,rel));}
const missingCrests=[];
for(const club of clubs){if(!exists(club.crestAsset))missingCrests.push({clubId:club.clubId,clubName:club.clubName,leagueKey:club.leagueKey,asset:club.crestAsset});}
const baseColors=['white','black','navy','royal_blue','sky_blue','red','dark_red','green','dark_green','yellow','orange','purple','pink','brown','gray','dark_gray','teal','turquoise','cream','gold'];
const styleMasks=['style_001','style_002','style_003','style_004','style_005'];
const accentMasks=['accent_001','accent_002','accent_003'];
const missingDesignerAssets=[];
baseColors.forEach(x=>{const rel='assets/kits/bases/'+x+'.png';if(!exists(rel))missingDesignerAssets.push(rel);});
styleMasks.forEach(x=>{const rel='assets/kits/masks_2/'+x+'.png';if(!exists(rel))missingDesignerAssets.push(rel);});
accentMasks.forEach(x=>{const rel='assets/kits/masks_3/'+x+'.png';if(!exists(rel))missingDesignerAssets.push(rel);});
const summary={totalClubs:clubs.length,crests:{present:clubs.length-missingCrests.length,missing:missingCrests.length},kitDesigner:{baseColors:baseColors.length,styleMasks:styleMasks.length,accentMasks:accentMasks.length,missing:missingDesignerAssets.length},missingCrests,missingDesignerAssets};
console.log(JSON.stringify(summary,null,2));
if(process.argv.includes('--strict')&&(missingCrests.length||missingDesignerAssets.length))process.exit(1);
