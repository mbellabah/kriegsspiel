export type Faction = 'french' | 'allies';

export type UnitType = 'infantry' | 'cavalry' | 'artillery' | 'guard' | 'headquarters' | 'supply';

export type Formation = 'line' | 'column' | 'square' | 'limbered' | 'unlimbered';

export type TroopFilterType = 'all' | 'infantry' | 'cavalry' | 'artillery' | 'guard' | 'headquarters' | 'french' | 'allies';

export type UnitStatus = 'idle' | 'marching' | 'engaging' | 'charging' | 'melee' | 'holding' | 'entrenching' | 'wavering' | 'routing' | 'shattered';

export interface Vector2D {
  x: number;
  y: number;
}

export type ConditionTriggerType =
  | 'on_contact'
  | 'if_attacked'
  | 'enemy_within'
  | 'morale_below'
  | 'casualties_above'
  | 'outflanked'
  | 'time_reached'
  | 'friendly_arrived';

export interface OrderCondition {
  type: ConditionTriggerType;
  triggerValue?: number; // Distance in meters (e.g. 200), threshold % (e.g. 50), or battle minute (e.g. 90)
  triggerTargetUnitId?: string;
  triggerTargetSector?: 'north' | 'center' | 'south';
  triggerLocation?: Vector2D;
  triggerLocationName?: string;
  description: string; // e.g. "If attacked", "If enemy within 200m", "If morale < 50%"
  contingencyAction?: 'retreat' | 'charge' | 'square' | 'line' | 'hold' | 'bombard' | 'march' | 'assault';
  contingencyDestination?: Vector2D;
  contingencyDestinationName?: string;
  triggered?: boolean;
}

// Order Authority / Provenance
export type OrderSource = 'player' | 'subordinate' | 'historical_event';

export interface ManeuverOrder {
  id: string;
  unitId: string;
  type: 'march' | 'assault' | 'flank' | 'charge' | 'bombard' | 'retreat' | 'hold' | 'entrench' | 'suppress' | 'volley';
  destination: Vector2D;
  waypoints: Vector2D[];
  curveControl?: Vector2D; // Bézier control point for curved flanking arrows
  targetUnitId?: string;
  faceUnitId?: string; // On arrival, square the firing edge onto this enemy's current position
  faceNearestEnemy?: boolean; // On arrival, square the firing edge onto whichever enemy is nearest then
  targetFormation?: Formation;
  plannedTime: number; // in battle minutes from start (e.g. 0 to 540 for 9 hours)
  dispatchArrivalTime?: number; // Time (in battle minutes) when the courier reaches the unit
  finalHeading?: number; // Total War arrival facing orientation
  status: 'planned' | 'delivering' | 'standby' | 'executing' | 'completed' | 'cancelled';
  isSmokeMission?: boolean; // Tactical artillery smoke screen
  isForcedMarch?: boolean; // Forced march: +45% movement speed, ignores fatigue slow, increases fatigue accumulation
  source?: OrderSource; // 'player' (from Supreme HQ / user), 'subordinate' (subordinate AI initiative), 'historical_event'

  // Advanced Tactical Fire Missions & Forward Observer (FO) Link
  observerUnitId?: string; // ID of forward observer unit directing precision fire
  supportingBatteryId?: string; // ID of supporting artillery battery assigned
  holdFireThreshold?: number; // For mass volley: range in px to hold fire until (defaults to ~65px / 325m)
  suppressionTargetId?: string; // Target unit for continuous suppressive fire
  isCounterBattery?: boolean; // Counter-battery fire mission targeting enemy artillery/engines
  isGrandBattery?: boolean; // Synchronized Grand Battery / Massed TOT barrage mission

  // Temporal & Durational Controls ("do at", "end at", "do till", "duration")
  startTime?: number; // Scheduled execution start time in battle minutes (e.g. 90 = 08:30 AM). Order remains in 'standby' until this time.
  endTime?: number; // Scheduled order expiration/conclusion time in battle minutes (e.g. 120 = 09:00 AM).
  durationMinutes?: number; // Scheduled duration in minutes (e.g. 20)

  // Tactical Conditional & Contingency
  condition?: OrderCondition;

