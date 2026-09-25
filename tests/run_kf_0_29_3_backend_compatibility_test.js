'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('src/app.bundle.js');
const server=read('server/index.js');
const index=read('index.html');
const report={version:'0.29.3',passed:true,checks:[]};
function check(name,ok,details={}){report.checks.push({name,ok:!!ok,details});if(!ok)report.passed=false;}
function block(a,b){const x=app.indexOf(a),y=app.indexOf(b,x+a.length);return x>=0&&y>x?app.slice(x,y):'';}

check('Game build and remote contract are independent',
  app.includes("var KF_VERSION = '0.29.5';")&&
  app.includes("var KF029_REMOTE_CONTRACT_VERSION = '0.29.5';")&&
  app.includes('clientVersion:KF029_REMOTE_CONTRACT_VERSION')&&
  !app.includes('clientVersion:KF_VERSION'));

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
  server.includes("const SERVICE_VERSION = '0.29.5';")&&
  server.includes("const API_VERSION = '0.29.5';")&&
  server.includes('version: SERVICE_VERSION, apiVersion: API_VERSION'));

check('Production cache busting is current',
  index.includes('KF_0.29.5')&&
  index.includes('app.bundle.js?v=0.29.5')&&
  index.includes('app.css?v=0.29.5'));

console.log(JSON.stringify(report,null,2));
process.exit(report.passed?0:1);
