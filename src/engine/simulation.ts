import { Unit, ManeuverOrder, Scenario, TerrainFeature, CombatLogEntry, BattleStateSnapshot, HistoricalEvent, Vector2D } from '../types/game';

export interface SimulationState {
  timeMinutes: number;
  isRunning: boolean;
  speedMultiplier: number;
  isHistoricalMode: boolean;
  units: Unit[];
  terrain: TerrainFeature[];
  activeOrders: ManeuverOrder[];
  frenchLosses: number;
  alliedLosses: number;
  combatLogs: CombatLogEntry[];
  selectedUnitId: string | null;
  snapshots: BattleStateSnapshot[];
  lastHistoricalEventIndex: number;
}

export class BattleEngine {
  private scenario: Scenario;
  private state: SimulationState;
  private listeners: Array<(state: SimulationState) => void> = [];
  private logIdCounter = 0;
  private lastNotifyTime = 0;

  constructor(scenario: Scenario) {
    this.scenario = scenario;
    this.state = this.createInitialState();
    this.saveSnapshot();
  }

  private createInitialState(): SimulationState {
    return {
      timeMinutes: this.scenario.initialTimeMinutes,
      isRunning: true,
      speedMultiplier: 1,
      isHistoricalMode: true,
      units: JSON.parse(JSON.stringify(this.scenario.units)),
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
      selectedUnitId: 'fr_soult_sthilaire',
      snapshots: [],
      lastHistoricalEventIndex: -1,
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

  public setSelectedUnit(unitId: string | null) {
    this.state.selectedUnitId = unitId;
    this.notify();
  }

  public resetBattle() {
    this.state = this.createInitialState();
    this.saveSnapshot();
    this.notify();
  }

  public issueOrder(unitId: string, order: Omit<ManeuverOrder, 'id' | 'status'>) {
    const unit = this.state.units.find((u) => u.id === unitId);

    let targetDest = { ...order.destination };
    let finalHeading = order.finalHeading;

    if (unit) {
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

    const newOrder: ManeuverOrder = {
      ...order,
      destination: targetDest,
      finalHeading,
      waypoints,
      id: `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      status: 'executing',
    };

    if (unit) {
      unit.currentOrder = newOrder;
      unit.status = order.type === 'assault' ? 'charging' : 'marching';
      if (order.targetFormation) {
        unit.formation = order.targetFormation;
      }
    }

    // Add to active orders
    this.state.activeOrders = this.state.activeOrders.filter((o) => o.unitId !== unitId);
    this.state.activeOrders.push(newOrder);
    this.state.isRunning = true;

    this.addLog(
      `${unit?.name || 'Unit'} issued order: ${order.type.toUpperCase()} toward coordinates (${Math.round(order.destination.x)}, ${Math.round(order.destination.y)}).`,
      unit?.faction || 'french',
      'normal'
    );

    this.notify();
  }

  public cancelOrder(unitId: string) {
    const unit = this.state.units.find((u) => u.id === unitId);
    if (unit) {
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
      unit.currentOrder = undefined;
      unit.status = 'holding';
      unit.morale = Math.min(100, unit.morale + 5);
      this.state.activeOrders = this.state.activeOrders.filter((o) => o.unitId !== unitId);
      this.addLog(`${unit.name} anchors defensive line and holds ground.`, unit.faction, 'normal');
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
      experience: parent.experience,
      position: newPos,
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

  private addLog(message: string, faction: Unit['faction'], importance: CombatLogEntry['importance']) {
    this.logIdCounter++;
    const formatted = this.formatTime(this.state.timeMinutes);
    this.state.combatLogs.unshift({
      id: `log_${this.logIdCounter}`,
      timeFormatted: formatted,
      message,
      faction,
      importance,
    });
    if (this.state.combatLogs.length > 60) {
      this.state.combatLogs.pop();
    }
  }

  public formatTime(minutesFromStart: number): string {
    const baseHour = 7; // 07:00
    const totalMinutes = baseHour * 60 + minutesFromStart;
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.floor(totalMinutes % 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours > 12 ? hours - 12 : hours;
    return `${displayHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${period}`;
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
  public tick(deltaSeconds: number) {
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

    // 2.5 Resolve physical collisions so units don't overlap (standoff distances)
    this.resolveCollisions();

    // 3. Process combat and morale
    this.resolveCombat(deltaSeconds * this.state.speedMultiplier);

    // 4. Save periodic snapshots (approx every 8 battle minutes)
    const lastSnap = this.state.snapshots[this.state.snapshots.length - 1];
    if (!lastSnap || this.state.timeMinutes - lastSnap.timeMinutes >= 8) {
      this.saveSnapshot();
    }

    // Throttle React UI state notifications to ~10Hz (every 100ms) to keep UI ultra responsive
    // and prevent React re-render thrashing, while canvas RAF runs silky smooth at 60 FPS.
    const now = performance.now();
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
    if (event.timeInMinutes === 60) {
      // 07:30 Dokhturov strikes Telnitz; Langeron advances on Sokolnitz
      this.issueOrder('al_dokhturov', {
        unitId: 'al_dokhturov',
        type: 'assault',
        destination: { x: 385, y: 495 }, // Telnitz
        waypoints: [{ x: 470, y: 465 }, { x: 385, y: 495 }],
        plannedTime: 60,
      });
      this.issueOrder('al_langeron', {
        unitId: 'al_langeron',
        type: 'assault',
        destination: { x: 400, y: 415 }, // Sokolnitz
        waypoints: [{ x: 490, y: 390 }, { x: 400, y: 415 }],
        plannedTime: 60,
      });
      this.issueOrder('al_przhebishevsky', {
        unitId: 'al_przhebishevsky',
        type: 'assault',
        destination: { x: 410, y: 360 }, // Castle / Sokolnitz North
        waypoints: [{ x: 540, y: 310 }, { x: 410, y: 360 }],
        plannedTime: 60,
      });
      // Davout vanguard Friant arrives at Telnitz
      this.issueOrder('fr_friant', {
        unitId: 'fr_friant',
        type: 'assault',
        destination: { x: 365, y: 495 },
        waypoints: [{ x: 365, y: 495 }],
        plannedTime: 60,
      });
    } else if (event.timeInMinutes === 120) {
      // 08:45 "Sun of Austerlitz" - Soult strikes the Pratzen Heights
      this.issueOrder('fr_sthilaire', {
        unitId: 'fr_sthilaire',
        type: 'assault',
        destination: { x: 560, y: 320 }, // Pratzen crest
        waypoints: [{ x: 490, y: 295 }, { x: 560, y: 320 }],
        curveControl: { x: 495, y: 285 },
        plannedTime: 120,
      });
      this.issueOrder('fr_vandamme', {
        unitId: 'fr_vandamme',
        type: 'assault',
        destination: { x: 610, y: 285 }, // Staré Vinohrady
        waypoints: [{ x: 510, y: 255 }, { x: 610, y: 285 }],
        curveControl: { x: 505, y: 245 },
        plannedTime: 120,
      });
    } else if (event.timeInMinutes === 240) {
      // 10:45 Northern battle along Olmütz Highway
      this.issueOrder('fr_lannes', {
        unitId: 'fr_lannes',
        type: 'assault',
        destination: { x: 740, y: 95 },
        waypoints: [{ x: 630, y: 110 }, { x: 740, y: 95 }],
        plannedTime: 240,
      });
      this.issueOrder('fr_murat', {
        unitId: 'fr_murat',
        type: 'assault',
        destination: { x: 680, y: 130 },
        waypoints: [{ x: 520, y: 160 }, { x: 680, y: 130 }],
        plannedTime: 240,
      });
      this.issueOrder('al_bagration', {
        unitId: 'al_bagration',
        type: 'assault',
        destination: { x: 660, y: 105 },
        waypoints: [{ x: 770, y: 75 }, { x: 660, y: 105 }],
        plannedTime: 240,
      });
    } else if (event.timeInMinutes === 330) {
      // 12:30 Russian Guard counter-attack on Pratzen
      this.issueOrder('al_constantine', {
        unitId: 'al_constantine',
        type: 'assault',
        destination: { x: 615, y: 290 },
        waypoints: [{ x: 680, y: 320 }, { x: 615, y: 290 }],
        plannedTime: 330,
      });
      this.issueOrder('fr_bessieres', {
        unitId: 'fr_bessieres',
        type: 'assault',
        destination: { x: 580, y: 285 },
        waypoints: [{ x: 510, y: 220 }, { x: 580, y: 285 }],
        plannedTime: 330,
      });
    } else if (event.timeInMinutes === 420) {
      // 14:00 Soult sweeps south toward the frozen Satschan and Menitz ponds
      this.issueOrder('fr_vandamme', {
        unitId: 'fr_vandamme',
        type: 'flank',
        destination: { x: 480, y: 510 },
        waypoints: [{ x: 560, y: 400 }, { x: 480, y: 510 }],
        curveControl: { x: 575, y: 445 },
        plannedTime: 420,
      });
      this.issueOrder('fr_sthilaire', {
        unitId: 'fr_sthilaire',
        type: 'assault',
        destination: { x: 440, y: 475 },
        waypoints: [{ x: 500, y: 390 }, { x: 440, y: 475 }],
        plannedTime: 420,
      });
    }
  }

  private updateUnitMovements(effectiveSpeed: number) {
    for (const unit of this.state.units) {
      if (unit.status === 'shattered' || unit.status === 'routing') {
        // Routing units drift backwards
        if (unit.status === 'routing') {
          const fleeDir = unit.faction === 'french' ? -1 : 1;
          unit.position.x += fleeDir * 0.4 * effectiveSpeed;
        }
        continue;
      }

      if (!unit.currentOrder) continue;

      const order = unit.currentOrder;
      
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

      // Check if final destination reached
      if (dist < 14 && (!order.waypoints || order.waypoints.length === 0)) {
        if (order.finalHeading !== undefined) {
          unit.heading = order.finalHeading;
        }
        unit.currentOrder = undefined;
        unit.status = 'idle';
        this.state.activeOrders = this.state.activeOrders.filter((o) => o.id !== order.id);
        this.addLog(`${unit.name} has completed maneuver to destination.`, unit.faction, 'normal');
        continue;
      }

      // Rotate towards current target heading (wheeling maneuver)
      const targetAngle = Math.atan2(dy, dx);
      let angleDiff = targetAngle - unit.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Wheel towards target heading responsively
      const turnRate = 6.0;
      const maxTurn = Math.min(Math.abs(angleDiff), turnRate * effectiveSpeed);
      unit.heading += Math.sign(angleDiff) * maxTurn;

      // When wheeling sharply, forward advance is slightly checked
      const turnAlignment = Math.max(0.25, Math.cos(angleDiff));

      // Terrain speed modifier
      const terrainMod = this.getTerrainSpeedModifier(unit.position);
      const formationSpeedMod = unit.formation === 'column' ? 1.4 : unit.formation === 'square' ? 0.25 : 0.9;

      // Authentic simulated velocities for 1x speed to match operational scale.
      // Cavalry ~3 px/s, artillery ~1 px/s, infantry ~1.5 px/s
      const baseVelocity = unit.type === 'cavalry' ? 3.0 : unit.type === 'artillery' ? 1.0 : 1.5;

      // Natural suppression recovery over time
      if (unit.suppression && unit.suppression > 0) {
        unit.suppression = Math.max(0, unit.suppression - 1.5 * effectiveSpeed);
      }
      const suppressionPenalty = 1 - ((unit.suppression || 0) * 0.004); // Up to 40% slow under heavy suppression

      const moveStep = baseVelocity * unit.speed * terrainMod * formationSpeedMod * turnAlignment * suppressionPenalty * effectiveSpeed;

      unit.position.x += Math.cos(unit.heading) * moveStep;
      unit.position.y += Math.sin(unit.heading) * moveStep;

      // Increase fatigue slowly while marching
      unit.fatigue = Math.min(100, unit.fatigue + 0.01 * effectiveSpeed);
    }
  }

  private resolveCollisions() {
    // Basic iterative collision to push units apart
    const standoffFriendly = 25;
    const standoffEnemy = 40; // Engagement line distance
    for (let i = 0; i < this.state.units.length; i++) {
      for (let j = i + 1; j < this.state.units.length; j++) {
        const u1 = this.state.units[i];
        const u2 = this.state.units[j];
        if (u1.status === 'shattered' || u2.status === 'shattered') continue;

        const dx = u2.position.x - u1.position.x;
        const dy = u2.position.y - u1.position.y;
        const dist = Math.hypot(dx, dy);
        
        const minStandoff = u1.faction !== u2.faction ? standoffEnemy : standoffFriendly;
        
        if (dist < minStandoff && dist > 0.01) {
          const overlap = minStandoff - dist;
          // Push units apart proportionally. If a unit is 'holding', it's heavier.
          const w1 = u1.status === 'holding' ? 0.1 : 0.5;
          const w2 = u2.status === 'holding' ? 0.1 : 0.5;
          const totalW = w1 + w2;
          
          const pushX = (dx / dist) * overlap;
          const pushY = (dy / dist) * overlap;
          
          u1.position.x -= pushX * (w1 / totalW);
          u1.position.y -= pushY * (w1 / totalW);
          u2.position.x += pushX * (w2 / totalW);
          u2.position.y += pushY * (w2 / totalW);
        }
      }
    }
  }

  private getTerrainSpeedModifier(pos: { x: number; y: number }): number {
    for (const feature of this.state.terrain) {
      if (feature.radius && feature.center) {
        const d = Math.hypot(pos.x - feature.center.x, pos.y - feature.center.y);
        if (d <= feature.radius) {
          return feature.moveSpeedMod ?? 1.0;
        }
      }
    }
    return 1.0;
  }

  private resolveCombat(effectiveSpeed: number) {
    const frenchUnits = this.state.units.filter((u) => u.faction === 'french' && u.status !== 'shattered');
    const alliedUnits = this.state.units.filter((u) => u.faction === 'allies' && u.status !== 'shattered');

    for (const french of frenchUnits) {
      for (const allied of alliedUnits) {
        const dx = allied.position.x - french.position.x;
        const dy = allied.position.y - french.position.y;
        const dist = Math.hypot(dx, dy);

        // Check if within maximum engagement range (musket or artillery)
        const maxRange = Math.max(french.range, allied.range);
        if (dist <= maxRange) {
          this.engagePair(french, allied, dist, effectiveSpeed);
        }
      }
    }
  }

  private engagePair(french: Unit, allied: Unit, dist: number, effectiveSpeed: number) {
    // Both units can engage if within their respective ranges
    const frenchInRange = dist <= french.range;
    const alliedInRange = dist <= allied.range;

    if (!frenchInRange && !alliedInRange) return;

    // Tactical advantages
    const frenchElevation = this.getElevation(french.position);
    const alliedElevation = this.getElevation(allied.position);
    const elevationAdvantage = frenchElevation - alliedElevation;

    // French attacks Allied
    if (frenchInRange && french.status !== 'routing') {
      const { damage, isFlanking, isRear } = this.calculateDamage(french, allied, dist, elevationAdvantage, effectiveSpeed);
      allied.strength = Math.max(0, allied.strength - damage);
      french.kills += damage;
      allied.casualtiesTaken += damage;
      this.state.alliedLosses += damage;

      // Flank / Rear morale shock
      const shock = isRear ? 12 : isFlanking ? 6 : 0;
      const moraleLoss = (damage / allied.initialStrength) * 120 + shock + 0.05 * effectiveSpeed;
      allied.morale = Math.max(0, allied.morale - moraleLoss);

      // Suppression buildup under fire
      allied.suppression = Math.min(100, (allied.suppression || 0) + (damage / Math.max(1, allied.initialStrength)) * 250 + 0.1 * effectiveSpeed);

      french.status = 'engaging';
      if (shock > 0) {
        allied.status = allied.morale <= 25 ? 'routing' : 'wavering';
      }
    }

    // Allied attacks French
    if (alliedInRange && allied.status !== 'routing') {
      const { damage, isFlanking, isRear } = this.calculateDamage(allied, french, dist, -elevationAdvantage, effectiveSpeed);
      french.strength = Math.max(0, french.strength - damage);
      allied.kills += damage;
      french.casualtiesTaken += damage;
      this.state.frenchLosses += damage;

      const shock = isRear ? 12 : isFlanking ? 6 : 0;
      const moraleLoss = (damage / french.initialStrength) * 120 + shock + 0.05 * effectiveSpeed;
      french.morale = Math.max(0, french.morale - moraleLoss);

      // Suppression buildup under fire
      french.suppression = Math.min(100, (french.suppression || 0) + (damage / Math.max(1, french.initialStrength)) * 250 + 0.1 * effectiveSpeed);

      allied.status = 'engaging';
      if (shock > 0) {
        french.status = french.morale <= 25 ? 'routing' : 'wavering';
      }
    }

    // Update unit statuses based on morale
    this.updateMoraleStatus(french);
    this.updateMoraleStatus(allied);

    // Auto-face towards enemy to create neat arrays
    const faceTarget = (u1: Unit, u2: Unit) => {
      if (u1.formation === 'square' || u1.status === 'routing') return;
      const targetAngle = Math.atan2(u2.position.y - u1.position.y, u2.position.x - u1.position.x);
      let angleDiff = targetAngle - u1.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      const turnRate = 0.5 * effectiveSpeed;
      if (Math.abs(angleDiff) > 0.05) {
        u1.heading += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnRate);
      }
    };
    if (frenchInRange) faceTarget(french, allied);
    if (alliedInRange) faceTarget(allied, french);
  }

  private calculateDamage(attacker: Unit, defender: Unit, dist: number, elevDiff: number, effectiveSpeed: number): { damage: number; isFlanking: boolean; isRear: boolean } {
    let power = attacker.type === 'artillery' ? attacker.firepower * 1.5 : attacker.firepower;

    // Suppression degrades attacker firepower
    if (attacker.suppression && attacker.suppression > 0) {
      power *= Math.max(0.4, 1 - (attacker.suppression / 100) * 0.5);
    }

    // Range falloff
    const rangeRatio = 1 - dist / attacker.range;
    power *= Math.max(0.2, rangeRatio);

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

    // Formation / Posture modifiers:
    // Column/March takes increased firepower damage
    if (defender.formation === 'column') {
      power *= 1.4;
    }
    // Defend/Square resists cavalry charge, but vulnerable to artillery
    if (defender.formation === 'square') {
      if (attacker.type === 'cavalry') {
        power *= 0.15; // cavalry charge bounces off square
      } else if (attacker.type === 'artillery') {
        power *= 2.2;
      }
    }
    // Cavalry charging an exposed line flank
    if (attacker.type === 'cavalry' && defender.formation === 'line' && (isFlanking || isRear)) {
      power *= 2.2;
    }

    // Elevation bonus (+20% if on higher ground like Pratzen Heights)
    if (elevDiff > 20) {
      power *= 1.25;
    } else if (elevDiff < -20) {
      power *= 0.8;
    }

    // Experience bonus
    if (attacker.experience === 'Elite Guard') power *= 1.35;
    else if (attacker.experience === 'Veteran') power *= 1.15;

    // Village cover
    const cover = this.getCoverModifier(defender.position);
    power *= 1 - cover;

    // Base damage per second
    const baseDamage = (power * (attacker.strength / 1000) * 0.08 * effectiveSpeed);
    return {
      damage: Math.round(Math.max(1, baseDamage)),
      isFlanking,
      isRear,
    };
  }

  private getElevation(pos: { x: number; y: number }): number {
    for (const feature of this.state.terrain) {
      if (feature.elevation && feature.radius && feature.center) {
        const d = Math.hypot(pos.x - feature.center.x, pos.y - feature.center.y);
        if (d <= feature.radius) {
          return feature.elevation;
        }
      }
      // Pratzen Heights bounding polygon check
      if (feature.id === 'pratzen_heights' && pos.x >= 1250 && pos.x <= 1850 && pos.y >= 850 && pos.y <= 1350) {
        return feature.elevation ?? 80;
      }
    }
    return 20; // baseline valley elevation
  }

  private getCoverModifier(pos: { x: number; y: number }): number {
    for (const feature of this.state.terrain) {
      if (feature.cover && feature.radius && feature.center) {
        const d = Math.hypot(pos.x - feature.center.x, pos.y - feature.center.y);
        if (d <= feature.radius) {
          return feature.cover;
        }
      }
    }
    return 0;
  }

  private updateMoraleStatus(unit: Unit) {
    if (unit.strength <= 100 || unit.morale <= 5) {
      if (unit.status !== 'shattered') {
        unit.status = 'shattered';
        this.addLog(`[DISASTER] ${unit.name} has been shattered and destroyed!`, unit.faction, 'critical');
      }
    } else if (unit.morale <= 25) {
      if (unit.status !== 'routing') {
        unit.status = 'routing';
        this.addLog(`[PANIC] ${unit.name} morale has broken! Troops are routing in disarray!`, unit.faction, 'critical');
      }
    } else if (unit.morale <= 45) {
      unit.status = 'wavering';
    }
  }
}
