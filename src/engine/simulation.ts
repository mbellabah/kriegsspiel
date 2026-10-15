import { Unit, ManeuverOrder, Scenario, TerrainFeature, CombatLogEntry, BattleStateSnapshot, HistoricalEvent, HistoricalDispatch, Vector2D, OperationalGraphic, ActiveEngagement, TargetReferencePoint, SectorForceRatios, WargameSymbology, TacticalObjective, Formation, CampaignEra, OrderCondition, OrderSource, ContactType, SitrepNotification, ERA_WEAPON_PROFILES } from '../types/game';
import { sounds } from './soundEffects';

export interface SimulationState {
  era: CampaignEra;
  playerFaction: 'french' | 'allies';
  timeMinutes: number;
  isRunning: boolean;
  speedMultiplier: number;
  isHistoricalMode: boolean;
  isFullHistoricalReplay: boolean;
  wargameSymbology: WargameSymbology;
  targetReferencePoints: TargetReferencePoint[];
  sectorForceRatios: SectorForceRatios;
  objectives: TacticalObjective[];
  units: Unit[];
  terrain: TerrainFeature[];
  activeOrders: ManeuverOrder[];
  frenchLosses: number;
  alliedLosses: number;
  combatLogs: CombatLogEntry[];
  selectedUnitId: string | null;
  selectedUnitIds: string[]; // Multi-unit group selection
  locatedUnitId: string | null;
  locatedUnitHighlightUntil?: number;
  sitrepNotifications: SitrepNotification[];
  fogOfWarEnabled: boolean;
  showOperationalGraphics: boolean;
  showArtilleryKillzones: boolean;
  showTopography: boolean;
  operationalGraphics: OperationalGraphic[];
  snapshots: BattleStateSnapshot[];
  lastHistoricalEventIndex: number;
  artilleryImpacts: {
    x: number;
    y: number;
    radius: number;
    timeMinutes: number;
    id: string;
    isSmoke?: boolean;
    isRicochet?: boolean;
    velocityHeading?: number;
    skipCount?: number;
    observerUnitId?: string; // ID of forward observer unit directing this fire mission
    isGrandBattery?: boolean; // Converged Grand Battery / TOT barrage
    isCounterBattery?: boolean; // Counter-battery fire mission
    isCaissonDetonation?: boolean; // Ammunition caisson explosion
  }[];
  iceCracks?: {
    x: number;
    y: number;
    radius: number;
    timeMinutes: number;
    shattered?: boolean;
  }[];
  activeEngagements: ActiveEngagement[];
  historicalDispatches?: HistoricalDispatch[];
  autoGeneralEnabled?: boolean;
}

