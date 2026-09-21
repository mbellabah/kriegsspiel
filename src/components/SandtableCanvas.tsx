import React, { useRef, useEffect, useState, useCallback } from 'react';
import { BattleEngine, SimulationState } from '../engine/simulation';
import { SandtableRenderer, Camera, DraftingManeuver } from '../engine/canvasRenderer';
import { Unit, Vector2D } from '../types/game';
import { sounds } from '../engine/soundEffects';
import { ZoomIn, ZoomOut, Crosshair, Volume2, VolumeX } from 'lucide-react';

interface SandtableCanvasProps {
  engine: BattleEngine;
  state: SimulationState;
  showHexGrid: boolean;
  symbology?: 'tactical' | 'nato';
}

export const SandtableCanvas: React.FC<SandtableCanvasProps> = ({
  engine,
  state,
  showHexGrid,
  symbology = 'tactical',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SandtableRenderer | null>(null);

  // Initial Camera centered on the authentic 980x620 atlas map
  const [camera, setCamera] = useState<Camera>({
    x: 490,
    y: 310,
    zoom: 1.35,
  });

  const [keysPressed, setKeysPressed] = useState<Record<string, boolean>>({});

  // Interaction modes
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Vector2D>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [hoveredUnitId, setHoveredUnitId] = useState<string | null>(null);
  const [drawingOrder, setDrawingOrder] = useState<DraftingManeuver | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Synchronous interaction refs so the 60 FPS animation loop is never restarted by state changes
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  const drawingOrderRef = useRef(drawingOrder);
  drawingOrderRef.current = drawingOrder;

  const hoveredUnitIdRef = useRef(hoveredUnitId);
  hoveredUnitIdRef.current = hoveredUnitId;

  const showHexGridRef = useRef(showHexGrid);
  showHexGridRef.current = showHexGrid;

  const symbologyRef = useRef(symbology);
  symbologyRef.current = symbology;

  // Setup HiDPI Canvas & Renderer
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    rendererRef.current = new SandtableRenderer(canvas);

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
        setKeysPressed((prev) => ({ ...prev, [e.key.toLowerCase()]: true }));
      }
      if (e.code === 'Space') {
        setIsSpacePressed(true);
      }
      if (e.shiftKey) {
        setIsShiftPressed(true);
      }
      if (e.altKey) {
        setIsAltPressed(true);
      }

      // Total War Arc bend shortcuts when dragging: Q (flank left) / E (flank right) / R (reset straight)
      if (drawingOrder) {
        if (e.key.toLowerCase() === 'q') {
          setDrawingOrder((d) => (d ? { ...d, curveOffset: (d.curveOffset || 0) - 25 } : null));
        } else if (e.key.toLowerCase() === 'e') {
          setDrawingOrder((d) => (d ? { ...d, curveOffset: (d.curveOffset || 0) + 25 } : null));
        } else if (e.key.toLowerCase() === 'r') {
          setDrawingOrder((d) => (d ? { ...d, curveOffset: 0, waypoints: [d.currentTarget] } : null));
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
        setKeysPressed((prev) => ({ ...prev, [e.key.toLowerCase()]: false }));
      }
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
      if (!e.shiftKey) {
        setIsShiftPressed(false);
      }
      if (!e.altKey) {
        setIsAltPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [drawingOrder]);

  // Smooth WASD & Keyboard Pan Loop
  useEffect(() => {
    let animId: number;
    const updateKeyboardPan = () => {
      let vx = 0;
      let vy = 0;
      const speed = 18 / camera.zoom;

      if (keysPressed['w'] || keysPressed['arrowup']) vy -= speed;
      if (keysPressed['s'] || keysPressed['arrowdown']) vy += speed;
      if (keysPressed['a'] || keysPressed['arrowleft']) vx -= speed;
      if (keysPressed['d'] || keysPressed['arrowright']) vx += speed;

      if (vx !== 0 || vy !== 0) {
        setCamera((prev) => ({
          ...prev,
          x: Math.max(100, Math.min(880, prev.x + vx)),
          y: Math.max(80, Math.min(540, prev.y + vy)),
        }));
      }

      animId = requestAnimationFrame(updateKeyboardPan);
    };

    animId = requestAnimationFrame(updateKeyboardPan);
    return () => cancelAnimationFrame(animId);
  }, [keysPressed, camera.zoom]);

  // Main Render & Simulation Loop - runs continuously at 60 FPS, decoupled from React component lifecycle
  useEffect(() => {
    let lastTime = performance.now();
    let animationId: number;

    const loop = (time: number) => {
      const deltaSeconds = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      // Tick simulation
      engine.tick(deltaSeconds);

      // Render main tactical sandtable
      if (rendererRef.current && canvasRef.current) {
        rendererRef.current.showHexGrid = showHexGridRef.current;
        rendererRef.current.symbology = symbologyRef.current;
        rendererRef.current.render(
          engine.getState(),
          cameraRef.current,
          drawingOrderRef.current,
          hoveredUnitIdRef.current
        );
      }

      animationId = requestAnimationFrame(loop);
    };

    animationId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationId);
  }, [engine]);

  // Convert Screen pixel coordinates to World coordinates
  const screenToWorld = useCallback(
    (screenX: number, screenY: number, currentCam: Camera = camera): Vector2D => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      return {
        x: (screenX - width / 2) / currentCam.zoom + currentCam.x,
        y: (screenY - height / 2) / currentCam.zoom + currentCam.y,
      };
    },
    [camera]
  );

  // Find unit under cursor using latest live engine state
  const getUnitAt = useCallback(
    (worldPos: Vector2D): Unit | null => {
      const currentUnits = engine.getState().units;
      for (const unit of currentUnits) {
        if (unit.status === 'shattered') continue;
        const dx = Math.abs(worldPos.x - unit.position.x);
        const dy = Math.abs(worldPos.y - unit.position.y);
        const halfW = (unit.width || 80) / 2 + 10;
        const halfH = (unit.depth || 26) / 2 + 10;
        if (dx <= halfW && dy <= halfH) {
          return unit;
        }
      }
      return null;
    },
    [engine]
  );

  // Mouse Handlers for Smooth Map Panning & Total War Curved Maneuvers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const clickedUnit = getUnitAt(worldPos);
    const currentState = engine.getState();

    // Right Click Handling (Total War standard):
    if (e.button === 2) {
      if (currentState.selectedUnitId) {
        const selected = currentState.units.find((u) => u.id === currentState.selectedUnitId);
        if (selected && selected.status !== 'shattered') {
          // Start dragging order from selected unit to destination!
          setDrawingOrder({
            startUnit: selected,
            currentTarget: worldPos,
            waypoints: [worldPos],
            curveOffset: 0,
          });
          sounds.playMapSelect();
          return;
        }
      }
      // Right-click drag without selected unit -> Pan map
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // Middle click OR Space+Click -> Pan
    if (e.button === 1 || isSpacePressed) {
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button === 0) {
      // Left Click
      if (clickedUnit) {
        // Select Unit & Start Drawing Order
        engine.setSelectedUnit(clickedUnit.id);
        sounds.playMapSelect();
        setDrawingOrder({
          startUnit: clickedUnit,
          currentTarget: worldPos,
          waypoints: [worldPos],
          curveOffset: 0,
        });
      } else {
        // Clicked ground -> Start Panning immediately
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        engine.setSelectedUnit(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);

    // Update hovered unit
    if (!drawingOrder && !isPanning) {
      const unit = getUnitAt(worldPos);
      setHoveredUnitId(unit ? unit.id : null);
    }

    // Process panning
    if (isPanning) {
      const dx = (e.clientX - panStart.x) / camera.zoom;
      const dy = (e.clientY - panStart.y) / camera.zoom;
      setCamera((prev) => ({
        ...prev,
        x: Math.max(100, Math.min(880, prev.x - dx)),
        y: Math.max(80, Math.min(540, prev.y - dy)),
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
    } else if (drawingOrder) {
      // Total War Curved Maneuver Drawing: Record trail of waypoints
      setDrawingOrder((prev) => {
        if (!prev) return null;
        const currentWaypoints = prev.waypoints ? [...prev.waypoints] : [];
        const lastPt = currentWaypoints[currentWaypoints.length - 1] || prev.startUnit.position;
        const stepDist = Math.hypot(worldPos.x - lastPt.x, worldPos.y - lastPt.y);

        // Record freehand curve waypoints when holding shift or moving noticeably
        if (isShiftPressed || stepDist > 22) {
          currentWaypoints.push(worldPos);
        }

        let heading = prev.finalHeading;
        if (isAltPressed) {
          heading = Math.atan2(worldPos.y - prev.currentTarget.y, worldPos.x - prev.currentTarget.x);
        }

        return {
          ...prev,
          currentTarget: worldPos,
          waypoints: currentWaypoints,
          finalHeading: heading,
        };
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (drawingOrder) {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const dx = worldPos.x - drawingOrder.startUnit.position.x;
      const dy = worldPos.y - drawingOrder.startUnit.position.y;
      const dist = Math.hypot(dx, dy);

      // If dragged more than 15 units, commit Total War maneuver order
      if (dist > 15) {
        let curveControl: Vector2D | undefined = undefined;
        if (drawingOrder.curveOffset && Math.abs(drawingOrder.curveOffset) > 5) {
          const midX = (drawingOrder.startUnit.position.x + worldPos.x) / 2;
          const midY = (drawingOrder.startUnit.position.y + worldPos.y) / 2;
          const perpX = -dy / dist;
          const perpY = dx / dist;
          curveControl = {
            x: midX + perpX * drawingOrder.curveOffset,
            y: midY + perpY * drawingOrder.curveOffset,
          };
        }

        engine.issueOrder(drawingOrder.startUnit.id, {
          unitId: drawingOrder.startUnit.id,
          type: 'assault',
          destination: worldPos,
          waypoints: drawingOrder.waypoints && drawingOrder.waypoints.length > 2 ? drawingOrder.waypoints : [],
          curveControl,
          finalHeading: drawingOrder.finalHeading,
          plannedTime: engine.getState().timeMinutes,
        });
        sounds.playDispatchStamp();
      }
      setDrawingOrder(null);
    }
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

    // Standard Zoom to Mouse Cursor Position
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.min(4.0, Math.max(0.6, camera.zoom * zoomFactor));

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const worldBefore = screenToWorld(mouseX, mouseY, camera);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const newCamX = worldBefore.x - (mouseX - width / 2) / newZoom;
    const newCamY = worldBefore.y - (mouseY - height / 2) / newZoom;

    setCamera({
      x: Math.max(100, Math.min(880, newCamX)),
      y: Math.max(80, Math.min(540, newCamY)),
      zoom: newZoom,
    });
  };

  const zoomIn = () => setCamera((c) => ({ ...c, zoom: Math.min(4.0, c.zoom * 1.25) }));
  const zoomOut = () => setCamera((c) => ({ ...c, zoom: Math.max(0.6, c.zoom / 1.25) }));
  const resetCamera = () => setCamera({ x: 490, y: 310, zoom: 1.35 });

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
        isPanning || isSpacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
      }`}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="block w-full h-full"
      />

      {/* Selected Unit Total War Hint Strip (Discreet bottom helper) */}
      {selectedUnit && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-white border border-[#a1a1aa] text-black text-[10px] px-3 py-1 font-bold uppercase shadow-sm flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#2563eb] animate-pulse" />
          <span>
            {selectedUnit.name}: DRAG TO MANEUVER • WHEEL/Q,E: BEND ARC • SHIFT: FREEHAND • ALT: SET FACING
          </span>
        </div>
      )}

      {/* Discreet Map Navigation Controls (Floating Bottom Right) */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 z-30 bg-[#f4f4f5] border border-[#a1a1aa] p-0.5 shadow-sm text-neutral-800 font-sans">
        <button
          onClick={zoomIn}
          title="Zoom In (Scroll Up)"
          className="p-1 hover:bg-white hover:text-black transition-colors"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={zoomOut}
          title="Zoom Out (Scroll Down)"
          className="p-1 hover:bg-white hover:text-black transition-colors"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={resetCamera}
          title="Recenter Battlefield"
          className="p-1 hover:bg-white hover:text-black transition-colors"
        >
          <Crosshair size={14} />
        </button>
        <div className="w-px h-4 bg-[#a1a1aa] mx-1" />
        <button
          onClick={toggleSound}
          title={soundEnabled ? 'Mute Military Audio' : 'Enable Military Audio'}
          className="p-1 hover:bg-white text-[#1e3a8a] transition-colors"
        >
          {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
      </div>
    </div>
  );
};
