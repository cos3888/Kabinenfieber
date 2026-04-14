// Kabinenfieber – DB5 Taktik v1
// Finale Positionsdefinitionen, Referenzslots und malusfreie Slotbereiche.

export const TACTIC_POSITIONS = {
  "TW": {
    "label": "Torwart",
    "group": "goal",
    "referenceSlot": "goal_basic_z"
  },
  "LV": {
    "label": "Linksverteidiger",
    "group": "defense",
    "referenceSlot": "defense_basic_l"
  },
  "IV": {
    "label": "Innenverteidiger",
    "group": "defense",
    "referenceSlot": "defense_basic_z"
  },
  "RV": {
    "label": "Rechtsverteidiger",
    "group": "defense",
    "referenceSlot": "defense_basic_r"
  },
  "LM": {
    "label": "Linkes Mittelfeld",
    "group": "midfield",
    "referenceSlot": "midfield_basic_l"
  },
  "DM": {
    "label": "Defensives Mittelfeld",
    "group": "midfield",
    "referenceSlot": "midfield_def_z"
  },
  "ZM": {
    "label": "Zentrales Mittelfeld",
    "group": "midfield",
    "referenceSlot": "midfield_basic_z"
  },
  "OM": {
    "label": "Offensives Mittelfeld",
    "group": "midfield",
    "referenceSlot": "midfield_off_z"
  },
  "RM": {
    "label": "Rechtes Mittelfeld",
    "group": "midfield",
    "referenceSlot": "midfield_basic_r"
  },
  "LF": {
    "label": "Linksaußen / linker Stürmer",
    "group": "attack",
    "referenceSlot": "attack_basic_l"
  },
  "ST": {
    "label": "Stürmer",
    "group": "attack",
    "referenceSlot": "attack_basic_z"
  },
  "HS": {
    "label": "Hängende Spitze",
    "group": "attack",
    "referenceSlot": "attack_def_z"
  },
  "RF": {
    "label": "Rechtsaußen / rechter Stürmer",
    "group": "attack",
    "referenceSlot": "attack_basic_r"
  }
};

export const POSITION_SLOT_AREAS = {
  "TW": [
    "goal_basic_z"
  ],
  "LV": [
    "defense_off_l",
    "defense_basic_l"
  ],
  "IV": [
    "defense_off_lz",
    "defense_off_z",
    "defense_off_rz",
    "defense_basic_lz",
    "defense_basic_z",
    "defense_basic_rz"
  ],
  "RV": [
    "defense_off_r",
    "defense_basic_r"
  ],
  "LM": [
    "midfield_off_l",
    "midfield_basic_l",
    "midfield_def_l"
  ],
  "DM": [
    "midfield_def_lz",
    "midfield_def_z",
    "midfield_def_rz"
  ],
  "ZM": [
    "midfield_basic_lz",
    "midfield_basic_z",
    "midfield_basic_rz"
  ],
  "OM": [
    "midfield_off_lz",
    "midfield_off_z",
    "midfield_off_rz"
  ],
  "RM": [
    "midfield_off_r",
    "midfield_basic_r",
    "midfield_def_r"
  ],
  "LF": [
    "attack_off_l",
    "attack_basic_l",
    "attack_def_l"
  ],
  "ST": [
    "attack_off_lz",
    "attack_off_z",
    "attack_off_rz",
    "attack_basic_lz",
    "attack_basic_z",
    "attack_basic_rz"
  ],
  "HS": [
    "attack_def_lz",
    "attack_def_z",
    "attack_def_rz"
  ],
  "RF": [
    "attack_off_r",
    "attack_basic_r",
    "attack_def_r"
  ]
};

export const POSITION_CODES = Object.freeze(Object.keys(TACTIC_POSITIONS));

export function getPositionGroup(positionCode) {
  return TACTIC_POSITIONS[positionCode]?.group ?? null;
}

export function getReferenceSlot(positionCode) {
  return TACTIC_POSITIONS[positionCode]?.referenceSlot ?? null;
}

export function getAllowedSlots(positionCode) {
  return POSITION_SLOT_AREAS[positionCode] ? [...POSITION_SLOT_AREAS[positionCode]] : [];
}