export class BattleEngine {
  private scenario: Scenario;
  private state: SimulationState;
  private listeners: Array<(state: SimulationState) => void> = [];
  private logIdCounter = 0;
  private lastNotifyTime = 0;
  private lastTacticalEvalTime = 0;
  private accumulatedTacticalSeconds = 0;
  private accumulatedTacticalMinutes = 0;
  private lastSitrepTimes: Map<string, { timeMinutes: number; contactType: ContactType }> = new Map();

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.state = this.createInitialState();
    this.saveSnapshot();
  }

  private createInitialState(): SimulationState {
    const initialUnits: Unit[] = JSON.parse(JSON.stringify(this.scenario.units)).map((u: Unit) => {
      let aiRole = u.aiRole;
      if (!aiRole) {
        const corpsLower = (u.corps || '').toLowerCase();
        if (corpsLower.includes('guard') || corpsLower.includes('reserve')) {
          aiRole = 'reserve';
        } else if (u.type === 'artillery') {
          aiRole = 'artillery_support';
        } else if (u.type === 'cavalry') {
          aiRole = 'screen';
        } else {
          aiRole = 'assault';
        }
      }
      return {
        ...u,
        aiRole,
        ammo: u.ammo ?? (u.type === 'supply' ? 5000 : u.type === 'artillery' ? 60 : 45),
        maxAmmo: u.maxAmmo ?? (u.type === 'supply' ? 5000 : u.type === 'artillery' ? 60 : 45),
        detectionState: 'identified',
        isEncircled: false,
        canisterActive: false,
        directDefenseActive: false,
        hasTriggeredWaveringSitrep: false,
        isWadingRiver: false,
        isGarrisoned: false,
      };
    });

    const objectives: TacticalObjective[] = this.scenario.objectives
      ? JSON.parse(JSON.stringify(this.scenario.objectives))
      : [];

    const trps: TargetReferencePoint[] = [
      {
        id: 'trp_01',
        code: 'TRP 01',
        name: 'Sokolnitz Defile & Castle',
        position: { x: 960, y: 990 },
        description: 'Sokolnitz village choke point & Goldbach stream crossing',
        isRegistered: true,
      },
      {
        id: 'trp_02',
        code: 'TRP 02',
        name: 'Telnitz Crossing',
        position: { x: 915, y: 1215 },
        description: 'Southern flank highway entering Telnitz village',
        isRegistered: true,
      },
      {
        id: 'trp_03',
        code: 'TRP 03',
        name: 'Pratzen Crest',
        position: { x: 1500, y: 735 },
        description: 'Central plateau crest at Pratzen Heights summit',
        isRegistered: true,
      },
      {
        id: 'trp_04',
        code: 'TRP 04',
        name: 'Santon Hill Redoubt',
        position: { x: 1335, y: 232 },
        description: 'Olmütz highway north of Santon fortified artillery redoubt',
        isRegistered: true,
      },
      {
        id: 'trp_05',
        code: 'TRP 05',
        name: 'Puntowitz Stone Bridge',
        position: { x: 1028, y: 660 },
        description: 'Central stream crossing below western Pratzen slope',
        isRegistered: true,
      },
      {
        id: 'trp_06',
        code: 'TRP 06',
        name: 'Kobelnitz Mill Bridge',
        position: { x: 1042, y: 750 },
        description: 'Reserve deployment defile behind French center-right',
        isRegistered: true,
      },
    ];

    const initialForceRatios = this.computeSectorRatios(initialUnits, 'french');

    return {
      playerFaction: 'french',
      timeMinutes: this.scenario.initialTimeMinutes,
      isRunning: false,
      speedMultiplier: 1,
      isHistoricalMode: true,
      isFullHistoricalReplay: false,
      wargameSymbology: 'nato', // Standard NATO Wargaming Symbology by default
      targetReferencePoints: trps,
      sectorForceRatios: initialForceRatios,
      objectives,
      activeEngagements: [],
      historicalDispatches: this.scenario.historicalDispatches ? JSON.parse(JSON.stringify(this.scenario.historicalDispatches)) : [],
      autoGeneralEnabled: false,
      units: initialUnits,
      terrain: this.scenario.terrain,
      activeOrders: [],
      frenchLosses: 0,
      alliedLosses: 0,
      combatLogs: [
        {
          id: 'log_0',
          timeFormatted: '07:00 AM',
          message: 'The armies stand deployed in the dense Moravian mist across the Goldbach valley.',
          faction: 'french',
          importance: 'highlight',
        },
      ],
      selectedUnitId: 'fr_sthilaire',
      selectedUnitIds: ['fr_sthilaire'],
      locatedUnitId: null,
      sitrepNotifications: [],
      fogOfWarEnabled: false,
      showOperationalGraphics: true,
      operationalGraphics: [
        {
          id: 'pl_goldbach',
          type: 'phase_line',
          name: 'PL GOLDBACH',
          color: '#1e3a8a',
          points: [{ x: 1050, y: 100 }, { x: 1010, y: 700 }, { x: 940, y: 1250 }],
        },
        {
          id: 'pl_pratzen',
          type: 'phase_line',
          name: 'PL PRATZEN',
          color: '#1e3a8a',
          points: [{ x: 1590, y: 400 }, { x: 1500, y: 735 }, { x: 1300, y: 1200 }],
        },
        {
          id: 'obj_pratzen',
          type: 'objective',
          name: 'OBJ PRATZEN',
          color: '#1e3a8a',
          points: [{ x: 1500, y: 735 }],
        },
        {
          id: 'obj_sokolnitz',
          type: 'objective',
          name: 'OBJ SOKOLNITZ',
          color: '#1e3a8a',
          points: [{ x: 960, y: 990 }],
        },
        {
          id: 'fscl_north',
          type: 'fscl',
          name: 'FSCL BLASOWITZ',
          color: '#111111',
          points: [{ x: 1470, y: 270 }, { x: 1950, y: 270 }],
        },
      ],
      snapshots: [],
      lastHistoricalEventIndex: -1,
      artilleryImpacts: [],
      iceCracks: [],
      showArtilleryKillzones: true,
      showTopography: true,
      era: this.scenario.era || 'napoleonic',
    };
  }

  public getState(): SimulationState {
    return this.state;
  }

  public subscribe(listener: (state: SimulationState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public setRunning(running: boolean) {
    this.state.isRunning = running;
    this.notify();
  }

  public setSpeedMultiplier(mult: number) {
    this.state.speedMultiplier = mult;
    this.notify();
  }

  public setHistoricalMode(enabled: boolean) {
    this.state.isHistoricalMode = enabled;
    this.notify();
  }

  public setFullHistoricalReplay(enabled: boolean) {
    this.state.isFullHistoricalReplay = enabled;
    this.addLog(
      `[COMMAND MODE] ${enabled ? 'Full Historical Replay (AI directs French maneuvers)' : 'Player Direct Command (French units stand fast awaiting player orders)'}.`,
      'french',
      'highlight'
    );
    this.notify();
  }

  public toggleFullHistoricalReplay() {
    this.setFullHistoricalReplay(!this.state.isFullHistoricalReplay);
  }

  public getSitreps(): SitrepNotification[] {
    return this.state.sitrepNotifications || [];
  }

  public dismissSitrep(id: string) {
    if (!this.state.sitrepNotifications) return;
    this.state.sitrepNotifications = this.state.sitrepNotifications.filter((s) => s.id !== id);
    this.notify();
  }

  public dismissAllSitreps() {
    this.state.sitrepNotifications = [];
    this.notify();
  }

  public markSitrepRead(id: string) {
    const s = this.state.sitrepNotifications?.find((item) => item.id === id);
    if (s) {
      s.read = true;
      this.notify();
    }
  }

  public locateUnit(unitId: string): Vector2D | null {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit) return null;

    this.setSelectedUnit(unitId);
    this.state.locatedUnitId = unitId;
    this.state.locatedUnitHighlightUntil = Date.now() + 3500;

    if (this.state.sitrepNotifications) {
      for (const s of this.state.sitrepNotifications) {
        if (s.unitId === unitId) {
          s.read = true;
        }
      }
    }

    try {
      sounds.playMapSelect();
    } catch {}

    this.notify();
    return { ...unit.position };
  }

  public getSectorNameForPosition(pos: Vector2D): string {
    const SECTORS: Array<{ name: string; center: Vector2D; radius: number }> = [
      { name: 'Santon Hill Redoubt', center: { x: 1480, y: 320 }, radius: 450 },
      { name: 'Pratzen Heights Summit', center: { x: 1500, y: 720 }, radius: 420 },
      { name: 'Puntowitz Stone Bridge', center: { x: 1150, y: 700 }, radius: 400 },
      { name: 'Sokolnitz Defile & Castle', center: { x: 970, y: 940 }, radius: 380 },
      { name: 'Telnitz Crossing', center: { x: 950, y: 1250 }, radius: 400 },
      { name: 'Kobelnitz Mill', center: { x: 1042, y: 750 }, radius: 350 },
      { name: 'Staré Vinohrady', center: { x: 1650, y: 550 }, radius: 400 },
      { name: 'Goldbach Brook Valley', center: { x: 1050, y: 500 }, radius: 500 },
    ];

    let closest = SECTORS[0];
    let minD = Infinity;
    for (const sec of SECTORS) {
      const d = Math.hypot(sec.center.x - pos.x, sec.center.y - pos.y);
      if (d < minD) {
        minD = d;
        closest = sec;
      }
    }
    return closest.name;
  }

  public triggerContactSitrep(
    unit: Unit,
    contactType: ContactType,
    enemy?: Unit,
    details?: string
  ) {
    if (unit.faction !== this.state.playerFaction) return;
    if (unit.status === 'shattered') return;

    const lastRecord = this.lastSitrepTimes.get(unit.id);
    const nowMinutes = this.state.timeMinutes;

    const getEscalationRank = (type: ContactType): number => {
      switch (type) {
        case 'routing': return 4;
        case 'wavering': return 3;
        case 'melee': return 2;
        case 'direct_fire':
        case 'artillery_bombardment': return 1;
      }
    };

    if (lastRecord) {
      const isEscalation = getEscalationRank(contactType) > getEscalationRank(lastRecord.contactType);
      const minutesSinceLast = nowMinutes - lastRecord.timeMinutes;
      // Skip if same contact type or de-escalation within 15 battle minutes
      if (!isEscalation && minutesSinceLast < 15) {
        return;
      }
    }

    this.lastSitrepTimes.set(unit.id, { timeMinutes: nowMinutes, contactType });

    const sectorName = this.getSectorNameForPosition(unit.position);
    const formattedTime = this.formatTime(nowMinutes);

    let headline = '';
    let message = '';

    const enemyName = enemy?.name || 'Enemy forces';
    const enemyCommander = enemy?.commander ? ` (${enemy.commander})` : '';

    switch (contactType) {
      case 'direct_fire':
        headline = 'IN CONTACT: Direct Musket Fire';
        message = `${unit.name} taking heavy direct fire from ${enemyName}${enemyCommander} at ${sectorName}! Line holding.`;
        break;
      case 'melee':
        headline = 'IN CONTACT: Close-Quarters Melee!';
        message = `Hand-to-hand bayonet clash! ${unit.name} locked in brutal melee with ${enemyName} at ${sectorName}!`;
        break;
      case 'artillery_bombardment':
        headline = 'IN CONTACT: Artillery Bombardment!';
        message = `${unit.name} under indirect artillery bombardment at ${sectorName}! Shrapnel and round shot impacting!`;
        break;
      case 'wavering':
        headline = 'CRISIS: Line Wavering!';
        message = `Morale faltering! ${unit.name} wavering under intense fire (${Math.round(unit.morale)}% morale) at ${sectorName}! Reinforcements requested!`;
        break;
      case 'routing':
        headline = 'CRITICAL: Line Shattered / Routing!';
        message = `Line collapsed! ${unit.name} has broken and is routing in disorder from ${sectorName}!`;
        break;
    }

    if (details) {
      message += ` ${details}`;
    }

    const sitrep: SitrepNotification = {
      id: `sitrep_${unit.id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      unitId: unit.id,
      unitName: unit.name,
      commander: unit.commander,
      corps: unit.corps,
      faction: unit.faction,
      contactType,
      enemyUnitId: enemy?.id,
      enemyUnitName: enemy?.name,
      position: { ...unit.position },
      sectorName,
      timestamp: nowMinutes,
      formattedTime,
      headline,
      message,
      morale: Math.round(unit.morale),
      strength: Math.round(unit.strength),
      read: false,
      dismissed: false,
      createdAtWallMs: Date.now(),
    };

    this.state.sitrepNotifications = [sitrep, ...(this.state.sitrepNotifications || [])].slice(0, 25);

    this.addLog(
      `[SITREP: ${headline.toUpperCase()}] ${message}`,
      unit.faction,
      contactType === 'routing' || contactType === 'wavering' ? 'critical' : 'highlight'
    );

    try {
      sounds.playAlertPing();
    } catch {}

    this.notify();
  }

  public toggleAutoGeneral(enabled?: boolean) {
    this.state.autoGeneralEnabled = enabled !== undefined ? enabled : !this.state.autoGeneralEnabled;
    this.addLog(
      `[AUTO-GENERAL] Napoleon grand-tactical coordination ${this.state.autoGeneralEnabled ? 'ACTIVATED' : 'STANDBY'}.`,
      'french',
      'normal'
    );
    this.notify();
  }

  public isAutoGeneralEnabled(): boolean {
    return !!this.state.autoGeneralEnabled;
  }

  public setSelectedUnit(unitId: string | null) {
    this.state.selectedUnitId = unitId;
    this.state.selectedUnitIds = unitId ? [unitId] : [];
    this.notify();
  }

  public setSelectedUnits(unitIds: string[]) {
    this.state.selectedUnitIds = [...unitIds];
    this.state.selectedUnitId = unitIds.length > 0 ? unitIds[0] : null;
    this.notify();
  }

  public toggleFogOfWar() {
    this.state.fogOfWarEnabled = !this.state.fogOfWarEnabled;
    this.addLog(
      `Reconnaissance Fog of War ${this.state.fogOfWarEnabled ? 'ENABLED (Staff View)' : 'DISABLED (Referee View)'}.`,
      this.state.playerFaction,
      'highlight'
    );
    this.notify();
  }

  public setSymbologyMode(mode: WargameSymbology) {
    this.state.wargameSymbology = mode;
    this.addLog(
      `Tabletop symbology switched to ${mode === 'nato' ? 'NATO APP-6 Standard (BLUFOR / OPFOR)' : 'Historical Regimental (French / Allied)'}.`,
      this.state.playerFaction,
      'highlight'
    );
    this.notify();
  }

  public toggleSymbologyMode() {
    this.setSymbologyMode(this.state.wargameSymbology === 'nato' ? 'historical' : 'nato');
  }

  public computeSectorRatios(units: Unit[], playerFaction: 'french' | 'allies'): SectorForceRatios {
    const active = units.filter((u) => u.status !== 'shattered' && u.strength > 0);

    const getPower = (u: Unit) => {
      let p = u.strength * (u.morale / 100);
      if (u.type === 'artillery') p *= 2.2;
      if (u.type === 'guard') p *= 1.35;
      if (u.type === 'cavalry') p *= 1.15;
      if (u.formation === 'square') p *= 1.1;
      return p;
    };

    const sectors = [
      { key: 'north', name: 'Northern Flank (Santon / Olmütz)', check: (u: Unit) => u.position.y < 450 },
      { key: 'center', name: 'Center Sector (Pratzen / Plateau)', check: (u: Unit) => u.position.y >= 450 && u.position.y < 850 },
      { key: 'south', name: 'Southern Defiles (Sokolnitz / Telnitz)', check: (u: Unit) => u.position.y >= 850 },
    ] as const;

    const result: Partial<SectorForceRatios> = {};

    for (const sec of sectors) {
      const secUnits = active.filter(sec.check);
      const blufor = secUnits.filter((u) => u.faction === playerFaction).reduce((acc, u) => acc + getPower(u), 0);
      const opfor = secUnits.filter((u) => u.faction !== playerFaction).reduce((acc, u) => acc + getPower(u), 0);
      
      const rawRatio = opfor > 50 ? blufor / opfor : (blufor > 0 ? 4.0 : 1.0);
      const ratio = Math.round(rawRatio * 10) / 10;

      let status: 'favorable' | 'parity' | 'critical' = 'parity';
      let statusLabel = 'PARITY';

      if (ratio >= 2.0) {
        status = 'favorable';
        statusLabel = 'ASSAULT READY';
      } else if (ratio >= 1.3) {
        status = 'favorable';
        statusLabel = 'FAVORABLE';
      } else if (ratio <= 0.75) {
        status = 'critical';
        statusLabel = 'BREACH RISK';
      } else {
        status = 'parity';
        statusLabel = 'CONTESTED';
      }

      result[sec.key] = {
        sector: sec.key,
        sectorName: sec.name,
        bluforStrength: Math.round(blufor),
        opforStrength: Math.round(opfor),
        ratio,
        status,
        statusLabel,
      };
    }

    return result as SectorForceRatios;
  }

  public addOperationalGraphic(graphic: OperationalGraphic) {
    this.state.operationalGraphics = [...this.state.operationalGraphics, graphic];
    this.state.showOperationalGraphics = true;
    this.notify();
  }

  public removeOperationalGraphic(id: string) {
    this.state.operationalGraphics = this.state.operationalGraphics.filter((g) => g.id !== id);
    this.notify();
  }

  // Battle minutes for a formed body to march a straight route in column, sampling terrain every 20 px
  public estimateMarchMinutes(from: Vector2D, to: Vector2D, unitType: Unit['type'] = 'infantry'): number {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 1) return 0;
    const heading = Math.atan2(to.y - from.y, to.x - from.x);
    const baseVelocity = unitType === 'cavalry' ? 6.5 : unitType === 'artillery' ? 2.6 : unitType === 'headquarters' ? 5.0 : 3.8;
    const columnMod = 1.25;
    const steps = Math.max(1, Math.ceil(dist / 20));
    let seconds = 0;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      const mod = Math.max(0.05, this.getTerrainSpeedModifier(p, heading));
      seconds += dist / steps / (baseVelocity * columnMod * mod);
    }
    // 1 real second at 1x = 0.5 battle minutes
    return seconds * 0.5;
  }

  public toggleOperationalGraphics() {
    this.state.showOperationalGraphics = !this.state.showOperationalGraphics;
    this.notify();
  }

  public toggleArtilleryKillzones() {
    this.state.showArtilleryKillzones = !this.state.showArtilleryKillzones;
    this.notify();
  }

  public setArtilleryKillzones(enabled: boolean) {
    this.state.showArtilleryKillzones = enabled;
    this.notify();
  }

  public toggleTopography() {
    this.state.showTopography = !this.state.showTopography;
    this.notify();
  }

  public setTopography(enabled: boolean) {
    this.state.showTopography = enabled;
    this.notify();
  }

  public moveTRP(idOrCode: string, newPosition: Vector2D) {
    if (!this.state.targetReferencePoints) return;
    const clean = idOrCode.toLowerCase().replace(/[\s_-]/g, '');
    const trp = this.state.targetReferencePoints.find(
      (t) => t.id.toLowerCase().replace(/[\s_-]/g, '') === clean ||
             t.code.toLowerCase().replace(/[\s_-]/g, '') === clean
    );
    if (!trp) return;

    trp.position = {
      x: Math.max(50, Math.min(2350, Math.round(newPosition.x))),
      y: Math.max(50, Math.min(1450, Math.round(newPosition.y))),
    };

    // Find nearest terrain landmark or objective to update description
    let nearestName = '';
    let minD = Infinity;
    for (const t of this.state.terrain) {
      if (t.center && t.name) {
        const d = Math.hypot(t.center.x - trp.position.x, t.center.y - trp.position.y);
        if (d < minD) {
          minD = d;
          nearestName = t.name.replace(/\s*\([^)]*\)/g, '').trim();
        }
      }
    }
    for (const obj of this.state.objectives) {
      if (obj.position && obj.name) {
        const d = Math.hypot(obj.position.x - trp.position.x, obj.position.y - trp.position.y);
        if (d < minD) {
          minD = d;
          nearestName = obj.name;
        }
      }
    }
    if (nearestName && minD < 220) {
      trp.description = `Pre-registered firing point near ${nearestName}`;
    }

    this.addLog(
      `[TRP RE-SIGHTED] ${trp.code} relocated to (${trp.position.x}, ${trp.position.y}). Artillery fire control updated.`,
      'french',
      'highlight'
    );
    this.notify();
  }

  public registerTRP(name: string, position: Vector2D): TargetReferencePoint {
    if (!this.state.targetReferencePoints) {
      this.state.targetReferencePoints = [];
    }
    const nextNum = this.state.targetReferencePoints.length + 1;
    const code = `TRP ${String(nextNum).padStart(2, '0')}`;
    const newTrp: TargetReferencePoint = {
      id: `trp_${String(nextNum).padStart(2, '0')}`,
      code,
      name: name || `Firing Point ${code}`,
      position: {
        x: Math.max(50, Math.min(2350, Math.round(position.x))),
        y: Math.max(50, Math.min(1450, Math.round(position.y))),
      },
      description: `Tactical Target Reference Point at (${Math.round(position.x)}, ${Math.round(position.y)})`,
      isRegistered: true,
    };
    this.state.targetReferencePoints.push(newTrp);
    this.addLog(
      `[NEW TRP REGISTERED] ${code} established at (${newTrp.position.x}, ${newTrp.position.y}).`,
      'french',
      'highlight'
    );
    this.notify();
    return newTrp;
  }

  public issueGroupLineOrder(unitIds: string[], start: Vector2D, end: Vector2D, finalHeading?: number) {
    const validUnits = this.state.units.filter((u) => unitIds.includes(u.id) && u.status !== 'shattered');
    if (validUnits.length === 0) return;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lineLen = Math.hypot(dx, dy);

    // Default heading perpendicular to line
    const heading = finalHeading !== undefined 
      ? finalHeading 
      : Math.atan2(dy, dx) - Math.PI / 2;

    const n = validUnits.length;
    if (n === 1) {
      this.issueOrder(validUnits[0].id, {
        unitId: validUnits[0].id,
        type: 'assault',
        destination: lineLen < 15 ? start : { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        waypoints: [],
        finalHeading: heading,
        plannedTime: this.state.timeMinutes,
      });
      this.notify();
      return;
    }

    const minSpacing = 68; // Guaranteed open air interval between adjacent battalion counters
    const dirX = lineLen > 0.001 ? dx / lineLen : 1;
    const dirY = lineLen > 0.001 ? dy / lineLen : 0;
    const spacing = Math.max(minSpacing, lineLen / (n - 1));
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    validUnits.forEach((unit, idx) => {
      const offset = (idx - (n - 1) / 2) * spacing;
      const dest: Vector2D = {
        x: midX + dirX * offset,
        y: midY + dirY * offset,
      };

      this.issueOrder(unit.id, {
        unitId: unit.id,
        type: 'assault',
        destination: dest,
        waypoints: [],
        finalHeading: heading,
        plannedTime: this.state.timeMinutes,
      });
    });
    this.notify();
  }

  public issueGroupFormationMove(unitIds: string[], targetCenter: Vector2D) {
    const validUnits = this.state.units.filter((u) => unitIds.includes(u.id) && u.status !== 'shattered');
    if (validUnits.length === 0) return;

    if (validUnits.length === 1) {
      this.issueOrder(validUnits[0].id, {
        unitId: validUnits[0].id,
        type: 'assault',
        destination: targetCenter,
        waypoints: [],
        plannedTime: this.state.timeMinutes,
      });
      this.notify();
      return;
    }

    // Calculate current centroid
    let sumX = 0;
    let sumY = 0;
    for (const u of validUnits) {
      sumX += u.position.x;
      sumY += u.position.y;
    }
    const centroid = { x: sumX / validUnits.length, y: sumY / validUnits.length };
    const moveAngle = Math.atan2(targetCenter.y - centroid.y, targetCenter.x - centroid.x);

    // Compute relative destination offsets, ensuring all destinations maintain at least 68px spacing
    const dests: Vector2D[] = validUnits.map((unit) => ({
      x: targetCenter.x + (unit.position.x - centroid.x),
      y: targetCenter.y + (unit.position.y - centroid.y),
    }));

    const minSpacing = 68;
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < dests.length; i++) {
        for (let j = i + 1; j < dests.length; j++) {
          let dX = dests[j].x - dests[i].x;
          let dY = dests[j].y - dests[i].y;
          let d = Math.hypot(dX, dY);
          if (d < 0.01) {
            dX = (i % 2 === 0 ? 1 : -1) * 0.1;
            dY = (j % 2 === 0 ? 1 : -1) * 0.1;
            d = Math.hypot(dX, dY);
          }
          if (d < minSpacing) {
            const push = (minSpacing - d) / 2;
            dests[i].x -= (dX / d) * push;
            dests[i].y -= (dY / d) * push;
            dests[j].x += (dX / d) * push;
            dests[j].y += (dY / d) * push;
          }
        }
      }
    }

    validUnits.forEach((unit, idx) => {
      this.issueOrder(unit.id, {
        unitId: unit.id,
        type: 'assault',
        destination: dests[idx],
        waypoints: [],
        finalHeading: moveAngle,
        plannedTime: this.state.timeMinutes,
      });
    });
    this.notify();
  }

  public transferUnitCorps(unitId: string, newCorps: string) {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit) return;
    unit.corps = newCorps;
    this.notify();
  }

  public issueCorpsOrder(
    corpsName: string,
    order: {
      type: ManeuverOrder['type'];
      destination: Vector2D;
      waypoints?: Vector2D[];
      curveControl?: Vector2D;
      targetFormation?: Formation;
      delayMinutes?: number;
      isSmokeMission?: boolean;
      isForcedMarch?: boolean;
      source?: OrderSource;
      startTime?: number;
      endTime?: number;
      durationMinutes?: number;
      condition?: OrderCondition;
      chainedOrder?: Omit<ManeuverOrder, 'id' | 'status'>;
      observerUnitId?: string;
      supportingBatteryId?: string;
      holdFireThreshold?: number;
      suppressionTargetId?: string;
      isCounterBattery?: boolean;
      isGrandBattery?: boolean;
    }
  ) {
    const validUnits = this.state.units.filter(
      (u) => u.corps.toLowerCase() === corpsName.toLowerCase() && u.status !== 'shattered' && u.strength > 0
    );
    if (validUnits.length === 0) return;

    if (validUnits.length === 1) {
      this.issueOrder(validUnits[0].id, {
        unitId: validUnits[0].id,
        type: order.type,
        destination: order.destination,
        waypoints: order.waypoints ? [...order.waypoints] : [],
        curveControl: order.curveControl,
        targetFormation: order.targetFormation,
        plannedTime: this.state.timeMinutes,
        dispatchArrivalTime: order.delayMinutes ? this.state.timeMinutes + order.delayMinutes : undefined,
        isSmokeMission: order.isSmokeMission,
        isForcedMarch: order.isForcedMarch,
        source: order.source ?? 'player',
        startTime: order.startTime,
        endTime: order.endTime,
        durationMinutes: order.durationMinutes,
        condition: order.condition,
        chainedOrder: order.chainedOrder,
        observerUnitId: order.observerUnitId,
        supportingBatteryId: order.supportingBatteryId,
        holdFireThreshold: order.holdFireThreshold,
        suppressionTargetId: order.suppressionTargetId,
      });
      this.notify();
      return;
    }

    // Calculate current centroid of the corps
    let sumX = 0;
    let sumY = 0;
    for (const u of validUnits) {
      sumX += u.position.x;
      sumY += u.position.y;
    }
    const centroid = { x: sumX / validUnits.length, y: sumY / validUnits.length };
    const moveAngle = Math.atan2(order.destination.y - centroid.y, order.destination.x - centroid.x);

    // Compute relative destination offsets, ensuring all corps destinations maintain at least 68px spacing
    const dests: Vector2D[] = validUnits.map((unit) => ({
      x: order.destination.x + (unit.position.x - centroid.x),
      y: order.destination.y + (unit.position.y - centroid.y),
    }));

    const minSpacing = 68;
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < dests.length; i++) {
        for (let j = i + 1; j < dests.length; j++) {
          let dX = dests[j].x - dests[i].x;
          let dY = dests[j].y - dests[i].y;
          let d = Math.hypot(dX, dY);
          if (d < 0.01) {
            dX = (i % 2 === 0 ? 1 : -1) * 0.1;
            dY = (j % 2 === 0 ? 1 : -1) * 0.1;
            d = Math.hypot(dX, dY);
          }
          if (d < minSpacing) {
            const push = (minSpacing - d) / 2;
            dests[i].x -= (dX / d) * push;
            dests[i].y -= (dY / d) * push;
            dests[j].x += (dX / d) * push;
            dests[j].y += (dY / d) * push;
          }
        }
      }
    }

    validUnits.forEach((unit, idx) => {
      const offsetX = dests[idx].x - order.destination.x;
      const offsetY = dests[idx].y - order.destination.y;

      // Maintain corps formation geometry along curved waypoints and destination
      const unitWaypoints = order.waypoints && order.waypoints.length > 0
        ? order.waypoints.map((wp) => ({ x: wp.x + offsetX, y: wp.y + offsetY }))
        : [];

      const unitCurveControl = order.curveControl
        ? { x: order.curveControl.x + offsetX, y: order.curveControl.y + offsetY }
        : undefined;

      this.issueOrder(unit.id, {
        unitId: unit.id,
        type: order.type,
        destination: dests[idx],
        waypoints: unitWaypoints,
        curveControl: unitCurveControl,
        targetFormation: order.targetFormation,
        finalHeading: moveAngle,
        plannedTime: this.state.timeMinutes,
        dispatchArrivalTime: order.delayMinutes ? this.state.timeMinutes + order.delayMinutes : undefined,
        isSmokeMission: order.isSmokeMission,
        isForcedMarch: order.isForcedMarch,
        source: order.source ?? 'player',
        startTime: order.startTime,
        endTime: order.endTime,
        durationMinutes: order.durationMinutes,
        condition: order.condition,
        chainedOrder: order.chainedOrder,
        observerUnitId: order.observerUnitId,
        supportingBatteryId: order.supportingBatteryId,
        holdFireThreshold: order.holdFireThreshold,
        suppressionTargetId: order.suppressionTargetId,
        isCounterBattery: order.isCounterBattery,
        isGrandBattery: order.isGrandBattery,
      });
    });
    this.notify();
  }

  public resetBattle() {
    this.state = this.createInitialState();
    this.saveSnapshot();
    this.notify();
  }

  public issueOrder(unitId: string, order: Omit<ManeuverOrder, 'id' | 'status'>) {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit || unit.status === 'shattered' || unit.strength <= 0) return;

    const isPlayerFaction = unit.faction === this.state.playerFaction;
    const incomingSource: OrderSource = order.source ?? (isPlayerFaction ? 'player' : 'subordinate');

    // COUNTERMAND PROTECTION:
    // Subordinate AI and historical maneuvers must NEVER countermand active orders given by the player.
    if (isPlayerFaction && (incomingSource === 'subordinate' || incomingSource === 'historical_event')) {
      const activeOrder = unit.currentOrder;
      const hasActivePlayerOrder = activeOrder &&
        activeOrder.source === 'player' &&
        (activeOrder.status === 'delivering' || activeOrder.status === 'standby' || activeOrder.status === 'executing');

      if (hasActivePlayerOrder) {
        if (incomingSource === 'historical_event') {
          this.addLog(
            `[ORDERS SUPREMACY] ${unit.name} maintaining Imperial HQ orders. Scheduled theater maneuver disregarded.`,
            unit.faction,
            'normal'
          );
        }
        return; // Do NOT countermand Supreme HQ orders!
      }
    }

    let targetDest = { ...order.destination };
    let finalHeading = order.finalHeading;

    // PILLAR 1: FORWARD OBSERVER (FO) INITIATED CALL FOR FIRE
    // If a non-artillery unit (infantry, cavalry, guard, HQ) issues a bombard mission,
    // they act as a Forward Observer, designating the target and linking with supporting artillery.
    if (unit && unit.type !== 'artillery' && order.type === 'bombard') {
      let supportingBattery: Unit | undefined = undefined;
      if (order.supportingBatteryId) {
        supportingBattery = this.state.units.find(
          (u) => u.id === order.supportingBatteryId && u.faction === unit.faction && u.type === 'artillery' && u.status !== 'shattered' && u.strength > 0
        );
      }
      if (!supportingBattery) {
        const activeBatteries = this.state.units.filter(
          (u) => u.faction === unit.faction && u.type === 'artillery' && u.status !== 'shattered' && u.strength > 0 && u.ammo > 0
        );
        activeBatteries.sort(
          (a, b) => Math.hypot(a.position.x - targetDest.x, a.position.y - targetDest.y) -
                    Math.hypot(b.position.x - targetDest.x, b.position.y - targetDest.y)
        );
        supportingBattery = activeBatteries[0];
      }

      if (!supportingBattery) {
        this.addLog(
          `[CFF UNAVAILABLE] ${unit.name} requested fire mission on (${Math.round(targetDest.x)}, ${Math.round(targetDest.y)}), but no artillery batteries are in range or supplied with ammunition.`,
          unit.faction,
          'critical'
        );
        return;
      }

      // Link forward observer to supporting battery
      unit.observerForBatteryId = supportingBattery.id;
      unit.status = 'holding';
      const foOrder: ManeuverOrder = {
        ...order,
        id: `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        status: 'executing',
        type: 'bombard',
        supportingBatteryId: supportingBattery.id,
        destination: targetDest,
        source: incomingSource,
        waypoints: [],
      };
      unit.currentOrder = foOrder;
      this.state.activeOrders = this.state.activeOrders.filter((o) => o.unitId !== unitId);
      this.state.activeOrders.push(foOrder);

      // Dispatch bombardment fire mission to the supporting battery with observerUnitId
      this.issueOrder(supportingBattery.id, {
        unitId: supportingBattery.id,
        type: 'bombard',
        destination: targetDest,
        waypoints: [],
        plannedTime: order.plannedTime ?? this.state.timeMinutes,
        dispatchArrivalTime: order.dispatchArrivalTime ?? this.state.timeMinutes,
        source: incomingSource,
        observerUnitId: unit.id,
        isSmokeMission: order.isSmokeMission,
        startTime: order.startTime,
        endTime: order.endTime,
        durationMinutes: order.durationMinutes,
      });

      this.addLog(
        `[C2 / FORWARD OBSERVER] ${unit.name} established precision fire-support link with ${supportingBattery.name} targeting (${Math.round(targetDest.x)}, ${Math.round(targetDest.y)}). FO line-of-sight reduces dispersion by 75%.`,
        unit.faction,
        'highlight'
      );
      this.notify();
      return;
    }

    if (unit && order.type === 'hold') {
      // Check if destination is right on top of an enemy unit. If so, offset it to musket range (standoff).
      for (const other of this.state.units) {
        if (other.faction !== unit.faction && other.status !== 'shattered') {
          const dx = targetDest.x - other.position.x;
          const dy = targetDest.y - other.position.y;
          const distToEnemy = Math.hypot(dx, dy);
          if (distToEnemy < 25) {
            // Target is an enemy! Stand off at 25px to form a firing line.
            const angleFromEnemy = Math.atan2(unit.position.y - other.position.y, unit.position.x - other.position.x);
            targetDest = {
              x: other.position.x + Math.cos(angleFromEnemy) * 25,
              y: other.position.y + Math.sin(angleFromEnemy) * 25,
            };
            // Automatically face the enemy when arriving
            finalHeading = Math.atan2(other.position.y - targetDest.y, other.position.x - targetDest.x);
            break;
          }
        }
      }
    }

    let waypoints = order.waypoints ? [...order.waypoints] : [];
    // If curveControl is provided and waypoints are empty, interpolate smooth Bezier curve points
    if (order.curveControl && waypoints.length <= 1 && unit) {
      const p0 = { ...unit.position };
      const p1 = order.curveControl;
      const p2 = targetDest;
      const generated: Vector2D[] = [];
      const steps = 12;
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const inv = 1 - t;
        const x = inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x;
        const y = inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y;
        generated.push({ x, y });
      }
      generated.push(p2);
      waypoints = generated;
    }

    // Direct tactical orders and battle maneuvers execute immediately!
    const delayMinutes = 0;

    const isDelivering = order.dispatchArrivalTime !== undefined && order.dispatchArrivalTime > this.state.timeMinutes;
    const isStandby = !isDelivering && order.startTime !== undefined && order.startTime > this.state.timeMinutes;

    const newOrder: ManeuverOrder = {
      ...order,
      source: incomingSource,
      destination: targetDest,
      finalHeading,
      waypoints,
      dispatchArrivalTime: order.dispatchArrivalTime ?? (this.state.timeMinutes + delayMinutes),
      id: `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      status: isDelivering ? 'delivering' : isStandby ? 'standby' : 'executing',
    };

    if (unit) {
      if (isPlayerFaction && incomingSource === 'player' && unit.subordinateInitiativeActive) {
        this.addLog(
          `[ORDERS ACKNOWLEDGED] ${unit.name} received Imperial dispatch. Subordinate initiative suspended.`,
          unit.faction,
          'normal'
        );
      }
      unit.currentOrder = newOrder;
      unit.subordinateInitiativeActive = incomingSource === 'subordinate';

      if (order.type === 'volley') {
        unit.volleyReady = true;
        if (!newOrder.holdFireThreshold) {
          newOrder.holdFireThreshold = order.holdFireThreshold || 65;
        }
      } else {
        unit.volleyReady = false;
      }

      if (order.type === 'suppress') {
        unit.suppressingTargetId = order.suppressionTargetId || order.targetUnitId;
        if (!unit.suppressingTargetId) {
          const nearestEnemy = this.state.units.find(
            (u) => u.faction !== unit.faction && u.status !== 'shattered' && u.strength > 0 &&
                   Math.hypot(u.position.x - targetDest.x, u.position.y - targetDest.y) <= 80
          );
          if (nearestEnemy) {
            unit.suppressingTargetId = nearestEnemy.id;
          }
        }
      } else {
        unit.suppressingTargetId = undefined;
      }

      if (!isDelivering && !isStandby) {
        unit.isForcedMarch = !!order.isForcedMarch;
        const distToDest = Math.hypot(targetDest.x - unit.position.x, targetDest.y - unit.position.y);
        unit.status = order.type === 'charge' 
          ? 'charging' 
          : order.type === 'entrench' 
          ? 'entrenching' 
          : order.type === 'hold' || order.type === 'volley'
          ? 'holding'
          : order.type === 'suppress'
          ? 'engaging'
          : distToDest > (unit.range || 350) ? 'marching' : 'engaging';
      }
    }

    // Add to active orders
    this.state.activeOrders = this.state.activeOrders.filter((o) => o.unitId !== unitId);
    this.state.activeOrders.push(newOrder);

    const matchingTrp = this.state.targetReferencePoints?.find(
      (t) => Math.hypot(t.position.x - targetDest.x, t.position.y - targetDest.y) <= 35
    );

    let logMsg = '';
    const authorityPrefix = incomingSource === 'subordinate' ? '[SUBORDINATE INITIATIVE] ' : '';
    if (isStandby) {
      logMsg = `${authorityPrefix}${unit?.name || 'Unit'} STANDBY for scheduled order at ${this.formatTime(order.startTime!)}.`;
    } else if (order.isSmokeMission) {
      logMsg = `${authorityPrefix}${unit?.name || 'Unit'} laying TACTICAL SMOKE SCREEN ${matchingTrp ? `on ${matchingTrp.code} (${matchingTrp.name})` : `at (${Math.round(targetDest.x)}, ${Math.round(targetDest.y)})`}.`;
    } else if (order.type === 'volley') {
      logMsg = `${authorityPrefix}${unit?.name || 'Unit'} HOLDING FIRE for mass point-blank battalion volley within ${Math.round((newOrder.holdFireThreshold || 65) * 5)}m!`;
    } else if (order.type === 'suppress') {
      logMsg = `${authorityPrefix}${unit?.name || 'Unit'} laying CONTINUOUS SUPPRESSIVE COVERING FIRE to pin hostile forces!`;
    } else if (order.type === 'bombard') {
      logMsg = matchingTrp
        ? `${authorityPrefix}${unit?.name || 'Unit'} executing PRE-REGISTERED FIRE MISSION on ${matchingTrp.code} (${matchingTrp.name}).`
        : `${authorityPrefix}${unit?.name || 'Unit'} commencing CALL FOR FIRE bombardment mission.`;
    } else if (order.isForcedMarch) {
      logMsg = `${authorityPrefix}${unit?.name || 'Unit'} FORCING MARCH at the double (+45% speed) to destination.`;
    } else {
      logMsg = `${authorityPrefix}${unit?.name || 'Unit'} commencing ${order.type.toUpperCase()} maneuver.`;
    }

    if (order.endTime !== undefined) {
      logMsg += ` (until ${this.formatTime(order.endTime)})`;
    }
    if (order.condition) {
      logMsg += ` [COND: ${order.condition.description}]`;
    }

    this.addLog(
      logMsg,
      unit?.faction || 'french',
      order.type === 'bombard' || order.type === 'volley' || order.type === 'suppress' || order.isSmokeMission || order.isForcedMarch || isStandby ? 'highlight' : 'normal'
    );

    this.notify();
  }

  public toggleForceMarch(unitId: string, enabled?: boolean) {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit || unit.status === 'shattered') return;
    unit.isForcedMarch = enabled !== undefined ? enabled : !unit.isForcedMarch;
    if (unit.currentOrder) {
      unit.currentOrder.isForcedMarch = unit.isForcedMarch;
    }
    this.addLog(
      `${unit.name} ${unit.isForcedMarch ? 'engages FORCED MARCH (+45% speed, pushing through fatigue)' : 'resumes standard march pace'}.`,
      unit.faction,
      unit.isForcedMarch ? 'highlight' : 'normal'
    );
    this.notify();
  }

  public cancelOrder(unitId: string) {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (unit) {
      if (unit.observerForBatteryId) {
        const arty = this.state.units.find((u) => u.id === unit.observerForBatteryId);
        if (arty?.currentOrder) {
          arty.currentOrder.observerUnitId = undefined;
        }
        unit.observerForBatteryId = undefined;
      }
      unit.volleyReady = false;
      unit.suppressingTargetId = undefined;
      unit.currentOrder = undefined;
      unit.status = 'idle';
    }
    this.state.activeOrders = this.state.activeOrders.filter((o) => o.unitId !== unitId);
    this.notify();
  }

  public setUnitFormation(unitId: string, formation: Unit['formation']) {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (unit) {
      unit.formation = formation;
      if (formation === 'line') {
        unit.width = 74;
        unit.depth = 12;
      } else if (formation === 'column') {
        unit.width = 22;
        unit.depth = 54;
      } else if (formation === 'square') {
        unit.width = 36;
        unit.depth = 36;
      }
      this.addLog(
        `${unit.name} forms into ${formation.toUpperCase()}.`,
        unit.faction,
        'normal'
      );
      this.notify();
    }
  }

  public holdGround(unitId: string) {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (unit) {
      this.issueOrder(unitId, {
        unitId,
        type: 'hold',
        destination: { ...unit.position },
        waypoints: [],
        plannedTime: this.state.timeMinutes,
        source: 'player',
      });
      unit.morale = Math.min(100, unit.morale + 5);
      this.addLog(`${unit.name} anchors defensive line and holds ground by order of Supreme HQ.`, unit.faction, 'normal');
      this.notify();
    }
  }

  public splitUnit(unitId: string, detachStrength: number, newName?: string, newCorps?: string) {
    const parent = this.state.units.find((u) => u.id === unitId);
    if (!parent || detachStrength <= 0 || detachStrength >= parent.strength) return;

    const remainingStrength = parent.strength - detachStrength;
    const ratio = remainingStrength / parent.strength;
    const detachRatio = detachStrength / parent.strength;

    parent.strength = remainingStrength;
    parent.firepower = Math.max(10, Math.round(parent.firepower * ratio));
    parent.shockValue = Math.max(10, Math.round(parent.shockValue * ratio));

    // Place detached brigade to the right flank
    const flankAngle = parent.heading + Math.PI / 2;
    const offsetDist = 36;
    const newPos: Vector2D = {
      x: Math.max(40, Math.min(940, parent.position.x + Math.cos(flankAngle) * offsetDist)),
      y: Math.max(40, Math.min(580, parent.position.y + Math.sin(flankAngle) * offsetDist)),
    };

    let w = 50;
    let h = 16;
    if (parent.formation === 'line') {
      w = 64;
      h = 12;
    } else if (parent.formation === 'column') {
      w = 20;
      h = 46;
    } else if (parent.formation === 'square') {
      w = 32;
      h = 32;
    }

    const detachedUnit: Unit = {
      id: `${parent.id}_det_${Date.now()}`,
      name: newName || `${parent.name} (Brigade)`,
      commander: `Brigadier ${parent.commander.split(' ').pop() || 'Subordinate'}`,
      faction: parent.faction,
      type: parent.type,
      corps: newCorps || parent.corps,
      strength: detachStrength,
      initialStrength: detachStrength,
      morale: parent.morale,
      fatigue: parent.fatigue,
      suppression: parent.suppression,
      ammo: Math.round(parent.ammo * (detachStrength / parent.initialStrength)),
      maxAmmo: Math.round(parent.maxAmmo * (detachStrength / parent.initialStrength)),
      experience: parent.experience,
      position: { ...newPos },
      heading: parent.heading,
      speed: parent.speed,
      width: w,
      depth: h,
      formation: parent.formation,
      status: 'idle',
      firepower: Math.max(10, Math.round(parent.firepower * detachRatio)),
      shockValue: Math.max(10, Math.round(parent.shockValue * detachRatio)),
      range: parent.range,
      kills: 0,
      casualtiesTaken: 0,
    };

    this.state.units.push(detachedUnit);
    this.state.selectedUnitId = detachedUnit.id;

    this.addLog(
      `Detached ${detachStrength.toLocaleString()} troops from ${parent.name} to form ${detachedUnit.name}.`,
      parent.faction,
      'normal'
    );
    this.notify();
  }

  public toggleSkirmishScreen(unitId: string, enabled?: boolean) {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (!unit || unit.status === 'shattered') return;
    unit.isSkirmishScreenActive = enabled !== undefined ? enabled : !unit.isSkirmishScreenActive;
    const era = this.state.era || 'napoleonic';
    const profile = ERA_WEAPON_PROFILES[era] || ERA_WEAPON_PROFILES.napoleonic;
    const screenName = profile.skirmishScreenType || 'Skirmish Screen';
    this.addLog(
      `${unit.name} ${unit.isSkirmishScreenActive ? `deploys forward screen: ${screenName} (absorbs 35% incoming volleys, disrupts shock charges)` : 'recalls forward screen to main battle line'}.`,
      unit.faction,
      unit.isSkirmishScreenActive ? 'highlight' : 'normal'
    );
    this.notify();
  }

  public formGrandBattery(batteryIds: string[], leaderId?: string) {
    const batteries = this.state.units.filter(
      (u) => batteryIds.includes(u.id) && u.type === 'artillery' && u.status !== 'shattered'
    );
    if (batteries.length === 0) return;
    const chosenLeaderId = leaderId || batteries[0].id;
    const groupId = `gb_${Date.now()}`;
    for (const b of batteries) {
      b.grandBatteryGroupId = groupId;
      b.isGrandBatteryLeader = b.id === chosenLeaderId;
    }
    const leader = batteries.find((b) => b.id === chosenLeaderId) || batteries[0];
    const totalGuns = batteries.reduce((sum, b) => sum + b.strength, 0);
    const era = this.state.era || 'napoleonic';
    const profile = ERA_WEAPON_PROFILES[era] || ERA_WEAPON_PROFILES.napoleonic;
    const gbName = profile.grandBatteryType || 'Grand Battery';
    this.addLog(
      `[${gbName.toUpperCase()}] Formed massed artillery group under ${leader.name}: ${batteries.length} batteries converged (${totalGuns} guns synchronized for TOT bombardment).`,
      leader.faction,
      'highlight'
    );
    this.notify();
  }

  public disbandGrandBattery(groupIdOrBatteryId: string) {
    for (const b of this.state.units) {
      if (b.grandBatteryGroupId === groupIdOrBatteryId || b.id === groupIdOrBatteryId) {
        b.grandBatteryGroupId = undefined;
        b.isGrandBatteryLeader = false;
      }
    }
    this.addLog('Disbanded Grand Battery grouping. Batteries resume individual battery command.', this.state.playerFaction, 'normal');
    this.notify();
  }

  public issueCounterBattery(batteryId: string, targetUnitId: string) {
    const battery = this.state.units.find((u) => u.id === batteryId);
    const target = this.state.units.find((u) => u.id === targetUnitId);
    if (!battery || !target || battery.status === 'shattered') return;

    this.issueOrder(batteryId, {
      unitId: batteryId,
      type: 'bombard',
      destination: { ...target.position },
      waypoints: [],
      targetUnitId,
      isCounterBattery: true,
      plannedTime: this.state.timeMinutes,
      source: 'player',
    });
    const era = this.state.era || 'napoleonic';
    const profile = ERA_WEAPON_PROFILES[era] || ERA_WEAPON_PROFILES.napoleonic;
    const cbName = profile.counterBatteryType || 'Counter-Battery Fire';
    this.addLog(
      `[${cbName.toUpperCase()}] ${battery.name} assigned counter-battery mission against ${target.name}. Targeting enemy gun carriages & caissons.`,
      battery.faction,
      'highlight'
    );
    this.notify();
  }

  public issueGrandBatteryBombardment(leaderBatteryId: string, destination: Vector2D) {
    const leader = this.state.units.find((u) => u.id === leaderBatteryId);
    if (!leader || !leader.grandBatteryGroupId) {
      this.issueOrder(leaderBatteryId, {
        unitId: leaderBatteryId,
        type: 'bombard',
        destination,
        waypoints: [],
        plannedTime: this.state.timeMinutes,
        source: 'player',
      });
      return;
    }

    const groupBatteries = this.state.units.filter(
      (u) => u.grandBatteryGroupId === leader.grandBatteryGroupId && u.status !== 'shattered' && u.type === 'artillery'
    );

    for (const b of groupBatteries) {
      this.issueOrder(b.id, {
        unitId: b.id,
        type: 'bombard',
        destination: { ...destination },
        waypoints: [],
        isGrandBattery: true,
        plannedTime: this.state.timeMinutes,
        source: 'player',
      });
    }

    const totalGuns = groupBatteries.reduce((sum, b) => sum + b.strength, 0);
    this.addLog(
      `[MASSED CONVERGENCE] Grand Battery (${totalGuns} guns) converging synchronized Time-On-Target salvo at (${Math.round(destination.x)}, ${Math.round(destination.y)})!`,
      leader.faction,
      'critical'
    );
    this.notify();
  }

  private addLog(message: string, faction: Unit['faction'], importance: CombatLogEntry['importance']) {
    this.logIdCounter++;
    const formatted = this.formatTime(this.state.timeMinutes);
    // Attach the position of the first unit named in the entry so the log can jump the map there
    const subject = this.state.units.find((u) => message.includes(u.name));
    this.state.combatLogs.unshift({
      id: `log_${this.logIdCounter}`,
      timeFormatted: formatted,
      message,
      faction,
      importance,
      location: subject ? { ...subject.position } : undefined,
    });
    if (this.state.combatLogs.length > 60) {
      this.state.combatLogs.pop();
    }
  }

  public formatTime(minutesFromStart: number): string {
    const baseHour = 7; // 07:00
    const totalSeconds = Math.floor((baseHour * 60 + minutesFromStart) * 60);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours;
    return `${displayHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} ${period}`;
  }

  // Scrubbing to specific time
  public scrubToTime(targetMinutes: number) {
    // Find closest snapshot <= targetMinutes
    const validSnapshots = this.state.snapshots.filter((s) => s.timeMinutes <= targetMinutes);
    if (validSnapshots.length > 0) {
      const closest = validSnapshots[validSnapshots.length - 1];
      this.state.timeMinutes = closest.timeMinutes;
      this.state.units = JSON.parse(JSON.stringify(closest.units));
      this.state.activeOrders = JSON.parse(JSON.stringify(closest.activeOrders));
      this.state.frenchLosses = closest.frenchLosses;
      this.state.alliedLosses = closest.alliedLosses;
      this.state.combatLogs = JSON.parse(JSON.stringify(closest.combatLogs));
    } else {
      this.resetBattle();
    }
    this.notify();
  }

  private saveSnapshot() {
    // Keep snapshots every 5-10 minutes
    const snapshot: BattleStateSnapshot = {
      timeMinutes: this.state.timeMinutes,
      units: JSON.parse(JSON.stringify(this.state.units)),
      activeOrders: JSON.parse(JSON.stringify(this.state.activeOrders)),
      frenchLosses: this.state.frenchLosses,
      alliedLosses: this.state.alliedLosses,
      combatLogs: JSON.parse(JSON.stringify(this.state.combatLogs)),
    };
    this.state.snapshots.push(snapshot);
    if (this.state.snapshots.length > 80) {
      this.state.snapshots.shift();
    }
  }

  // Main simulation tick
  public tick(deltaSeconds: number = 0.016) {
    if (!this.state.isRunning) return;

    // Delta battle minutes: 1 real second at 1x = 0.5 battle minutes
    const battleMinutesDelta = deltaSeconds * 0.5 * this.state.speedMultiplier;
    this.state.timeMinutes += battleMinutesDelta;

    if (this.state.timeMinutes >= this.scenario.endTimeMinutes) {
      this.state.timeMinutes = this.scenario.endTimeMinutes;
      this.state.isRunning = false;
      this.addLog('The Battle of Austerlitz has concluded!', 'french', 'critical');
      this.notify();
      return;
    }

    // 1. Check Historical events triggers
    this.checkHistoricalEvents();

    // 2. Process unit movement & orders
    this.updateUnitMovements(deltaSeconds * this.state.speedMultiplier);

    // 2.2 Update unit terrain status (river wading, compound garrisons)
    this.updateUnitTerrainStatus();

    // 2.5 Resolve physical collisions so units don't overlap (standoff distances)
    this.resolveCollisions();

    // 3. Process combat and morale
    this.resolveCombat(deltaSeconds * this.state.speedMultiplier);
    this.updateEngagements();

    // 3.5 Artillery CFF impacts & AI fire missions run with live delta
    this.updateArtillery(battleMinutesDelta);
    this.updateAIArtillery(battleMinutesDelta);

    // 3.6 Heavy tactical assessments (Logistics, Tactical AI, Engineering, Encirclement, Fog of War, Sector Ratios)
    // Run at ~10Hz (or when accumulated delta >= 0.1s) to eliminate micro-stutters and keep FPS silky smooth
    this.accumulatedTacticalSeconds += deltaSeconds * this.state.speedMultiplier;
    this.accumulatedTacticalMinutes += battleMinutesDelta;

    const now = performance.now();
    if (this.accumulatedTacticalSeconds >= 0.1 || now - this.lastTacticalEvalTime >= 100) {
      const evalSeconds = this.accumulatedTacticalSeconds;
      const evalMinutes = this.accumulatedTacticalMinutes;
      this.accumulatedTacticalSeconds = 0;
      this.accumulatedTacticalMinutes = 0;
      this.lastTacticalEvalTime = now;

      this.updateLogistics(evalMinutes);
      this.updateTacticalAI(evalSeconds);
      this.updatePlayerSubordinateAI(evalSeconds);
      this.updateEngineering();
      this.updateEncirclement(evalSeconds);
      this.updateFogOfWar();
      this.state.sectorForceRatios = this.computeSectorRatios(this.state.units, this.state.playerFaction);
    }

    // 4. Save periodic snapshots (approx every 8 battle minutes)
    const lastSnap = this.state.snapshots[this.state.snapshots.length - 1];
    if (!lastSnap || this.state.timeMinutes - lastSnap.timeMinutes >= 8) {
      this.saveSnapshot();
    }

    // Throttle React UI state notifications to ~10Hz (every 100ms) to keep UI ultra responsive
    // and prevent React re-render thrashing, while canvas RAF runs silky smooth at 60 FPS.
    if (now - this.lastNotifyTime >= 100) {
      this.lastNotifyTime = now;
      this.notify();
    }
  }

  private checkHistoricalEvents() {
    for (let i = 0; i < this.scenario.historicalEvents.length; i++) {
      const event = this.scenario.historicalEvents[i];
      if (this.state.timeMinutes >= event.timeInMinutes && this.state.lastHistoricalEventIndex < i) {
        this.state.lastHistoricalEventIndex = i;
        this.addLog(`[HISTORICAL DISPATCH] ${event.title}: ${event.description}`, 'french', 'critical');

        // If in historical mode, trigger the historical orders
        if (this.state.isHistoricalMode) {
          this.triggerHistoricalManeuver(event);
        }
      }
    }
  }

  private triggerHistoricalManeuver(event: HistoricalEvent) {
    if (event.timeInMinutes === 0) {
      // 07:00 AM Opening Wheel: Allied left-wing columns descend from Pratzen; Bagration advances north; Davout forced march
      this.issueOrder('al_dokhturov', {
        unitId: 'al_dokhturov',
        type: 'assault',
        destination: { x: 630, y: 805 }, // Telnitz
        waypoints: [{ x: 740, y: 760 }, { x: 630, y: 805 }],
        plannedTime: 0,
      });
      this.issueOrder('al_langeron', {
        unitId: 'al_langeron',
        type: 'assault',
        destination: { x: 650, y: 675 }, // Sokolnitz
        waypoints: [{ x: 770, y: 640 }, { x: 650, y: 675 }],
        plannedTime: 0,
      });
      this.issueOrder('al_przhebishevsky', {
        unitId: 'al_przhebishevsky',
        type: 'assault',
        destination: { x: 665, y: 585 }, // Castle / Sokolnitz North
        waypoints: [{ x: 850, y: 500 }, { x: 665, y: 585 }],
        plannedTime: 0,
      });
      this.issueOrder('al_kollowrat', {
        unitId: 'al_kollowrat',
        type: 'assault',
        destination: { x: 780, y: 505 }, // Lower Pratzen slope
        waypoints: [{ x: 780, y: 505 }],
        plannedTime: 0,
      });
      this.issueOrder('al_bagration', {
        unitId: 'al_bagration',
        type: 'assault',
        destination: { x: 1080, y: 155 },
        waypoints: [{ x: 1200, y: 150 }, { x: 1080, y: 155 }],
        plannedTime: 0,
      });
      this.issueOrder('al_liechtenstein', {
        unitId: 'al_liechtenstein',
        type: 'flank',
        destination: { x: 1060, y: 220 },
        waypoints: [{ x: 1060, y: 220 }],
        plannedTime: 0,
      });

      // Player troops are dispatched strictly by the player by default.
      // Automated French orders only execute if Full Historical Replay is explicitly enabled.
      if (this.state.isFullHistoricalReplay) {
        this.issueOrder('fr_davout', {
          unitId: 'fr_davout',
          type: 'march',
          destination: { x: 560, y: 805 }, // Forced march to reinforce Telnitz
          waypoints: [{ x: 480, y: 830 }, { x: 560, y: 805 }],
          plannedTime: 0,
          source: 'historical_event',
        });
      }
    } else if (event.timeInMinutes === 60) {
      // 07:30 Dokhturov strikes Telnitz; Langeron advances on Sokolnitz
      this.issueOrder('al_dokhturov', {
        unitId: 'al_dokhturov',
        type: 'assault',
        destination: { x: 630, y: 805 }, // Telnitz
        waypoints: [{ x: 740, y: 760 }, { x: 630, y: 805 }],
        plannedTime: 60,
      });
      this.issueOrder('al_langeron', {
        unitId: 'al_langeron',
        type: 'assault',
        destination: { x: 650, y: 675 }, // Sokolnitz
        waypoints: [{ x: 770, y: 640 }, { x: 650, y: 675 }],
        plannedTime: 60,
      });
      this.issueOrder('al_przhebishevsky', {
        unitId: 'al_przhebishevsky',
        type: 'assault',
        destination: { x: 665, y: 585 }, // Castle / Sokolnitz North
        waypoints: [{ x: 850, y: 500 }, { x: 665, y: 585 }],
        plannedTime: 60,
      });
      if (this.state.isFullHistoricalReplay) {
        // Davout vanguard Friant arrives at Telnitz
        this.issueOrder('fr_friant', {
          unitId: 'fr_friant',
          type: 'assault',
          destination: { x: 590, y: 805 },
          waypoints: [{ x: 590, y: 805 }],
          plannedTime: 60,
          source: 'historical_event',
        });
      }
    } else if (event.timeInMinutes === 120) {
      // 08:45 "Sun of Austerlitz" - Soult strikes the Pratzen Heights
      if (this.state.isFullHistoricalReplay) {
        this.issueOrder('fr_sthilaire', {
          unitId: 'fr_sthilaire',
          type: 'assault',
          destination: { x: 915, y: 520 }, // Pratzen crest
          waypoints: [{ x: 800, y: 480 }, { x: 915, y: 520 }],
          curveControl: { x: 810, y: 465 },
          plannedTime: 120,
          source: 'historical_event',
        });
        this.issueOrder('fr_vandamme', {
          unitId: 'fr_vandamme',
          type: 'assault',
          destination: { x: 995, y: 460 }, // Staré Vinohrady
          waypoints: [{ x: 830, y: 415 }, { x: 995, y: 460 }],
          curveControl: { x: 820, y: 400 },
          plannedTime: 120,
          source: 'historical_event',
        });
      }
    } else if (event.timeInMinutes === 240) {
      // 10:45 Northern battle along Olmütz Highway
      if (this.state.isFullHistoricalReplay) {
        this.issueOrder('fr_lannes', {
          unitId: 'fr_lannes',
          type: 'assault',
          destination: { x: 1200, y: 155 },
          waypoints: [{ x: 1020, y: 180 }, { x: 1200, y: 155 }],
          plannedTime: 240,
          source: 'historical_event',
        });
        this.issueOrder('fr_murat', {
          unitId: 'fr_murat',
          type: 'assault',
          destination: { x: 1100, y: 210 },
          waypoints: [{ x: 840, y: 260 }, { x: 1100, y: 210 }],
          plannedTime: 240,
          source: 'historical_event',
        });
      }
      this.issueOrder('al_bagration', {
        unitId: 'al_bagration',
        type: 'assault',
        destination: { x: 1080, y: 170 },
        waypoints: [{ x: 1250, y: 120 }, { x: 1080, y: 170 }],
        plannedTime: 240,
      });
    } else if (event.timeInMinutes === 330) {
      // 12:30 Russian Guard counter-attack on Pratzen
      this.issueOrder('al_constantine', {
        unitId: 'al_constantine',
        type: 'assault',
        destination: { x: 1000, y: 470 },
        waypoints: [{ x: 1100, y: 520 }, { x: 1000, y: 470 }],
        plannedTime: 330,
      });
      if (this.state.isFullHistoricalReplay) {
        this.issueOrder('fr_bessieres', {
          unitId: 'fr_bessieres',
          type: 'assault',
          destination: { x: 945, y: 465 },
          waypoints: [{ x: 830, y: 360 }, { x: 945, y: 465 }],
          plannedTime: 330,
          source: 'historical_event',
        });
      }
    } else if (event.timeInMinutes === 420) {
      // 14:00 Soult sweeps south toward the frozen Satschan and Menitz ponds
      if (this.state.isFullHistoricalReplay) {
        this.issueOrder('fr_vandamme', {
          unitId: 'fr_vandamme',
          type: 'flank',
          destination: { x: 780, y: 830 },
          waypoints: [{ x: 910, y: 650 }, { x: 780, y: 830 }],
          curveControl: { x: 935, y: 725 },
          plannedTime: 420,
          source: 'historical_event',
        });
        this.issueOrder('fr_sthilaire', {
          unitId: 'fr_sthilaire',
          type: 'assault',
          destination: { x: 715, y: 775 },
          waypoints: [{ x: 815, y: 635 }, { x: 715, y: 775 }],
          plannedTime: 420,
          source: 'historical_event',
        });
      }
    }
  }

  private updateUnitMovements(effectiveSpeed: number) {
    // Clean up any stale activeOrders belonging to shattered/dead units or completed orders
    if (this.state.activeOrders.length > 0) {
      this.state.activeOrders = this.state.activeOrders.filter((order) => {
        const u = this.state.units.find((unit) => unit.id === order.unitId);
        return u && u.status !== 'shattered' && u.strength > 0 && order.status !== 'completed' && order.status !== 'cancelled';
      });
    }

    for (const unit of this.state.units) {
      if (unit.status === 'shattered' || unit.status === 'routing') {
        if (unit.currentOrder) {
          unit.currentOrder = undefined;
        }
        // Routing units drift backwards
        if (unit.status === 'routing') {
          const fleeDir = unit.faction === 'french' ? -1 : 1;
          unit.position.x += fleeDir * 0.4 * effectiveSpeed;
        }
        continue;
      }

      // Natural fatigue recovery when idle or holding ground
      if ((unit.status === 'idle' || unit.status === 'holding') && unit.fatigue > 0) {
        unit.fatigue = Math.max(0, unit.fatigue - 0.015 * effectiveSpeed);
      }

      if (!unit.currentOrder) continue;

      const order = unit.currentOrder;
      
      // COMMAND FRICTION: Wait for courier
      if (order.status === 'delivering') {
        if (this.state.timeMinutes >= (order.dispatchArrivalTime || 0)) {
          if (order.startTime !== undefined && order.startTime > this.state.timeMinutes) {
            order.status = 'standby';
            this.addLog(`${unit.name} received dispatch: standing by until ${this.formatTime(order.startTime)}.`, unit.faction, 'normal');
            continue;
          } else {
            order.status = 'executing';
            unit.isForcedMarch = order.isForcedMarch;
            unit.status = order.type === 'entrench' 
              ? 'entrenching' 
              : order.type === 'charge' 
              ? 'charging' 
              : order.type === 'hold'
              ? 'holding'
              : order.type === 'bombard'
              ? 'engaging'
              : 'marching';
            if (order.targetFormation) {
              unit.formation = order.targetFormation;
            }
            this.addLog(`${unit.name} received dispatch and is now executing orders.`, unit.faction, 'normal');
          }
        } else {
          continue; // Wait for the order to arrive
        }
      }

      // STANDBY TIMED ORDER: Wait until scheduled startTime
      if (order.status === 'standby') {
        if (this.state.timeMinutes >= (order.startTime || 0)) {
          order.status = 'executing';
          unit.isForcedMarch = order.isForcedMarch;
          unit.status = order.type === 'entrench' 
            ? 'entrenching' 
            : order.type === 'charge' 
            ? 'charging' 
            : order.type === 'hold'
            ? 'holding'
            : order.type === 'bombard'
            ? 'engaging'
            : 'marching';
          if (order.targetFormation) {
            unit.formation = order.targetFormation;
          }
          this.addLog(
            `[SCHEDULED START] ${this.formatTime(this.state.timeMinutes)}: ${unit.name} commencing scheduled order: ${order.type.toUpperCase()}.`,
            unit.faction,
            'highlight'
          );
        } else {
          continue; // Still on standby
        }
      }

      // TIMED ORDER EXPIRATION / "UNTIL" / DURATION:
      if (order.status === 'executing' && order.endTime !== undefined && this.state.timeMinutes >= order.endTime) {
        if (order.chainedOrder) {
          this.addLog(
            `[SCHEDULED TRANSITION] ${this.formatTime(this.state.timeMinutes)}: ${unit.name} completed timed directive. Commencing follow-up: ${order.chainedOrder.type.toUpperCase()}.`,
            unit.faction,
            'highlight'
          );
          const chained = { ...order.chainedOrder, plannedTime: this.state.timeMinutes };
          this.issueOrder(unit.id, chained);
          continue;
        } else {
          order.status = 'completed';
          unit.currentOrder = undefined;
          unit.status = order.type === 'hold' || order.type === 'entrench' ? 'holding' : 'idle';
          this.state.activeOrders = this.state.activeOrders.filter((o) => o.id !== order.id);
          this.addLog(
            `[SCHEDULED COMPLETION] ${this.formatTime(this.state.timeMinutes)}: ${unit.name} completed timed order.`,
            unit.faction,
            'normal'
          );
          continue;
        }
      }

      // TACTICAL CONTINGENCY CONDITIONS EVALUATION:
      if (order.condition && !order.condition.triggered) {
        let conditionMet = false;
        const cond = order.condition;

        if (cond.type === 'if_attacked') {
          if (unit.status === 'engaging' || unit.status === 'melee' || (unit.suppression && unit.suppression > 5)) {
            conditionMet = true;
          }
        } else if (cond.type === 'on_contact') {
          if (unit.status === 'engaging' || unit.status === 'melee') {
            conditionMet = true;
          } else {
            for (const enemy of this.state.units) {
              if (enemy.faction !== unit.faction && enemy.status !== 'shattered' && enemy.strength > 0) {
                const d = Math.hypot(enemy.position.x - unit.position.x, enemy.position.y - unit.position.y);
                if (d <= (unit.range || 350)) {
                  conditionMet = true;
                  break;
                }
              }
            }
          }
        } else if (cond.type === 'enemy_within') {
          const thresholdPx = (cond.triggerValue || 200) / 5;
          for (const enemy of this.state.units) {
            if (enemy.faction !== unit.faction && enemy.status !== 'shattered' && enemy.strength > 0) {
              const d = Math.hypot(enemy.position.x - unit.position.x, enemy.position.y - unit.position.y);
              if (d <= thresholdPx) {
                conditionMet = true;
                break;
              }
            }
          }
        } else if (cond.type === 'morale_below') {
          if (unit.morale <= (cond.triggerValue || 50)) {
            conditionMet = true;
          }
        } else if (cond.type === 'casualties_above') {
          const casualtyPct = ((unit.initialStrength - unit.strength) / unit.initialStrength) * 100;
          if (casualtyPct >= (cond.triggerValue || 25)) {
            conditionMet = true;
          }
        } else if (cond.type === 'outflanked') {
          if (unit.isEncircled) {
            conditionMet = true;
          }
        }

        if (conditionMet) {
          cond.triggered = true;
          this.addLog(
            `[CONTINGENCY TRIGGERED] ${unit.name}: Tactical trigger met (${cond.description}). Executing contingency response.`,
            unit.faction,
            'highlight'
          );

          if (cond.contingencyAction === 'square') {
            unit.formation = 'square';
            unit.status = 'holding';
            order.targetFormation = 'square';
            continue;
          } else if (cond.contingencyAction === 'retreat') {
            const retreatDest = cond.contingencyDestination || {
              x: Math.max(80, unit.position.x + (unit.faction === 'french' ? -180 : 180)),
              y: unit.position.y,
            };
            this.issueOrder(unit.id, {
              unitId: unit.id,
              type: 'retreat',
              destination: retreatDest,
              waypoints: [],
              plannedTime: this.state.timeMinutes,
            });
            continue;
          } else if (cond.contingencyAction === 'charge' || cond.contingencyAction === 'assault') {
            this.issueOrder(unit.id, {
              unitId: unit.id,
              type: 'charge',
              destination: order.destination,
              waypoints: [],
              plannedTime: this.state.timeMinutes,
            });
            continue;
          } else if (cond.contingencyAction === 'hold') {
            unit.status = 'holding';
            order.type = 'hold';
            continue;
          }
        }
      }

      // Entrench orders do not involve movement
      if (order.type === 'entrench') {
        continue;
      }

      // Autonomous advance into firing range for Bombardment (CFF) missions
      if (order.type === 'bombard') {
        if (order.targetUnitId) {
          const targetUnit = this.state.units.find(u => u.id === order.targetUnitId && u.status !== 'shattered');
          if (targetUnit) {
            order.destination = { ...targetUnit.position };
          }
        }

        const distToTarget = Math.hypot(order.destination.x - unit.position.x, order.destination.y - unit.position.y);
        const maxRange = unit.range || 350;
        const effectiveFiringDist = maxRange * 0.85;

        if (distToTarget <= maxRange) {
          // In range! Turn to face target, deploy battery, and stop moving
          const targetAngle = Math.atan2(order.destination.y - unit.position.y, order.destination.x - unit.position.x);
          let angleDiff = targetAngle - unit.heading;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          unit.heading += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 2.0 * effectiveSpeed);
          unit.status = 'engaging';
          continue; // Battery deployed in firing position
        }

        // Out of range! Advance battery towards firing position
        unit.status = 'marching';
        const angleToDest = Math.atan2(order.destination.y - unit.position.y, order.destination.x - unit.position.x);
        const intermediateTarget = {
          x: order.destination.x - Math.cos(angleToDest) * effectiveFiringDist,
          y: order.destination.y - Math.sin(angleToDest) * effectiveFiringDist,
        };

        const dx = intermediateTarget.x - unit.position.x;
        const dy = intermediateTarget.y - unit.position.y;
        const distToIntermediate = Math.hypot(dx, dy);

        if (distToIntermediate < 10) {
          unit.heading = angleToDest;
          unit.status = 'engaging';
          continue;
        }

        // Steer and march toward intermediateTarget
        const targetAngle = Math.atan2(dy, dx);
        let angleDiff = targetAngle - unit.heading;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        unit.heading += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), 1.6 * effectiveSpeed);

        const turnAlignment = Math.max(0.3, Math.cos(angleDiff));
        const terrainMod = this.getTerrainSpeedModifier(unit.position);
        const step = (unit.speed * 1.1) * terrainMod * turnAlignment * effectiveSpeed;
        unit.position.x += (dx / distToIntermediate) * step;
        unit.position.y += (dy / distToIntermediate) * step;
        unit.fatigue = Math.min(100, unit.fatigue + 0.015 * effectiveSpeed);
        continue;
      }

      // Dynamically track target unit if assigned
      if (order.targetUnitId) {
        const targetUnit = this.state.units.find(u => u.id === order.targetUnitId && u.status !== 'shattered');
        if (targetUnit) {
          order.destination = { ...targetUnit.position };
        } else {
          order.targetUnitId = undefined;
        }
      }

      // Target the active waypoint along the curved route, or final destination
      const currentTarget = (order.waypoints && order.waypoints.length > 0)
        ? order.waypoints[0]
        : order.destination;

      const dx = currentTarget.x - unit.position.x;
      const dy = currentTarget.y - unit.position.y;
      const dist = Math.hypot(dx, dy);

      // Advance to next waypoint if close enough
      if (order.waypoints && order.waypoints.length > 0 && dist < 18) {
        order.waypoints.shift();
        continue;
      }

      // Check if another friendly unit is already occupying or holding near the destination
      const isDestinationOccupied = !order.targetUnitId && this.state.units.some(
        other => other.id !== unit.id &&
                 other.faction === unit.faction &&
                 other.status !== 'shattered' &&
                 other.strength > 0 &&
                 Math.hypot(other.position.x - order.destination.x, other.position.y - order.destination.y) < 45
      );

      // Arrival threshold: march smoothly right to destination (dist <= 6px); if occupied, halt cleanly before crowding
      const arrivalThreshold = order.targetUnitId ? 38 : (isDestinationOccupied ? 48 : 6);
      if (dist <= arrivalThreshold && (!order.waypoints || order.waypoints.length === 0)) {
        if (!order.targetUnitId && !isDestinationOccupied && dist <= 6) {
          unit.position.x = order.destination.x;
          unit.position.y = order.destination.y;
        }
        if (order.finalHeading !== undefined) {
          unit.heading = order.finalHeading;
        }

        // If this is a hold order, maintain defensive stance at destination
        if (order.type === 'hold') {
          unit.status = 'holding';
          continue;
        }

        // If this order has an end time / duration (e.g. hold until 08:30 or for 30 minutes), maintain position until time arrives
        if (order.endTime !== undefined && this.state.timeMinutes < order.endTime) {
          unit.status = 'holding';
          continue;
        }

        // If there is a chained follow-up order (e.g. advance to TRP 01 then assault Pratzen):
        if (order.chainedOrder) {
          this.addLog(
            `[OBJECTIVE REACHED] ${unit.name} reached destination. Transitioning to follow-up order: ${order.chainedOrder.type.toUpperCase()}.`,
            unit.faction,
            'highlight'
          );
          const chained = { ...order.chainedOrder, plannedTime: this.state.timeMinutes };
          this.issueOrder(unit.id, chained);
          continue;
        }

        order.status = 'completed';
        unit.currentOrder = undefined;
        unit.status = order.targetUnitId ? (dist <= 42 ? 'melee' : 'engaging') : 'idle';
        this.state.activeOrders = this.state.activeOrders.filter((o) => o.id !== order.id);
        this.addLog(`${unit.name} has completed maneuver to destination.`, unit.faction, 'normal');
        continue;
      }

      // Rotate towards current target heading (wheeling maneuver with exact angular convergence)
      const targetAngle = Math.atan2(dy, dx);
      let angleDiff = targetAngle - unit.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Wheel towards target heading gracefully (deliberate battalion wheeling)
      const turnRate = 1.6;
      const maxTurn = turnRate * effectiveSpeed;
      if (Math.abs(angleDiff) <= maxTurn) {
        unit.heading = targetAngle;
      } else {
        unit.heading += Math.sign(angleDiff) * maxTurn;
      }

      // When wheeling sharply, forward advance is checked
      const turnAlignment = Math.max(0.25, Math.cos(angleDiff));

      // Terrain and slope speed modifier
      const terrainMod = this.getTerrainSpeedModifier(unit.position, unit.heading);
      const formationSpeedMod = unit.formation === 'column' ? 1.25 : unit.formation === 'square' ? 0.3 : 0.85;

      // Authentic Napoleonic march velocities (tuned so 0.5x is a smooth, perceptible slow-motion march)
      // Cavalry ~6.5 px/s, artillery ~2.6 px/s, headquarters ~5.0 px/s, infantry ~3.8 px/s
      let baseVelocity = unit.type === 'cavalry' ? 6.5 : unit.type === 'artillery' ? 2.6 : unit.type === 'headquarters' ? 5.0 : 3.8;

      // Forced march bonus (+45% speed)
      const isForcedMarch = !!(order.isForcedMarch || unit.isForcedMarch);
      if (isForcedMarch) {
        baseVelocity *= 1.45;
      }

      // Final bayonet/saber charge acceleration when charging or within close proximity of target
      if (order.type === 'charge' || (order.type === 'assault' && dist < 50)) {
        unit.status = 'charging';
        baseVelocity *= 1.45;
      } else if (unit.status !== 'entrenching' && unit.status !== 'melee') {
        unit.status = 'marching';
      }

      // Fatigue penalty on normal march (units with >70 fatigue slow down up to 25%, but forced march pushes through!)
      let fatiguePenalty = 1.0;
      if (!isForcedMarch && unit.fatigue > 70) {
        fatiguePenalty = Math.max(0.75, 1 - (unit.fatigue - 70) * 0.008);
      }

      // Natural suppression recovery over time
      if (unit.suppression && unit.suppression > 0) {
        unit.suppression = Math.max(0, unit.suppression - 1.5 * effectiveSpeed);
      }
      const suppressionPenalty = 1 - ((unit.suppression || 0) * 0.004); // Up to 40% slow under heavy suppression

      const moveStep = baseVelocity * unit.speed * terrainMod * formationSpeedMod * turnAlignment * suppressionPenalty * fatiguePenalty * effectiveSpeed;

      // Direct arrival step clamping: never overshoot destination or waypoint
      if (dist <= moveStep) {
        unit.position.x = currentTarget.x;
        unit.position.y = currentTarget.y;
      } else {
        unit.position.x += Math.cos(unit.heading) * moveStep;
        unit.position.y += Math.sin(unit.heading) * moveStep;
      }

      // Increase fatigue while marching (forced march tires units 2.5x faster; steep uphill march increases exertion)
      const lookaheadPos = {
        x: unit.position.x + Math.cos(unit.heading) * 15,
        y: unit.position.y + Math.sin(unit.heading) * 15,
      };
      const slopeUphill = Math.max(0, this.getElevation(lookaheadPos) - this.getElevation(unit.position));
      const slopeExertionMult = 1.0 + Math.min(2.0, (slopeUphill / 12) * 1.5);
      const fatigueRate = (isForcedMarch ? 0.025 : 0.01) * slopeExertionMult;
      unit.fatigue = Math.min(100, unit.fatigue + fatigueRate * effectiveSpeed);
    }
  }

  private resolveCollisions() {
    const units = this.state.units;
    const n = units.length;

    // Helper: compute oriented elliptical radius for unit along separation angle alpha
    const getUnitRadius = (u: Unit, alpha: number): number => {
      let a = Math.max(10, (u.depth || 20) / 2);
      let b = Math.max(22, (u.width || 52) / 2);
      if (u.formation === 'column') {
        a = Math.max((u.depth || 20) / 2, ((u.width || 52) / 2) * 0.75);
        b = Math.max(14, (u.depth || 20) / 2);
      } else if (u.formation === 'square') {
        a = b = 18;
      }
      const cosA = Math.cos(alpha);
      const sinA = Math.sin(alpha);
      const denom = Math.sqrt((b * cosA) * (b * cosA) + (a * sinA) * (a * sinA));
      return denom > 0.001 ? (a * b) / denom : a;
    };

    // 3 relaxation iterations ensure dense multi-unit lines settle cleanly without cascading vibrations
    for (let iter = 0; iter < 3; iter++) {
      for (let i = 0; i < n; i++) {
        const u1 = units[i];
        if (u1.status === 'shattered' || u1.strength <= 0) continue;

        for (let j = i + 1; j < n; j++) {
          const u2 = units[j];
          if (u2.status === 'shattered' || u2.strength <= 0) continue;

          let dx = u2.position.x - u1.position.x;
          let dy = u2.position.y - u1.position.y;
          // Ultra-fast AABB distance pruning before expensive trigonometry and square roots
          if (Math.abs(dx) > 75 || Math.abs(dy) > 75) continue;

          let dist = Math.hypot(dx, dy);

          // Handle exact coincidence (dist < 0.01) deterministically
          if (dist < 0.01) {
            dx = (i % 2 === 0 ? 1 : -1) * 0.1;
            dy = (j % 2 === 0 ? 1 : -1) * 0.1;
            dist = Math.hypot(dx, dy);
          }

          const angle = Math.atan2(dy, dx);
          const alpha1 = angle - u1.heading;
          const alpha2 = (angle + Math.PI) - u2.heading;

          const r1 = getUnitRadius(u1, alpha1);
          const r2 = getUnitRadius(u2, alpha2);
          const isFriendly = u1.faction === u2.faction;

          // Friendly units maintain a clear open air tactical interval between counters (min 30px)
          // Enemy units clash at an authentic melee standoff (min 22px) without overlapping counters
          const minStandoff = isFriendly
            ? Math.max(30, r1 + r2 + 2)
            : Math.max(22, r1 + r2);

          if (dist < minStandoff) {
            const overlap = minStandoff - dist;

            // Mass weighting: stationary/holding/entrenched units are heavier
            const isU1Fixed = u1.status === 'holding' || u1.status === 'entrenching';
            const isU2Fixed = u2.status === 'holding' || u2.status === 'entrenching';

            let w1: number;
            let w2: number;

            if (isU1Fixed && !isU2Fixed) {
              w1 = 0.05;
              w2 = 0.95;
            } else if (!isU1Fixed && isU2Fixed) {
              w1 = 0.95;
              w2 = 0.05;
            } else {
              w1 = 0.5;
              w2 = 0.5;
            }

            // Damped relaxation factor (0.5) eliminates overshooting and prevents cascading vibrations in clusters
            const relaxation = 0.5;
            const pushX = (dx / dist) * overlap * relaxation;
            const pushY = (dy / dist) * overlap * relaxation;

            u1.position.x -= pushX * w1;
            u1.position.y -= pushY * w1;
            u2.position.x += pushX * w2;
            u2.position.y += pushY * w2;

            // Clamp positions within battlefield bounds
            u1.position.x = Math.max(40, Math.min(2460, u1.position.x));
            u1.position.y = Math.max(40, Math.min(1560, u1.position.y));
            u2.position.x = Math.max(40, Math.min(2460, u2.position.x));
            u2.position.y = Math.max(40, Math.min(1560, u2.position.y));
          }
        }
      }
    }
  }

  private updateLogistics(deltaMinutes: number) {
    const supplyUnits = this.state.units.filter((u) => u.type === 'supply' && u.status !== 'shattered');
    const defaultResupplyRadius = 180; // ~900m in game scale

    // Reset resupply status on all non-supply units
    for (const unit of this.state.units) {
      if (unit.type !== 'supply') {
        unit.isResupplying = false;
      }
    }

    for (const unit of this.state.units) {
      if (unit.type === 'supply' || unit.status === 'shattered') continue;
      
      // If below max ammo, check for nearby friendly supply units
      if (unit.ammo < unit.maxAmmo) {
        for (const supply of supplyUnits) {
          if (supply.faction === unit.faction && supply.ammo > 0) {
            const resupplyRadius = supply.supplyRadius || defaultResupplyRadius;
            const dist = Math.hypot(supply.position.x - unit.position.x, supply.position.y - unit.position.y);
            if (dist < resupplyRadius) {
              const amountNeeded = unit.maxAmmo - unit.ammo;
              const transferRate = (unit.type === 'artillery' ? 15 : 35) * deltaMinutes;
              const transferAmount = Math.min(amountNeeded, transferRate, supply.ammo);
              
              const wasEmpty = unit.ammo <= 0;
              unit.ammo += transferAmount;
              supply.ammo -= transferAmount;
              unit.isResupplying = true;

              if (wasEmpty && unit.ammo > 0 && unit.faction === this.state.playerFaction) {
                this.addLog(
                  `[AMMUNITION RESTORED] ${unit.name} replenished by ${supply.name}. Ranged capability restored!`,
                  unit.faction,
                  'highlight'
                );
              }
              break; // Only resupply from one source at a time
            }
          }
        }
      }
    }
  }

  private updateArtillery(deltaMinutes: number) {
    // Clear old impacts (retaining craters and scorch marks for 1.2 minutes / 72 battle seconds)
    this.state.artilleryImpacts = this.state.artilleryImpacts.filter(
      (impact) => this.state.timeMinutes - impact.timeMinutes < 1.2
    );
    if (this.state.artilleryImpacts.length > 80) {
      this.state.artilleryImpacts = this.state.artilleryImpacts.slice(-80);
    }

    const artilleryUnits = this.state.units.filter(
      (u) => u.type === 'artillery' && u.currentOrder?.status === 'executing' && u.currentOrder.type === 'bombard' && u.status !== 'shattered'
    );

    for (const arty of artilleryUnits) {
      if (arty.ammo <= 0) {
        if (arty.status !== 'idle') {
          arty.status = 'idle';
          arty.currentOrder = undefined;
          this.addLog(`${arty.name} is out of ammunition! CFF halted.`, arty.faction, 'critical');
        }
        continue;
      }

      const dest = arty.currentOrder!.destination;
      const dist = Math.hypot(dest.x - arty.position.x, dest.y - arty.position.y);
      
      // Out of range check (only fire when deployed within range)
      if (dist > arty.range * 1.05) {
        continue; 
      }

      // Smoothbore firing interval: 1 barrage salvo every ~0.35 battle minutes (~3.5s real time)
      if (arty.reloadTimer === undefined) arty.reloadTimer = 0;
      arty.reloadTimer += deltaMinutes;

      const fireCadence = 0.35;
      if (arty.reloadTimer >= fireCadence) {
        arty.reloadTimer = 0;
        arty.ammo = Math.max(0, arty.ammo - 2);
        arty.status = 'engaging';

        // Check elevation line-of-sight & defilade (smoothbore flat trajectory blocked by hill crests)
        const los = this.checkLineOfSight(arty.position, dest);
        const artyElev = this.getElevation(arty.position);
        const targetElev = this.getElevation(dest);
        const isPlunging = artyElev - targetElev > 30;
        const defiladeMult = los.inDefilade ? 0.15 : (isPlunging ? 1.25 : 1.0);
        const scatterMultiplier = los.inDefilade ? 2.2 : 1.0;

        // Check if destination is registered TRP (Pre-planned Target Reference Point)
        const matchingTrp = this.state.targetReferencePoints?.find(
          (t) => Math.hypot(t.position.x - dest.x, t.position.y - dest.y) <= 35
        );
        const trpDispersionDiscount = matchingTrp ? 0.35 : 1.0; // 65% reduction in dispersion for pre-registered TRP

        // PILLAR 1: FORWARD OBSERVER (FO) PRECISION C2 ADJUSTMENT LINK
        let foDispersionDiscount = 1.0;
        let activeObserver: Unit | null = null;
        if (arty.currentOrder?.observerUnitId) {
          const obs = this.state.units.find((u) => u.id === arty.currentOrder?.observerUnitId);
          if (obs && obs.status !== 'shattered' && obs.strength > 0) {
            const obsLos = this.checkLineOfSight(obs.position, dest);
            if (!obsLos.inDefilade) {
              // Direct Line-of-Sight from Forward Observer reduces scatter by 75%!
              foDispersionDiscount = 0.25;
              activeObserver = obs;
            }
          }
        }

        // Grand Battery Convergence: 2+ batteries of same faction firing at destinations within 65px, or explicit leader
        const convergingBatteries = artilleryUnits.filter(
          (other) => other.faction === arty.faction && other.currentOrder?.destination && Math.hypot(other.currentOrder.destination.x - dest.x, other.currentOrder.destination.y - dest.y) <= 65
        );
        const isGrandBatteryConvergence = convergingBatteries.length >= 2 || !!arty.isGrandBatteryLeader || !!arty.currentOrder?.isGrandBattery;
        const isExplicitCounterBattery = !!arty.currentOrder?.isCounterBattery;

        const isSmoke = !!arty.currentOrder?.isSmokeMission;
        const blastRadius = isSmoke ? 48 : (isGrandBatteryConvergence ? 44 : 32); // Grand Battery expands massed beaten zone

        // Authentic smoothbore ballistic dispersion (reduced by 75% under FO observation, and 65% on TRP)
        const scatterRadius = Math.max(4, (10 + dist * 0.16) * scatterMultiplier * trpDispersionDiscount * foDispersionDiscount); 
        const impactX = dest.x + (Math.random() - 0.5) * scatterRadius;
        const impactY = dest.y + (Math.random() - 0.5) * scatterRadius;

        const impactElev = this.getElevation({ x: impactX, y: impactY });
        const terrainAtImpact = this.getTerrainAt({ x: impactX, y: impactY });
        const isMudOrWater = impactElev <= 180 || terrainAtImpact?.type === 'lake' || terrainAtImpact?.type === 'marsh';
        const isCompound = terrainAtImpact?.type === 'village';

        let triggeredCaissonExplosion = false;
        this.state.artilleryImpacts.push({
          x: impactX,
          y: impactY,
          radius: blastRadius,
          timeMinutes: this.state.timeMinutes,
          id: `impact_${Date.now()}_${Math.random()}`,
          isSmoke,
          observerUnitId: activeObserver?.id,
          isGrandBattery: isGrandBatteryConvergence,
          isCounterBattery: isExplicitCounterBattery,
        });

        if (isSmoke) {
          // Smoke Screen: Does not inflict kinetic casualties, but suppresses units and blocks LOS
          for (const target of this.state.units) {
            if (target.status === 'shattered') continue;
            const d = Math.hypot(target.position.x - impactX, target.position.y - impactY);
            if (d <= blastRadius) {
              target.suppression = Math.min(100, (target.suppression || 0) + 12);
            }
          }
        } else {
          // High Explosive / Solid Shot: Resolve AOE Damage with smooth falloff, Suppression & Morale Shock
          for (const target of this.state.units) {
            if (target.status === 'shattered') continue;
            
            const d = Math.hypot(target.position.x - impactX, target.position.y - impactY);
            if (d <= blastRadius) {
              const distRatio = Math.min(1, d / blastRadius);
              let damage = (arty.firepower * 0.65) * Math.pow(1 - distRatio, 1.8);
              // Columns take extra damage from primary direct artillery blast
              if (target.formation === 'column') {
                damage *= 1.35;
              }
              // Grand Battery / Massed Fire Support Convergence bonus: +40% concentrated kinetic shock
              if (isGrandBatteryConvergence) {
                damage *= 1.40;
              }

              // Compound & village cover: Grand Battery massed fires breach 50% of stone cover
              let cover = this.getTerrainCover(target.position);
              if (isGrandBatteryConvergence && (isCompound || target.isGarrisoned)) {
                cover *= 0.50; // Breaching bonus against fortified strongpoints
              }
              const finalDamage = damage * (1 - cover) * defiladeMult;
              
              // Counter-Battery Fire: targeting enemy artillery directly disables guns
              const isTargetArtillery = target.type === 'artillery';
              if (isTargetArtillery && (isExplicitCounterBattery || target.currentOrder?.type === 'bombard')) {
                const gunKnockoutRatio = isExplicitCounterBattery ? 0.30 : 0.15;
                const gunsKnockedOut = Math.max(1, Math.round(finalDamage * gunKnockoutRatio));
                target.gunsDisabled = (target.gunsDisabled || 0) + gunsKnockedOut;
                target.strength = Math.max(0, target.strength - gunsKnockedOut);
                target.firepower = Math.max(10, Math.round(target.firepower * (1 - gunsKnockedOut / Math.max(1, target.initialStrength))));
                target.suppression = Math.min(100, (target.suppression || 0) + (isExplicitCounterBattery ? 50 : 25));

                // Catastrophic Caisson Explosion (ammunition detonation)
                const caissonChance = isExplicitCounterBattery ? 0.08 : 0.03;
                if (!triggeredCaissonExplosion && Math.random() < caissonChance) {
                  triggeredCaissonExplosion = true;
                  const caissonLosses = Math.min(target.strength, Math.round(target.strength * 0.30 + 2));
                  target.strength = Math.max(0, target.strength - caissonLosses);
                  target.gunsDisabled = (target.gunsDisabled || 0) + 2;
                  target.morale = Math.max(0, target.morale - 35);
                  target.suppression = 100;
                  this.addLog(
                    `[CAISSON DETONATION] Counter-battery strike triggered an ammunition caisson explosion in ${target.name}! Severe damage & morale shock!`,
                    target.faction,
                    'critical'
                  );
                  const lastImpact = this.state.artilleryImpacts[this.state.artilleryImpacts.length - 1];
                  if (lastImpact) lastImpact.isCaissonDetonation = true;
                }
              } else {
                target.strength = Math.max(0, target.strength - finalDamage);
              }

              target.casualtiesTaken += finalDamage;
              target.suppression = Math.min(100, (target.suppression || 0) + damage * (isGrandBatteryConvergence ? 0.45 : 0.25));
              target.morale = Math.max(0, target.morale - (finalDamage / target.initialStrength) * (isGrandBatteryConvergence ? 110 : 75));

              if (activeObserver) {
                activeObserver.kills += Math.round(finalDamage * 0.3); // FO spotter assist kills
              }

              if (target.faction === 'french') {
                this.state.frenchLosses += finalDamage;
              } else {
                this.state.alliedLosses += finalDamage;
              }

              if (finalDamage > 5 && target.faction === this.state.playerFaction) {
                this.triggerContactSitrep(target, 'artillery_bombardment', arty);
              }

              // Immediately check morale status for potential shattering or routing
              this.updateMoraleStatus(target);
            }
          }

          // FROZEN LAKE ICE IMPACTS: Satschan & Menitz Ponds
          const isPondImpact = (
            impactElev <= 185 || 
            terrainAtImpact?.type === 'lake' ||
            Math.hypot(impactX - 990, impactY - 1380) <= 80 ||
            Math.hypot(impactX - 1230, impactY - 1400) <= 85
          ) && impactY > 1250 && impactX >= 880 && impactX <= 1400;
          if (isPondImpact && !isSmoke) {
            this.state.iceCracks = this.state.iceCracks || [];
            this.state.iceCracks.push({
              x: impactX,
              y: impactY,
              radius: blastRadius * 1.15,
              timeMinutes: this.state.timeMinutes,
              shattered: true,
            });
            if (this.state.iceCracks.length > 35) {
              this.state.iceCracks.shift();
            }

            // Troops on or adjacent to fractured ice suffer cold water immersion & drowning shock
            for (const target of this.state.units) {
              if (target.status === 'shattered') continue;
              const d = Math.hypot(target.position.x - impactX, target.position.y - impactY);
              if (d <= blastRadius * 1.35) {
                const iceDrownLosses = Math.min(target.strength, Math.round(target.strength * 0.08 + 20));
                target.strength = Math.max(0, target.strength - iceDrownLosses);
                target.casualtiesTaken += iceDrownLosses;
                target.morale = Math.max(0, target.morale - 28);
                target.suppression = 100;
                if (target.faction === 'french') {
                  this.state.frenchLosses += iceDrownLosses;
                } else {
                  this.state.alliedLosses += iceDrownLosses;
                }
                this.addLog(
                  `[FROZEN POND SHATTERED] Artillery plunged through ice at Satschan/Menitz! ${target.name} suffering plunging ice casualties!`,
                  target.faction,
                  'critical'
                );
                this.updateMoraleStatus(target);
              }
            }
          }

          // GRAZING & RICOCHET BALLISTICS:
          // Solid round shot skips forward across dry, firm plateau soils (>= 190m elevation)
          // Low marshlands (<= 180m), ponds, and thick stone villages swallow the cannonball with 0 bounce.
          const isSolidRoundShot = (this.state.era || 'napoleonic') === 'napoleonic' || (this.state.era || 'napoleonic') === 'blackpowder';
          if (isSolidRoundShot && !isMudOrWater && !isCompound && impactElev >= 190) {
            const heading = Math.atan2(impactY - arty.position.y, impactX - arty.position.x);

            // Skip 1: Grazing ricochet +36px forward
            const skip1X = impactX + Math.cos(heading) * 36;
            const skip1Y = impactY + Math.sin(heading) * 36;
            const skip1Elev = this.getElevation({ x: skip1X, y: skip1Y });
            const skip1Terrain = this.getTerrainAt({ x: skip1X, y: skip1Y });

            this.state.artilleryImpacts.push({
              x: skip1X,
              y: skip1Y,
              radius: 20,
              timeMinutes: this.state.timeMinutes,
              id: `ricochet_1_${Date.now()}_${Math.random()}`,
              isSmoke: false,
              isRicochet: true,
              skipCount: 1,
              velocityHeading: heading,
              observerUnitId: activeObserver?.id,
            });

            // Skip 1 grazing damage (60% power)
            for (const target of this.state.units) {
              if (target.status === 'shattered') continue;
              const d = Math.hypot(target.position.x - skip1X, target.position.y - skip1Y);
              if (d <= 22) {
                const distRatio = Math.min(1, d / 22);
                let damage = (arty.firepower * 0.65 * 0.60) * Math.pow(1 - distRatio, 1.5);
                // Column formation vulnerability: solid ball bowling through ranks
                if (target.formation === 'column') {
                  damage *= 1.65;
                }
                const cover = this.getTerrainCover(target.position);
                const finalDamage = damage * (1 - cover) * defiladeMult;

                target.strength = Math.max(0, target.strength - finalDamage);
                target.casualtiesTaken += finalDamage;
                target.suppression = Math.min(100, (target.suppression || 0) + damage * 0.20);
                target.morale = Math.max(0, target.morale - (finalDamage / target.initialStrength) * 60);

                if (activeObserver) {
                  activeObserver.kills += Math.round(finalDamage * 0.3);
                }

                if (target.faction === 'french') {
                  this.state.frenchLosses += finalDamage;
                } else {
                  this.state.alliedLosses += finalDamage;
                }
                this.updateMoraleStatus(target);
              }
            }

            // Skip 2: Secondary grazing ricochet +24px forward (if still on open firm ground)
            if (skip1Elev >= 190 && skip1Terrain?.type !== 'lake' && skip1Terrain?.type !== 'marsh' && skip1Terrain?.type !== 'village') {
              const skip2X = skip1X + Math.cos(heading) * 24;
              const skip2Y = skip1Y + Math.sin(heading) * 24;

              this.state.artilleryImpacts.push({
                x: skip2X,
                y: skip2Y,
                radius: 14,
                timeMinutes: this.state.timeMinutes,
                id: `ricochet_2_${Date.now()}_${Math.random()}`,
                isSmoke: false,
                isRicochet: true,
                skipCount: 2,
                velocityHeading: heading,
                observerUnitId: activeObserver?.id,
              });

              // Skip 2 grazing damage (35% power)
              for (const target of this.state.units) {
                if (target.status === 'shattered') continue;
                const d = Math.hypot(target.position.x - skip2X, target.position.y - skip2Y);
                if (d <= 16) {
                  const distRatio = Math.min(1, d / 16);
                  let damage = (arty.firepower * 0.65 * 0.35) * Math.pow(1 - distRatio, 1.5);
                  if (target.formation === 'column') {
                    damage *= 1.65;
                  }
                  const cover = this.getTerrainCover(target.position);
                  const finalDamage = damage * (1 - cover) * defiladeMult;

                  target.strength = Math.max(0, target.strength - finalDamage);
                  target.casualtiesTaken += finalDamage;
                  target.suppression = Math.min(100, (target.suppression || 0) + damage * 0.15);
                  target.morale = Math.max(0, target.morale - (finalDamage / target.initialStrength) * 45);

                  if (activeObserver) {
                    activeObserver.kills += Math.round(finalDamage * 0.3);
                  }

                  if (target.faction === 'french') {
                    this.state.frenchLosses += finalDamage;
                  } else {
                    this.state.alliedLosses += finalDamage;
                  }
                  this.updateMoraleStatus(target);
                }
              }
            }
          }
        }
      }
    }
  }

  private updateAIArtillery(_deltaMinutes: number) {
    if (!this.state.isRunning) return;

    const aiFaction = this.state.playerFaction === 'french' ? 'allies' : 'french';
    const playerFaction = this.state.playerFaction;

    const aiArtillery = this.state.units.filter(
      (u) => u.faction === aiFaction && u.type === 'artillery' && u.status !== 'shattered' && u.ammo > 0
    );

    const playerTargets = this.state.units.filter(
      (u) => u.faction === playerFaction && u.status !== 'shattered'
    );

    for (const arty of aiArtillery) {
      // If already executing a valid bombardment on a live target in range, let it continue
      if (arty.currentOrder?.type === 'bombard' && arty.currentOrder.status === 'executing') {
        const dest = arty.currentOrder.destination;
        const d = Math.hypot(dest.x - arty.position.x, dest.y - arty.position.y);
        if (d <= (arty.range || 330) * 1.05) {
          if (arty.currentOrder.targetUnitId) {
            const tgt = this.state.units.find((u) => u.id === arty.currentOrder?.targetUnitId);
            if (tgt && tgt.status !== 'shattered') {
              continue;
            }
          } else {
            continue;
          }
        }
      }

      // Search for optimal French target in range
      let bestTarget: Unit | null = null;
      let bestScore = -1;

      for (const tgt of playerTargets) {
        const dist = Math.hypot(tgt.position.x - arty.position.x, tgt.position.y - arty.position.y);
        const maxRange = arty.range || 330;
        
        if (dist <= maxRange) {
          let score = 100 - (dist / maxRange) * 30; // Closer targets favored
          
          // Counter-battery priority
          if (tgt.type === 'artillery') score += 70;
          // High-value guard or marching columns
          if (tgt.type === 'guard') score += 40;
          if (tgt.formation === 'column') score += 35;
          if (tgt.status === 'engaging') score += 25;

          if (score > bestScore) {
            bestScore = score;
            bestTarget = tgt;
          }
        }
      }

      if (bestTarget) {
        this.issueOrder(arty.id, {
          unitId: arty.id,
          type: 'bombard',
          destination: { ...bestTarget.position },
          waypoints: [],
          targetUnitId: bestTarget.id,
          plannedTime: this.state.timeMinutes,
        });
        this.addLog(`[ALLIED CFF] ${arty.name} commences counter-bombardment against ${bestTarget.name}!`, aiFaction, 'highlight');
      }
    }
  }

  private updateTacticalAI(effectiveSpeed: number) {
    if (!this.state.isRunning) return;

    const playerFaction = this.state.playerFaction;
    const aiFaction = playerFaction === 'french' ? 'allies' : 'french';

    // AI units that are not shattered and not currently routing
    const aiUnits = this.state.units.filter(
      (u) => u.faction === aiFaction && u.status !== 'shattered' && u.status !== 'routing' && u.type !== 'supply'
    );
    const opponentUnits = this.state.units.filter(
      (u) => u.faction === playerFaction && u.status !== 'shattered' && u.status !== 'routing'
    );

    // Operational Assessment: Identify if any sector is under critical breach
    let criticalSector: 'north' | 'center' | 'south' | null = null;
    if (this.state.sectorForceRatios) {
      if (this.state.sectorForceRatios.south.status === 'critical') criticalSector = 'south';
      else if (this.state.sectorForceRatios.center.status === 'critical') criticalSector = 'center';
      else if (this.state.sectorForceRatios.north.status === 'critical') criticalSector = 'north';
    }

    const availableObjectives = this.state.objectives || [];

    for (const unit of aiUnits) {
      // Scan for closest hostile opponent unit
      let closestEnemy: Unit | null = null;
      let minEnemyDist = Infinity;

      for (const enemy of opponentUnits) {
        const d = Math.hypot(enemy.position.x - unit.position.x, enemy.position.y - unit.position.y);
        if (d < minEnemyDist) {
          minEnemyDist = d;
          closestEnemy = enemy;
        }
      }

      const directFireRange = unit.range || 100;
      const closingThreatRange = 220;

      // 1. EMERGENCY REACTION: Cavalry Charge Defense (Formation = Square)
      if (closestEnemy && closestEnemy.type === 'cavalry' && minEnemyDist <= 135) {
        if ((unit.type === 'infantry' || unit.type === 'guard') && unit.formation !== 'square') {
          if (unit.morale > 28 && (!unit.suppression || unit.suppression < 80)) {
            unit.formation = 'square';
            unit.status = 'holding';
            unit.currentOrder = undefined;
            continue;
          }
        }
      }

      // 2. TACTICAL COMBAT ENGAGEMENT: Enemy within direct threat range (< 220px)
      if (closestEnemy && minEnemyDist <= closingThreatRange) {
        if (minEnemyDist <= directFireRange) {
          // Within firefight range: Dress ranks into Line to maximize musketry and face enemy
          const targetAngle = Math.atan2(closestEnemy.position.y - unit.position.y, closestEnemy.position.x - unit.position.x);
          let angleDiff = targetAngle - unit.heading;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          const turnRate = 2.0;
          const maxTurn = turnRate * effectiveSpeed;
          if (Math.abs(angleDiff) <= maxTurn) {
            unit.heading = targetAngle;
          } else {
            unit.heading += Math.sign(angleDiff) * maxTurn;
          }

          if (unit.formation === 'column' && unit.type !== 'cavalry') {
            unit.formation = 'line';
          }
          unit.currentOrder = undefined;
          if (unit.type === 'cavalry' && (closestEnemy.status === 'wavering' || closestEnemy.morale <= 50 || closestEnemy.formation !== 'square')) {
            unit.status = 'charging';
          } else {
            unit.status = 'engaging';
          }
          continue;
        } else {
          // Closing distance: only orient and order reaction if not already executing a maneuver order
          if (!unit.currentOrder || unit.currentOrder.status !== 'executing') {
            const targetAngle = Math.atan2(closestEnemy.position.y - unit.position.y, closestEnemy.position.x - unit.position.x);
            let angleDiff = targetAngle - unit.heading;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const turnRate = 2.0;
            const maxTurn = turnRate * effectiveSpeed;
            if (Math.abs(angleDiff) <= maxTurn) {
              unit.heading = targetAngle;
            } else {
              unit.heading += Math.sign(angleDiff) * maxTurn;
            }

            unit.currentOrder = {
              id: `ai_react_${unit.id}_${Date.now()}`,
              unitId: unit.id,
              type: 'assault',
              destination: { ...closestEnemy.position },
              waypoints: [],
              status: 'executing',
              plannedTime: this.state.timeMinutes,
            };
            unit.status = 'marching';
          }
          continue;
        }
      }

      // If unit already has an active order executing, let updateUnitMovements handle it
      if (unit.currentOrder && unit.currentOrder.status === 'executing') {
        continue;
      }

      // 3. OPERATIONAL OBJECTIVE-DRIVEN MANEUVERS (Generic & Scenario-Agnostic)
      const unitSector = unit.position.y < 450 ? 'north' : unit.position.y >= 850 ? 'south' : 'center';

      // 3A. Strategic Reserves (e.g. Imperial Guard, Reserve Corps)
      if (unit.aiRole === 'reserve') {
        const shouldReleaseReserve = criticalSector !== null || this.state.timeMinutes >= 45 || this.state.alliedLosses > 2200;
        if (!shouldReleaseReserve) {
          // Hold position in reserve defilade behind ridge
          unit.formation = 'line';
          unit.status = 'holding';
          continue;
        }
      }

      // 3B. Find Best Target Objective
      let bestObj: TacticalObjective | null = null;
      let bestScore = -Infinity;

      for (const obj of availableObjectives) {
        const dist = Math.hypot(obj.position.x - unit.position.x, obj.position.y - unit.position.y);
        let score = (obj.strategicValue || 50) - (dist / 20);

        // Preference objectives in same sector
        if (obj.targetSector === unitSector) {
          score += 40;
        }
        // If critical sector needs reinforcement and objective is there
        if (criticalSector && obj.targetSector === criticalSector) {
          score += 60;
        }
        // Assigned faction
        if (obj.assignedFaction === aiFaction) {
          score += 30;
        }
        // Contested or enemy held
        if (obj.heldByFaction !== aiFaction) {
          score += 25;
        }

        if (score > bestScore) {
          bestScore = score;
          bestObj = obj;
        }
      }

      if (bestObj) {
        const distToObj = Math.hypot(bestObj.position.x - unit.position.x, bestObj.position.y - unit.position.y);
        if (distToObj > 26) {
          // March to objective in column formation
          unit.formation = 'column';
          unit.status = 'marching';
          unit.currentOrder = {
            id: `ai_obj_${unit.id}_${Date.now()}`,
            unitId: unit.id,
            type: 'assault',
            destination: { ...bestObj.position },
            waypoints: [],
            status: 'executing',
            plannedTime: this.state.timeMinutes,
          };
        } else {
          // Deployed on objective: form defensive line and orient toward enemy
          unit.formation = 'line';
          unit.status = 'holding';
          unit.heading = this.getNearestEnemyHeading(unit.position, unit.faction);
        }
      } else if (opponentUnits.length > 0) {
        // Fallback: If no explicit objectives defined, advance towards enemy mass centroid
        const avgEnemyPos = opponentUnits.reduce(
          (acc, u) => ({ x: acc.x + u.position.x / opponentUnits.length, y: acc.y + u.position.y / opponentUnits.length }),
          { x: 0, y: 0 }
        );
        const distToCentroid = Math.hypot(avgEnemyPos.x - unit.position.x, avgEnemyPos.y - unit.position.y);
        if (distToCentroid > directFireRange) {
          unit.formation = 'column';
          unit.status = 'marching';
          unit.currentOrder = {
            id: `ai_cen_${unit.id}_${Date.now()}`,
            unitId: unit.id,
            type: 'assault',
            destination: avgEnemyPos,
            waypoints: [],
            status: 'executing',
            plannedTime: this.state.timeMinutes,
          };
        }
      }
    }
  }

  private updatePlayerSubordinateAI(effectiveSpeed: number) {
    if (!this.state.isRunning) return;

    // Per commander intent: Player troops are dispatched strictly by the player.
    // Autonomous subordinate initiative and wheeling are disabled by default and only run if Auto-General is explicitly toggled.
    if (!this.state.autoGeneralEnabled) {
      for (const unit of this.state.units) {
        if (unit.faction === this.state.playerFaction) {
          unit.subordinateInitiativeActive = false;
        }
      }
      return;
    }

    const playerFaction = this.state.playerFaction;
    const enemyFaction = playerFaction === 'french' ? 'allies' : 'french';

    const playerUnits = this.state.units.filter(
      (u) => u.faction === playerFaction && u.status !== 'shattered' && u.status !== 'routing' && u.type !== 'supply'
    );
    const enemyUnits = this.state.units.filter(
      (u) => u.faction === enemyFaction && u.status !== 'shattered' && u.status !== 'routing'
    );

    for (const unit of playerUnits) {
      // 1. SUPREME HQ INTEGRITY:
      // If the unit has an active order issued by the player, NEVER countermand!
      const activeOrder = unit.currentOrder;
      const hasActivePlayerOrder = activeOrder &&
        activeOrder.source === 'player' &&
        (activeOrder.status === 'delivering' || activeOrder.status === 'standby' || activeOrder.status === 'executing');

      if (hasActivePlayerOrder) {
        unit.subordinateInitiativeActive = false;
        continue;
      }

      // 2. SUBORDINATE COMMANDER INITIATIVE (No active player order):
      unit.subordinateInitiativeActive = true;

      // Scan closest enemy
      let closestEnemy: Unit | null = null;
      let minEnemyDist = Infinity;
      for (const enemy of enemyUnits) {
        const d = Math.hypot(enemy.position.x - unit.position.x, enemy.position.y - unit.position.y);
        if (d < minEnemyDist) {
          minEnemyDist = d;
          closestEnemy = enemy;
        }
      }

      // A. Artillery Battery Opportunity Fire
      if (unit.type === 'artillery') {
        if (unit.ammo > 0) {
          if (unit.currentOrder?.type === 'bombard' && unit.currentOrder.status === 'executing') {
            const dest = unit.currentOrder.destination;
            const d = Math.hypot(dest.x - unit.position.x, dest.y - unit.position.y);
            if (d <= (unit.range || 350) * 1.05) {
              if (unit.currentOrder.targetUnitId) {
                const tgt = this.state.units.find((u) => u.id === unit.currentOrder?.targetUnitId);
                if (tgt && tgt.status !== 'shattered') continue;
              } else {
                continue;
              }
            }
          }

          let bestTgt: Unit | null = null;
          let bestScore = -1;
          for (const tgt of enemyUnits) {
            const d = Math.hypot(tgt.position.x - unit.position.x, tgt.position.y - unit.position.y);
            if (d <= (unit.range || 350)) {
              let score = 100 - (d / (unit.range || 350)) * 30;
              if (tgt.type === 'artillery') score += 70; // Counter-battery priority
              if (tgt.formation === 'column') score += 40;
              if (tgt.status === 'engaging') score += 30;
              if (score > bestScore) {
                bestScore = score;
                bestTgt = tgt;
              }
            }
          }

          if (bestTgt) {
            this.issueOrder(unit.id, {
              unitId: unit.id,
              type: 'bombard',
              destination: { ...bestTgt.position },
              waypoints: [],
              targetUnitId: bestTgt.id,
              plannedTime: this.state.timeMinutes,
              source: 'subordinate',
            });
            this.addLog(
              `[SUBORDINATE INITIATIVE] ${unit.name}: Conducting opportunity bombardment against ${bestTgt.name}.`,
              unit.faction,
              'normal'
            );
          }
        }
        continue;
      }

      // B. Emergency Cavalry Defense (Infantry / Guard)
      if (closestEnemy && closestEnemy.type === 'cavalry' && minEnemyDist <= 135) {
        if ((unit.type === 'infantry' || unit.type === 'guard') && unit.formation !== 'square') {
          if (unit.morale > 25 && (!unit.suppression || unit.suppression < 80)) {
            unit.formation = 'square';
            unit.status = 'holding';
            this.addLog(
              `[SUBORDINATE INITIATIVE] ${unit.name}: Subordinate commander forms defensive square against charging cavalry!`,
              unit.faction,
              'highlight'
            );
            continue;
          }
        }
      }

      // C. Tactical Combat Engagement within threat range (< 220px ~ 1100m)
      const directFireRange = unit.range || 100;
      if (closestEnemy && minEnemyDist <= 220) {
        if (minEnemyDist <= directFireRange) {
          const targetAngle = Math.atan2(closestEnemy.position.y - unit.position.y, closestEnemy.position.x - unit.position.x);
          let angleDiff = targetAngle - unit.heading;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          const turnRate = 2.0;
          const maxTurn = turnRate * effectiveSpeed;
          if (Math.abs(angleDiff) <= maxTurn) {
            unit.heading = targetAngle;
          } else {
            unit.heading += Math.sign(angleDiff) * maxTurn;
          }

          if (unit.formation === 'column' && unit.type !== 'cavalry') {
            unit.formation = 'line';
          }
          if (unit.type === 'cavalry' && (closestEnemy.status === 'wavering' || closestEnemy.morale <= 50 || closestEnemy.formation !== 'square')) {
            if (unit.status !== 'charging') {
              this.issueOrder(unit.id, {
                unitId: unit.id,
                type: 'charge',
                destination: { ...closestEnemy.position },
                waypoints: [],
                plannedTime: this.state.timeMinutes,
                source: 'subordinate',
              });
              this.addLog(
                `[SUBORDINATE INITIATIVE] ${unit.name}: Cavalry seizing tactical opening to charge disordered enemy!`,
                unit.faction,
                'highlight'
              );
            }
          } else {
            unit.status = 'engaging';
          }
          continue;
        } else {
          // Closing distance: only orient and react if unit is not already executing a maneuver order
          if (!unit.currentOrder || unit.currentOrder.status !== 'executing') {
            const targetAngle = Math.atan2(closestEnemy.position.y - unit.position.y, closestEnemy.position.x - unit.position.x);
            let angleDiff = targetAngle - unit.heading;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

            const turnRate = 2.0;
            const maxTurn = turnRate * effectiveSpeed;
            if (Math.abs(angleDiff) <= maxTurn) {
              unit.heading = targetAngle;
            } else {
              unit.heading += Math.sign(angleDiff) * maxTurn;
            }

            this.issueOrder(unit.id, {
              unitId: unit.id,
              type: 'assault',
              destination: { ...closestEnemy.position },
              waypoints: [],
              plannedTime: this.state.timeMinutes,
              source: 'subordinate',
            });
            this.addLog(
              `[SUBORDINATE INITIATIVE] ${unit.name}: Advancing to engage closing threat (${closestEnemy.name}).`,
              unit.faction,
              'normal'
            );
          }
          continue;
        }
      }

      // If unit already has a subordinate order executing, let it run
      if (unit.currentOrder && unit.currentOrder.status === 'executing') {
        continue;
      }

      // D. Mutual Support for Adjacent Engaged Friendly Unit
      let friendlyNeedingSupport: Unit | null = null;
      let minFriendlyDist = Infinity;
      for (const friendly of playerUnits) {
        if (friendly.id === unit.id) continue;
        if (friendly.status === 'engaging' || friendly.status === 'melee' || friendly.isEncircled) {
          const d = Math.hypot(friendly.position.x - unit.position.x, friendly.position.y - unit.position.y);
          if (d <= 350 && d < minFriendlyDist) {
            minFriendlyDist = d;
            friendlyNeedingSupport = friendly;
          }
        }
      }

      if (friendlyNeedingSupport && minFriendlyDist > 65) {
        const supportAngle = friendlyNeedingSupport.heading + Math.PI / 2;
        const supportPos: Vector2D = {
          x: Math.max(40, Math.min(2360, friendlyNeedingSupport.position.x + Math.cos(supportAngle) * 45)),
          y: Math.max(40, Math.min(1460, friendlyNeedingSupport.position.y + Math.sin(supportAngle) * 45)),
        };
        this.issueOrder(unit.id, {
          unitId: unit.id,
          type: 'march',
          destination: supportPos,
          waypoints: [],
          plannedTime: this.state.timeMinutes,
          source: 'subordinate',
        });
        this.addLog(
          `[SUBORDINATE INITIATIVE] ${unit.name}: Maneuvering to support engaged flank of ${friendlyNeedingSupport.name}.`,
          unit.faction,
          'normal'
        );
        continue;
      }
    }
  }

  private updateEngineering() {
    for (const unit of this.state.units) {
      if (unit.status === 'shattered' || !unit.currentOrder) continue;
      
      const order = unit.currentOrder;
      if (order.status === 'executing' && order.type === 'entrench') {
        const timeElapsed = this.state.timeMinutes - (order.dispatchArrivalTime || 0);
        const completionTime = 15; // 15 battle minutes to dig in
        
        if (timeElapsed >= completionTime) {
          // Construction finished!
          const newTrench: TerrainFeature = {
            id: `trench_${Date.now()}_${unit.id}`,
            name: 'Fieldworks',
            type: 'trench',
            center: { ...unit.position },
            points: [],
            radius: 20, // 20px radius of protection
            cover: 0.60, // Massive cover bonus
          };
          
          this.state.terrain.push(newTrench);
          
          unit.status = 'holding';
          order.status = 'completed';
          unit.currentOrder = undefined;
          this.state.activeOrders = this.state.activeOrders.filter((o) => o.id !== order.id);
          
          this.addLog(`${unit.name} has finished digging in. Fieldworks constructed.`, unit.faction, 'highlight');
        }
      }
    }
  }

  private updateEncirclement(effectiveSpeed: number) {
    const activeUnits = this.state.units.filter((u) => u.status !== 'shattered');
    const supplyUnits = activeUnits.filter((u) => u.type === 'supply');

    for (const unit of activeUnits) {
      if (unit.type === 'supply' || unit.type === 'headquarters') {
        unit.isEncircled = false;
        continue;
      }

      // Check nearby enemies attacking or threatening
      const nearbyEnemies = activeUnits.filter(
        (e) => e.faction !== unit.faction && Math.hypot(e.position.x - unit.position.x, e.position.y - unit.position.y) < 140
      );

      if (nearbyEnemies.length >= 2) {
        // Compute angular spread of attackers
        const angles = nearbyEnemies.map((e) =>
          Math.atan2(e.position.y - unit.position.y, e.position.x - unit.position.x)
        );
        let maxAngleDiff = 0;
        for (let i = 0; i < angles.length; i++) {
          for (let j = i + 1; j < angles.length; j++) {
            let diff = Math.abs(angles[i] - angles[j]);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff > maxAngleDiff) maxAngleDiff = diff;
          }
        }

        // Check if cut off from friendly supply lines (> 220px away)
        const friendlySupplyNearby = supplyUnits.some(
          (s) => s.faction === unit.faction && Math.hypot(s.position.x - unit.position.x, s.position.y - unit.position.y) < 220
        );

        // Encirclement occurs if engaged from opposite flanks (> 108 deg) and isolated from supply
        if (maxAngleDiff >= (Math.PI * 0.6) && !friendlySupplyNearby) {
          if (!unit.isEncircled) {
            this.addLog(`[ENCIRCLEMENT] ${unit.name} is cut off and encircled! Morale falling!`, unit.faction, 'critical');
          }
          unit.isEncircled = true;
          // Morale decay and heavy suppression under encirclement
          unit.morale = Math.max(0, unit.morale - 0.35 * effectiveSpeed);
          unit.suppression = Math.min(100, (unit.suppression || 0) + 0.25 * effectiveSpeed);
          continue;
        }
      }
      unit.isEncircled = false;
    }
  }

  private updateFogOfWar() {
    if (!this.state.fogOfWarEnabled) {
      for (const unit of this.state.units) {
        unit.detectionState = 'identified';
      }
      return;
    }

    const playerUnits = this.state.units.filter(
      (u) => u.faction === this.state.playerFaction && u.status !== 'shattered'
    );
    const enemyUnits = this.state.units.filter(
      (u) => u.faction !== this.state.playerFaction && u.status !== 'shattered'
    );

    // Player units are always identified
    for (const pu of playerUnits) {
      pu.detectionState = 'identified';
    }

    for (const enemy of enemyUnits) {
      let bestState: 'hidden' | 'contact' | 'identified' = 'hidden';

      // Check if enemy is in concealing terrain
      const enemyInCover = this.state.terrain.some((t) => {
        if ((t.type === 'woods' || t.type === 'village' || t.type === 'trench') && t.radius && t.center) {
          return Math.hypot(enemy.position.x - t.center.x, enemy.position.y - t.center.y) <= t.radius;
        }
        return false;
      });

      for (const friendly of playerUnits) {
        const dist = Math.hypot(enemy.position.x - friendly.position.x, enemy.position.y - friendly.position.y);

        // 1. Line-of-sight & Reverse Slope Defilade check
        const los = this.checkLineOfSight(friendly.position, enemy.position);
        if (los.inDefilade && dist > 50) {
          // Target is occluded by intermediate crest / dead ground
          continue;
        }

        // Base spotting ranges (pixels)
        let spottingRange = friendly.type === 'cavalry' ? 240 : friendly.type === 'headquarters' ? 210 : 160;

        // 2. High Ground Elevation Vantage (Santon 320m, Staré Vinohrady 300m, Žuráň 280m, Pratzen 285m)
        const friendlyElev = this.getElevation(friendly.position);
        const enemyElev = this.getElevation(enemy.position);
        if (friendlyElev >= 265) {
          spottingRange *= 1.45;
        }

        // 3. Morning Mist of Austerlitz ("Le Brouillard d'Austerlitz" from 07:00 to 08:30 AM / t < 90 min)
        const isMorningMist = this.state.timeMinutes < 90;
        const isFriendlyInValleyMist = isMorningMist && friendlyElev <= 210 && friendly.position.y >= 300 && friendly.position.y <= 1300;
        const isEnemyInValleyMist = isMorningMist && enemyElev <= 210 && enemy.position.y >= 300 && enemy.position.y <= 1300;

        if (isFriendlyInValleyMist) {
          // Heavy ground mist restricts observers inside the valley to close-range detection
          spottingRange = Math.min(spottingRange, 100);
        } else if (friendlyElev >= 240 && isEnemyInValleyMist) {
          // Observers on sunny ridges looking down into the cloud deck cannot resolve valley troop movements
          spottingRange *= 0.45;
        }

        // 4. Concealment penalty (woods, stone compounds, redoubts)
        if (enemyInCover) {
          spottingRange *= 0.55;
        }

        if (dist <= spottingRange) {
          bestState = 'identified';
          break;
        } else if (dist <= spottingRange * 1.55) {
          bestState = 'contact';
        }
      }

      enemy.detectionState = bestState;
      if (bestState === 'contact') {
        const base = Math.round(enemy.strength / 1000) * 1000;
        const low = Math.max(500, base - 1500);
        const high = base + 1500;
        enemy.estimatedStrength = `~${low.toLocaleString()} - ${high.toLocaleString()}`;
      }
    }
  }

  public getTerrainAt(pos: { x: number; y: number }) {
    for (const feature of this.state.terrain) {
      if (feature.radius && feature.center) {
        const d = Math.hypot(pos.x - feature.center.x, pos.y - feature.center.y);
        if (d <= feature.radius) {
          return feature;
        }
      }
    }
    return null;
  }

  public getDistanceToGoldbachStream(pos: { x: number; y: number }): number {
    const pts = [
      { x: 1058, y: 0 },
      { x: 1050, y: 165 },
      { x: 1020, y: 360 },
      { x: 1012, y: 532 },
      { x: 1072, y: 750 },
      { x: 1050, y: 870 },
      { x: 990, y: 990 },
      { x: 922, y: 1215 },
      { x: 855, y: 1400 },
      { x: 825, y: 1500 },
    ];
    let minDist = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      const t = Math.max(0, Math.min(1, ((pos.x - p1.x) * dx + (pos.y - p1.y) * dy) / lenSq));
      const projX = p1.x + t * dx;
      const projY = p1.y + t * dy;
      const d = Math.hypot(pos.x - projX, pos.y - projY);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  public getStreamCrossingStatus(pos: { x: number; y: number }): { isCrossing: boolean; isBridge: boolean; isFord: boolean; speedModifier: number } {
    // Check if within bridge radius
    for (const feat of this.state.terrain) {
      if (feat.isBridge && feat.center) {
        if (Math.hypot(pos.x - feat.center.x, pos.y - feat.center.y) <= (feat.radius || 30)) {
          return { isCrossing: true, isBridge: true, isFord: false, speedModifier: 1.0 };
        }
      }
    }
    // Check if within ford radius
    for (const feat of this.state.terrain) {
      if (feat.isFord && feat.center) {
        if (Math.hypot(pos.x - feat.center.x, pos.y - feat.center.y) <= (feat.radius || 32)) {
          return { isCrossing: true, isBridge: false, isFord: true, speedModifier: 0.65 };
        }
      }
    }
    // Check if in Goldbach stream channel (within 20px of centerline)
    const distToStream = this.getDistanceToGoldbachStream(pos);
    if (distToStream <= 20) {
      // Wading stream without bridge or ford: severe 0.25x speed penalty
      return { isCrossing: true, isBridge: false, isFord: false, speedModifier: 0.25 };
    }
    return { isCrossing: false, isBridge: false, isFord: false, speedModifier: 1.0 };
  }

  public updateUnitTerrainStatus() {
    for (const unit of this.state.units) {
      if (unit.status === 'shattered') continue;
      
      // 1. River Wading status
      const streamStatus = this.getStreamCrossingStatus(unit.position);
      unit.isWadingRiver = streamStatus.isCrossing && !streamStatus.isBridge && !streamStatus.isFord;

      // 2. Settlement Garrison status
      let garrisoned = false;
      for (const feat of this.state.terrain) {
        if (feat.isGarrisonable && feat.center) {
          const d = Math.hypot(unit.position.x - feat.center.x, unit.position.y - feat.center.y);
          if (d <= (feat.radius || 36)) {
            // Defending or stationary units inside stone compounds are garrisoned
            if (
              unit.status === 'holding' || 
              unit.status === 'idle' || 
              unit.status === 'entrenching' || 
              unit.formation === 'line' || 
              unit.formation === 'square'
            ) {
              garrisoned = true;
              break;
            }
          }
        }
      }
      unit.isGarrisoned = garrisoned;
    }
  }

  public isPositionOnRoad(pos: { x: number; y: number }): boolean {
    const roads: { x1: number; y1: number; x2: number; y2: number }[] = [
      // Olmütz Highway (Primary MSR)
      { x1: 95, y1: 260, x2: 435, y2: 240 },
      { x1: 435, y1: 240, x2: 870, y2: 280 },
      { x1: 870, y1: 280, x2: 1305, y2: 285 },
      { x1: 1305, y1: 285, x2: 1700, y2: 220 },
      { x1: 1700, y1: 220, x2: 2325, y2: 75 },
      // Vienna Highway
      { x1: 75, y1: 1500, x2: 150, y2: 1160 },
      { x1: 150, y1: 1160, x2: 150, y2: 870 },
      { x1: 150, y1: 870, x2: 240, y2: 340 },
      { x1: 240, y1: 340, x2: 375, y2: 220 },
      // Brünn - Turas - Schlappanitz - Puntowitz - Pratzen - Austerlitz
      { x1: 375, y1: 165, x2: 630, y2: 660 },
      { x1: 630, y1: 660, x2: 780, y2: 720 },
      { x1: 780, y1: 720, x2: 1065, y2: 570 },
      { x1: 1065, y1: 570, x2: 1200, y2: 660 },
      { x1: 1200, y1: 660, x2: 1370, y2: 780 },
      { x1: 1370, y1: 780, x2: 1725, y2: 765 },
      { x1: 1725, y1: 765, x2: 2310, y2: 630 },
      // Puntowitz - Sokolnitz - Telnitz - Aujest
      { x1: 1200, y1: 660, x2: 960, y2: 990 },
      { x1: 960, y1: 990, x2: 915, y2: 1215 },
      { x1: 915, y1: 1215, x2: 1305, y2: 1120 },
      { x1: 1305, y1: 1120, x2: 1470, y2: 1050 },
      // Raigern - Telnitz - Satschan
      { x1: 160, y1: 1320, x2: 435, y2: 1350 },
      { x1: 435, y1: 1350, x2: 915, y2: 1215 },
      { x1: 915, y1: 1215, x2: 1100, y2: 1400 },
    ];

    for (const seg of roads) {
      const l2 = (seg.x2 - seg.x1) * (seg.x2 - seg.x1) + (seg.y2 - seg.y1) * (seg.y2 - seg.y1);
      if (l2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((pos.x - seg.x1) * (seg.x2 - seg.x1) + (pos.y - seg.y1) * (seg.y2 - seg.y1)) / l2));
      const projX = seg.x1 + t * (seg.x2 - seg.x1);
      const projY = seg.y1 + t * (seg.y2 - seg.y1);
      if (Math.hypot(pos.x - projX, pos.y - projY) <= 22) {
        return true;
      }
    }
    return false;
  }

  public getTerrainSpeedModifier(pos: { x: number; y: number }, heading?: number): number {
    let mod = 1.0;
    const feat = this.getTerrainAt(pos);
    if (feat?.moveSpeedMod) {
      mod *= feat.moveSpeedMod;
    }

    // Stream crossing speed modifier (bridge: 1.0, ford: 0.65, unbridged wading: 0.25)
    const streamStatus = this.getStreamCrossingStatus(pos);
    if (streamStatus.isCrossing) {
      mod *= streamStatus.speedModifier;
    }

    // Road alignment & paved highway bonus (+20% speed, alleviates mud & slope friction)
    const onRoad = this.isPositionOnRoad(pos);
    if (onRoad) {
      mod *= 1.20;
    }

    if (heading !== undefined) {
      // Look ahead 20px along heading to test slope
      const lookahead = 20;
      const nextPos = {
        x: pos.x + Math.cos(heading) * lookahead,
        y: pos.y + Math.sin(heading) * lookahead,
      };
      const curEl = this.getElevation(pos);
      const nextEl = this.getElevation(nextPos);
      const slope = nextEl - curEl;
      if (slope >= 1) {
        // Uphill drag: slow down by up to 45% (halved on engineered roads)
        const dragFactor = onRoad ? 0.20 : 0.45;
        mod *= Math.max(0.55, 1.0 - (slope / lookahead) * dragFactor);
      } else if (slope <= -1) {
        // Downhill boost: speed up by up to 30%
        mod *= Math.min(1.30, 1.0 + (Math.abs(slope) / lookahead) * 0.25);
      }
    }

    // Marsh / Pond lowlands (el <= 180) - mitigated by road causeways
    const el = this.getElevation(pos);
    if (el <= 180) {
      mod *= onRoad ? 0.90 : 0.65;
    }

    // Frozen Satschan / Menitz ponds ice fracture hazard
    if (pos.y > 1280 && this.state.iceCracks && this.state.iceCracks.length > 0) {
      for (const crack of this.state.iceCracks) {
        if (Math.hypot(pos.x - crack.x, pos.y - crack.y) <= (crack.radius + 25)) {
          mod *= 0.25; // Broken ice drastically hinders movement
          break;
        }
      }
    }

    return mod;
  }

  public getTerrainCover(pos: { x: number; y: number }): number {
    const feat = this.getTerrainAt(pos);
    return feat?.cover ?? 0.0;
  }

  private getDirectEngagementRange(u: Unit): number {
    // Direct line-of-sight firefight range:
    // Artillery direct point defense:
    // - If actively executing a distant Call-For-Fire (CFF) bombardment mission: 60px (emergency overrun canister range)
    // - If deployed on the line without an active bombardment mission: 100px (defensive direct fire)
    if (u.type === 'artillery') {
      if (u.currentOrder?.status === 'executing' && u.currentOrder.type === 'bombard') {
        return 60; // Emergency point-defense canister range
      }
      return 100; // Defensive direct fire range
    }
    // Skirmish screen forward pickets extend harassment range by 25%
    if (u.isSkirmishScreenActive) return u.range * 1.25;
    return u.range;
  }

  private resolveCombat(effectiveSpeed: number) {
    // Clear engaging and melee status for units before checking current active combat
    for (const u of this.state.units) {
      if (u.type === 'artillery') {
        u.canisterActive = false;
        u.directDefenseActive = false;
      }
      if (u.status === 'engaging' || u.status === 'melee') {
        if (u.currentOrder && u.currentOrder.status === 'executing') {
          if (u.currentOrder.type === 'charge') {
            u.status = 'charging';
          } else if (u.currentOrder.type === 'hold') {
            u.status = 'holding';
          } else if (u.currentOrder.type === 'entrench') {
            u.status = 'entrenching';
          } else if (u.currentOrder.type === 'bombard') {
            const distToBombard = Math.hypot(u.currentOrder.destination.x - u.position.x, u.currentOrder.destination.y - u.position.y);
            u.status = distToBombard <= (u.range || 350) ? 'engaging' : 'marching';
          } else {
            u.status = 'marching';
          }
        } else {
          u.status = (u.morale <= 50 && u.morale > 25) ? 'wavering' : 'idle';
        }
      }
      u.isEnfiladed = false;
    }

    const frenchUnits = this.state.units.filter((u) => u.faction === 'french' && u.status !== 'shattered');
    const alliedUnits = this.state.units.filter((u) => u.faction === 'allies' && u.status !== 'shattered');

    // Pre-calculate incoming angles to detect Concentrated Enfilade Crossfire (>= 40 deg angle difference)
    const incomingAngles = new Map<string, number[]>();

    for (const french of frenchUnits) {
      const frenchDirectRange = this.getDirectEngagementRange(french);
      for (const allied of alliedUnits) {
        const alliedDirectRange = this.getDirectEngagementRange(allied);
        const dx = allied.position.x - french.position.x;
        const dy = allied.position.y - french.position.y;
        const dist = Math.hypot(dx, dy);

        const frenchCanFire = french.status !== 'routing' && dist <= frenchDirectRange &&
          (!french.volleyReady || dist <= (french.currentOrder?.holdFireThreshold || 65));
        if (frenchCanFire) {
          const angle = Math.atan2(french.position.y - allied.position.y, french.position.x - allied.position.x);
          const list = incomingAngles.get(allied.id) || [];
          list.push(angle);
          incomingAngles.set(allied.id, list);
        }

        const alliedCanFire = allied.status !== 'routing' && dist <= alliedDirectRange &&
          (!allied.volleyReady || dist <= (allied.currentOrder?.holdFireThreshold || 65));
        if (alliedCanFire) {
          const angle = Math.atan2(allied.position.y - french.position.y, allied.position.x - french.position.x);
          const list = incomingAngles.get(french.id) || [];
          list.push(angle);
          incomingAngles.set(french.id, list);
        }
      }
    }

    for (const u of this.state.units) {
      const angles = incomingAngles.get(u.id);
      if (angles && angles.length >= 2) {
        for (let i = 0; i < angles.length; i++) {
          for (let j = i + 1; j < angles.length; j++) {
            let diff = Math.abs(angles[i] - angles[j]);
            while (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
            if (diff >= (40 * Math.PI) / 180) { // >= 40 deg
              u.isEnfiladed = true;
              break;
            }
          }
          if (u.isEnfiladed) break;
        }
      }
    }

    for (const french of frenchUnits) {
      const frenchDirectRange = this.getDirectEngagementRange(french);
      for (const allied of alliedUnits) {
        const alliedDirectRange = this.getDirectEngagementRange(allied);
        const dx = allied.position.x - french.position.x;
        const dy = allied.position.y - french.position.y;
        const dist = Math.hypot(dx, dy);

        // Check if within direct firefight or melee range
        const maxRange = Math.max(frenchDirectRange, alliedDirectRange);
        if (dist <= maxRange) {
          this.engagePair(french, allied, dist, effectiveSpeed, frenchDirectRange, alliedDirectRange);
        }
      }
    }
  }

  private engagePair(
    french: Unit,
    allied: Unit,
    dist: number,
    effectiveSpeed: number,
    frenchDirectRange: number,
    alliedDirectRange: number
  ) {
    // Both units can engage if within their respective direct ranges or close melee contact
    const frenchInRange = dist <= frenchDirectRange;
    const alliedInRange = dist <= alliedDirectRange;

    if (!frenchInRange && !alliedInRange) return;

    // Tactical advantages
    const frenchElevation = this.getElevation(french.position);
    const alliedElevation = this.getElevation(allied.position);
    const elevationAdvantage = frenchElevation - alliedElevation;

    // Melee threshold: distance <= 38px or either unit currently executing a charge order
    const isMeleeContact = dist <= 38 || french.status === 'charging' || allied.status === 'charging';

    // French attacks Allied
    if (frenchInRange && french.status !== 'routing') {
      const isFrenchMelee = isMeleeContact && french.type !== 'artillery';
      const isHoldingVolley = french.volleyReady && dist > (french.currentOrder?.holdFireThreshold || 65);

      if (!isHoldingVolley) {
        if (french.ammo <= 0 && !isFrenchMelee) {
          french.status = 'holding';
        } else {
          const isDischargingVolley = french.volleyReady && dist <= (french.currentOrder?.holdFireThreshold || 65);
          const { damage, isFlanking, isRear } = this.calculateDamage(french, allied, dist, elevationAdvantage, effectiveSpeed, isFrenchMelee);
          
          // Artillery strength is counted in guns (18-24) rather than soldiers (thousands).
          // Scale casualty damage so ~20 crew casualties equals 1 disabled gun.
          const effectiveDamage = allied.type === 'artillery' ? Math.max(0.01, damage / 20) : damage;
          allied.strength = Math.max(0, allied.strength - effectiveDamage);
          french.kills += damage;
          allied.casualtiesTaken += damage;
          this.state.alliedLosses += damage;

          // Continuous combat morale drain (rate scaled per second by effectiveSpeed)
          const continuousMeleeShock = isFrenchMelee ? 2.5 * effectiveSpeed : 0.4 * effectiveSpeed;
          const continuousFlankShock = (isRear ? 4.5 : isFlanking ? 2.0 : 0) * effectiveSpeed;
          const continuousEnfiladeShock = allied.isEnfiladed ? 2.5 * effectiveSpeed : 0;
          const casualtyMoraleShock = (effectiveDamage / Math.max(1, allied.initialStrength)) * 80;

          // Discrete one-time shock: point-blank battalion volley delivers a sharp 8-point shock burst once
          const discreteVolleyShock = isDischargingVolley ? 8.0 : 0;

          const moraleLoss = casualtyMoraleShock + continuousMeleeShock + continuousFlankShock + continuousEnfiladeShock + discreteVolleyShock + 0.04 * effectiveSpeed;
          allied.morale = Math.max(0, allied.morale - moraleLoss);

          // Suppression buildup under fire, melee press, suppressive mission, and enfilade crossfire
          const isSuppressive = french.currentOrder?.type === 'suppress' || french.suppressingTargetId === allied.id;
          const suppressiveMult = isSuppressive ? 2.5 : 1.0;
          const suppressiveBonus = isSuppressive ? 12.0 * effectiveSpeed : 0;
          const volleySuppression = isDischargingVolley ? 45 : 0;
          const enfiladeSuppression = allied.isEnfiladed ? 0.35 * effectiveSpeed : 0;
          allied.suppression = Math.min(
            100,
            (allied.suppression || 0) +
              (damage / Math.max(1, allied.initialStrength)) * 260 * suppressiveMult +
              (isFrenchMelee ? 0.35 : 0.1) * effectiveSpeed +
              suppressiveBonus +
              volleySuppression +
              enfiladeSuppression
          );

          if (isDischargingVolley) {
            french.volleyReady = false;
            if (french.currentOrder?.type === 'volley') {
              french.currentOrder.type = 'hold';
            }
            this.addLog(
              `[BATTALION VOLLEY] ${french.name} unloads devastating point-blank shock volley (${Math.round(dist * 5)}m) into ${allied.name}! Enemy line staggered!`,
              french.faction,
              'highlight'
            );
          }

          french.status = isFrenchMelee ? 'melee' : 'engaging';
          if (this.state.playerFaction === 'allies') {
            this.triggerContactSitrep(allied, isFrenchMelee ? 'melee' : 'direct_fire', french);
          }
          if (allied.morale <= 25) {
            allied.status = 'routing';
          }
        }
      } else {
        french.status = 'holding';
      }
    }

    // Allied attacks French
    if (alliedInRange && allied.status !== 'routing') {
      const isAlliedMelee = isMeleeContact && allied.type !== 'artillery';
      const isHoldingVolley = allied.volleyReady && dist > (allied.currentOrder?.holdFireThreshold || 65);

      if (!isHoldingVolley) {
        if (allied.ammo <= 0 && !isAlliedMelee) {
          allied.status = 'holding';
        } else {
        const isDischargingVolley = allied.volleyReady && dist <= (allied.currentOrder?.holdFireThreshold || 65);
        const { damage, isFlanking, isRear } = this.calculateDamage(allied, french, dist, -elevationAdvantage, effectiveSpeed, isAlliedMelee);
        
        // Artillery strength is counted in guns (18-24) rather than soldiers (thousands).
        // Scale casualty damage so ~20 crew casualties equals 1 disabled gun.
        const effectiveDamage = french.type === 'artillery' ? Math.max(0.01, damage / 20) : damage;
        french.strength = Math.max(0, french.strength - effectiveDamage);
        allied.kills += damage;
        french.casualtiesTaken += damage;
        this.state.frenchLosses += damage;

        // Continuous combat morale drain (rate scaled per second by effectiveSpeed)
        const continuousMeleeShock = isAlliedMelee ? 2.5 * effectiveSpeed : 0.4 * effectiveSpeed;
        const continuousFlankShock = (isRear ? 4.5 : isFlanking ? 2.0 : 0) * effectiveSpeed;
        const continuousEnfiladeShock = french.isEnfiladed ? 2.5 * effectiveSpeed : 0;
        const casualtyMoraleShock = (effectiveDamage / Math.max(1, french.initialStrength)) * 80;

        // Discrete one-time shock: point-blank battalion volley delivers a sharp 8-point shock burst once
        const discreteVolleyShock = isDischargingVolley ? 8.0 : 0;

        const moraleLoss = casualtyMoraleShock + continuousMeleeShock + continuousFlankShock + continuousEnfiladeShock + discreteVolleyShock + 0.04 * effectiveSpeed;
        french.morale = Math.max(0, french.morale - moraleLoss);

        // Suppression buildup
        const isSuppressive = allied.currentOrder?.type === 'suppress' || allied.suppressingTargetId === french.id;
        const suppressiveMult = isSuppressive ? 2.5 : 1.0;
        const suppressiveBonus = isSuppressive ? 12.0 * effectiveSpeed : 0;
        const volleySuppression = isDischargingVolley ? 45 : 0;
        const enfiladeSuppression = french.isEnfiladed ? 0.35 * effectiveSpeed : 0;
        french.suppression = Math.min(
          100,
          (french.suppression || 0) +
            (damage / Math.max(1, french.initialStrength)) * 260 * suppressiveMult +
            (isAlliedMelee ? 0.35 : 0.1) * effectiveSpeed +
            suppressiveBonus +
            volleySuppression +
            enfiladeSuppression
        );

        if (isDischargingVolley) {
          allied.volleyReady = false;
          if (allied.currentOrder?.type === 'volley') {
            allied.currentOrder.type = 'hold';
          }
          this.addLog(
            `[BATTALION VOLLEY] ${allied.name} unloads devastating point-blank shock volley (${Math.round(dist * 5)}m) into ${french.name}! Friendly line staggered!`,
            allied.faction,
            'highlight'
          );
        }

        allied.status = isAlliedMelee ? 'melee' : 'engaging';
        if (this.state.playerFaction === 'french') {
          this.triggerContactSitrep(french, isAlliedMelee ? 'melee' : 'direct_fire', allied);
        }
        if (french.morale <= 25) {
          french.status = 'routing';
        }
      }
    } else {
      allied.status = 'holding';
    }
    }

    // Update unit statuses based on morale
    this.updateMoraleStatus(french);
    this.updateMoraleStatus(allied);

    // Auto-face towards enemy to create neat arrays (only when holding/engaging without active maneuver orders)
    const faceTarget = (u1: Unit, u2: Unit) => {
      if (u1.formation === 'square' || u1.status === 'routing') return;
      if (u1.currentOrder && u1.currentOrder.status === 'executing') return;
      const targetAngle = Math.atan2(u2.position.y - u1.position.y, u2.position.x - u1.position.x);
      let angleDiff = targetAngle - u1.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      const turnRate = 0.5 * effectiveSpeed;
      if (Math.abs(angleDiff) <= turnRate) {
        u1.heading = targetAngle;
      } else {
        u1.heading += Math.sign(angleDiff) * turnRate;
      }
    };
    if (frenchInRange) faceTarget(french, allied);
    if (alliedInRange) faceTarget(allied, french);
  }

  private updateEngagements() {
    const SECTORS: Array<{
      id: string;
      name: string;
      center: Vector2D;
      radius: number;
    }> = [
      { id: 'santon', name: 'Santon Hill & Blasowitz (Northern Flank)', center: { x: 1480, y: 320 }, radius: 450 },
      { id: 'pratzen', name: 'Pratzen Heights (Center Plateau)', center: { x: 1500, y: 720 }, radius: 420 },
      { id: 'puntowitz', name: 'Puntowitz & Goldbach Crossing', center: { x: 1150, y: 700 }, radius: 400 },
      { id: 'sokolnitz', name: 'Sokolnitz Castle & Pheasantry', center: { x: 970, y: 940 }, radius: 380 },
      { id: 'telnitz', name: 'Telnitz & Satschitzer Lakes (Southern Flank)', center: { x: 950, y: 1250 }, radius: 400 },
    ];

    const playerFaction = this.state.playerFaction;
    const enemyFaction = playerFaction === 'french' ? 'allies' : 'french';

    const activeEngagements: ActiveEngagement[] = [];

    for (const sec of SECTORS) {
      const sectorUnits = this.state.units.filter((u) => {
        if (u.status === 'shattered' || u.strength <= 0) return false;
        const d = Math.hypot(u.position.x - sec.center.x, u.position.y - sec.center.y);
        return d <= sec.radius;
      });

      const friendlyInSector = sectorUnits.filter((u) => u.faction === playerFaction);
      const enemyInSector = sectorUnits.filter((u) => u.faction === enemyFaction);

      let isClashing = false;
      for (const f of friendlyInSector) {
        for (const e of enemyInSector) {
          const d = Math.hypot(f.position.x - e.position.x, f.position.y - e.position.y);
          if (d <= Math.max(f.range, e.range) + 25 || f.status === 'engaging' || e.status === 'engaging') {
            isClashing = true;
            break;
          }
        }
        if (isClashing) break;
      }

      if (isClashing && friendlyInSector.length > 0 && enemyInSector.length > 0) {
        let sumX = 0, sumY = 0;
        const allClash = [...friendlyInSector, ...enemyInSector];
        for (const u of allClash) {
          sumX += u.position.x;
          sumY += u.position.y;
        }
        const clashCentroid = {
          x: Math.round(sumX / allClash.length),
          y: Math.round(sumY / allClash.length),
        };

        const friendlyStrength = friendlyInSector.reduce((sum, u) => sum + u.strength, 0);
        const enemyStrength = enemyInSector.reduce((sum, u) => sum + u.strength, 0);
        const friendlyCasualties = Math.round(friendlyInSector.reduce((sum, u) => sum + (u.casualtiesTaken || 0), 0));
        const enemyCasualties = Math.round(enemyInSector.reduce((sum, u) => sum + (u.casualtiesTaken || 0), 0));
        const avgFriendlyMorale = friendlyInSector.reduce((sum, u) => sum + u.morale, 0) / friendlyInSector.length;
        
        const forceRatio = enemyStrength / Math.max(1, friendlyStrength);
        const hasWaveringOrRouting = friendlyInSector.some((u) => u.status === 'wavering' || u.status === 'routing');

        let urgency: 'critical' | 'heavy' | 'skirmish' | 'favorable' = 'skirmish';
        let needsReinforcements = false;
        let statusText = '';

        if (hasWaveringOrRouting || avgFriendlyMorale < 38 || forceRatio >= 1.6) {
          urgency = 'critical';
          needsReinforcements = true;
          statusText = `CRITICAL PRESSURE: Line wavering under heavy enemy pressure (${Math.round(enemyStrength).toLocaleString()} vs ${Math.round(friendlyStrength).toLocaleString()} men). Immediate reinforcement required!`;
        } else if (forceRatio >= 1.15 || avgFriendlyMorale < 55) {
          urgency = 'heavy';
          needsReinforcements = true;
          statusText = `HEAVY ENGAGEMENT: Intensely contested sector. Enemy columns pressing hard (${Math.round(enemyStrength).toLocaleString()} opposing). Support recommended.`;
        } else if (forceRatio <= 0.75) {
          urgency = 'favorable';
          needsReinforcements = false;
          statusText = `TACTICAL ADVANTAGE: Superior firepower in effect. Repelling enemy attacks with manageable losses.`;
        } else {
          urgency = 'skirmish';
          needsReinforcements = false;
          statusText = `FIREFIGHT IN PROGRESS: Exchange of musket & cannon fire. Formations holding steady in defensive lines.`;
        }

        activeEngagements.push({
          id: `eng_${sec.id}`,
          name: sec.name,
          sectorLocation: clashCentroid,
          friendlyUnits: friendlyInSector,
          enemyUnits: enemyInSector,
          friendlyCasualties,
          enemyCasualties,
          urgency,
          statusText,
          needsReinforcements,
        });
      }
    }

    this.state.activeEngagements = activeEngagements;
  }

  private calculateDamage(
    attacker: Unit, 
    defender: Unit, 
    dist: number, 
    elevDiff: number, 
    effectiveSpeed: number, 
    isMelee: boolean = false
  ): { damage: number; isFlanking: boolean; isRear: boolean } {
    // Volley fire discipline: If holding fire for mass point-blank volley, 0 damage until within threshold
    if (attacker.volleyReady && dist > (attacker.currentOrder?.holdFireThreshold || 65)) {
      return { damage: 0, isFlanking: false, isRear: false };
    }

    let power: number;

    if (isMelee) {
      // Melee Combat: Bayonets, sabres, and shock momentum
      power = attacker.shockValue * 1.5;

      // Charge momentum boost (dampened if defender deployed forward skirmish screen)
      if (attacker.status === 'charging' || (attacker.currentOrder && attacker.currentOrder.type === 'charge')) {
        const chargeMultiplier = defender.isSkirmishScreenActive ? 1.15 : 1.45;
        power *= chargeMultiplier;
      }

      // Column formation provides strong forward penetrative shock
      if (attacker.formation === 'column') {
        power *= 1.40;
      }

      // Melee vs Formations & Garrisoned Compounds:
      if (defender.isGarrisoned && attacker.type === 'cavalry') {
        // Cavalry cannot charge stone house compounds, gardens, or perimeter walls
        power *= 0.10;
        attacker.morale = Math.max(0, attacker.morale - 0.25 * effectiveSpeed);
      } else if (defender.formation === 'square') {
        if (attacker.type === 'cavalry') {
          // Cavalry bounces off bristling hedge of bayonets
          power *= 0.08;
          attacker.morale = Math.max(0, attacker.morale - 0.3 * effectiveSpeed);
        } else if (attacker.type === 'infantry') {
          // Concentrated infantry bayonet charge against a static square has superior concentrated shock
          power *= 1.35;
        }
      } else if (attacker.type === 'cavalry' && defender.formation === 'line') {
        power *= 2.2;
      }
    } else {
      // Logistics: Out of ammo = unit cannot fire ranged weapons! (Restricted to cold steel / melee only)
      if (attacker.ammo <= 0) {
        return { damage: 0, isFlanking: false, isRear: false };
      }

      // Ranged Firefight
      power = attacker.type === 'artillery' ? attacker.firepower * 1.5 : attacker.firepower;

      // Point-blank battalion volley delivers 2.5x shock damage burst
      if (attacker.volleyReady && dist <= (attacker.currentOrder?.holdFireThreshold || 65)) {
        power *= 2.5;
      }

      // Consume ammo based on unit firing (suppressive fire burns extra ammo)
      const isSuppressiveMission = attacker.currentOrder?.type === 'suppress' || attacker.suppressingTargetId === defender.id;
      const ammoBurn = (isSuppressiveMission ? 0.45 : 0.2) * effectiveSpeed;
      attacker.ammo = Math.max(0, attacker.ammo - ammoBurn);

      // Skirmish Screen defensive protection: 35% of incoming ranged volleys absorbed by screen line!
      if (defender.isSkirmishScreenActive) {
        power *= 0.65;
      }

      // Attacker skirmish screen trade-off: 15% headcount detached forward to screen line
      if (attacker.isSkirmishScreenActive) {
        power *= 0.88;
      }

      // Suppression degrades ranged firepower (pinned units suffer severe accuracy loss)
      if (attacker.suppression && attacker.suppression > 0) {
        power *= Math.max(0.4, 1 - (attacker.suppression / 100) * 0.5);
        if (attacker.suppression > 50) {
          power *= 0.65; // Additional pinned penalty
        }
      }

      // Range falloff
      const rangeRatio = 1 - dist / attacker.range;
      power *= Math.max(0.2, rangeRatio);

      // Formation vulnerability to fire: Column takes increased artillery & musket casualties
      if (defender.formation === 'column') {
        power *= 1.4;
      }

      // Square vulnerable to concentrated artillery shot
      if (defender.formation === 'square' && attacker.type === 'artillery') {
        power *= 2.4;
      }

      // Artillery Canister Shot vs Direct Round Shot
      if (attacker.type === 'artillery') {
        attacker.directDefenseActive = true;
        if (dist <= 60) {
          attacker.canisterActive = true;
          power *= 2.2; // Lethal point-blank canister spray
          defender.suppression = Math.min(100, (defender.suppression || 0) + 1.5 * effectiveSpeed);
        } else {
          attacker.canisterActive = false;
          power *= 1.3; // Direct flat-trajectory solid roundshot punch
        }
      }
    }

    // Directional combat: Flanking & Rear attack check
    const relDx = attacker.position.x - defender.position.x;
    const relDy = attacker.position.y - defender.position.y;
    const incomingAngle = Math.atan2(relDy, relDx);
    let angleDiff = Math.abs(incomingAngle - defender.heading);
    while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);

    let isFlanking = false;
    let isRear = false;

    // Defend posture / square has 360-degree security (immune to flank bonuses)
    if (defender.formation !== 'square') {
      if (angleDiff >= (3 * Math.PI) / 4) {
        // Attack from behind (> 135 deg)
        power *= 2.0;
        isRear = true;
      } else if (angleDiff >= Math.PI / 3) {
        // Attack from flank (> 60 deg)
        power *= 1.5;
        isFlanking = true;
      }
    }

    // Concentrated Enfilade Crossfire: defender caught in converging angles (>= 40 deg split) takes +50% damage
    if (defender.isEnfiladed) {
      power *= 1.50;
    }

    // Advanced Terrain Cover & Compound Garrison
    let cover = this.getTerrainCover(defender.position);
    if (defender.isGarrisoned) {
      const feat = this.getTerrainAt(defender.position);
      const effectiveGarrisonCover = feat?.garrisonCover || 0.80;
      cover = Math.max(cover, effectiveGarrisonCover);
    }
    power *= (1 - cover * (isMelee ? 0.35 : 1.0)); // Cover is less effective in direct hand-to-hand melee

    // River crossing disorder & water wading vulnerability
    if (defender.isWadingRiver) {
      power *= 1.35; // Wet powder, deep mud, disorganized files in water
    }

    // Apply strength and fatigue decay
    power *= Math.max(0.1, defender.fatigue > 80 ? 0.7 : 1.0);
    if (elevDiff > 15) {
      power *= 1.25;
      if (attacker.status === 'charging') {
        // Downhill charge shock momentum bonus (tremendous kinetic impact for cavalry)
        power *= attacker.type === 'cavalry' ? 1.50 : 1.35;
      }
    } else if (elevDiff < -15) {
      // Uphill assault gravity check (cavalry momentum heavily dissipated)
      power *= attacker.type === 'cavalry' ? 0.55 : 0.75;
    }

    // Experience bonus
    if (attacker.experience === 'Elite Guard') power *= 1.35;
    else if (attacker.experience === 'Veteran') power *= 1.15;

    // Continuous casualties per tick (power * normalized strength * rate * effectiveSpeed)
    const baseDamage = power * (attacker.strength / 1000) * 0.08 * effectiveSpeed;
    return {
      damage: Math.max(0, baseDamage),
      isFlanking,
      isRear,
    };
  }

  public getElevation(pos: { x: number; y: number }): number {
    const bx = pos.x / 1.5;
    const by = pos.y / 1.5;

    let elev = 200;

    // 1. Organic Moravian Rolling Undulation (Multi-harmonic subtle micro-relief)
    const n1 = Math.sin(bx * 0.0042 + 1.2) * Math.cos(by * 0.0038 + 0.8) * 3.5;
    const n2 = Math.sin(bx * 0.0095 - by * 0.0071 + 2.1) * 2.0;
    const n3 = Math.cos(bx * 0.016 + by * 0.014 + 0.4) * 1.2;
    const organicTerrain = n1 + n2 + n3;

    // 2. Goldbach Valley (Main north-to-south drainage depression down to ~180m)
    let bxGb = 705;
    if (by < 355) {
      bxGb = 705 - (by / 355) * 30;
    } else if (by < 580) {
      bxGb = 675 + ((by - 355) / 225) * 25;
    } else if (by < 810) {
      bxGb = 700 - ((by - 580) / 230) * 85;
    } else {
      bxGb = 615 - ((by - 810) / 190) * 65;
    }
    // Stream meander
    bxGb += Math.sin(by * 0.02) * 8;
    const dGb = Math.abs(bx - bxGb);
    // Asymmetrical valley profile: steeper on eastern scarp side, gentler on west
    const gbWidth = bx > bxGb ? 28 : 36;
    const deltaGb = -22 * Math.exp(-(dGb * dGb) / (2 * gbWidth * gbWidth));

    // 2b. Bosenitz Brook (Roketnice) East-West Valley (North sector, by: 190 - 230)
    // Carves between Santon and Žuráň from east to west into Goldbach
    const bosenitzY = 210 + Math.sin(bx * 0.008) * 12;
    let deltaBosenitz = 0;
    if (bx > 700 && bx < 1550 && by > 150 && by < 270) {
      const dBos = Math.abs(by - bosenitzY);
      const blendEast = Math.min(1, Math.max(0, (bx - 700) / 150));
      deltaBosenitz = -15 * Math.exp(-(dBos * dBos) / (2 * 18 * 18)) * blendEast;
    }

    // 2c. Puntowitz Ravine (Streams flowing from Pratzeberg west into Goldbach at Puntowitz)
    let deltaPuntowitz = 0;
    const pSegX1 = 760, pSegY1 = 575, pSegX2 = 1000, pSegY2 = 510;
    const pDx = pSegX2 - pSegX1, pDy = pSegY2 - pSegY1;
    const pLen2 = pDx * pDx + pDy * pDy;
    const pT = Math.max(0, Math.min(1, ((bx - pSegX1) * pDx + (by - pSegY1) * pDy) / pLen2));
    const pDist = Math.hypot(bx - (pSegX1 + pT * pDx), by - (pSegY1 + pT * pDy));
    if (pDist < 45 && pT > 0.05 && pT < 0.95) {
      const ravineDepth = 14 * Math.sin(pT * Math.PI);
      deltaPuntowitz = -ravineDepth * Math.exp(-(pDist * pDist) / (2 * 14 * 14));
    }

    // 2d. Kobelnitz Ravine (Carves from Staré Vinohrady down past Kobelnitz)
    let deltaKobelnitz = 0;
    const kSegX1 = 740, kSegY1 = 660, kSegX2 = 980, kSegY2 = 460;
    const kDx = kSegX2 - kSegX1, kDy = kSegY2 - kSegY1;
    const kLen2 = kDx * kDx + kDy * kDy;
    const kT = Math.max(0, Math.min(1, ((bx - kSegX1) * kDx + (by - kSegY1) * kDy) / kLen2));
    const kDist = Math.hypot(bx - (kSegX1 + kT * kDx), by - (kSegY1 + kT * kDy));
    if (kDist < 40 && kT > 0.05 && kT < 0.95) {
      deltaKobelnitz = -12 * Math.sin(kT * Math.PI) * Math.exp(-(kDist * kDist) / (2 * 12 * 12));
    }

    // 3. Satschan & Menitz Ponds Lowland Basin (173 - 176m)
    let deltaPond = 0;
    if (by > 840 && bx >= 480 && bx <= 960) {
      const dPondX = (bx - 680) / 165;
      const dPondY = (by - 950) / 85;
      const dPond = dPondX * dPondX + dPondY * dPondY;
      if (dPond < 1.0) {
        deltaPond = -27 * Math.pow(1 - dPond, 1.1);
      }
    }

    // 4. West Turas / Schlapanitz Shelf (Gentle rolling western rise: 215 - 235m)
    let deltaWest = 0;
    if (bx < 480) {
      const westRatio = Math.max(0, 1 - bx / 480);
      deltaWest = 26 * (0.5 - 0.5 * Math.cos(westRatio * Math.PI));
    }

    // 5. Northern Ridge (Uplands rising to 275 - 290m)
    let deltaRidge = 0;
    if (by < 150 && bx > 500) {
      const ridgeRatio = Math.max(0, 1 - by / 150);
      const blendX = Math.min(1, (bx - 500) / 220);
      deltaRidge = 85 * Math.pow(ridgeRatio, 1.2) * blendX;
    }

    // 6. Santon Hill (Northern Fortified Promontory, 320m)
    // Asymmetrical: steep western face, gentler eastern spur
    const dSantonX = bx - 890;
    const dSantonY = by - 155;
    const santonSigmaX = dSantonX < 0 ? 22 : 30; // steeper on west
    const santonSigmaY = 24;
    const dSanton2 = (dSantonX * dSantonX) / (2 * santonSigmaX * santonSigmaX) + (dSantonY * dSantonY) / (2 * santonSigmaY * santonSigmaY);
    const deltaSanton = 120 * Math.exp(-dSanton2);

    // 7. Žuráň Hill (Napoleon HQ Knoll, 280m)
    const dZuran = Math.hypot(bx - 720, by - 250);
    const deltaZuran = 80 * Math.exp(-(dZuran * dZuran) / (2 * 23 * 23));

    // 8. Pratzen Massif (Continuous plateau with realistic ridges, saddles, and spurs)
    // 8a. Broad Plateau Base (255 - 260m)
    const dPlatX = (bx - 1080) / 215;
    const dPlatY = (by - 520) / 225;
    const dPlat = dPlatX * dPlatX + dPlatY * dPlatY;
    const deltaPlat = 55 * Math.exp(-dPlat);

    // 8b. Staré Vinohrady Crest (300m Summit)
    const rotVino = -0.22;
    const dxV = (bx - 1060) * Math.cos(rotVino) - (by - 390) * Math.sin(rotVino);
    const dyV = (bx - 1060) * Math.sin(rotVino) + (by - 390) * Math.cos(rotVino);
    const dVino = (dxV * dxV) / (2 * 54 * 54) + (dyV * dyV) / (2 * 32 * 32);
    const deltaVino = 64 * Math.exp(-dVino);

    // 8c. Pratzen Crest / Pratzeberg (285m)
    const rotPratz = -0.15;
    const dxP = (bx - 1000) * Math.cos(rotPratz) - (by - 490) * Math.sin(rotPratz);
    const dyP = (bx - 1000) * Math.sin(rotPratz) + (by - 490) * Math.cos(rotPratz);
    const dPratz = (dxP * dxP) / (2 * 50 * 50) + (dyP * dyP) / (2 * 30 * 30);
    const deltaPratz = 38 * Math.exp(-dPratz);

    // 8d. Hostieradek Knoll (275m)
    const dHost = Math.pow(bx - 980, 2) / (2 * 44 * 44) + Math.pow(by - 700, 2) / (2 * 32 * 32);
    const deltaHost = 75 * Math.exp(-dHost);

    // Uplands maximum blend
    const upland = Math.max(
      deltaSanton,
      deltaZuran,
      deltaPlat + Math.max(deltaVino, deltaPratz),
      deltaHost,
      deltaRidge,
      deltaWest
    );

    // Ravines and drainage erode into both uplands and valley
    const drainage = deltaGb + deltaBosenitz + deltaPuntowitz + deltaKobelnitz + deltaPond;
    // Mask stream depression on highest peaks
    const peakMask = Math.max(0, 1 - Math.max(deltaSanton, deltaZuran) / 80);

    elev += (drainage * peakMask) + upland + organicTerrain;

    return Math.round(elev);
  }

  public checkLineOfSight(from: Vector2D, to: Vector2D): { inDefilade: boolean; occludingElevation: number; occludingPoint?: Vector2D } {
    const elFrom = this.getElevation(from);
    const elTo = this.getElevation(to);
    const steps = 14;
    let maxOcclusion = 0;
    let occludingPoint: Vector2D | undefined;

    // Sample points along trajectory between 15% and 85%
    for (let i = 2; i <= steps - 2; i++) {
      const t = i / steps;
      const px = from.x + (to.x - from.x) * t;
      const py = from.y + (to.y - from.y) * t;
      const sightlineEl = elFrom + (elTo - elFrom) * t;
      const terrainEl = this.getElevation({ x: px, y: py });

      const occlusion = terrainEl - sightlineEl;
      if (occlusion > 12 && occlusion > maxOcclusion) {
        maxOcclusion = occlusion;
        occludingPoint = { x: px, y: py };
      }
    }

    return {
      inDefilade: maxOcclusion > 0,
      occludingElevation: maxOcclusion,
      occludingPoint,
    };
  }

  public getNearestEnemyHeading(pos: Vector2D, faction: string): number {
    let nearestEnemy: Unit | null = null;
    let minDist = Infinity;
    for (const u of this.state.units) {
      if (u.faction !== faction && u.status !== 'shattered' && u.strength > 0) {
        const d = Math.hypot(u.position.x - pos.x, u.position.y - pos.y);
        if (d < minDist) {
          minDist = d;
          nearestEnemy = u;
        }
      }
    }
    if (nearestEnemy) {
      return Math.atan2(nearestEnemy.position.y - pos.y, nearestEnemy.position.x - pos.x);
    }
    return faction === 'french' ? 0 : Math.PI;
  }

  private updateMoraleStatus(unit: Unit) {
    const minShatterStrength = unit.type === 'artillery' ? 1 : 80;
    // Units shatter only when fighting headcount is annihilated
    if (unit.strength <= minShatterStrength) {
      if (unit.status !== 'shattered') {
        unit.status = 'shattered';
        unit.strength = 0;
        unit.currentOrder = undefined;

        // Clean up active orders for this unit and orders targeting this unit
        this.state.activeOrders = this.state.activeOrders.filter(
          (o) => o.unitId !== unit.id && o.targetUnitId !== unit.id
        );

        // Cancel orders from other units that were targeting this destroyed unit
        for (const other of this.state.units) {
          if (other.currentOrder?.targetUnitId === unit.id) {
            other.currentOrder = undefined;
            if (other.status === 'marching' || other.status === 'charging' || other.status === 'engaging') {
              other.status = 'idle';
            }
          }
        }

        this.addLog(`[DESTROYED] ${unit.name} has been shattered and wiped out!`, unit.faction, 'critical');

        // Automatically clear selection if this unit was selected
        if (this.state.selectedUnitId === unit.id) {
          this.state.selectedUnitId = null;
        }
        if (this.state.selectedUnitIds?.includes(unit.id)) {
          this.state.selectedUnitIds = this.state.selectedUnitIds.filter((id) => id !== unit.id);
        }
      }
    } else if (unit.morale <= 25) {
      // When morale breaks, the unit routes (flees in disorder), preserving remaining headcount!
      if (unit.status !== 'routing') {
        unit.status = 'routing';
        unit.currentOrder = undefined;
        this.state.activeOrders = this.state.activeOrders.filter((o) => o.unitId !== unit.id);
        this.addLog(`[PANIC] ${unit.name} morale has broken! Troops are routing in disarray!`, unit.faction, 'critical');
        this.triggerContactSitrep(unit, 'routing');
      }
    } else if (unit.morale <= 50) {
      if (!unit.hasTriggeredWaveringSitrep) {
        unit.hasTriggeredWaveringSitrep = true;
        this.triggerContactSitrep(unit, 'wavering');
      }
      // If the unit is not engaged in active combat or movement, set status to wavering
      if (unit.status !== 'engaging' && unit.status !== 'melee' && unit.status !== 'charging' && unit.status !== 'marching') {
        unit.status = 'wavering';
      }
    } else if (unit.morale > 55) {
      unit.hasTriggeredWaveringSitrep = false;
      if (unit.status === 'wavering') {
        unit.status = 'idle';
      }
    }
  }

  public getUnitVisionRadius(unit: Unit): number {
    let r = unit.type === 'cavalry' ? 260 : unit.type === 'headquarters' ? 220 : unit.type === 'artillery' ? 140 : 160;
    const elev = this.getElevation(unit.position);
    if (elev > 230) r *= 1.45;
    return r;
  }
}