  // Chained / Follow-up Order (executed when primary order completes or expires at endTime)
  chainedOrder?: Omit<ManeuverOrder, 'id' | 'status'>;
}

export interface DispatchEntry {
  id: string;
  timestamp: number; // in battle minutes
  formattedTime: string;
  sender: string;
  rawText: string;
  recipientName: string;
  recipientUnitId: string;
  orderType: ManeuverOrder['type'];
  acknowledgment: string;
  status: 'transmitting' | 'acknowledged' | 'executing' | 'failed';
  delayMinutes: number;
  modelUsed?: string;
  isSmokeMission?: boolean;
  startTime?: number;
  endTime?: number;
  durationMinutes?: number;
  conditionDescription?: string;
  timingDescription?: string;
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
  ammo: number; // Logistical ammunition
  maxAmmo: number;
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

  // Recon & Fog of War
  detectionState?: 'hidden' | 'contact' | 'identified'; // for player faction perception
  estimatedStrength?: string; // e.g. "~3,000 - 5,000"

  // Tactical status
  isEncircled?: boolean;
  canisterActive?: boolean;
  directDefenseActive?: boolean;
  hasTriggeredWaveringSitrep?: boolean;
  reloadTimer?: number; // accumulated time for artillery firing cadence
  aiRole?: 'assault' | 'defend' | 'screen' | 'reserve' | 'artillery_support';
  aiTargetObjectiveId?: string;
  isWadingRiver?: boolean;
  isGarrisoned?: boolean;
  isForcedMarch?: boolean;
  subordinateInitiativeActive?: boolean; // True when operating under autonomous subordinate commander initiative

  // Advanced Tactical Fire Missions & Combined Arms Links
  isEnfiladed?: boolean; // True when caught in converging crossfire (2+ firers >= 80 deg apart)
  volleyReady?: boolean; // True when holding fire for point-blank battalion volley
  suppressingTargetId?: string; // ID of target being suppressed with continuous covering fire
  observerForBatteryId?: string; // ID of artillery battery this unit is currently spotting for

  // Generic NATO Wargaming Elements (Classical to Modern)
  isSkirmishScreenActive?: boolean; // Forward light infantry / reconnaissance screen deployed ahead of main line
  isGrandBatteryLeader?: boolean; // Leading battery coordinating massed converging artillery fire
  grandBatteryGroupId?: string; // ID of Grand Battery / Massed Artillery convergence group
  gunsDisabled?: number; // Count of artillery guns knocked out / disabled by counter-battery or shock fire
  isResupplying?: boolean; // True when actively receiving Class V logistics replenishment from nearby supply park
  supplyRadius?: number; // Logistical radius projected by supply units (defaults to 180px / 900m)
}

export type AIRole = 'assault' | 'defend' | 'screen' | 'reserve' | 'artillery_support';

export interface TacticalObjective {
  id: string;
  name: string;
  position: Vector2D;
  importance: 'critical' | 'secondary' | 'screening';
  targetSector: 'north' | 'center' | 'south';
  assignedFaction: Faction;
  heldByFaction?: Faction | 'contested';
  radius: number;
  strategicValue: number; // 1 - 100
}

export interface OperationalGraphic {
  id: string;
  type: 'phase_line' | 'objective' | 'fscl' | 'boundary';
  name: string;
  points: Vector2D[];
  color: string;
  labelOffset?: number;
}

