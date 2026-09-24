// Kabinenfieber – DB5 Taktik v1
// Standardformationen aus dem bereitgestellten Positionsraster / Excel.
// Formation = belegte Slots + erwartete Positionscodes, aber keine Spielerzuweisung.

export const TACTIC_FORMATIONS = [
  {
    "id": "formation_3_1_4_2",
    "label": "3-1-4-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_basic_l",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_basic_r",
      "midfield_def_z",
      "defense_basic_lz",
      "defense_basic_z",
      "defense_basic_rz",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_basic_l": "LM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_basic_r": "RM",
      "midfield_def_z": "DM",
      "defense_basic_lz": "IV",
      "defense_basic_z": "IV",
      "defense_basic_rz": "IV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_3_4_1_2",
    "label": "3-4-1-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_off_z",
      "midfield_basic_l",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_basic_r",
      "defense_basic_lz",
      "defense_basic_z",
      "defense_basic_rz",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_off_z": "OM",
      "midfield_basic_l": "LM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_basic_r": "RM",
      "defense_basic_lz": "IV",
      "defense_basic_z": "IV",
      "defense_basic_rz": "IV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_3_4_2_1",
    "label": "3-4-2-1",
    "occupiedSlots": [
      "attack_basic_z",
      "attack_def_lz",
      "attack_def_rz",
      "midfield_basic_l",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_basic_r",
      "defense_off_lz",
      "defense_off_z",
      "defense_off_rz",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_z": "ST",
      "attack_def_lz": "HS",
      "attack_def_rz": "HS",
      "midfield_basic_l": "LM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_basic_r": "RM",
      "defense_off_lz": "IV",
      "defense_off_z": "IV",
      "defense_off_rz": "IV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_3_5_2",
    "label": "3-5-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_off_z",
      "midfield_basic_l",
      "midfield_basic_r",
      "midfield_def_lz",
      "midfield_def_rz",
      "defense_basic_lz",
      "defense_basic_z",
      "defense_basic_rz",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_off_z": "OM",
      "midfield_basic_l": "LM",
      "midfield_basic_r": "RM",
      "midfield_def_lz": "DM",
      "midfield_def_rz": "DM",
      "defense_basic_lz": "IV",
      "defense_basic_z": "IV",
      "defense_basic_rz": "IV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_3_4_3",
    "label": "3-4-3",
    "occupiedSlots": [
      "attack_off_l",
      "attack_off_z",
      "attack_off_r",
      "midfield_basic_l",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_basic_r",
      "defense_basic_lz",
      "defense_basic_z",
      "defense_basic_rz",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_off_l": "LF",
      "attack_off_z": "ST",
      "attack_off_r": "RF",
      "midfield_basic_l": "LM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_basic_r": "RM",
      "defense_basic_lz": "IV",
      "defense_basic_z": "IV",
      "defense_basic_rz": "IV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_1_2_1_2",
    "label": "4-1-2-1-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_off_z",
      "midfield_basic_l",
      "midfield_basic_r",
      "midfield_def_z",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_off_z": "OM",
      "midfield_basic_l": "LM",
      "midfield_basic_r": "RM",
      "midfield_def_z": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_1_2_1_2_2",
    "label": "4-1-2-1-2(2)",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_off_z",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_def_z",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_off_z": "OM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_def_z": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_1_3_2",
    "label": "4-1-3-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_basic_l",
      "midfield_basic_z",
      "midfield_basic_r",
      "midfield_def_z",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_basic_l": "LM",
      "midfield_basic_z": "ZM",
      "midfield_basic_r": "RM",
      "midfield_def_z": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_1_4_1",
    "label": "4-1-4-1",
    "occupiedSlots": [
      "attack_off_z",
      "midfield_basic_l",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_basic_r",
      "midfield_def_z",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_off_z": "ST",
      "midfield_basic_l": "LM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_basic_r": "RM",
      "midfield_def_z": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_2_1_3",
    "label": "4-2-1-3",
    "occupiedSlots": [
      "attack_off_l",
      "attack_off_z",
      "attack_off_r",
      "midfield_off_z",
      "midfield_def_lz",
      "midfield_def_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_off_l": "LF",
      "attack_off_z": "ST",
      "attack_off_r": "RF",
      "midfield_off_z": "OM",
      "midfield_def_lz": "DM",
      "midfield_def_rz": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_2_2_2",
    "label": "4-2-2-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_off_lz",
      "midfield_off_rz",
      "midfield_def_lz",
      "midfield_def_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_off_lz": "OM",
      "midfield_off_rz": "OM",
      "midfield_def_lz": "DM",
      "midfield_def_rz": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_2_3_1",
    "label": "4-2-3-1",
    "occupiedSlots": [
      "attack_off_z",
      "midfield_off_lz",
      "midfield_off_z",
      "midfield_off_rz",
      "midfield_def_lz",
      "midfield_def_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_off_z": "ST",
      "midfield_off_lz": "OM",
      "midfield_off_z": "OM",
      "midfield_off_rz": "OM",
      "midfield_def_lz": "DM",
      "midfield_def_rz": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_2_3_1_2",
    "label": "4-2-3-1(2)",
    "occupiedSlots": [
      "attack_off_z",
      "midfield_off_l",
      "midfield_off_z",
      "midfield_off_r",
      "midfield_def_lz",
      "midfield_def_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_off_z": "ST",
      "midfield_off_l": "LM",
      "midfield_off_z": "OM",
      "midfield_off_r": "RM",
      "midfield_def_lz": "DM",
      "midfield_def_rz": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_2_4",
    "label": "4-2-4",
    "occupiedSlots": [
      "attack_basic_l",
      "attack_basic_lz",
      "attack_basic_rz",
      "attack_basic_r",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_l": "LF",
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "attack_basic_r": "RF",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_3_1_2",
    "label": "4-3-1-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_off_z",
      "midfield_basic_lz",
      "midfield_basic_z",
      "midfield_basic_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_off_z": "OM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_z": "ZM",
      "midfield_basic_rz": "ZM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_3_2_1",
    "label": "4-3-2-1",
    "occupiedSlots": [
      "attack_basic_z",
      "attack_def_lz",
      "attack_def_rz",
      "midfield_basic_lz",
      "midfield_basic_z",
      "midfield_basic_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_z": "ST",
      "attack_def_lz": "HS",
      "attack_def_rz": "HS",
      "midfield_basic_lz": "ZM",
      "midfield_basic_z": "ZM",
      "midfield_basic_rz": "ZM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_3_3",
    "label": "4-3-3",
    "occupiedSlots": [
      "attack_basic_l",
      "attack_basic_z",
      "attack_basic_r",
      "midfield_basic_lz",
      "midfield_basic_z",
      "midfield_basic_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_l": "LF",
      "attack_basic_z": "ST",
      "attack_basic_r": "RF",
      "midfield_basic_lz": "ZM",
      "midfield_basic_z": "ZM",
      "midfield_basic_rz": "ZM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_3_3_2",
    "label": "4-3-3(2)",
    "occupiedSlots": [
      "attack_basic_l",
      "attack_basic_z",
      "attack_basic_r",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_def_z",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_l": "LF",
      "attack_basic_z": "ST",
      "attack_basic_r": "RF",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_def_z": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_3_3_3",
    "label": "4-3-3(3)",
    "occupiedSlots": [
      "attack_off_l",
      "attack_off_z",
      "attack_off_r",
      "midfield_basic_z",
      "midfield_def_lz",
      "midfield_def_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_off_l": "LF",
      "attack_off_z": "ST",
      "attack_off_r": "RF",
      "midfield_basic_z": "ZM",
      "midfield_def_lz": "DM",
      "midfield_def_rz": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_3_3_4",
    "label": "4-3-3(4)",
    "occupiedSlots": [
      "attack_basic_l",
      "attack_basic_z",
      "attack_basic_r",
      "midfield_off_z",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_l": "LF",
      "attack_basic_z": "ST",
      "attack_basic_r": "RF",
      "midfield_off_z": "OM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_4_1_1_2",
    "label": "4-4-1-1(2)",
    "occupiedSlots": [
      "attack_basic_z",
      "midfield_off_z",
      "midfield_basic_l",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_basic_r",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_z": "ST",
      "midfield_off_z": "OM",
      "midfield_basic_l": "LM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_basic_r": "RM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_4_2",
    "label": "4-4-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_basic_l",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_basic_r",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_basic_l": "LM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_basic_r": "RM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_4_2_2",
    "label": "4-4-2(2)",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_basic_l",
      "midfield_basic_r",
      "midfield_def_lz",
      "midfield_def_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_basic_l": "LM",
      "midfield_basic_r": "RM",
      "midfield_def_lz": "DM",
      "midfield_def_rz": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_4_5_1",
    "label": "4-5-1",
    "occupiedSlots": [
      "attack_basic_z",
      "midfield_off_lz",
      "midfield_off_rz",
      "midfield_basic_l",
      "midfield_basic_z",
      "midfield_basic_r",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_z": "ST",
      "midfield_off_lz": "OM",
      "midfield_off_rz": "OM",
      "midfield_basic_l": "LM",
      "midfield_basic_z": "ZM",
      "midfield_basic_r": "RM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_5_2_1_2",
    "label": "5-2-1-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_off_z",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_z",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_off_z": "OM",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_z": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_5_2_3",
    "label": "5-2-3",
    "occupiedSlots": [
      "attack_basic_l",
      "attack_basic_z",
      "attack_basic_r",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_z",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_l": "LF",
      "attack_basic_z": "ST",
      "attack_basic_r": "RF",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_z": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_5_3_2",
    "label": "5-3-2",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_def_z",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_z",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_def_z": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_z": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  },
  {
    "id": "formation_5_4_1",
    "label": "5-4-1",
    "occupiedSlots": [
      "attack_basic_lz",
      "attack_basic_rz",
      "midfield_basic_lz",
      "midfield_basic_rz",
      "midfield_def_z",
      "defense_basic_l",
      "defense_basic_lz",
      "defense_basic_z",
      "defense_basic_rz",
      "defense_basic_r",
      "goal_basic_z"
    ],
    "positionMap": {
      "attack_basic_lz": "ST",
      "attack_basic_rz": "ST",
      "midfield_basic_lz": "ZM",
      "midfield_basic_rz": "ZM",
      "midfield_def_z": "DM",
      "defense_basic_l": "LV",
      "defense_basic_lz": "IV",
      "defense_basic_z": "IV",
      "defense_basic_rz": "IV",
      "defense_basic_r": "RV",
      "goal_basic_z": "TW"
    }
  }
];

export const TACTIC_FORMATIONS_BY_ID = Object.freeze(
  Object.fromEntries(TACTIC_FORMATIONS.map(formation => [formation.id, formation]))
);

export function getFormationById(formationId) {
  return TACTIC_FORMATIONS_BY_ID[formationId] ?? null;
}

export function getFormationLabels() {
  return TACTIC_FORMATIONS.map(formation => formation.label);
}
