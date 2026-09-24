// Kabinenfieber – DB5 Taktik v1
// Bewertungslogik für Positionspassung auf Feldslots.
// Wichtige Festlegung:
// - Ausgangspunkt ist immer der Referenzslot einer Haupt- oder Nebenposition.
// - Der beste Pfad gewinnt.
// - Der Zielslot ist immer der konkrete Raster-Slot, nicht nur der Positionsname.
// - Torwart ist Sonderfall und wird nicht normal über Feldspieler-Overall bewertet.

import { TACTIC_POSITIONS, POSITION_SLOT_AREAS, getReferenceSlot } from "./db5_positions.js";
import { TACTIC_GRID_BY_ID, GRID_GROUP_ORDER, GRID_ALIGNMENT_ORDER, GRID_LANE_ORDER } from "./db5_grid.js";

export const TACTIC_RULES = Object.freeze({
  mainPositionFactor: 1.0,
  secondaryPositionFactor: 0.94,
  fieldGroupChangePenalty: 0.08,
  distancePenaltyCurve: {
    0: 0.00,
    1: 0.08,
    2: 0.16,
    3: 0.24,
    4: 0.31,
    5: 0.38,
    6: 0.44,
    7: 0.49,
    8: 0.54,
    9: 0.58,
    10: 0.62,
    11: 0.66
  },
  maxDistanceInCurrentRaster: 11,
  goalkeeperSpecialCase: {
    goalSlotUsesGoalkeeperAbilityModel: true,
    note: "Der TW-Slot wird separat über Torwartfähigkeiten bewertet."
  }
});

function getGridCoordinates(slotId) {
  const slot = TACTIC_GRID_BY_ID[slotId];
  if (!slot) return null;

  const groupIndex = GRID_GROUP_ORDER.indexOf(slot.group);
  const laneIndex = GRID_LANE_ORDER.indexOf(slot.lane);

  // Tor wird als tiefster Block im Raster behandelt.
  let rowIndex;
  if (slot.group === "goal") {
    rowIndex = 8;
  } else {
    const alignmentIndex = GRID_ALIGNMENT_ORDER.indexOf(slot.alignment);
    rowIndex = groupIndex * 3 + alignmentIndex;
  }

  return { rowIndex, laneIndex, group: slot.group, alignment: slot.alignment };
}

export function getRasterStepDistance(fromSlotId, toSlotId) {
  const from = getGridCoordinates(fromSlotId);
  const to = getGridCoordinates(toSlotId);

  if (!from || !to) return null;

  const rowDistance = Math.abs(from.rowIndex - to.rowIndex);
  const laneDistance = Math.abs(from.laneIndex - to.laneIndex);

  return rowDistance + laneDistance;
}

export function getDistancePenalty(stepDistance) {
  const curve = TACTIC_RULES.distancePenaltyCurve;
  if (stepDistance == null || stepDistance < 0) return 0;

  if (curve[stepDistance] != null) {
    return curve[stepDistance];
  }

  // Sicherheitslogik: Alles oberhalb des aktuell definierten Maximalfalls
  // verwendet denselben Malus wie der höchste bekannte Abstand.
  return curve[TACTIC_RULES.maxDistanceInCurrentRaster];
}

export function getFieldGroupChangePenalty(fromPositionCode, targetSlotId) {
  const positionGroup = TACTIC_POSITIONS[fromPositionCode]?.group ?? null;
  const targetGroup = TACTIC_GRID_BY_ID[targetSlotId]?.group ?? null;

  if (!positionGroup || !targetGroup) return 0;
  if (positionGroup === "goal" || targetGroup === "goal") return 0;
  if (positionGroup === targetGroup) return 0;

  return TACTIC_RULES.fieldGroupChangePenalty;
}

export function isSlotInsidePositionArea(positionCode, targetSlotId) {
  return POSITION_SLOT_AREAS[positionCode]?.includes(targetSlotId) ?? false;
}

export function getPositionBaseFactor(positionCode, mainPosition, secondaryPositions = []) {
  if (positionCode === mainPosition) return TACTIC_RULES.mainPositionFactor;
  if (secondaryPositions.includes(positionCode)) return TACTIC_RULES.secondaryPositionFactor;
  return null;
}

export function evaluateFieldSlotFit({
  baseStrength,
  targetSlotId,
  mainPosition,
  secondaryPositions = []
}) {
  const candidatePositions = [mainPosition, ...secondaryPositions].filter(Boolean);

  if (TACTIC_GRID_BY_ID[targetSlotId]?.group === "goal") {
    return {
      targetSlotId,
      isGoalkeeperCase: true,
      note: "TW-Slot separat über Torwartfähigkeiten bewerten."
    };
  }

  let best = null;

  for (const positionCode of candidatePositions) {
    const baseFactor = getPositionBaseFactor(positionCode, mainPosition, secondaryPositions);
    if (baseFactor == null) continue;

    const insideArea = isSlotInsidePositionArea(positionCode, targetSlotId);
    const referenceSlot = getReferenceSlot(positionCode);
    const stepDistance = insideArea ? 0 : getRasterStepDistance(referenceSlot, targetSlotId);
    const distancePenalty = getDistancePenalty(stepDistance);
    const groupChangePenalty = getFieldGroupChangePenalty(positionCode, targetSlotId);

    const fitFactor = Math.max(0, baseFactor - distancePenalty - groupChangePenalty);
    const effectiveStrength = Math.max(0, Math.round(baseStrength * fitFactor));

    const result = {
      sourcePosition: positionCode,
      referenceSlot,
      targetSlotId,
      insideArea,
      stepDistance,
      baseFactor,
      distancePenalty,
      groupChangePenalty,
      fitFactor,
      effectiveStrength
    };

    if (!best || result.effectiveStrength > best.effectiveStrength) {
      best = result;
    }
  }

  return best;
}
