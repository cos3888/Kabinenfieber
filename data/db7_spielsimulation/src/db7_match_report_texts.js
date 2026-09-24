export function buildMatchReport(result, context) {
  const homeName = context?.homeClub?.clubName || 'Heimteam';
  const awayName = context?.awayClub?.clubName || 'Auswärtsteam';
  const homeGoals = Number(result?.homeGoals || 0);
  const awayGoals = Number(result?.awayGoals || 0);
  const goalEvents = (result?.events || []).filter(event => event.type === 'goal' || event.type === 'own_goal' || event.type === 'penalty_goal');
  const cardEvents = (result?.events || []).filter(event => event.type === 'yellow_card' || event.type === 'red_card');

  let headline = `${homeName} gegen ${awayName} endet ${homeGoals}:${awayGoals}.`;
  if (homeGoals > awayGoals) headline = `${homeName} setzt sich mit ${homeGoals}:${awayGoals} gegen ${awayName} durch.`;
  else if (awayGoals > homeGoals) headline = `${awayName} gewinnt auswärts mit ${awayGoals}:${homeGoals} bei ${homeName}.`;

  const summary = `${headline} Tore: ${goalEvents.length}, Karten: ${cardEvents.length}.`;

  const eventLines = goalEvents.slice(0, 5).map(event => {
    if (event.type === 'own_goal') return `${event.minute}'. Eigentor zugunsten ${event.benefitClubId || '-'}.`;
    if (event.type === 'penalty_goal') return `${event.minute}'. Elfmeter verwandelt von ${event.playerId}.`;
    return `${event.minute}'. Tor durch ${event.playerId}.`;
  });

  return {
    headline,
    summary,
    eventLines
  };
}
