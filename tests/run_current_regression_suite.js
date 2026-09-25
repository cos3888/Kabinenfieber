const cp=require('child_process'),path=require('path');
const root=path.resolve(__dirname,'..');
const full=process.argv.includes('--full');
const core=[
  'tests/run_current_source_integrity_test.js',
  'tests/run_architecture_guard_test.js',
  'tests/run_current_multiworld_readiness_test.js',
  'tests/run_current_server_foundation_test.js',
  'tests/run_current_data_truth_invariants_test.js',
  'tests/run_current_market_value_history_test.js',
  'tests/run_fixture_id_integrity_test.js',
  'tests/run_national_cup_test.js',
  'tests/run_current_season_transition_invariants_test.js',
  'tests/run_current_suspension_model_test.js',
  'tests/run_current_finance_balance_licence_test.js',
  'tests/run_current_negotiation_regression_test.js',
  'tests/run_kf_0_25_1_fix_regression_test.js',
  'tests/run_kf_0_25_2_fix_regression_test.js',
  'tests/run_kf_0_25_3_fix_regression_test.js',
  'tests/run_kf_0_25_4_fix_regression_test.js',
  'tests/run_kf_0_25_5_fix_regression_test.js',
  'tests/run_kf_0_25_6_fix_regression_test.js',
  'tests/run_kf_0_26_0_history_compaction_test.js',
  'tests/run_kf_0_26_0_real_match_storage_sample_test.js',
  'tests/run_kf_0_26_1_bonus_event_cleanup_test.js',
  'tests/run_kf_0_26_2_player_lifecycle_strength_test.js',
  'tests/run_kf_0_27_0_current_season_match_store_test.js',
  'tests/run_kf_0_27_1_current_season_finance_store_test.js',
  'tests/run_kf_0_27_2_repository_asset_cleanup_test.js',
  'tests/run_kf_0_27_3_club_crest_integration_test.js',
  'tests/run_kf_0_28_0_backend_persistence_foundation_test.js',
  'tests/run_kf_0_28_1_cloud_persistence_verification_test.js',
  'tests/run_kf_0_29_0_user_world_runtime_test.js',
  'tests/run_kf_0_29_0_http_api_test.js',
  'tests/run_kf_0_29_1_autosave_world_metadata_test.js'
];
const extended=[
  'tests/run_current_ui_ownership_pipeline_test.js',
  'tests/run_current_data_mail_integrity_test.js',
  'tests/run_report_consistency_test.js',
  'tests/run_match_feel_test.js',
  'tests/run_current_multiseason_stability_test.js'
];
const list=full?core.concat(extended):core;
const result={passed:true,mode:full?'full':'core',tests:[]};
for(const rel of list){
  const started=Date.now();
  const run=cp.spawnSync(process.execPath,[path.join(root,rel)],{cwd:root,encoding:'utf8',timeout:210000,maxBuffer:10*1024*1024});
  const ok=run.status===0&&!run.error;
  result.tests.push({test:rel,ok,durationMs:Date.now()-started,status:run.status,error:run.error?String(run.error):null});
  console.log(`[${ok?'PASS':'FAIL'}] ${rel} (${Date.now()-started} ms)`);
  if(!ok){
    result.passed=false;
    if(run.stdout)console.log(run.stdout.slice(-5000));
    if(run.stderr)console.error(run.stderr.slice(-5000));
    break;
  }
}
console.log(JSON.stringify(result,null,2));
process.exit(result.passed?0:1);