export interface TerrainFeature {
  id: string;
  name: string;
  type: 'hill' | 'ridge' | 'woods' | 'river' | 'lake' | 'marsh' | 'village' | 'road' | 'bridge' | 'ford' | 'trench';
  points: Vector2D[];
  center: Vector2D;
  radius?: number; // for circular/simple features
  elevation?: number; // 0 to 100m
  cover?: number; // 0 to 1 (damage reduction)
  moveSpeedMod?: number; // multiplier e.g. 0.5 for swamp, 1.3 for road
  isBridge?: boolean;
  isFord?: boolean;
  isGarrisonable?: boolean;
  garrisonCover?: number;
  passable?: boolean;
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

export interface HistoricalDispatch {
  id: string;
  timeMinutes: number; // battle minutes from battle start (e.g. 0 = 07:00, 90 = 08:30)
  timeFormatted: string; // e.g. "07:00 AM", "08:30 AM"
  commander: string; // e.g. "Napoleon Bonaparte (Supreme HQ)"
  recipientName: string; // e.g. "General Friant", "Marshal Soult"
  rawText: string; // Authentic dispatch command
  historicalQuote: string; // Historical context / rationale from Napoleon's staff correspondence
  orderType: 'march' | 'assault' | 'hold' | 'bombard' | 'charge' | 'retreat' | 'entrench';
  timingHint?: string; // e.g. "Hold until 09:00 AM" or "At 08:30 AM"
  badge: string; // "INF", "ARTY", "CORPS", "CAV"
  badgeColor: string; // Tailwind color classes for military badge
}

export type CampaignEra = 'ancient_greek' | 'napoleonic' | 'blackpowder' | 'ww1' | 'ww2' | 'modern';

export interface EraWeaponProfile {
  id: CampaignEra;
  name: string;
  artilleryType: string;
  directFireType: string;
  closeDefenseType: string;
  skirmishScreenType: string; // Forward screen element (Peltasts, Tirailleurs, Recon pickets, FLOT)
  grandBatteryType: string; // Massed fire support convergence (Massed engines, Grande Batterie, DAG, TOT)
  counterBatteryType: string; // Weapon disablement mission (Anti-engine, Tir de contre-batterie, CB radar)
  supplyType: string; // Class V ammunition echelon (Skeuophoroi, Caissons & Parcs, ASP, FLE)
  ammoNoun: string; // Ammunition label (Javelins & Stones, Cartridges & Shot, Shells, Class V)
  meleeOnlyNoun: string; // Restrictive stance when out of ammo (Phalanx melee, Bayonets only, Cold steel, CQB)
  troopNouns: {
    infantry: string;
    cavalry: string;
    artillery: string;
    supply: string;
  };
  rangeLabels: {
    pointDefense: string;
    indirectFire: string;
    directFire: string;
  };
  projectileVisual: 'napoleonic_roundshot' | 'modern_ordnance';
  muzzleVisual: 'blackpowder_smoke' | 'modern_brake';
}

export const ERA_WEAPON_PROFILES: Record<CampaignEra, EraWeaponProfile> = {
  ancient_greek: {
    id: 'ancient_greek',
    name: 'Ancient Greece & Classical Era (5th–4th Century BC)',
    artilleryType: 'Torsion Siege Engines (Lithoboloi & Oxybeleis)',
    directFireType: 'Javelins, Slings & Recurve Bows',
    closeDefenseType: 'Dory Phalanx & Aspis Wall',
    skirmishScreenType: 'Peltasts & Psiloi (Javelin & Slinger Screen)',
    grandBatteryType: 'Massed Catapult Battery (Torsion Artillery)',
    counterBatteryType: 'Anti-Engine Precision Bombardment',
    supplyType: 'Skeuophoroi (Pack Train & Armory)',
    ammoNoun: 'Javelins & Stones',
    meleeOnlyNoun: 'Dory & Xiphos Only (Phalanx Melee)',
    troopNouns: {
      infantry: 'Hoplites & Peltasts',
      cavalry: 'Hippeis',
      artillery: 'Engines & Crews',
      supply: 'Skeuophoroi Baggage',
    },
    rangeLabels: {
      pointDefense: 'CLOSE SHIELD DEFENSE',
      indirectFire: 'CATAPULT BOMBARDMENT RANGE',
      directFire: 'MISSILE WEAPON RANGE',
    },
    projectileVisual: 'napoleonic_roundshot',
    muzzleVisual: 'blackpowder_smoke',
  },
  napoleonic: {
    id: 'napoleonic',
    name: 'Napoleonic Wars (1799–1815)',
    artilleryType: 'Gribeauval Smoothbore Cannon & Howitzers',
    directFireType: 'Flintlock Musket (Charleville 1777 / Brown Bess)',
    closeDefenseType: 'Canister Shot (Boîte à balles)',
    skirmishScreenType: 'Tirailleurs en Grande Bande (Voltigeur Screen)',
    grandBatteryType: 'Grande Batterie (Massed Ordnance)',
    counterBatteryType: 'Tir de Contre-Batterie (Gun Disablement)',
    supplyType: 'Parc d’Artillerie & Caissons (Class V)',
    ammoNoun: 'Cartridges & Roundshot',
    meleeOnlyNoun: 'Bayonets Only (Cold Steel)',
    troopNouns: {
      infantry: 'Bayonets',
      cavalry: 'Sabres',
      artillery: 'Guns & Crew',
      supply: 'Caissons & Wagons',
    },
    rangeLabels: {
      pointDefense: 'CANISTER DEFENSE',
      indirectFire: 'CFF BOMBARDMENT RANGE',
      directFire: 'MUSKET VOLLEY RANGE',
    },
    projectileVisual: 'napoleonic_roundshot',
    muzzleVisual: 'blackpowder_smoke',
  },
  blackpowder: {
    id: 'blackpowder',
    name: 'Age of Black Powder (18th–19th Century)',
    artilleryType: 'Smoothbore Field Cannon',
    directFireType: 'Muzzle-Loading Musket',
    closeDefenseType: 'Canister Shot',
    skirmishScreenType: 'Light Infantry Pickets (Skirmish Line)',
    grandBatteryType: 'Grand Battery Line (Concentrated Guns)',
    counterBatteryType: 'Counter-Battery Bombardment',
    supplyType: 'Ammunition Baggage Train',
    ammoNoun: 'Cartridges & Shot',
    meleeOnlyNoun: 'Bayonets Only',
    troopNouns: {
      infantry: 'Bayonets',
      cavalry: 'Sabres',
      artillery: 'Guns & Crew',
      supply: 'Baggage Wagons',
    },
    rangeLabels: {
      pointDefense: 'CANISTER DEFENSE',
      indirectFire: 'CFF BOMBARDMENT RANGE',
      directFire: 'MUSKET VOLLEY RANGE',
    },
    projectileVisual: 'napoleonic_roundshot',
    muzzleVisual: 'blackpowder_smoke',
  },
  ww1: {
    id: 'ww1',
    name: 'First World War (1914–1918)',
    artilleryType: 'Quick-Firing Field Guns & Heavy Howitzers',
    directFireType: 'Bolt-Action Rifle & Heavy Machine Gun',
    closeDefenseType: 'Shrapnel / Trench Sweeper',
    skirmishScreenType: 'Recon Pickets & Trench Outpost Line',
    grandBatteryType: 'Corps Artillery Barrage (Massed Guns)',
    counterBatteryType: 'Flash-Spotting Counter-Battery',
    supplyType: 'Class V Ammunition Dump & Railhead',
    ammoNoun: 'Shells & Small Arms Munitions',
    meleeOnlyNoun: 'Cold Steel / Trench Clubs Only',
    troopNouns: {
      infantry: 'Rifles',
      cavalry: 'Cavalry',
      artillery: 'Guns & Crew',
      supply: 'Ammunition Columns',
    },
    rangeLabels: {
      pointDefense: 'FINAL PROTECTIVE FIRE',
      indirectFire: 'BARRAGE RANGE',
      directFire: 'RIFLE / MG RANGE',
    },
    projectileVisual: 'modern_ordnance',
    muzzleVisual: 'modern_brake',
  },
  ww2: {
    id: 'ww2',
    name: 'Second World War (1939–1945)',
    artilleryType: 'Divisional Howitzers & Mortars',
    directFireType: 'Rifles & Submachine Guns',
    closeDefenseType: 'Anti-Personnel / Case Shot',
    skirmishScreenType: 'Combat Reconnaissance Pickets (Forward Screen)',
    grandBatteryType: 'Divisional Artillery Group (DAG / TOT)',
    counterBatteryType: 'Counter-Battery Fire Mission',
    supplyType: 'Ammunition Supply Point (ASP)',
    ammoNoun: 'Artillery Shells & Ammunition',
    meleeOnlyNoun: 'Close Quarters / Cold Steel Only',
    troopNouns: {
      infantry: 'Infantrymen',
      cavalry: 'Armored Recon',
      artillery: 'Guns & Crew',
      supply: 'Logistics Columns',
    },
    rangeLabels: {
      pointDefense: 'POINT DEFENSE',
      indirectFire: 'CFF ARTILLERY RANGE',
      directFire: 'DIRECT FIRE RANGE',
    },
    projectileVisual: 'modern_ordnance',
    muzzleVisual: 'modern_brake',
  },
  modern: {
    id: 'modern',
    name: 'Modern NATO Standard (STANAG / APP-6)',
    artilleryType: '155mm Howitzers & Precision Guided Munitions',
    directFireType: 'Assault Rifles & Automatic Weapons',
    closeDefenseType: 'Point Defense / APERS',
    skirmishScreenType: 'FLOT Recon Pickets & Screening Force',
    grandBatteryType: 'Massed Time-On-Target (TOT) Strike',
    counterBatteryType: 'Radar-Directed Counter-Battery (Q-36/Q-37)',
    supplyType: 'Class V Forward Logistics Element (FLE)',
    ammoNoun: 'Precision Munitions & Class V',
    meleeOnlyNoun: 'Close Quarters Battle (CQB) Only',
    troopNouns: {
      infantry: 'Infantrymen',
      cavalry: 'Armor / IFVs',
      artillery: 'Guns & Crew',
      supply: 'Support Echelons',
    },
    rangeLabels: {
      pointDefense: 'POINT DEFENSE (DIRECT FIRE)',
      indirectFire: 'INDIRECT FIRE RANGE (CFF)',
      directFire: 'DIRECT FIRE WEAPON RANGE',
    },
    projectileVisual: 'modern_ordnance',
    muzzleVisual: 'modern_brake',
  },
};

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  location: string;
  era?: CampaignEra;
  mapDimensions: { width: number; height: number };
  initialTimeMinutes: number; // e.g. 0 = 07:00
  endTimeMinutes: number; // e.g. 540 = 16:00
  units: Unit[];
  terrain: TerrainFeature[];
  objectives?: TacticalObjective[];
  historicalEvents: HistoricalEvent[];
  historicalDispatches?: HistoricalDispatch[];
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
  location?: Vector2D;
}

