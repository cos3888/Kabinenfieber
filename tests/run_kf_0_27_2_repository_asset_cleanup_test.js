const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const exists=r=>fs.existsSync(path.join(root,r));
const report={passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
const db=JSON.parse(read('data/db3_vereine/db3_vereine_final.json'));
check('DB3 has 432 clubs and only crestAsset as fixed club image asset',db.clubs.length===432&&db.clubs.every(c=>c.crestAsset&&!('homeKitAsset' in c)&&!('awayKitAsset' in c)),{clubs:db.clubs.length});
const ctx={window:{},console};vm.createContext(ctx);vm.runInContext(read('src/static-data.js'),ctx);const sd=ctx.window.KFStaticData;
check('StaticData mirrors kit-asset cleanup',sd.clubs.length===432&&sd.clubs.every(c=>c.crestAsset&&!('homeKitAsset' in c)&&!('awayKitAsset' in c)),{clubs:sd.clubs.length});
const app=read('src/app.bundle.js');
check('Runtime is KF_0.29.3 while cleanup schema remains 0.27.2',app.includes("var KF_VERSION = '0.29.3';")&&app.includes("world.meta.schemaVersion='kf-core-0.27.2'")&&app.includes("record.schemaVersion='kf-world-record-0.27.2'"),{});
check('Finance architecture metadata points to external ledger',app.includes("processedFinancialEvents: 'CurrentSeasonFinanceRepository[worldId][season][clubId][eventId].eventKey (current season only)'"),{});
check('Current kit renderer uses shared designer assets',app.includes("var DESIGNER_BASE_COLORS = ['white','black','navy'")&&app.includes("'./assets/kits/masks_2/'")&&app.includes("'./assets/kits/masks_3/'"),{});
const legacyClubFiles=[];for(const ent of fs.readdirSync(path.join(root,'assets','clubs'),{withFileTypes:true})){if(!ent.isDirectory())continue;for(const n of ['home.png','away.png','README.md'])if(exists(path.join('assets','clubs',ent.name,n)))legacyClubFiles.push(path.join(ent.name,n));}
check('Legacy per-club kit placeholders/readmes are gone',legacyClubFiles.length===0,{legacyClubFiles:legacyClubFiles.slice(0,10)});
const removed=['assets/ui/kits','assets/ui/icons','assets/ui/tiles','assets/common/sponsor_placeholder.png','assets/kits/bases/base_lime.png','assets/tiles/tile_lineup_bg.png','assets/tiles/tile_squad_bg.png','assets/tiles/tile_statistics_bg.png','data/db3_vereine/db3_vereine_final.js','data/source_archives','tests/_tmp_profile_nosave.js'];
check('Confirmed obsolete repository artifacts are gone',removed.every(x=>!exists(x)),{stillPresent:removed.filter(exists)});
const requiredBases=['white','black','navy','royal_blue','sky_blue','red','dark_red','green','dark_green','yellow','orange','purple','pink','brown','gray','dark_gray','teal','turquoise','cream','gold'];
const requiredMasks=['style_001','style_002','style_003','style_004','style_005'].map(x=>'assets/kits/masks_2/'+x+'.png').concat(['accent_001','accent_002','accent_003'].map(x=>'assets/kits/masks_3/'+x+'.png'));
check('All dynamic kit designer assets remain',requiredBases.every(x=>exists('assets/kits/bases/'+x+'.png'))&&requiredMasks.every(exists),{});
check('Generated report JSONs are ignored',read('.gitignore').includes('reports/*.json'),{});
const out=path.join(root,'reports','kf_0.27.2_repository_asset_cleanup_test.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:out},null,2));process.exit(report.passed?0:1);
