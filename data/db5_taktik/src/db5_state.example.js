// Kabinenfieber – DB5 Taktik v1
// Beispiel für den laufenden Taktikzustand eines Vereins.
// Diese Datei ist keine globale Datenbank, sondern ein Muster für Runtime-State.

export const EXAMPLE_CLUB_TACTIC_STATE = {
  clubId: "club_01",
  activeFormationId: "formation_4_2_3_1",
  formationMode: "standard", // "standard" | "individual"
  selectedPresetId: "formation_4_2_3_1",
  fieldAssignments: {
    goal_basic_z: "player_001",
    defense_basic_l: "player_002",
    defense_basic_lz: "player_003",
    defense_basic_rz: "player_004",
    defense_basic_r: "player_005",
    midfield_def_lz: "player_006",
    midfield_def_rz: "player_007",
    midfield_off_lz: "player_008",
    midfield_off_z: "player_009",
    midfield_off_rz: "player_010",
    attack_off_z: "player_011"
  },
  benchAssignments: {
    bench_01: "player_012",
    bench_02: "player_013",
    bench_03: "player_014",
    bench_04: "player_015",
    bench_05: "player_016",
    bench_06: "player_017",
    bench_07: "player_018"
  },
  reservePlayerIds: [
    "player_019",
    "player_020",
    "player_021",
    "player_022",
    "player_023"
  ]
};
