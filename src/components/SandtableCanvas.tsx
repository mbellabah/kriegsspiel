import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { SandtableRenderer, Camera, DraftingManeuver } from '../engine/canvasRenderer';
import { Unit, Vector2D, TroopFilterType, TargetReferencePoint } from '../types/game';
import { sounds } from '../engine/soundEffects';
import { ZoomIn, ZoomOut, Crosshair, Volume2, VolumeX, Copy, X, Navigation } from 'lucide-react';
import { TacticalContextMenu } from './TacticalContextMenu';
import { headingToBearing, getCardinalDirection } from '../engine/tacticalNavigation';

interface SandtableCanvasProps {
  engine: BattleEngine;
  state: SimulationState;
  showHexGrid: boolean;
  showRangeRings?: boolean;
  onToggleRangeRings?: () => void;
  showCorpsOverlay?: boolean;
  onToggleCorpsOverlay?: () => void;
  hoveredCorps?: string | null;
  activeFilter?: TroopFilterType;
  isBombardTargeting?: boolean;
  onStartBombardTargeting?: () => void;
  onCancelBombardTargeting?: () => void;
  focusLocation?: Vector2D | null;
  isPickingCoordinates?: boolean;
  onPickCoordinates?: (coords: Vector2D) => void;
  onCancelPickCoordinates?: () => void;
  isDispatchDeskOpen?: boolean;
  onInsertCompassText?: (text: string) => void;
  onOpenSitrep?: () => void;
}

