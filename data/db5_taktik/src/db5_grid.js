// Kabinenfieber – DB5 Taktik v1
// Festes Positionsraster. Das Raster ist die Wahrheit.
// Jeder Slot hat eine eindeutige ID und kann in UI und Berechnung direkt verwendet werden.

export const TACTIC_GRID_SLOTS = [
  {
    "slotId": "attack_off_l",
    "group": "attack",
    "alignment": "off",
    "lane": "l",
    "defaultPosition": "LF",
    "ui": {
      "leftPct": 18,
      "topPct": 14
    }
  },
  {
    "slotId": "attack_off_lz",
    "group": "attack",
    "alignment": "off",
    "lane": "lz",
    "defaultPosition": "ST",
    "ui": {
      "leftPct": 34,
      "topPct": 14
    }
  },
  {
    "slotId": "attack_off_z",
    "group": "attack",
    "alignment": "off",
    "lane": "z",
    "defaultPosition": "ST",
    "ui": {
      "leftPct": 50,
      "topPct": 14
    }
  },
  {
    "slotId": "attack_off_rz",
    "group": "attack",
    "alignment": "off",
    "lane": "rz",
    "defaultPosition": "ST",
    "ui": {
      "leftPct": 66,
      "topPct": 14
    }
  },
  {
    "slotId": "attack_off_r",
    "group": "attack",
    "alignment": "off",
    "lane": "r",
    "defaultPosition": "RF",
    "ui": {
      "leftPct": 82,
      "topPct": 14
    }
  },
  {
    "slotId": "attack_basic_l",
    "group": "attack",
    "alignment": "basic",
    "lane": "l",
    "defaultPosition": "LF",
    "ui": {
      "leftPct": 18,
      "topPct": 21
    }
  },
  {
    "slotId": "attack_basic_lz",
    "group": "attack",
    "alignment": "basic",
    "lane": "lz",
    "defaultPosition": "ST",
    "ui": {
      "leftPct": 34,
      "topPct": 21
    }
  },
  {
    "slotId": "attack_basic_z",
    "group": "attack",
    "alignment": "basic",
    "lane": "z",
    "defaultPosition": "ST",
    "ui": {
      "leftPct": 50,
      "topPct": 21
    }
  },
  {
    "slotId": "attack_basic_rz",
    "group": "attack",
    "alignment": "basic",
    "lane": "rz",
    "defaultPosition": "ST",
    "ui": {
      "leftPct": 66,
      "topPct": 21
    }
  },
  {
    "slotId": "attack_basic_r",
    "group": "attack",
    "alignment": "basic",
    "lane": "r",
    "defaultPosition": "RF",
    "ui": {
      "leftPct": 82,
      "topPct": 21
    }
  },
  {
    "slotId": "attack_def_l",
    "group": "attack",
    "alignment": "def",
    "lane": "l",
    "defaultPosition": "LF",
    "ui": {
      "leftPct": 18,
      "topPct": 28
    }
  },
  {
    "slotId": "attack_def_lz",
    "group": "attack",
    "alignment": "def",
    "lane": "lz",
    "defaultPosition": "HS",
    "ui": {
      "leftPct": 34,
      "topPct": 28
    }
  },
  {
    "slotId": "attack_def_z",
    "group": "attack",
    "alignment": "def",
    "lane": "z",
    "defaultPosition": "HS",
    "ui": {
      "leftPct": 50,
      "topPct": 28
    }
  },
  {
    "slotId": "attack_def_rz",
    "group": "attack",
    "alignment": "def",
    "lane": "rz",
    "defaultPosition": "HS",
    "ui": {
      "leftPct": 66,
      "topPct": 28
    }
  },
  {
    "slotId": "attack_def_r",
    "group": "attack",
    "alignment": "def",
    "lane": "r",
    "defaultPosition": "RF",
    "ui": {
      "leftPct": 82,
      "topPct": 28
    }
  },
  {
    "slotId": "midfield_off_l",
    "group": "midfield",
    "alignment": "off",
    "lane": "l",
    "defaultPosition": "LM",
    "ui": {
      "leftPct": 18,
      "topPct": 42
    }
  },
  {
    "slotId": "midfield_off_lz",
    "group": "midfield",
    "alignment": "off",
    "lane": "lz",
    "defaultPosition": "OM",
    "ui": {
      "leftPct": 34,
      "topPct": 42
    }
  },
  {
    "slotId": "midfield_off_z",
    "group": "midfield",
    "alignment": "off",
    "lane": "z",
    "defaultPosition": "OM",
    "ui": {
      "leftPct": 50,
      "topPct": 42
    }
  },
  {
    "slotId": "midfield_off_rz",
    "group": "midfield",
    "alignment": "off",
    "lane": "rz",
    "defaultPosition": "OM",
    "ui": {
      "leftPct": 66,
      "topPct": 42
    }
  },
  {
    "slotId": "midfield_off_r",
    "group": "midfield",
    "alignment": "off",
    "lane": "r",
    "defaultPosition": "RM",
    "ui": {
      "leftPct": 82,
      "topPct": 42
    }
  },
  {
    "slotId": "midfield_basic_l",
    "group": "midfield",
    "alignment": "basic",
    "lane": "l",
    "defaultPosition": "LM",
    "ui": {
      "leftPct": 18,
      "topPct": 49
    }
  },
  {
    "slotId": "midfield_basic_lz",
    "group": "midfield",
    "alignment": "basic",
    "lane": "lz",
    "defaultPosition": "ZM",
    "ui": {
      "leftPct": 34,
      "topPct": 49
    }
  },
  {
    "slotId": "midfield_basic_z",
    "group": "midfield",
    "alignment": "basic",
    "lane": "z",
    "defaultPosition": "ZM",
    "ui": {
      "leftPct": 50,
      "topPct": 49
    }
  },
  {
    "slotId": "midfield_basic_rz",
    "group": "midfield",
    "alignment": "basic",
    "lane": "rz",
    "defaultPosition": "ZM",
    "ui": {
      "leftPct": 66,
      "topPct": 49
    }
  },
  {
    "slotId": "midfield_basic_r",
    "group": "midfield",
    "alignment": "basic",
    "lane": "r",
    "defaultPosition": "RM",
    "ui": {
      "leftPct": 82,
      "topPct": 49
    }
  },
  {
    "slotId": "midfield_def_l",
    "group": "midfield",
    "alignment": "def",
    "lane": "l",
    "defaultPosition": "LM",
    "ui": {
      "leftPct": 18,
      "topPct": 56
    }
  },
  {
    "slotId": "midfield_def_lz",
    "group": "midfield",
    "alignment": "def",
    "lane": "lz",
    "defaultPosition": "DM",
    "ui": {
      "leftPct": 34,
      "topPct": 56
    }
  },
  {
    "slotId": "midfield_def_z",
    "group": "midfield",
    "alignment": "def",
    "lane": "z",
    "defaultPosition": "DM",
    "ui": {
      "leftPct": 50,
      "topPct": 56
    }
  },
  {
    "slotId": "midfield_def_rz",
    "group": "midfield",
    "alignment": "def",
    "lane": "rz",
    "defaultPosition": "DM",
    "ui": {
      "leftPct": 66,
      "topPct": 56
    }
  },
  {
    "slotId": "midfield_def_r",
    "group": "midfield",
    "alignment": "def",
    "lane": "r",
    "defaultPosition": "RM",
    "ui": {
      "leftPct": 82,
      "topPct": 56
    }
  },
  {
    "slotId": "defense_off_l",
    "group": "defense",
    "alignment": "off",
    "lane": "l",
    "defaultPosition": "LV",
    "ui": {
      "leftPct": 18,
      "topPct": 70
    }
  },
  {
    "slotId": "defense_off_lz",
    "group": "defense",
    "alignment": "off",
    "lane": "lz",
    "defaultPosition": "IV",
    "ui": {
      "leftPct": 34,
      "topPct": 70
    }
  },
  {
    "slotId": "defense_off_z",
    "group": "defense",
    "alignment": "off",
    "lane": "z",
    "defaultPosition": "IV",
    "ui": {
      "leftPct": 50,
      "topPct": 70
    }
  },
  {
    "slotId": "defense_off_rz",
    "group": "defense",
    "alignment": "off",
    "lane": "rz",
    "defaultPosition": "IV",
    "ui": {
      "leftPct": 66,
      "topPct": 70
    }
  },
  {
    "slotId": "defense_off_r",
    "group": "defense",
    "alignment": "off",
    "lane": "r",
    "defaultPosition": "RV",
    "ui": {
      "leftPct": 82,
      "topPct": 70
    }
  },
  {
    "slotId": "defense_basic_l",
    "group": "defense",
    "alignment": "basic",
    "lane": "l",
    "defaultPosition": "LV",
    "ui": {
      "leftPct": 18,
      "topPct": 77
    }
  },
  {
    "slotId": "defense_basic_lz",
    "group": "defense",
    "alignment": "basic",
    "lane": "lz",
    "defaultPosition": "IV",
    "ui": {
      "leftPct": 34,
      "topPct": 77
    }
  },
  {
    "slotId": "defense_basic_z",
    "group": "defense",
    "alignment": "basic",
    "lane": "z",
    "defaultPosition": "IV",
    "ui": {
      "leftPct": 50,
      "topPct": 77
    }
  },
  {
    "slotId": "defense_basic_rz",
    "group": "defense",
    "alignment": "basic",
    "lane": "rz",
    "defaultPosition": "IV",
    "ui": {
      "leftPct": 66,
      "topPct": 77
    }
  },
  {
    "slotId": "defense_basic_r",
    "group": "defense",
    "alignment": "basic",
    "lane": "r",
    "defaultPosition": "RV",
    "ui": {
      "leftPct": 82,
      "topPct": 77
    }
  },
  {
    "slotId": "goal_basic_z",
    "group": "goal",
    "alignment": "basic",
    "lane": "z",
    "defaultPosition": "TW",
    "ui": {
      "leftPct": 50,
      "topPct": 89
    }
  }
];

export const TACTIC_GRID_BY_ID = Object.freeze(
  Object.fromEntries(TACTIC_GRID_SLOTS.map(slot => [slot.slotId, slot]))
);

export const GRID_GROUP_ORDER = Object.freeze(["attack", "midfield", "defense", "goal"]);
export const GRID_ALIGNMENT_ORDER = Object.freeze(["off", "basic", "def"]);
export const GRID_LANE_ORDER = Object.freeze(["l", "lz", "z", "rz", "r"]);

export function getGridSlot(slotId) {
  return TACTIC_GRID_BY_ID[slotId] ?? null;
}
