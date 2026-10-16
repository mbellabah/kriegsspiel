import { BattleStateSnapshot, Unit } from '../types/game';

// Unit positions at an arbitrary battle time, interpolated between the two snapshots around it
export function unitsAtTime(snapshots: BattleStateSnapshot[], t: number): Unit[] | null {
  if (snapshots.length === 0) return null;
  let i = 0;
  while (i < snapshots.length - 1 && snapshots[i + 1].timeMinutes <= t) i++;
  const a = snapshots[i];
  const b = snapshots[i + 1];
  if (!b || t <= a.timeMinutes) return a.units;
  const f = Math.max(0, Math.min(1, (t - a.timeMinutes) / Math.max(0.001, b.timeMinutes - a.timeMinutes)));
  const later = new Map(b.units.map((u) => [u.id, u]));
  return a.units.map((u) => {
    const v = later.get(u.id);
    if (!v) return u;
    let dh = v.heading - u.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    return {
      ...u,
      position: { x: u.position.x + (v.position.x - u.position.x) * f, y: u.position.y + (v.position.y - u.position.y) * f },
      heading: u.heading + dh * f,
      strength: u.strength + (v.strength - u.strength) * f,
      status: f < 0.5 ? u.status : v.status,
      formation: f < 0.5 ? u.formation : v.formation,
    };
  });
}