export interface BattleStateSnapshot {
  timeMinutes: number;
  units: Unit[];
  activeOrders: ManeuverOrder[];
  frenchLosses: number;
  alliedLosses: number;
  combatLogs: CombatLogEntry[];
}

export interface ActiveEngagement {
  id: string;
  name: string;
  sectorLocation: Vector2D;
  friendlyUnits: Unit[];
  enemyUnits: Unit[];
  friendlyCasualties: number;
  enemyCasualties: number;
  urgency: 'critical' | 'heavy' | 'skirmish' | 'favorable';
  statusText: string;
  needsReinforcements: boolean;
}

export type WargameSymbology = 'historical' | 'nato';

export interface TargetReferencePoint {
  id: string; // e.g. 'trp_1'
  code: string; // e.g. 'TRP 01'
  name: string; // e.g. 'Sokolnitz Defile'
  position: Vector2D;
  description: string;
  isRegistered?: boolean;
}

export interface SectorForceRatio {
  sector: 'north' | 'center' | 'south';
  sectorName: string;
  bluforStrength: number;
  opforStrength: number;
  ratio: number; // blufor / opfor
  status: 'favorable' | 'parity' | 'critical';
  statusLabel: string;
}

export interface SectorForceRatios {
  north: SectorForceRatio;
  center: SectorForceRatio;
  south: SectorForceRatio;
}

export type ContactType = 'direct_fire' | 'melee' | 'artillery_bombardment' | 'wavering' | 'routing';

export interface SitrepNotification {
  id: string;
  unitId: string;
  unitName: string;
  commander: string;
  corps: string;
  faction: Faction;
  contactType: ContactType;
  enemyUnitId?: string;
  enemyUnitName?: string;
  position: Vector2D;
  sectorName: string;
  timestamp: number; // in battle minutes
  formattedTime: string; // e.g. "07:18 AM"
  headline: string; // e.g. "IN CONTACT: Direct Musket Fire"
  message: string; // e.g. "3rd Line (Legrand) under heavy fire from Dokhturov Column at Telnitz!"
  morale: number;
  strength: number;
  read: boolean;
  dismissed: boolean;
  createdAtWallMs: number;
}

