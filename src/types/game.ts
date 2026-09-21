export type Faction = 'french' | 'allies';

export type UnitType = 'infantry' | 'cavalry' | 'artillery' | 'guard' | 'headquarters';

export type Formation = 'line' | 'column' | 'square' | 'limbered' | 'unlimbered';

export type UnitStatus = 'idle' | 'marching' | 'engaging' | 'charging' | 'holding' | 'wavering' | 'routing' | 'shattered';

export interface Vector2D {
  x: number;
  y: number;
}

export interface ManeuverOrder {
  id: string;
  unitId: string;
  type: 'march' | 'assault' | 'flank' | 'bombard' | 'retreat' | 'hold';
  destination: Vector2D;
  waypoints: Vector2D[];
  curveControl?: Vector2D; // Bézier control point for curved flanking arrows
  targetUnitId?: string;
  targetFormation?: Formation;
  plannedTime: number; // in battle minutes from start (e.g. 0 to 540 for 9 hours)
  dispatchArrivalTime?: number; // Time (in battle minutes) when the courier reaches the unit
  finalHeading?: number; // Total War arrival facing orientation
  status: 'planned' | 'delivering' | 'executing' | 'completed' | 'cancelled';
}

export interface Unit {
  id: string;
  name: string;
  commander: string;
  faction: Faction;
  type: UnitType;
  corps: string; // e.g. "IV Corps (Soult)", "Bagration Advance Guard"
  strength: number; // Men or guns
  initialStrength: number;
  morale: number; // 0 - 100
  fatigue: number; // 0 - 100
  suppression?: number; // 0 - 100 combat suppression under fire
  experience: 'Militia' | 'Line' | 'Veteran' | 'Elite Guard';
  
  // Spatial
  position: Vector2D;
  heading: number; // facing angle in radians
  targetHeading?: number;
  speed: number;
  width: number;
  depth: number;
  
  formation: Formation;
  status: UnitStatus;
  currentOrder?: ManeuverOrder;
  
  // Tactical stats
  firepower: number; // relative volley strength
  shockValue: number; // melee assault power
  range: number; // musket/cannon range
  kills: number;
  casualtiesTaken: number;
}

export interface TerrainFeature {
  id: string;
  name: string;
  type: 'hill' | 'ridge' | 'woods' | 'river' | 'lake' | 'village' | 'road' | 'bridge';
  points: Vector2D[];
  center: Vector2D;
  radius?: number; // for circular/simple features
  elevation?: number; // 0 to 100m
  cover?: number; // 0 to 1 (damage reduction)
  moveSpeedMod?: number; // multiplier e.g. 0.5 for swamp, 1.3 for road
}

export interface HistoricalEvent {
  timeInMinutes: number; // battle minutes from 07:00 (e.g. 0 = 07:00, 90 = 08:30)
  timeFormatted: string;
  title: string;
  description: string;
  affectedUnitIds?: string[];
  cameraFocus?: Vector2D;
  narration: string;
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  location: string;
  mapDimensions: { width: number; height: number };
  initialTimeMinutes: number; // e.g. 0 = 07:00
  endTimeMinutes: number; // e.g. 540 = 16:00
  units: Unit[];
  terrain: TerrainFeature[];
  historicalEvents: HistoricalEvent[];
  briefing: {
    overview: string;
    frenchObjective: string;
    alliedObjective: string;
  };
}

export interface CombatLogEntry {
  id: string;
  timeFormatted: string;
  message: string;
  faction: Faction;
  importance: 'normal' | 'highlight' | 'critical';
}

export interface BattleStateSnapshot {
  timeMinutes: number;
  units: Unit[];
  activeOrders: ManeuverOrder[];
  frenchLosses: number;
  alliedLosses: number;
  combatLogs: CombatLogEntry[];
}
