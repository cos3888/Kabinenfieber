const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const db=JSON.parse(read('data/db3_vereine/db3_vereine_final.json'));
const expectedMissing=['tur3_fc_kapidag','tur3_sc_marmara_adasi','tur3_fc_artvin_yayla','tur3_sc_rize_cay','tur3_fc_harran_ovasi','tur3_sc_mardin_tas','tur3_fc_tunceli_munzur','tur3_sc_erzincan_yayla'].sort();
const missing=[],badDimensions=[],notPng=[],sizes=[];
function pngDimensions(file){
  const b=fs.readFileSync(file);
  if(b.length<24||b.toString('hex',0,8)!=='89504e470d0a1a0a')return null;
  return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
}
for(const club of db.clubs){
  const file=path.join(root,club.crestAsset);
  if(!fs.existsSync(file)){missing.push(club.clubId);continue;}
  const d=pngDimensions(file);
  if(!d){notPng.push(club.clubId);continue;}
  if(d.width>512||d.height>512)badDimensions.push({clubId:club.clubId,...d});
  sizes.push(fs.statSync(file).size);
}
const totalBytes=sizes.reduce((a,b)=>a+b,0);
const app=read('src/app.bundle.js');
const passed=db.clubs.length===432&&sizes.length===424&&JSON.stringify(missing.sort())===JSON.stringify(expectedMissing)&&badDimensions.length===0&&notPng.length===0&&app.includes("var KF_VERSION = '0.29.3';");
const report={passed,totalClubs:db.clubs.length,present:sizes.length,missing:missing.sort(),badDimensions,notPng,totalBytes,totalMiB:Number((totalBytes/1024/1024).toFixed(2)),maxBytes:sizes.length?Math.max(...sizes):0};
console.log(JSON.stringify(report,null,2));
process.exit(passed?0:1);