export const SandtableCanvas: React.FC<SandtableCanvasProps> = React.memo(({
  engine,
  state,
  showHexGrid,
  showRangeRings = true,
  onToggleRangeRings,
  showCorpsOverlay = false,
  onToggleCorpsOverlay,
  hoveredCorps = null,
  activeFilter = 'all',
  isBombardTargeting = false,
  onStartBombardTargeting,
  onCancelBombardTargeting,
  focusLocation = null,
  isPickingCoordinates = false,
  onPickCoordinates,
  onCancelPickCoordinates,
  isDispatchDeskOpen = false,
  onInsertCompassText,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SandtableRenderer | null>(null);

  // Initial Camera centered on the authentic 2400x1500 atlas map, auto-fitting the window
  const initialCam = useMemo(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 2400;
    const h = typeof window !== 'undefined' ? window.innerHeight : 1500;
    const fitZoom = Math.min(Math.max(w / 2400, h / 1500), 1.8);
    return {
      x: 1200,
      y: 750,
      zoom: fitZoom,
    };
  }, []);

  // High-performance camera physics & momentum refs (decoupled from React render lifecycle)
  const cameraRef = useRef<Camera>({ ...initialCam });
  const cameraVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const targetZoomRef = useRef<number>(initialCam.zoom);
  const targetFocusRef = useRef<Vector2D | null>(null);
  const keysPressedRef = useRef<Record<string, boolean>>({});
  const isShiftPressedRef = useRef<boolean>(false);
  const hoverRafRef = useRef<number | null>(null);
  const canvasRectRef = useRef<{ width: number; height: number; left: number; top: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 2400,
    height: typeof window !== 'undefined' ? window.innerHeight : 1500,
    left: 0,
    top: 0,
  });

  // Interaction modes
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<Vector2D>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [drawingOrder, setDrawingOrder] = useState<DraftingManeuver | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);


  // Quick cursor coordinate copy toast feedback
  const [cursorToast, setCursorToast] = useState<{
    text: string;
    screenPos: { x: number; y: number };
  } | null>(null);

  // Live mouse hover coordinates & screen position
  const [hoverCoords, setHoverCoords] = useState<Vector2D | null>(null);
  const [hoverScreenPos, setHoverScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [copiedCoord, setCopiedCoord] = useState(false);

  // Rubber-band box selection
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxSelectStartScreen, setBoxSelectStartScreen] = useState<Vector2D | null>(null);
  const [boxSelectCurrentScreen, setBoxSelectCurrentScreen] = useState<Vector2D | null>(null);

  // Interactive Bearing Arrow Tool
  const [isDrawingBearing, setIsDrawingBearing] = useState(false);
  const [bearingArrow, setBearingArrow] = useState<{
    origin: Vector2D;
    target: Vector2D;
    isPinned: boolean;
  } | null>(null);

  const isDrawingBearingRef = useRef(isDrawingBearing);
  isDrawingBearingRef.current = isDrawingBearing;
  const bearingArrowRef = useRef(bearingArrow);
  bearingArrowRef.current = bearingArrow;

  // Computed Bearing & Distance from drawn arrow
  const drawnBearingInfo = useMemo(() => {
    if (!bearingArrow) return null;
    const dx = bearingArrow.target.x - bearingArrow.origin.x;
    const dy = bearingArrow.target.y - bearingArrow.origin.y;
    const distPx = Math.hypot(dx, dy);
    if (distPx < 4 && !bearingArrow.isPinned) return null;
    const mathAngle = Math.atan2(dy, dx);
    const bearing = headingToBearing(mathAngle);
    return {
      bearing,
      distance: distPx * 5, // 1px = 5m (accurate simulation ground distance in meters)
      cardinal: getCardinalDirection(bearing),
    };
  }, [bearingArrow]);

  const toggleBearingTool = useCallback(() => {
    setIsDrawingBearing((prev) => {
      const next = !prev;
      if (next) {
        const curState = engine.getState();
        const selUnit = curState.selectedUnitId 
          ? curState.units.find((u) => u.id === curState.selectedUnitId)
          : null;
        if (selUnit) {
          const target = hoverCoordsRef.current ? { ...hoverCoordsRef.current } : { ...selUnit.position };
          setBearingArrow({
            origin: { ...selUnit.position },
            target,
            isPinned: false,
          });
        }
      } else {
        setBearingArrow(null);
      }
      return next;
    });
  }, [engine]);

  // Quick cursor coordinate and orientation refs
  const hoverCoordsRef = useRef<Vector2D | null>(null);
  hoverCoordsRef.current = hoverCoords;
  const hoverScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  hoverScreenPosRef.current = hoverScreenPos;
  const handleQuickCopyRef = useRef<(coords: Vector2D, screenPos: { x: number; y: number } | null, includeBearing?: boolean) => void>(() => {});



  const drawingOrderRef = useRef(drawingOrder);
  drawingOrderRef.current = drawingOrder;

  const hoveredUnitIdRef = useRef(hoveredUnitId);
  hoveredUnitIdRef.current = hoveredUnitId;

  const showHexGridRef = useRef(showHexGrid);
  showHexGridRef.current = showHexGrid;

  const showRangeRingsRef = useRef(showRangeRings);
  showRangeRingsRef.current = showRangeRings;

  const activeFilterRef = useRef(activeFilter);
  activeFilterRef.current = activeFilter;

  const isBombardTargetingRef = useRef(isBombardTargeting);
  isBombardTargetingRef.current = isBombardTargeting;

  const isPickingCoordinatesRef = useRef(isPickingCoordinates);
  isPickingCoordinatesRef.current = isPickingCoordinates;

  const showCorpsOverlayRef = useRef(showCorpsOverlay);
  showCorpsOverlayRef.current = showCorpsOverlay;

  const hoveredCorpsRef = useRef(hoveredCorps);
  hoveredCorpsRef.current = hoveredCorps;

  const targetingMousePosRef = useRef<Vector2D | undefined>(undefined);

  // Target Reference Point (TRP) drag-and-drop state
  const [draggingTrpId, setDraggingTrpId] = useState<string | null>(null);
  const draggingTrpIdRef = useRef<string | null>(null);
  draggingTrpIdRef.current = draggingTrpId;

  // Tactical Context Menu state (RMB on terrain or TRP)
  const [contextMenuData, setContextMenuData] = useState<{
    screenPos: { x: number; y: number };
    worldCoords: Vector2D;
    trp?: TargetReferencePoint | null;
  } | null>(null);
  const contextMenuDataRef = useRef(contextMenuData);
  contextMenuDataRef.current = contextMenuData;

  const rightClickDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // Identify nearby pre-planned Target Reference Point within 35px of cursor (or currently dragging TRP)
  const nearbyTRP = useMemo(() => {
    if (draggingTrpId && state.targetReferencePoints) {
      return state.targetReferencePoints.find((t) => t.id === draggingTrpId) || null;
    }
    if (!hoverCoords || !state.targetReferencePoints) return null;
    for (const trp of state.targetReferencePoints) {
      const dist = Math.hypot(trp.position.x - hoverCoords.x, trp.position.y - hoverCoords.y);
      if (dist <= 35) {
        return trp;
      }
    }
    return null;
  }, [hoverCoords, state.targetReferencePoints, draggingTrpId]);

  const nearbyTrpIdRef = useRef<string | null>(null);
  nearbyTrpIdRef.current = nearbyTRP?.id || null;

  // Identify nearby strategic landmark or terrain feature within 80px of cursor
  const nearbyLandmark = useMemo(() => {
    if (!hoverCoords) return null;
    for (const t of state.terrain) {
      if (t.center && t.name) {
        const dist = Math.hypot(t.center.x - hoverCoords.x, t.center.y - hoverCoords.y);
        if (dist <= 80) {
          return t;
        }
      }
    }
    return null;
  }, [hoverCoords, state.terrain]);

  // Identify unit currently hovered by cursor
  const hoveredUnit = useMemo(() => {
    if (!hoveredUnitId) return null;
    return state.units.find((u) => u.id === hoveredUnitId) || null;
  }, [hoveredUnitId, state.units]);

  // Setup HiDPI Canvas & Renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const renderer = new SandtableRenderer(canvas);
    renderer.engine = engine;
    rendererRef.current = renderer;

    const handleResize = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvasRectRef.current = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    handleResize();
    const ro = new ResizeObserver(() => handleResize());
    ro.observe(canvas);
    window.addEventListener('resize', handleResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.engine = engine;
    }
  }, [engine]);

  // Smoothly center camera when a sector focus is requested from SITREP
  useEffect(() => {
    if (focusLocation) {
      targetFocusRef.current = { x: focusLocation.x, y: focusLocation.y };
      targetZoomRef.current = Math.max(cameraRef.current.zoom, 1.6);
    }
  }, [focusLocation]);

  // Keyboard Event Listeners
  useEffect(() => {
    const isFormInput = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only suppress controls if the user is actively focused on an input field
      if (isFormInput(e.target) || isFormInput(document.activeElement)) {
        return;
      }

      const lowerKey = e.key.toLowerCase();

      // Pan keys
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(lowerKey)) {
        keysPressedRef.current[lowerKey] = true;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        const willRun = !engine.getState().isRunning;
        console.log('[TOTAL WAR] Spacebar pressed. Transitioning isRunning to:', willRun);
        engine.setRunning(willRun);
        try {
          if (willRun) {
            sounds.playDrum();
          }
        } catch (err) {
          console.warn('Audio feedback failed:', err);
        }
      }
      if (e.shiftKey) {
        isShiftPressedRef.current = true;
      }

      // Hotkeys for ranges (R), corps overlay (C), Call-For-Fire bombardment (B), Charge (F), and Quick Copy (X)
      if (!drawingOrder) {
        if (lowerKey === 'x') {
          // Hotkey X: Instant copy hovered grid coordinates (or Shift+X for coordinates + bearing)
          if (hoverCoordsRef.current) {
            handleQuickCopyRef.current(hoverCoordsRef.current, hoverScreenPosRef.current, e.shiftKey);
          }
        } else if (lowerKey === 'r') {
          onToggleRangeRings?.();
        } else if (lowerKey === 'c') {
          onToggleCorpsOverlay?.();
        } else if (lowerKey === 'k') {
          engine.toggleArtilleryKillzones();
          try {
            sounds.playClick();
          } catch {}
        } else if (lowerKey === 'b') {
          const currentUnit = state.selectedUnitId 
            ? state.units.find((u) => u.id === state.selectedUnitId)
            : null;
          if (currentUnit && currentUnit.type === 'artillery') {
            if (isBombardTargeting) {
              onCancelBombardTargeting?.();
            } else {
              onStartBombardTargeting?.();
            }
          } else {
            toggleBearingTool();
          }
        } else if (lowerKey === 'f') {
          const currentUnit = state.selectedUnitId 
            ? state.units.find((u) => u.id === state.selectedUnitId)
            : null;
          if (currentUnit && (currentUnit.type === 'infantry' || currentUnit.type === 'cavalry')) {
            const enemyFaction = currentUnit.faction === 'french' ? 'allies' : 'french';
            let nearestEnemy: Unit | null = null;
            let minDist = 350;
            for (const u of state.units) {
              if (u.faction === enemyFaction && u.status !== 'shattered' && u.strength > 0) {
                const d = Math.hypot(u.position.x - currentUnit.position.x, u.position.y - currentUnit.position.y);
                if (d < minDist) {
                  minDist = d;
                  nearestEnemy = u;
                }
              }
            }
            const dest = nearestEnemy
              ? { x: nearestEnemy.position.x, y: nearestEnemy.position.y }
              : {
                  x: Math.max(30, Math.min(2370, currentUnit.position.x + Math.cos(currentUnit.heading) * 160)),
                  y: Math.max(30, Math.min(1470, currentUnit.position.y + Math.sin(currentUnit.heading) * 160)),
                };
            engine.issueOrder(currentUnit.id, {
              unitId: currentUnit.id,
              type: 'charge',
              destination: dest,
              waypoints: [],
              plannedTime: state.timeMinutes,
            });
          }
        }
      }

      if (e.key === 'Escape') {
        if (contextMenuDataRef.current) {
          setContextMenuData(null);
        } else if (drawingOrderRef.current) {
          setDrawingOrder(null);
        } else if (isPickingCoordinatesRef.current) {
          onCancelPickCoordinates?.();
        } else if (isBombardTargeting) {
          onCancelBombardTargeting?.();
        } else if (isDrawingBearingRef.current || bearingArrowRef.current) {
          setIsDrawingBearing(false);
          setBearingArrow(null);
        } else {
          engine.setSelectedUnit(null);
        }
      }

      // Total War Arc bend shortcuts when dragging: Q (flank left) / E (flank right) / R (reset straight)
      if (drawingOrder) {
        if (lowerKey === 'q') {
          setDrawingOrder((d) => (d ? { ...d, curveOffset: (d.curveOffset || 0) - 25 } : null));
        } else if (lowerKey === 'e') {
          setDrawingOrder((d) => (d ? { ...d, curveOffset: (d.curveOffset || 0) + 25 } : null));
        } else if (lowerKey === 'r') {
          setDrawingOrder((d) => (d ? { ...d, curveOffset: 0, waypoints: [d.currentTarget] } : null));
        }
      } else if (!isFormInput(e.target) && !isFormInput(document.activeElement)) {
        // Quick toggle hotkeys
        if (lowerKey === 't') {
          engine.toggleTopography();
        } else if (lowerKey === 'k') {
          engine.toggleArtilleryKillzones();
        } else if (lowerKey === 'b') {
          toggleBearingTool();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isFormInput(e.target) || isFormInput(document.activeElement)) {
        return;
      }

      const lowerKey = e.key.toLowerCase();
      delete keysPressedRef.current[lowerKey];
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
      if (!e.shiftKey) {
        isShiftPressedRef.current = false;
      }
    };

    const handleWindowBlur = () => {
      keysPressedRef.current = {};
      isShiftPressedRef.current = false;
      cameraVelocityRef.current = { vx: 0, vy: 0 };
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [drawingOrder]);

  // Main Render, Camera Physics & Simulation Loop
  // Runs continuously at 60/120 FPS on requestAnimationFrame, completely decoupled from React render churn
  useEffect(() => {
    let lastTime = performance.now();
    let animationId: number;

    const loop = (time: number) => {
      try {
        const deltaSeconds = Math.min(0.05, (time - lastTime) / 1000);
        lastTime = time;

        // 1. Butter-Smooth Camera Physics (WASD / Arrow Keys with Inertia & Velocity Damping)
        const cam = cameraRef.current;
        let inputX = 0;
        let inputY = 0;
        const keys = keysPressedRef.current;
        if (keys['w'] || keys['arrowup']) inputY -= 1;
        if (keys['s'] || keys['arrowdown']) inputY += 1;
        if (keys['a'] || keys['arrowleft']) inputX -= 1;
        if (keys['d'] || keys['arrowright']) inputX += 1;

        // Diagonal normalization so diagonal movement has equal velocity
        if (inputX !== 0 && inputY !== 0) {
          const invLen = 0.70710678;
          inputX *= invLen;
          inputY *= invLen;
        }

        const isFastPan = isShiftPressedRef.current;
        const targetSpeed = (isFastPan ? 2200 : 1200) / cam.zoom;
        const targetVx = inputX * targetSpeed;
        const targetVy = inputY * targetSpeed;

        const vel = cameraVelocityRef.current;
        const accelRate = (inputX !== 0 || inputY !== 0) ? 14 : 9;
        vel.vx += (targetVx - vel.vx) * Math.min(1, accelRate * deltaSeconds);
        vel.vy += (targetVy - vel.vy) * Math.min(1, accelRate * deltaSeconds);

        if (Math.abs(vel.vx) < 0.1 && inputX === 0) vel.vx = 0;
        if (Math.abs(vel.vy) < 0.1 && inputY === 0) vel.vy = 0;

        if (vel.vx !== 0 || vel.vy !== 0) {
          cam.x = Math.max(200, Math.min(2200, cam.x + vel.vx * deltaSeconds));
          cam.y = Math.max(150, Math.min(1350, cam.y + vel.vy * deltaSeconds));
        }

        // Smooth Zoom Interpolation
        if (Math.abs(cam.zoom - targetZoomRef.current) > 0.001) {
          cam.zoom += (targetZoomRef.current - cam.zoom) * Math.min(1, 15 * deltaSeconds);
        } else {
          cam.zoom = targetZoomRef.current;
        }

        // Smooth Focus Glide (if SITREP [LOCATE] or sector focus requested)
        if (targetFocusRef.current) {
          const tf = targetFocusRef.current;
          const dx = tf.x - cam.x;
          const dy = tf.y - cam.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 1.5) {
            cam.x += dx * Math.min(1, 10 * deltaSeconds);
            cam.y += dy * Math.min(1, 10 * deltaSeconds);
          } else {
            cam.x = tf.x;
            cam.y = tf.y;
            targetFocusRef.current = null;
          }
        }

        // 2. Tick simulation
        engine.tick(deltaSeconds);

        // 3. Render main tactical sandtable
        if (rendererRef.current && canvasRef.current) {
          const liveState = engine.getState();
          rendererRef.current.showHexGrid = showHexGridRef.current;
          rendererRef.current.activeFilter = activeFilterRef.current || 'all';
          rendererRef.current.showRangeRings = !!showRangeRingsRef.current;
          rendererRef.current.showArtilleryKillzones = liveState.showArtilleryKillzones !== false;
          rendererRef.current.showTopography = liveState.showTopography !== false;
          rendererRef.current.showCorpsOverlay = !!showCorpsOverlayRef.current;
          rendererRef.current.hoveredCorps = hoveredCorpsRef.current || null;
          rendererRef.current.hoveredTrpId = nearbyTrpIdRef.current;
          rendererRef.current.draggingTrpId = draggingTrpIdRef.current;
          rendererRef.current.targetingState = isBombardTargetingRef.current && liveState.selectedUnitId ? {
            active: true,
            batteryUnitId: liveState.selectedUnitId,
            currentMousePos: targetingMousePosRef.current,
          } : { active: false };

          rendererRef.current.render(
            liveState,
            cameraRef.current,
            drawingOrderRef.current,
            hoveredUnitIdRef.current
          );
        }
      } catch (err) {
        console.error('Simulation loop error:', err);
      } finally {
        animationId = requestAnimationFrame(loop);
      }
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [engine]);

  // Instant copy coordinates or bearing to clipboard & Dispatch Desk
  const handleQuickCopy = useCallback(
    (coords: Vector2D, screenPos: { x: number; y: number } | null, includeBearing: boolean = false) => {
      const roundedX = Math.round(coords.x);
      const roundedY = Math.round(coords.y);
      const coordStr = `(${roundedX}, ${roundedY})`;
      let fullText = coordStr;

      const curState = engine.getState();
      const curSelected = curState.selectedUnitId 
        ? curState.units.find((u) => u.id === curState.selectedUnitId)
        : null;

      if (includeBearing) {
        const refX = curSelected ? curSelected.position.x : 1000;
        const refY = curSelected ? curSelected.position.y : 750;
        const dx = coords.x - refX;
        const dy = coords.y - refY;
        const mathAngle = Math.atan2(dy, dx);
        const bearing = headingToBearing(mathAngle);
        const cardinal = getCardinalDirection(bearing).code;
        fullText = `GRID ${coordStr} Bearing ${String(bearing).padStart(3, '0')}° (${cardinal})`;
      }

      navigator.clipboard?.writeText(fullText);
      try {
        sounds.playDispatchStamp();
      } catch {}

      if (onInsertCompassText && isDispatchDeskOpen) {
        onInsertCompassText(fullText);
      }

      setCopiedCoord(true);
      setTimeout(() => setCopiedCoord(false), 1500);

      if (screenPos) {
        setCursorToast({
          text: fullText,
          screenPos,
        });
        setTimeout(() => setCursorToast(null), 1800);
      }
    },
    [engine, onInsertCompassText, isDispatchDeskOpen]
  );
  handleQuickCopyRef.current = handleQuickCopy;

  // Convert Screen pixel coordinates to World coordinates
  const screenToWorld = useCallback(
    (screenX: number, screenY: number, currentCam: Camera = cameraRef.current): Vector2D => {
      const rect = canvasRectRef.current;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return {
        x: (screenX - centerX) / currentCam.zoom + currentCam.x,
        y: (screenY - centerY) / currentCam.zoom + currentCam.y,
      };
    },
    []
  );

  // Convert World coordinates to Screen pixel coordinates
  const worldToScreen = useCallback(
    (world: Vector2D, currentCam: Camera = cameraRef.current): Vector2D => {
      const rect = canvasRectRef.current;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return {
        x: (world.x - currentCam.x) * currentCam.zoom + centerX,
        y: (world.y - currentCam.y) * currentCam.zoom + centerY,
      };
    },
    []
  );

  // Find unit under cursor using latest live engine state (calibrated to counter geometry)
  const getUnitAt = useCallback(
    (worldPos: Vector2D): Unit | null => {
      const currentUnits = engine.getState().units;
      for (const unit of currentUnits) {
        if (unit.status === 'shattered') continue;
        const dx = Math.abs(worldPos.x - unit.position.x);
        const dy = Math.abs(worldPos.y - unit.position.y);
        const halfW = Math.max(24, (unit.width || 48) / 2 + 6);
        const halfH = Math.max(16, (unit.depth || 20) / 2 + 6);
        if (dx <= halfW && dy <= halfH) {
          return unit;
        }
      }
      return null;
    },
    [engine]
  );

  // Total War Mouse Handlers:
  // - LEFT CLICK: Exclusively selection (click unit, shift multi-select, drag box-select). Never moves units.
  // - RIGHT CLICK: Dedicated to orders (click enemy = attack/bombard, click ground = move, drag ground = array formation & wheel facing).
  // - MIDDLE CLICK / SPACE: Pan camera.
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If user clicks on the map, blur any active input field (like the Dispatch Desk) so WASD controls work immediately
    if (document.activeElement instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      document.activeElement.blur();
    }

    const worldPos = screenToWorld(e.clientX, e.clientY);
    const clickedUnit = getUnitAt(worldPos);
    const currentState = engine.getState();

    // 0. Interactive Bearing Arrow Tool Intercept
    if (isDrawingBearingRef.current) {
      if (e.button === 0) { // Left click
        if (!bearingArrowRef.current || bearingArrowRef.current.isPinned) {
          const originPos = clickedUnit ? { ...clickedUnit.position } : { ...worldPos };
          setBearingArrow({
            origin: originPos,
            target: { ...worldPos },
            isPinned: false,
          });
          sounds.playMapSelect();
          return;
        } else {
          // Pin arrow at current target
          setBearingArrow((prev) => (prev ? { ...prev, target: { ...worldPos }, isPinned: true } : null));
          sounds.playDispatchStamp();
          return;
        }
      } else if (e.button === 2) { // Right click cancels bearing drawing
        setIsDrawingBearing(false);
        setBearingArrow(null);
        return;
      }
    }

    // Shift + Left Click on terrain: Quick Copy coordinates to clipboard & Dispatch Desk
    if (e.shiftKey && e.button === 0 && !clickedUnit && !isBombardTargetingRef.current && !isPickingCoordinatesRef.current) {
      handleQuickCopy(worldPos, { x: e.clientX, y: e.clientY }, false);
      return;
    }

    // 1. Call For Fire (Bombardment) targeting mode intercept (from Artillery Dossier only):
    if (isBombardTargetingRef.current) {
      if (e.button === 0) {
        // Left click to commit fire mission
        const selId = currentState.selectedUnitId;
        const selUnit = currentState.units.find((u) => u.id === selId);
        if (selUnit && selUnit.type === 'artillery') {
          engine.issueOrder(selUnit.id, {
            unitId: selUnit.id,
            type: 'bombard',
            destination: clickedUnit ? clickedUnit.position : worldPos,
            waypoints: [],
            targetUnitId: clickedUnit ? clickedUnit.id : undefined,
            plannedTime: currentState.timeMinutes,
          });
          sounds.playDispatchStamp();
        }
        onCancelBombardTargeting?.();
        return;
      } else if (e.button === 2) {
        // Right click cancels targeting mode
        onCancelBombardTargeting?.();
        return;
      }
    }

    // 2. Unit Left Click: ALWAYS select unit to display Unit Dossier (even when Dispatch Desk is open)
    if (e.button === 0 && clickedUnit) {
      if (isShiftPressedRef.current || e.shiftKey) {
        // Toggle unit in multi-selection pool
        const currentIds = currentState.selectedUnitIds || [];
        const newIds = currentIds.includes(clickedUnit.id)
          ? currentIds.filter((id) => id !== clickedUnit.id)
          : [...currentIds, clickedUnit.id];
        engine.setSelectedUnits(newIds);
        sounds.playMapSelect();
        return;
      }

      // If user was in coordinate pinpoint mode and clicked a unit, cancel pinpoint mode so dossier inspects cleanly
      if (isPickingCoordinatesRef.current) {
        onCancelPickCoordinates?.();
      }

      // Single select (opens UnitDossier showing troop name, commander, corps, and Class V ammo)
      engine.setSelectedUnit(clickedUnit.id);
      sounds.playMapSelect();
      return;
    }

    // 3. Coordinate Pinpoint Mode (from Dispatch Desk): Only triggers on ground/TRP when NO unit was clicked
    if (isPickingCoordinatesRef.current && !clickedUnit) {
      if (e.button === 0) {
        const clickedTrp = state.targetReferencePoints?.find(
          (t) => Math.hypot(t.position.x - worldPos.x, t.position.y - worldPos.y) <= 30
        );
        const finalCoords = clickedTrp
          ? { x: clickedTrp.position.x, y: clickedTrp.position.y }
          : { x: Math.round(worldPos.x), y: Math.round(worldPos.y) };
        onPickCoordinates?.(finalCoords);
        try {
          sounds.playDispatchStamp();
        } catch {}
        return;
      } else if (e.button === 2) {
        onCancelPickCoordinates?.();
        return;
      }
    }

    // 4. Left click cancels any active right-drag formation preview (Total War cancel drag):
    if (e.button === 0 && drawingOrder) {
      setDrawingOrder(null);
      return;
    }

    // 5. Middle click OR Space+Click -> Pan
    if (e.button === 1 || isSpacePressed) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // 4. LEFT CLICK: STRICTLY FOR SELECTION & RUBBER-BAND BOX SELECT
    if (e.button === 0) {
      if (contextMenuDataRef.current) {
        setContextMenuData(null);
      }

      if (clickedUnit) {
        if (isShiftPressedRef.current || e.shiftKey) {
          // Toggle unit in multi-selection pool
          const currentIds = currentState.selectedUnitIds || [];
          const newIds = currentIds.includes(clickedUnit.id)
            ? currentIds.filter((id) => id !== clickedUnit.id)
            : [...currentIds, clickedUnit.id];
          engine.setSelectedUnits(newIds);
          sounds.playMapSelect();
          return;
        }

        // Single select (never starts drawing order!)
        engine.setSelectedUnit(clickedUnit.id);
        sounds.playMapSelect();
        return;
      } else if (nearbyTRP && !isPickingCoordinatesRef.current && !isBombardTargetingRef.current) {
        // Direct Left Click Drag: Pick up and drag TRP marker!
        setDraggingTrpId(nearbyTRP.id);
        draggingTrpIdRef.current = nearbyTRP.id;
        sounds.playMapSelect();
        return;
      } else {
        // Clicked ground: start rubber-band box select in screen coordinates
        setIsBoxSelecting(true);
        setBoxSelectStartScreen({ x: e.clientX, y: e.clientY });
        setBoxSelectCurrentScreen({ x: e.clientX, y: e.clientY });
        return;
      }
    }

    // 5. RIGHT CLICK: DEDICATED TO TOTAL WAR ORDERS & MOVEMENT
    if (e.button === 2) {
      if (contextMenuDataRef.current) {
        setContextMenuData(null);
      }
      rightClickDownPosRef.current = { x: e.clientX, y: e.clientY };
      const selectedUnitIds = currentState.selectedUnitIds?.length > 0 
        ? currentState.selectedUnitIds 
        : (currentState.selectedUnitId ? [currentState.selectedUnitId] : []);
      const selectedUnits = currentState.units.filter((u) => selectedUnitIds.includes(u.id) && u.status !== 'shattered');

      if (selectedUnits.length > 0) {
        // If clicked on an enemy, issue attack/bombard order directly to all selected units
        if (clickedUnit && clickedUnit.faction !== selectedUnits[0].faction) {
          selectedUnits.forEach((u) => {
            const isArtillery = u.type === 'artillery';
            engine.issueOrder(u.id, {
              unitId: u.id,
              type: isArtillery ? 'bombard' : 'assault',
              destination: clickedUnit.position,
              waypoints: [],
              targetUnitId: clickedUnit.id,
              plannedTime: currentState.timeMinutes,
            });
          });
          sounds.playDispatchStamp();
          return;
        }

        // Clicked ground: start Total War formation array drag (or Alt freehand path tracing)
        const isFreehand = e.altKey;
        setDrawingOrder({
          startUnit: selectedUnits[0],
          selectedUnits: selectedUnits,
          currentTarget: worldPos,
          dragStartPoint: worldPos, // Anchor for array facing
          waypoints: isFreehand ? [worldPos] : [],
          curveOffset: 0,
          finalHeading: selectedUnits.length === 1 ? selectedUnits[0].heading : undefined,
          isFreehandPath: isFreehand,
        });
        sounds.playMapSelect();
        return;
      }

      // No units selected: Right-click drag pans camera (Total War standard)
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    targetingMousePosRef.current = worldPos;

    // Track live world coordinates and screen position for hover tooltip & HUD (throttled via rAF)
    hoverCoordsRef.current = worldPos;
    hoverScreenPosRef.current = { x: e.clientX, y: e.clientY };

    if (hoverRafRef.current === null) {
      hoverRafRef.current = requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const keys = keysPressedRef.current;
        const isActivelyPanning = isPanning ||
          keys['w'] || keys['s'] || keys['a'] || keys['d'] ||
          keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright'];
        if (!isActivelyPanning) {
          if (hoverCoordsRef.current) setHoverCoords(hoverCoordsRef.current);
          if (hoverScreenPosRef.current) setHoverScreenPos(hoverScreenPosRef.current);
        }
      });
    }

    // Live TRP marker dragging
    if (draggingTrpIdRef.current) {
      engine.moveTRP(draggingTrpIdRef.current, worldPos);
      return;
    }

    // Update live drawn bearing arrow target if currently drawing
    if (isDrawingBearingRef.current && bearingArrowRef.current && !bearingArrowRef.current.isPinned) {
      setBearingArrow((prev) => (prev ? { ...prev, target: worldPos } : null));
    }

    // Rubber-band selection box update
    if (isBoxSelecting) {
      setBoxSelectCurrentScreen({ x: e.clientX, y: e.clientY });
      return;
    }

    // Update hovered unit only when the hovered entity changes
    if (!drawingOrder && !isPanning) {
      const unit = getUnitAt(worldPos);
      const newHoveredId = unit ? unit.id : null;
      if (newHoveredId !== hoveredUnitIdRef.current) {
        hoveredUnitIdRef.current = newHoveredId;
        setHoveredUnitId(newHoveredId);
      }
    }

    // Process panning
    if (isPanning) {
      const dx = (e.clientX - panStartRef.current.x) / cameraRef.current.zoom;
      const dy = (e.clientY - panStartRef.current.y) / cameraRef.current.zoom;
      const cam = cameraRef.current;
      cam.x = Math.max(200, Math.min(2200, cam.x - dx));
      cam.y = Math.max(150, Math.min(1350, cam.y - dy));
      cameraVelocityRef.current.vx = -dx * 12;
      cameraVelocityRef.current.vy = -dy * 12;
      panStartRef.current = { x: e.clientX, y: e.clientY };
    } else if (drawingOrder && drawingOrder.isFreehandPath) {
      // FREEHAND CUSTOM PATH TRACING (Holding Option/Alt)
      const waypoints = drawingOrder.waypoints ? [...drawingOrder.waypoints] : [];
      const lastPt = waypoints.length > 0 ? waypoints[waypoints.length - 1] : (drawingOrder.dragStartPoint || worldPos);
      const distFromLast = Math.hypot(worldPos.x - lastPt.x, worldPos.y - lastPt.y);

      // Append waypoint every ~14px along stroke for smooth path definition
      if (distFromLast >= 14) {
        waypoints.push(worldPos);
      }

      setDrawingOrder((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentTarget: worldPos,
          waypoints,
          finalHeading: Math.atan2(worldPos.y - lastPt.y, worldPos.x - lastPt.x),
        };
      });
    } else if (drawingOrder && drawingOrder.dragStartPoint) {
      // TOTAL WAR FORMATION / ARRAY DRAG (Real-time 360° circular wheeling)
      const dx = worldPos.x - drawingOrder.dragStartPoint.x;
      const dy = worldPos.y - drawingOrder.dragStartPoint.y;
      const dragDist = Math.hypot(dx, dy);
      const isMulti = drawingOrder.selectedUnits && drawingOrder.selectedUnits.length > 1;

      let heading: number | undefined;
      if (dragDist > 10) {
        // Multi-unit lines face perpendicular to frontage (forward); single units aim directly toward mouse
        heading = isMulti ? Math.atan2(dy, dx) - Math.PI / 2 : Math.atan2(dy, dx);
      } else {
        heading = isMulti ? undefined : drawingOrder.startUnit.heading;
      }

      setDrawingOrder((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentTarget: worldPos,
          finalHeading: heading,
        };
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
    }

    // 0. Release Dragged TRP (Left Click Release)
    if (e.button === 0 && draggingTrpIdRef.current) {
      sounds.playDispatchStamp();
      setDraggingTrpId(null);
      draggingTrpIdRef.current = null;
      return;
    }

    // 1. Commit Rubber-band Box Select (Left Click Release)
    if (isBoxSelecting && boxSelectStartScreen) {
      const minX = Math.min(boxSelectStartScreen.x, e.clientX);
      const maxX = Math.max(boxSelectStartScreen.x, e.clientX);
      const minY = Math.min(boxSelectStartScreen.y, e.clientY);
      const maxY = Math.max(boxSelectStartScreen.y, e.clientY);
      const boxDist = Math.hypot(maxX - minX, maxY - minY);

      if (boxDist > 12) {
        const playerFaction = engine.getState().playerFaction;
        const insideUnits = engine.getState().units.filter((u) => {
          if (u.faction !== playerFaction || u.status === 'shattered') return false;
          const sp = worldToScreen(u.position);
          return sp.x >= minX && sp.x <= maxX && sp.y >= minY && sp.y <= maxY;
        });

        if (insideUnits.length > 0) {
          engine.setSelectedUnits(insideUnits.map((u) => u.id));
          sounds.playMapSelect();
        } else {
          engine.setSelectedUnit(null);
        }
      } else {
        // Clicked ground without dragging: clear selection
        engine.setSelectedUnit(null);
      }
      setIsBoxSelecting(false);
      setBoxSelectStartScreen(null);
      setBoxSelectCurrentScreen(null);
      return;
    }

    // 2. Commit Total War Move or Formation Array (Right Click Release)
    if (e.button === 2 && drawingOrder && drawingOrder.dragStartPoint) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const anchor = drawingOrder.dragStartPoint;
      const dx = worldPos.x - anchor.x;
      const dy = worldPos.y - anchor.y;
      const dragDist = Math.hypot(dx, dy);
      const units = drawingOrder.selectedUnits && drawingOrder.selectedUnits.length > 0
        ? drawingOrder.selectedUnits
        : [drawingOrder.startUnit];

      if (drawingOrder.isFreehandPath && drawingOrder.waypoints && drawingOrder.waypoints.length > 1) {
        // FREEHAND CUSTOM PATH TRACING COMMITTED
        const waypoints = drawingOrder.waypoints;
        const finalDest = waypoints[waypoints.length - 1];
        const intermediateWaypoints = waypoints.slice(0, -1);
        const autoEnemyHeading = engine.getNearestEnemyHeading(finalDest, units[0].faction);

        units.forEach((u) => {
          engine.issueOrder(u.id, {
            unitId: u.id,
            type: 'assault',
            destination: finalDest,
            waypoints: [...intermediateWaypoints],
            finalHeading: autoEnemyHeading,
            plannedTime: engine.getState().timeMinutes,
          });
        });
        sounds.playDispatchStamp();
        setDrawingOrder(null);
        return;
      }

      if (dragDist < 15) {
        // A. QUICK RIGHT CLICK (Tap): Direct Move with auto-alignment toward nearest enemy
        const autoEnemyHeading = engine.getNearestEnemyHeading(anchor, units[0].faction);
        if (units.length === 1) {
          engine.issueOrder(units[0].id, {
            unitId: units[0].id,
            type: 'assault',
            destination: anchor,
            waypoints: [],
            finalHeading: autoEnemyHeading,
            plannedTime: engine.getState().timeMinutes,
          });
        } else {
          // Multiple units: march together and auto-face nearest threat
          engine.issueGroupFormationMove(units.map((u) => u.id), anchor);
          units.forEach((u) => {
            if (u.currentOrder) {
              u.currentOrder.finalHeading = autoEnemyHeading;
            }
          });
        }
        sounds.playDispatchStamp();
      } else {
        // B. RIGHT CLICK DRAG: Formation Array Order
        if (units.length === 1) {
          const heading = Math.atan2(dy, dx);
          engine.issueOrder(units[0].id, {
            unitId: units[0].id,
            type: 'assault',
            destination: anchor,
            waypoints: [],
            finalHeading: heading,
            plannedTime: engine.getState().timeMinutes,
          });
        } else {
          const heading = drawingOrder.finalHeading !== undefined 
            ? drawingOrder.finalHeading 
            : Math.atan2(dy, dx) - Math.PI / 2;
          engine.issueGroupLineOrder(
            units.map((u) => u.id),
            anchor,
            worldPos,
            heading
          );
        }
        sounds.playDispatchStamp();
      }

      setDrawingOrder(null);
      return;
    }

    // 3. Right Click Tap: Open Tactical Context Menu (Ground or TRP)
    if (e.button === 2 && rightClickDownPosRef.current) {
      const startPos = rightClickDownPosRef.current;
      rightClickDownPosRef.current = null;
      const dragDist = Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y);

      if (dragDist < 8) {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        setContextMenuData({
          screenPos: { x: e.clientX, y: e.clientY },
          worldCoords: worldPos,
          trp: nearbyTRP || null,
        });
        sounds.playMapSelect();
        return;
      }
    }
  };

  const handleMouseLeave = () => {
    setHoverCoords(null);
    setHoverScreenPos(null);
    setHoveredUnitId(null);
  };

  // Wheel handling: Bends maneuver curve while drafting, or zooms camera otherwise
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    // If currently drafting a maneuver arrow, scroll wheel BENDS THE CURVE (Total War Flank Arc)
    if (drawingOrder) {
      const bendDelta = e.deltaY > 0 ? 15 : -15;
      setDrawingOrder((prev) => (prev ? { ...prev, curveOffset: (prev.curveOffset || 0) + bendDelta } : null));
      return;
    }

    // Standard Zoom to Mouse Cursor Position (with smooth buttery interpolation)
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const nextZoom = Math.min(4.0, Math.max(0.6, targetZoomRef.current * zoomFactor));

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const worldBefore = screenToWorld(mouseX, mouseY, cameraRef.current);

    targetZoomRef.current = nextZoom;

    const rect = canvasRectRef.current;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const newCamX = worldBefore.x - (mouseX - centerX) / nextZoom;
    const newCamY = worldBefore.y - (mouseY - centerY) / nextZoom;

    cameraRef.current.x = Math.max(200, Math.min(2200, newCamX));
    cameraRef.current.y = Math.max(150, Math.min(1350, newCamY));
  };

  const zoomIn = () => {
    targetZoomRef.current = Math.min(4.0, targetZoomRef.current * 1.25);
  };
  const zoomOut = () => {
    targetZoomRef.current = Math.max(0.6, targetZoomRef.current / 1.25);
  };
  const resetCamera = () => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 2400;
    const h = typeof window !== 'undefined' ? window.innerHeight : 1500;
    const fitZoom = Math.min(Math.max(w / 2400, h / 1500), 1.8);
    targetZoomRef.current = fitZoom;
    targetFocusRef.current = { x: 1200, y: 750 };
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sounds.enabled = next;
  };

  const selectedUnit = state.selectedUnitId
    ? state.units.find((u) => u.id === state.selectedUnitId)
    : null;

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none ${
        isBombardTargeting || isPickingCoordinates
          ? 'cursor-crosshair'
          : draggingTrpId
          ? 'cursor-grabbing'
          : nearbyTRP && !hoveredUnit
          ? 'cursor-grab'
          : isPanning || isSpacePressed
          ? 'cursor-grab active:cursor-grabbing'
          : 'cursor-default'
      }`}
    >
      {/* Call For Fire (Bombardment) Targeting Mode HUD Banner */}
      {isBombardTargeting && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 bg-[#fef2f2] border-2 border-[#dc2626] text-neutral-900 px-4 py-2 shadow-2xl flex items-center gap-3 font-sans text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-[#dc2626] animate-ping" />
          <span className="font-bold text-[#b91c1c] tracking-wider uppercase">CALL FOR FIRE (CFF):</span>
          <span className="font-semibold text-neutral-800">LEFT-CLICK TARGET TO FIRE • RETICLE DISPLAYS DYNAMIC KILLZONE, BURST RADIUS & SHELL DISPERSION</span>
          <span className="text-neutral-500 text-[10px] font-mono">• (HOTKEY: ESC OR RIGHT-CLICK TO CANCEL)</span>
          <button
            onClick={onCancelBombardTargeting}
            className="ml-2 px-2 py-0.5 bg-[#dc2626] hover:bg-[#b91c1c] text-white text-[10px] font-bold border border-red-500 uppercase cursor-pointer"
          >
            CANCEL
          </button>
        </div>
      )}

      {/* Pinpoint Target Mode HUD Banner */}
      {isPickingCoordinates && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 bg-blue-50 border-2 border-[#1e3a8a] text-blue-950 px-4 py-2 shadow-2xl flex items-center gap-3 font-sans text-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1e3a8a] animate-ping" />
          <span className="font-bold text-[#1e3a8a] tracking-wider uppercase">PINPOINT TARGET:</span>
          <span className="font-semibold text-blue-900">LEFT-CLICK TARGET LOCATION ON MAP TO INSERT COORDINATES INTO DISPATCH</span>
          <span className="text-blue-600 text-[10px] font-mono">• (HOTKEY: ESC OR RIGHT-CLICK TO CANCEL)</span>
          <button
            onClick={onCancelPickCoordinates}
            className="ml-2 px-2 py-0.5 bg-[#dc2626] hover:bg-[#ef4444] text-white text-[10px] font-bold border border-red-300 uppercase cursor-pointer"
          >
            CANCEL
          </button>
        </div>
      )}

      {/* Floating Quick Copy Toast Confirmation */}
      {cursorToast && (
        <div
          className="fixed z-50 pointer-events-none bg-[#1e3a8a] text-white px-2.5 py-1 text-xs font-mono font-bold shadow-2xl rounded flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100"
          style={{
            left: Math.min(cursorToast.screenPos.x + 16, window.innerWidth - 240),
            top: Math.max(16, cursorToast.screenPos.y - 28),
          }}
        >
          <Copy size={12} className="text-[#93c5fd]" />
          <span>COPIED: {cursorToast.text}</span>
        </div>
      )}

      {/* Floating On-Hover Tactical Entity Pill (Shown when inspecting units, TRPs, or landmarks) */}
      {hoverCoords && hoverScreenPos && !isBoxSelecting && !isPanning && (nearbyTRP || hoveredUnit || nearbyLandmark) && (
        <div
          className="fixed pointer-events-none z-30 bg-[#fbfbfa] border-2 border-[#1e3a8a] text-neutral-900 shadow-xl px-2.5 py-1 font-mono text-[10px] flex items-center gap-2 rounded select-none animate-in fade-in duration-75"
          style={{
            left: Math.min(hoverScreenPos.x + 14, window.innerWidth - 260),
            top: Math.min(hoverScreenPos.y + 14, window.innerHeight - 50),
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#1e3a8a] shrink-0 animate-pulse" />
          {nearbyTRP ? (
            <span className="text-amber-800 font-bold">
              [{nearbyTRP.code}] {nearbyTRP.name} {draggingTrpId ? '(DRAGGING)' : '(DRAG / RMB OPTIONS)'}
            </span>
          ) : hoveredUnit ? (
            <div className="flex items-center gap-1.5">
              <span className={hoveredUnit.faction === state.playerFaction ? 'text-[#1e3a8a] font-bold' : 'text-[#dc2626] font-bold'}>
                {hoveredUnit.name}
              </span>
              <span className="text-[9px] text-neutral-500 font-normal">
                ({hoveredUnit.strength.toLocaleString()} {hoveredUnit.type.toUpperCase()})
              </span>
            </div>
          ) : nearbyLandmark ? (
            <span className="text-neutral-800 font-semibold">
              {nearbyLandmark.name.replace(/\s*\([^)]*\)/g, '').trim()} • {Math.round(engine.getElevation(hoverCoords))}m
            </span>
          ) : null}
        </div>
      )}

      {/* 07:00 AM Initial Array - Prominent Battle Start Directive */}
      {!state.isRunning && state.timeMinutes === 0 && !isBombardTargeting && !isPickingCoordinates && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 bg-[#f4f4f5] border-2 border-[#1e3a8a] px-5 py-3 shadow-2xl text-black font-sans select-none animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1e3a8a]">
            <span className="w-2 h-2 rounded-full bg-[#1e3a8a] animate-ping" />
            <span>AUSTERLITZ • 07:00 AM — ARMIES IN POSITION</span>
          </div>
          <p className="text-[11px] text-neutral-700 text-center max-w-sm font-medium">
            Both forces stand arrayed on the field. Click below or press <b>SPACEBAR</b> to commence tactical maneuvers.
          </p>
          <button
            type="button"
            onClick={() => {
              console.log('[TOTAL WAR] Starting battle via banner');
              engine.setRunning(true);
              try {
                sounds.playDrum();
              } catch {}
            }}
            className="mt-1 flex items-center gap-2 px-5 py-2 bg-[#15803d] hover:bg-[#16a34a] text-white text-xs font-bold uppercase tracking-wider border border-[#166534] shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span>▶ COMMENCE BATTLE (SPACEBAR)</span>
          </button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="block w-full h-full outline-none focus:outline-none"
      />

      {/* Rubber-Band Box Selection Overlay */}
      {isBoxSelecting && boxSelectStartScreen && boxSelectCurrentScreen && (() => {
        const left = Math.min(boxSelectStartScreen.x, boxSelectCurrentScreen.x);
        const top = Math.min(boxSelectStartScreen.y, boxSelectCurrentScreen.y);
        const width = Math.abs(boxSelectStartScreen.x - boxSelectCurrentScreen.x);
        const height = Math.abs(boxSelectStartScreen.y - boxSelectCurrentScreen.y);
        return (
          <div
            className="absolute pointer-events-none border border-[#2563eb] bg-[rgba(37,99,235,0.14)] z-20"
            style={{ left, top, width, height }}
          />
        );
      })()}

      {/* Interactive Bearing Arrow Overlay */}
      {bearingArrow && (() => {
        const p1 = worldToScreen(bearingArrow.origin);
        const p2 = worldToScreen(bearingArrow.target);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const screenLen = Math.hypot(dx, dy);
        const worldDx = bearingArrow.target.x - bearingArrow.origin.x;
        const worldDy = bearingArrow.target.y - bearingArrow.origin.y;
        const worldDistPx = Math.hypot(worldDx, worldDy);
        const worldDistMeters = Math.round(worldDistPx * 5);
        const formattedDist = worldDistMeters >= 1000
          ? `${(worldDistMeters / 1000).toFixed(1)}km`
          : `${worldDistMeters}m`;
        const mathAngle = Math.atan2(worldDy, worldDx);
        const bearing = headingToBearing(mathAngle);
        const cardinal = getCardinalDirection(bearing);

        const formattedText = `on bearing ${String(bearing).padStart(3, '0')}° (${cardinal.code}, ${cardinal.mils} mils) for ${worldDistMeters}m to (${Math.round(bearingArrow.target.x)}, ${Math.round(bearingArrow.target.y)})`;

        return (
          <div className="absolute inset-0 pointer-events-none z-25 overflow-hidden">
            <svg className="w-full h-full" style={{ overflow: 'visible' }}>
              <defs>
                <marker
                  id="bearing-arrowhead"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="4"
                  orient="auto"
                >
                  <polygon points="0 1, 7 4, 0 7, 2 4" fill="#2563eb" />
                </marker>
              </defs>

              {/* Origin Circle */}
              <circle cx={p1.x} cy={p1.y} r="5" fill="#1e3a8a" stroke="#ffffff" strokeWidth="1.5" />
              <circle cx={p1.x} cy={p1.y} r="1.5" fill="#ffffff" />

              {/* Bearing Line with Arrowhead */}
              {screenLen > 8 && (
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#2563eb"
                  strokeWidth="2"
                  strokeDasharray="5,4"
                  markerEnd="url(#bearing-arrowhead)"
                />
              )}

              {/* Target Dot */}
              <circle cx={p2.x} cy={p2.y} r="4" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
            </svg>

            {/* Tactical Bearing & Range Badge */}
            {screenLen > 15 && (
              <div
                className="absolute pointer-events-auto transform -translate-x-1/2 -translate-y-full mb-2 bg-[#fbfbfa] text-neutral-900 border-2 border-[#1e3a8a] px-2.5 py-1.5 shadow-xl text-[10px] font-mono select-none flex flex-col items-center gap-1 rounded"
                style={{
                  left: p2.x,
                  top: p2.y - 12,
                }}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-[#1e3a8a]">{String(bearing).padStart(3, '0')}° {cardinal.code}</span>
                  <span className="text-neutral-500 font-normal">[{cardinal.mils} mil]</span>
                  <span className="text-neutral-400">•</span>
                  <span className="text-blue-700">{formattedDist}</span>
                  <span className="text-neutral-400">•</span>
                  <span className="text-neutral-600 font-semibold">GRID ({Math.round(bearingArrow.target.x)}, {Math.round(bearingArrow.target.y)})</span>
                </div>

                {/* Quick Action Pill */}
                <div className="flex items-center gap-1 w-full pt-1 border-t border-neutral-300">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard?.writeText(formattedText);
                      setCopiedCoord(true);
                      setTimeout(() => setCopiedCoord(false), 1200);
                    }}
                    className="flex-1 px-1.5 py-0.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-[9px] font-bold uppercase transition-colors text-neutral-800 cursor-pointer text-center rounded"
                    title="Copy bearing text to clipboard"
                  >
                    COPY
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onInsertCompassText) {
                        onInsertCompassText(formattedText);
                      }
                    }}
                    className="flex-1 px-1.5 py-0.5 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-[9px] font-bold uppercase transition-colors text-white cursor-pointer text-center rounded"
                    title="Send bearing to Imperial Dispatch Desk"
                  >
                    + DISPATCH
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBearingArrow(null);
                      setIsDrawingBearing(false);
                    }}
                    className="p-1 text-neutral-500 hover:text-black hover:bg-neutral-200 rounded transition-colors cursor-pointer flex items-center justify-center"
                    title="Clear bearing arrow"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Consolidated Bottom Tactical Status Bar (Full Width Docked Strip) */}
      <footer className="fixed bottom-0 left-0 right-0 z-30 h-7 bg-[#fbfbfa] border-t-2 border-[#71717a] px-3 flex items-center justify-between text-black font-mono text-[10px] select-none shadow-sm pointer-events-auto">
        {/* Left: Tactical Control Prompt */}
        <div className="flex items-center gap-2 truncate pr-2">
          <span className="w-1.5 h-1.5 bg-[#2563eb] rounded-full shrink-0 animate-pulse" />
          <span className="font-bold uppercase tracking-tight text-neutral-800 truncate">
            {isDrawingBearing
              ? 'BEARING TOOL: CLICK ORIGIN THEN TARGET • B / ESC TO CANCEL'
              : isPickingCoordinates
              ? 'PINPOINT TARGET MODE: LEFT-CLICK MAP TO INSERT COORDS • ESC TO CANCEL'
              : state.selectedUnitIds?.length > 1
              ? `SELECTED: ${state.selectedUnitIds.length} UNITS • RMB: MARCH / ARRAY • X: COPY`
              : selectedUnit
              ? `${selectedUnit.name.toUpperCase()} • RMB: MOVE / FACING • X: COPY`
              : 'LMB: SELECT • RMB: ORDERS • SPACE / WASD: PAN • B: BEARING • X: COPY COORDS'}
          </span>
        </div>

        {/* Center: Live Sector & Topography Telemetry */}
        {hoverCoords && (
          <div className="hidden lg:flex items-center gap-1.5 text-[9px] font-mono text-neutral-600 bg-white border border-[#a1a1aa] px-2 py-0.5 rounded shadow-2xs shrink-0">
            <span className="font-bold text-neutral-800">
              {nearbyLandmark ? nearbyLandmark.name.replace(/\s*\([^)]*\)/g, '').trim().toUpperCase() : nearbyTRP ? nearbyTRP.name.toUpperCase() : 'AUSTERLITZ SECTOR'}
            </span>
            <span>• ELEV {Math.round(engine.getElevation(hoverCoords))}m</span>
          </div>
        )}

        {/* Right: Coordinates, Bearing Tool & Map Navigation */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Drawn Bearing Pill */}
          {drawnBearingInfo && (
            <div className="flex items-center gap-1 bg-white border border-[#a1a1aa] px-1.5 py-0.5 font-mono text-[9.5px] rounded">
              <Navigation size={10} className="text-[#1e3a8a] rotate-45 shrink-0" />
              <span className="font-bold text-[#1e3a8a]">
                BRG {String(drawnBearingInfo.bearing).padStart(3, '0')}° ({drawnBearingInfo.cardinal.code} • {drawnBearingInfo.cardinal.mils}m) {Math.round(drawnBearingInfo.distance)}m
              </span>
              <button
                type="button"
                onClick={() => {
                  const brgStr = String(drawnBearingInfo.bearing).padStart(3, '0');
                  const text = `on bearing ${brgStr}° (${drawnBearingInfo.cardinal.code}, ${drawnBearingInfo.cardinal.mils} mils) for ${Math.round(drawnBearingInfo.distance)}m`;
                  navigator.clipboard?.writeText(text);
                  setCopiedCoord(true);
                  setTimeout(() => setCopiedCoord(false), 1200);
                }}
                title="Copy bearing details to clipboard"
                className="px-1 py-0.2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-[8.5px] font-bold uppercase transition-colors cursor-pointer text-neutral-800 rounded"
              >
                COPY
              </button>
              {onInsertCompassText && (
                <button
                  type="button"
                  onClick={() => {
                    const brgStr = String(drawnBearingInfo.bearing).padStart(3, '0');
                    const text = `on bearing ${brgStr}° (${drawnBearingInfo.cardinal.code}, ${drawnBearingInfo.cardinal.mils} mils) for ${Math.round(drawnBearingInfo.distance)}m`;
                    onInsertCompassText(text);
                  }}
                  title="Send bearing directly to Imperial Dispatch Desk"
                  className="px-1 py-0.2 bg-[#1e3a8a] text-white hover:bg-[#1d4ed8] border border-[#1e40af] text-[8.5px] font-bold uppercase transition-colors cursor-pointer rounded"
                >
                  + DISPATCH
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setBearingArrow(null);
                  setIsDrawingBearing(false);
                }}
                title="Clear drawn bearing line"
                className="p-0.5 text-neutral-400 hover:text-black transition-colors cursor-pointer"
              >
                <X size={10} />
              </button>
            </div>
          )}

          {/* Grid Coordinates & Quick Actions */}
          <div className="flex items-center gap-1 bg-white border border-[#a1a1aa] px-1.5 py-0.5 rounded">
            <Crosshair size={11} className="text-[#1e3a8a]" />
            <span className="font-bold text-[9.5px] tracking-tight">
              {hoverCoords
                ? `GRID (${Math.round(hoverCoords.x)}, ${Math.round(hoverCoords.y)})`
                : 'GRID: (----, ----)'}
            </span>
            {hoverCoords && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickCopy(hoverCoords, hoverScreenPos, false);
                  }}
                  title="Copy grid coordinates to clipboard (Hotkey: X, or Shift+Click map)"
                  className="px-1 py-0.2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-[8.5px] font-bold uppercase transition-colors cursor-pointer text-[#1e3a8a] rounded"
                >
                  {copiedCoord ? 'COPIED' : 'COPY'}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleQuickCopy(hoverCoords, hoverScreenPos, true);
                  }}
                  title="Copy coordinates and compass heading to clipboard (Hotkey: Shift+X)"
                  className="px-1 py-0.2 bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 text-[8.5px] font-bold uppercase transition-colors cursor-pointer text-neutral-800 rounded"
                >
                  +BRG
                </button>
              </>
            )}
            {hoverCoords && onPickCoordinates && isDispatchDeskOpen && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const clickedTrp = state.targetReferencePoints?.find(
                    (t) => Math.hypot(t.position.x - hoverCoords.x, t.position.y - hoverCoords.y) <= 35
                  );
                  const finalCoords = clickedTrp
                    ? { x: clickedTrp.position.x, y: clickedTrp.position.y }
                    : { x: Math.round(hoverCoords.x), y: Math.round(hoverCoords.y) };
                  onPickCoordinates(finalCoords);
                  try {
                    sounds.playDispatchStamp();
                  } catch {}
                }}
                title="Pass current coordinates into Dispatch Desk"
                className="px-1.5 py-0.2 bg-[#1e3a8a] text-white hover:bg-[#1d4ed8] border border-[#1e40af] text-[8.5px] font-bold uppercase transition-colors cursor-pointer rounded"
              >
                TO DISPATCH
              </button>
            )}
          </div>

          {/* Toggle Bearing Tool Button */}
          <button
            type="button"
            onClick={toggleBearingTool}
            title={isDrawingBearing ? 'Cancel Bearing Tool (Hotkey: B or Esc)' : 'Draw Bearing & Distance Azimuth on Map (Hotkey: B)'}
            className={`px-1.5 py-0.5 border text-[9px] font-bold uppercase transition-colors cursor-pointer flex items-center gap-1 rounded ${
              isDrawingBearing
                ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 animate-pulse'
                : 'bg-white hover:bg-neutral-200 border-neutral-300 text-neutral-800'
            }`}
          >
            <Navigation size={9} className={isDrawingBearing ? 'rotate-45' : ''} />
            <span>{isDrawingBearing ? 'DRAWING (B)' : 'BRG (B)'}</span>
          </button>

          <div className="w-px h-3.5 bg-[#a1a1aa] mx-0.5" />

          {/* Zoom & Recenter Controls */}
          <button
            onClick={zoomIn}
            title="Zoom In (Scroll Up)"
            className="p-1 hover:bg-white hover:text-black rounded transition-colors cursor-pointer"
          >
            <ZoomIn size={13} />
          </button>
          <button
            onClick={zoomOut}
            title="Zoom Out (Scroll Down)"
            className="p-1 hover:bg-white hover:text-black rounded transition-colors cursor-pointer"
          >
            <ZoomOut size={13} />
          </button>
          <button
            onClick={resetCamera}
            title="Recenter Battlefield"
            className="p-1 hover:bg-white hover:text-black rounded transition-colors cursor-pointer"
          >
            <Crosshair size={13} />
          </button>

          <div className="w-px h-3.5 bg-[#a1a1aa] mx-0.5" />

          {/* Audio Toggle */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? 'Mute Military Audio' : 'Enable Military Audio'}
            className="p-1 hover:bg-white text-[#1e3a8a] rounded transition-colors cursor-pointer"
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          </button>
        </div>
      </footer>

      {/* Tactical Context Menu (Right Click on Terrain or TRP) */}
      {contextMenuData && (
        <TacticalContextMenu
          screenPos={contextMenuData.screenPos}
          worldCoords={contextMenuData.worldCoords}
          bearing={drawnBearingInfo ? drawnBearingInfo.bearing : null}
          cardinal={drawnBearingInfo ? drawnBearingInfo.cardinal.code : null}
          selectedUnit={selectedUnit || null}
          elevation={Math.round(engine.getElevation(contextMenuData.worldCoords))}
          activeTrp={contextMenuData.trp}
          availableTrps={state.targetReferencePoints || []}
          onClose={() => setContextMenuData(null)}
          onInsertToDispatch={onInsertCompassText}
          onPinpointTarget={onPickCoordinates}
          onRelocateTrp={(trpId, coords) => engine.moveTRP(trpId, coords)}
          onRegisterTrp={(name, coords) => engine.registerTRP(name, coords)}
        />
      )}
    </div>
  );
});
