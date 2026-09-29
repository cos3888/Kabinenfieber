'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('src/app.bundle.js');
const server=read('server/index.js');
const index=read('index.html');
const pkg=JSON.parse(read('package.json'));
const currentVersion=String(pkg.version||'');
const report={version:'0.29.3',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
function block(a,b){const x=app.indexOf(a),y=app.indexOf(b,x+a.length);return x>=0&&y>x?app.slice(x,y):'';}

check('Game build and remote contract are independent',
  !!currentVersion&&
  app.includes("var KF_VERSION = '"+currentVersion+"';")&&
  app.includes("var KF029_REMOTE_CONTRACT_VERSION = '0.30.0';")&&
  currentVersion!=='0.30.0'&&
  app.includes('clientVersion:KF029_REMOTE_CONTRACT_VERSION')&&
  !app.includes('clientVersion:KF_VERSION'),
  {currentVersion,remoteContract:'0.30.0'});

const restore=block('async function kf029RestoreRemoteSession()','async function kf029Login');
const login=block('async function kf029Login','function kf029CurrentMatches');
const load=block('async function kf029LoadWorld','async function kf029CreateRemoteWorld');
check('Healthcheck no longer gates restore, login or world loading',
  !restore.includes('kf029EnsureBackendCompatible')&&
  !login.includes('kf029EnsureBackendCompatible')&&
  !load.includes('kf029EnsureBackendCompatible'));

const probe=block('async function kf029EnsureBackendCompatible()','async function kf029RefreshWorldList');
check('Healthcheck is diagnostic and compares only remote contract when advertised',
  probe.includes('backendContractVersion')&&
  !probe.includes('backendVersion!==String(KF_VERSION)'));

check('Server separates service build from API contract',
  !!currentVersion&&
  server.includes("const SERVICE_VERSION = '"+currentVersion+"';")&&
  server.includes("const API_VERSION = '0.30.0';")&&
  currentVersion!=='0.30.0'&&
  server.includes('version: SERVICE_VERSION, apiVersion: API_VERSION'),
  {currentVersion,apiVersion:'0.30.0'});

check('Production cache busting is current',
  !!currentVersion&&
  index.includes('KF_'+currentVersion)&&
  index.includes('app.bundle.js?v='+currentVersion)&&
  index.includes('app.css?v='+currentVersion),
  {currentVersion});

console.log(JSON.stringify(report,null,2));
process.exit(report.passed?0:1);
