import { Unit, ManeuverOrder, Vector2D } from '../types/game';
import { SimulationState } from './simulation';

export interface SmokeParticle {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  maxAlpha: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface DraftingManeuver {
  startUnit: Unit;
  currentTarget: Vector2D;
  waypoints?: Vector2D[];
  curveOffset?: number; // Perpendicular bend
  curveControl?: Vector2D;
  finalHeading?: number;
}

export class SandtableRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private smokeParticles: SmokeParticle[] = [];
  private animFrame: number = 0;
  public showHexGrid: boolean = false;
  public symbology: 'tactical' | 'nato' = 'tactical';
  public mapTheme: 'classic' | 'dark' | 'slate' = 'classic';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;
  }

  public render(
    state: SimulationState,
    camera: Camera,
    drawingOrder: DraftingManeuver | null,
    hoveredUnitId: string | null
  ) {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    this.animFrame++;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply HiDPI scale
    ctx.scale(dpr, dpr);

    // Camera Transform (Centered)
    const screenW = canvas.width / dpr;
    const screenH = canvas.height / dpr;
    ctx.translate(screenW / 2, screenH / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);

    // =========================================================================
    // WEST POINT MILITARY ATLAS / NAPOLEON-EMPIRE 1805 AUSTERLITZ CARTOGRAPHY
    // =========================================================================

    // 1. Base Map Paper Background
    this.renderBaseParchment(ctx);

    // 2. Topographic Contour Elevation Bands (200m, 240m, 280m, 320m)
    this.renderTopographicContours(ctx);

    // 3. Woodlands & Forest Parcels
    this.renderWoodlands(ctx);

    // 4. Hydrology: Rivers, Tributaries, Mill Ponds, Frozen Lakes & Marshes
    this.renderHydrology(ctx);

    // 5. Road Network: Imperial Highway & Secondary Country Routes
    this.renderRoads(ctx);

    // 6. Towns, Villages & Settlements (Stippled Footprints & Typography)
    this.renderSettlements(ctx);

    // 7. Tactical Landmark Badges: Ⓢ Santon, Ⓥ Staré Vinohrady, Ⓩ Žuráň
    this.renderLandmarkBadges(ctx);

    // 8. Hex Grid (Optional Wargame Mode)
    if (this.showHexGrid) {
      this.renderHexGrid(ctx);
    }

    // 9. Historical Tactical Maneuver Arrows (Dashed sweep lines)
    this.renderHistoricalManeuvers(ctx, state);

    // 10. Active Orders & User Maneuver Caliper
    this.renderActiveOrders(ctx, state.activeOrders, state.units);
    if (drawingOrder) {
      this.renderDraftingArrow(ctx, drawingOrder);
    }

    // 11. Range Arc / Caliper for Selected Unit
    if (state.selectedUnitId) {
      const selected = state.units.find((u) => u.id === state.selectedUnitId);
      if (selected && selected.status !== 'shattered') {
        this.renderUnitRangeArc(ctx, selected);
      }
    }

    // 12. Military Unit Chits (Royal Blue French vs Red Allied)
    this.renderMilitaryUnits(ctx, state.units, state.selectedUnitId, hoveredUnitId);

    // 13. Gunpowder Smoke Drifting with Cold Winter Winds
    this.updateAndRenderSmoke(ctx, state);

    // 14. Authentic Lower-Right Cartouche & Map Legend
    this.renderAtlasCartouche(ctx, state);

    // 15. North Compass Needle in Bottom-Left
    this.renderNorthArrow(ctx);

    ctx.restore();
  }

  // =========================================================================
  // 1. BASE TERRAIN (MILITARY TOPO AESTHETIC)
  // =========================================================================
  private renderBaseParchment(ctx: CanvasRenderingContext2D) {
    // Stark light gray base topo
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(-200, -200, 1380, 1020);

    // Border Frame (Strict C2 bounding box)
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(0, 0, 980, 620);
  }

  // =========================================================================
  // 2. TOPOGRAPHIC CONTOUR ELEVATION BANDS
  // Exact 200m, 240m, 280m, 320m contours matching West Point Austerlitz map
  // =========================================================================
  private renderTopographicContours(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // -----------------------------------------------------------------------
    // Level 200m Contour (Separates lower Goldbach & Schwarza lowlands)
    // -----------------------------------------------------------------------
    ctx.fillStyle = '#f3f4f6';
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 0.8;

    // West rising plateau (west of Goldbach)
    ctx.beginPath();
    ctx.moveTo(120, 0);
    ctx.bezierCurveTo(150, 120, 180, 200, 220, 240);
    ctx.bezierCurveTo(250, 280, 280, 360, 260, 480);
    ctx.bezierCurveTo(240, 560, 160, 580, 110, 620);
    ctx.lineTo(0, 620);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // East rising plateau (east of Goldbach brook, Pratzen system)
    ctx.beginPath();
    ctx.moveTo(430, 0);
    ctx.bezierCurveTo(450, 120, 470, 210, 490, 240);
    ctx.bezierCurveTo(480, 290, 440, 340, 440, 420);
    ctx.bezierCurveTo(430, 480, 400, 510, 420, 570);
    ctx.bezierCurveTo(450, 610, 530, 620, 640, 620);
    ctx.bezierCurveTo(740, 600, 830, 540, 890, 480);
    ctx.bezierCurveTo(940, 420, 970, 300, 980, 220);
    ctx.lineTo(980, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // -----------------------------------------------------------------------
    // Level 240m Contour
    // -----------------------------------------------------------------------
    ctx.fillStyle = '#e5e7eb';
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 0.8;

    // West 240m shelf (Latain / Turas heights)
    ctx.beginPath();
    ctx.moveTo(180, 0);
    ctx.bezierCurveTo(200, 80, 220, 140, 250, 180);
    ctx.bezierCurveTo(290, 230, 270, 320, 240, 410);
    ctx.bezierCurveTo(210, 490, 120, 520, 80, 620);
    ctx.lineTo(0, 620);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // East 240m broad Pratzen plateau & Northern range
    ctx.beginPath();
    ctx.moveTo(480, 0);
    ctx.bezierCurveTo(510, 110, 520, 190, 535, 235);
    ctx.bezierCurveTo(515, 270, 510, 330, 520, 380);
    ctx.bezierCurveTo(510, 440, 495, 490, 525, 525);
    ctx.bezierCurveTo(565, 540, 630, 520, 680, 475);
    ctx.bezierCurveTo(745, 430, 800, 380, 840, 310);
    ctx.bezierCurveTo(870, 250, 900, 190, 940, 130);
    ctx.lineTo(980, 120);
    ctx.lineTo(980, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // -----------------------------------------------------------------------
    // Level 280m Contour (Santon hill, Žuráň hill, Staré Vinohrady & Pratzen crest)
    // -----------------------------------------------------------------------
    ctx.fillStyle = '#d1d5db';
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 0.9;

    // Northern Ridge (behind Kritschen and Bosenitz)
    ctx.beginPath();
    ctx.moveTo(330, 0);
    ctx.bezierCurveTo(390, 30, 450, 45, 520, 40);
    ctx.bezierCurveTo(620, 35, 710, 50, 820, 75);
    ctx.bezierCurveTo(900, 95, 960, 70, 980, 50);
    ctx.lineTo(980, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Santon Hill Knoll (280m)
    ctx.beginPath();
    ctx.arc(552, 95, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Žuráň Hill Knoll (280m - Napoleon HQ)
    ctx.beginPath();
    ctx.arc(442, 155, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Central Pratzen Plateau Crest (280m)
    ctx.beginPath();
    ctx.moveTo(565, 250);
    ctx.bezierCurveTo(630, 225, 710, 240, 765, 275);
    ctx.bezierCurveTo(800, 320, 765, 380, 710, 415);
    ctx.bezierCurveTo(650, 440, 590, 420, 565, 365);
    ctx.bezierCurveTo(550, 320, 550, 280, 565, 250);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hostieradek Knoll (280m)
    ctx.beginPath();
    ctx.ellipse(605, 435, 28, 18, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // -----------------------------------------------------------------------
    // Level 320m Contour (Highest summits)
    // -----------------------------------------------------------------------
    ctx.fillStyle = '#9ca3af';
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 0.9;

    // Northern Ridge Crest (320m)
    ctx.beginPath();
    ctx.moveTo(410, 0);
    ctx.bezierCurveTo(460, 25, 520, 25, 580, 10);
    ctx.lineTo(580, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Staré Vinohrady & Pratzen Summit (320m)
    ctx.beginPath();
    ctx.ellipse(645, 290, 38, 22, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Elevation numerals stamped in small crisp typography
    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText('200', 95, 225);
    ctx.fillText('200', 200, 275);
    ctx.fillText('200', 215, 555);
    ctx.fillText('240', 20, 480);
    ctx.fillText('240', 17, 575);
    ctx.fillText('240', 255, 135);
    ctx.fillText('280', 290, 60);
    ctx.fillText('320', 365, 105);
    ctx.fillText('280', 368, 145);
    ctx.fillText('280', 370, 280);
    ctx.fillText('320', 445, 45);
    ctx.fillText('280', 460, 75);
    ctx.fillText('240', 370, 370);
    ctx.fillText('200', 285, 455);
    ctx.fillText('200', 460, 555);
    ctx.fillText('240', 485, 595);
    ctx.fillText('280', 515, 595);
    ctx.fillText('320', 565, 30);
    ctx.fillText('280', 582, 155);
    ctx.fillText('240', 650, 105);
    ctx.fillText('280', 655, 160);
    ctx.fillText('320', 695, 105);
    ctx.fillText('280', 725, 105);
    ctx.fillText('280', 780, 30);
    ctx.fillText('240', 730, 205);
    ctx.fillText('280', 865, 135);
    ctx.fillText('280', 790, 240);
    ctx.fillText('240', 790, 170);
    ctx.fillText('320', 905, 240);
    ctx.fillText('280', 970, 255);
    ctx.fillText('240', 840, 270);
    ctx.fillText('280', 870, 335);
    ctx.fillText('240', 960, 430);
    ctx.fillText('280', 985, 475);
    ctx.fillText('240', 650, 555);
    ctx.fillText('200', 680, 505);
    ctx.fillText('240', 845, 620);
    ctx.fillText('240', 590, 355);

    ctx.restore();
  }

  // =========================================================================
  // 3. WOODLANDS & FORESTS
  // =========================================================================
  private renderWoodlands(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const parcels = [
      { x: 440, y: 65, w: 70, h: 35 },
      { x: 395, y: 405, w: 35, h: 30 },
      { x: 575, y: 445, w: 45, h: 25 },
    ];

    for (const p of parcels) {
      ctx.fillStyle = 'rgba(167, 243, 208, 0.4)';
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, 6);
      ctx.fill();

      // Delicate tree stipples
      ctx.fillStyle = '#059669';
      for (let i = 0; i < 10; i++) {
        const tx = p.x + 6 + (Math.sin(i * 17) * 0.5 + 0.5) * (p.w - 12);
        const ty = p.y + 6 + (Math.cos(i * 29) * 0.5 + 0.5) * (p.h - 12);
        ctx.beginPath();
        ctx.arc(tx, ty, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // =========================================================================
  // 4. HYDROLOGY (RIVERS, LAKES, MARSHES)
  // Vivid blue matching West Point military cartography
  // =========================================================================
  private renderHydrology(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const riverBlue = '#3b82f6';
    const lakeFill = '#bfdbfe';

    // 1. Marshland Floodplains (Hatching)
    const marshAreas = [
      { x: 105, y: 135, w: 60, h: 165 },
      { x: 495, y: 485, w: 50, h: 40 },
    ];
    for (const m of marshAreas) {
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 0.9;
      for (let y = m.y; y < m.y + m.h; y += 7) {
        ctx.beginPath();
        ctx.moveTo(m.x + (y % 14), y);
        ctx.lineTo(m.x + m.w - (y % 14), y);
        ctx.stroke();
      }
    }

    // 2. Lakes (Satschan & Menitz)
    // Satschan Pond
    ctx.fillStyle = lakeFill;
    ctx.strokeStyle = riverBlue;
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.moveTo(395, 515);
    ctx.bezierCurveTo(450, 495, 510, 505, 530, 540);
    ctx.bezierCurveTo(500, 575, 430, 585, 385, 555);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Menitz Pond
    ctx.beginPath();
    ctx.moveTo(325, 540);
    ctx.bezierCurveTo(365, 535, 385, 565, 375, 595);
    ctx.bezierCurveTo(340, 610, 315, 590, 325, 540);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Puntowitz & Sokolnitz Mill Ponds (Chain of blue ponds along Goldbach)
    const ponds = [
      { x: 432, y: 310, r: 6 },
      { x: 428, y: 335, r: 8 },
      { x: 422, y: 355, r: 7 },
      { x: 270, y: 450, r: 9 }, // Turas stream pond
      { x: 775, y: 485, r: 10 }, // Birnbaum pond
    ];
    for (const p of ponds) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // 3. Rivers & Streams
    ctx.strokeStyle = riverBlue;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Schwarza River (Left)
    ctx.beginPath();
    ctx.lineWidth = 2.2;
    ctx.moveTo(145, 0);
    ctx.bezierCurveTo(135, 90, 115, 230, 105, 350);
    ctx.bezierCurveTo(95, 450, 80, 530, 65, 620);
    ctx.stroke();

    // Goldbach Brook (Center)
    ctx.beginPath();
    ctx.lineWidth = 1.6;
    ctx.moveTo(435, 0);
    ctx.bezierCurveTo(430, 70, 420, 150, 415, 220);
    ctx.bezierCurveTo(420, 270, 440, 310, 430, 360);
    ctx.bezierCurveTo(420, 410, 390, 460, 380, 500);
    ctx.bezierCurveTo(370, 540, 350, 580, 340, 620);
    ctx.stroke();

    // Littawa River (East)
    ctx.beginPath();
    ctx.lineWidth = 2.0;
    ctx.moveTo(960, 0);
    ctx.bezierCurveTo(940, 120, 930, 220, 915, 320);
    ctx.bezierCurveTo(900, 420, 860, 510, 820, 620);
    ctx.stroke();

    // Tributary Streams
    const tributaries = [
      // Stream towards Bosenitz
      [
        { x: 435, y: 50 },
        { x: 515, y: 70 },
        { x: 610, y: 65 },
      ],
      // Stream towards Turas
      [
        { x: 110, y: 280 },
        { x: 180, y: 300 },
        { x: 265, y: 285 },
      ],
      // Stream towards Schlappanitz
      [
        { x: 415, y: 220 },
        { x: 365, y: 245 },
        { x: 345, y: 290 },
      ],
      // Stream from Krzenowitz to Littawa
      [
        { x: 710, y: 315 },
        { x: 760, y: 340 },
        { x: 830, y: 360 },
        { x: 915, y: 345 },
      ],
    ];

    ctx.lineWidth = 1.1;
    for (const trib of tributaries) {
      ctx.beginPath();
      ctx.moveTo(trib[0].x, trib[0].y);
      for (let i = 1; i < trib.length; i++) {
        ctx.lineTo(trib[i].x, trib[i].y);
      }
      ctx.stroke();
    }

    // River Names (Rotated italic blue labels)
    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold italic 11px Arial, sans-serif';

    // "Schwarza R."
    ctx.save();
    ctx.translate(112, 450);
    ctx.rotate(-Math.PI / 2.3);
    ctx.fillText('Schwarza R.', 0, 0);
    ctx.restore();

    // "Goldbach Brook"
    ctx.save();
    ctx.translate(332, 530);
    ctx.rotate(-Math.PI / 2.5);
    ctx.fillText('Goldbach Brook', 0, 0);
    ctx.restore();

    // "Littawa R."
    ctx.fillText('Littawa R.', 920, 230);

    ctx.restore();
  }

  // =========================================================================
  // 5. ROAD NETWORK (IMPERIAL HIGHWAY & ROADS)
  // =========================================================================
  private renderRoads(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Olmütz Imperial Highway (Double-cased major road)
    ctx.beginPath();
    ctx.moveTo(40, 110);
    ctx.bezierCurveTo(180, 100, 360, 115, 540, 120);
    ctx.bezierCurveTo(700, 115, 830, 80, 960, 30);

    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 3.4;
    ctx.stroke();

    ctx.strokeStyle = '#f9fafb';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // "Olmütz ->" highway label
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillText('Olmütz ➔', 870, 22);

    // Vienna Highway (Raigern, bottom-left)
    ctx.beginPath();
    ctx.moveTo(30, 620);
    ctx.bezierCurveTo(50, 560, 60, 480, 60, 360);
    ctx.bezierCurveTo(60, 240, 100, 140, 140, 90);
    ctx.strokeStyle = '#888888';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // Secondary Country Roads (Single grey lines)
    const secondaryRoads = [
      // Brünn to Turas, Marxdorf, Schlappanitz, Puntowitz, Pratzen, Krzenowitz, Austerlitz
      [
        { x: 160, y: 70 },
        { x: 260, y: 275 },
        { x: 320, y: 300 },
        { x: 440, y: 235 },
        { x: 490, y: 270 },
        { x: 560, y: 320 },
        { x: 710, y: 315 },
        { x: 955, y: 260 },
      ],
      // Puntowitz to Sokolnitz to Telnitz to Aujest to Hostieradek to Krzenowitz
      [
        { x: 490, y: 270 },
        { x: 395, y: 410 },
        { x: 375, y: 500 },
        { x: 535, y: 460 },
        { x: 600, y: 430 },
        { x: 710, y: 315 },
      ],
      // Raigern to Telnitz & Satschan
      [
        { x: 65, y: 550 },
        { x: 180, y: 560 },
        { x: 375, y: 500 },
        { x: 450, y: 580 },
      ],
      // Raussnitz to Walspitz to Austerlitz
      [
        { x: 810, y: 65 },
        { x: 800, y: 160 },
        { x: 955, y: 260 },
      ],
      // Posoritz to Holubitz to Pratzen
      [
        { x: 750, y: 100 },
        { x: 690, y: 160 },
        { x: 560, y: 320 },
      ],
    ];

    ctx.strokeStyle = '#9e9e9e';
    ctx.lineWidth = 1.2;
    for (const r of secondaryRoads) {
      ctx.beginPath();
      ctx.moveTo(r[0].x, r[0].y);
      for (let i = 1; i < r.length; i++) {
        ctx.lineTo(r[i].x, r[i].y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  // =========================================================================
  // 6. TOWNS & VILLAGES
  // Authentic 19th century stippled grey building clusters & sharp typography
  // =========================================================================
  private renderSettlements(ctx: CanvasRenderingContext2D) {
    ctx.save();

    const settlements = [
      { name: 'BRÜNN', x: 160, y: 55, isMajor: true },
      { name: 'Latain', x: 310, y: 165 },
      { name: 'Kritschen', x: 445, y: 72 },
      { name: 'Bosenitz', x: 615, y: 80 },
      { name: 'Posoritz', x: 750, y: 100 },
      { name: 'Raussnitz', x: 810, y: 65 },
      { name: 'Turas', x: 275, y: 275 },
      { name: 'Marxdorf', x: 320, y: 300 },
      { name: 'Schl.', x: 440, y: 235 },
      { name: 'Puntowitz', x: 490, y: 270 },
      { name: 'Pratzen', x: 560, y: 320 },
      { name: 'Krzenowitz', x: 710, y: 315 },
      { name: 'Holubitz', x: 690, y: 160 },
      { name: 'Walspitz', x: 800, y: 160 },
      { name: 'Sokolnitz', x: 395, y: 410 },
      { name: 'Tellnitz', x: 375, y: 500 },
      { name: 'Aujest', x: 535, y: 460 },
      { name: 'Hostie-radek', x: 600, y: 430 },
      { name: 'Birnbaum', x: 775, y: 390 },
      { name: 'Raigern', x: 75, y: 530 },
      { name: 'Satschan', x: 450, y: 580 },
      { name: 'Menitz', x: 325, y: 580 },
      { name: 'AUSTERLITZ', x: 955, y: 260, isMajor: true },
    ];

    for (const s of settlements) {
      // Stippled grey town cluster footprint
      ctx.fillStyle = '#6b7280';
      ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
      ctx.fillRect(s.x - 6, s.y - 1, 3, 3);
      ctx.fillRect(s.x + 3, s.y + 1, 3, 3);
      if (s.isMajor) {
        ctx.fillStyle = '#374151';
        ctx.fillRect(s.x - 5, s.y - 5, 10, 10);
      }

      ctx.fillStyle = '#111827';
      ctx.font = s.isMajor ? 'bold 11px Arial, sans-serif' : 'bold 9px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name.toUpperCase(), s.x, s.y - 8);
    }

    ctx.restore();
  }

  // =========================================================================
  // 7. KEY TACTICAL LANDMARK BADGES (Ⓢ, Ⓥ, Ⓩ)
  // Exact green circular symbols from West Point map
  // =========================================================================
  private renderLandmarkBadges(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const badges = [
      { sym: 'S', x: 552, y: 95, label: 'Santon hill' },
      { sym: 'Z', x: 442, y: 155, label: 'Zuran hill' },
      { sym: 'V', x: 615, y: 290, label: 'Stare Vinohrady' },
    ];

    for (const b of badges) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#1f2937';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.sym, b.x, b.y);
    }
    ctx.restore();
  }

  // =========================================================================
  // 8. HEX GRID (OPTIONAL WARGAME MODE)
  // =========================================================================
  private renderHexGrid(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 80, 80, 0.15)';
    ctx.lineWidth = 0.5;

    const hexRadius = 24;
    const hexHeight = Math.sqrt(3) * hexRadius;
    const side = (3 / 2) * hexRadius;

    for (let x = 0; x < 980; x += side) {
      for (let y = 0; y < 620; y += hexHeight) {
        const cx = x;
        const cy = y + ((x / side) % 2 === 0 ? 0 : hexHeight / 2);

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = cx + hexRadius * Math.cos(angle);
          const py = cy + hexRadius * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // =========================================================================
  // 9. HISTORICAL TACTICAL MANEUVER ARROWS
  // Dashed red Allied flank attack & blue French counter-attack vectors
  // =========================================================================
  private renderHistoricalManeuvers(ctx: CanvasRenderingContext2D, state: SimulationState) {
    ctx.save();

    // 1. Allied Columns Flanking March (Red dashed arrows from Pratzen to Telnitz/Sokolnitz)
    const alliedVectors = [
      // Dokhturov (Column I) sweeping southwest into Aujest & Tellnitz
      {
        start: { x: 670, y: 380 },
        control: { x: 590, y: 440 },
        end: { x: 490, y: 490 },
      },
      // Langeron (Column II) wheeling towards Sokolnitz
      {
        start: { x: 650, y: 350 },
        control: { x: 540, y: 390 },
        end: { x: 440, y: 430 },
      },
      // Prschibilschewski (Column III) towards Sokolnitz Castle
      {
        start: { x: 660, y: 260 },
        control: { x: 550, y: 310 },
        end: { x: 460, y: 380 },
      },
      // Kollowrat (Column IV) descending into Puntowitz
      {
        start: { x: 740, y: 280 },
        control: { x: 650, y: 280 },
        end: { x: 560, y: 290 },
      },
    ];

    for (const v of alliedVectors) {
      this.renderTotalWarArrow(ctx, v.start, v.end, undefined, v.control, '#cc1111', true);
    }

    // 2. French Counter-Assault Vectors (Blue dashed arrows)
    if (state.timeMinutes >= 110) {
      // Soult climbing the Pratzen heights
      this.renderTotalWarArrow(
        ctx,
        { x: 460, y: 260 },
        { x: 550, y: 290 },
        undefined,
        { x: 500, y: 270 },
        '#0033cc',
        true
      );
      this.renderTotalWarArrow(
        ctx,
        { x: 460, y: 280 },
        { x: 580, y: 340 },
        undefined,
        { x: 510, y: 310 },
        '#0033cc',
        true
      );
    }

    // Davout forced march north from Raigern
    this.renderTotalWarArrow(
      ctx,
      { x: 45, y: 615 },
      { x: 35, y: 550 },
      undefined,
      { x: 40, y: 580 },
      '#0033cc',
      true
    );

    ctx.restore();
  }

  // =========================================================================
  // TOTAL WAR CURVED MANEUVER ARROW RENDERING ENGINE
  // Multi-point splines, marching chevrons, destination ghost formations & flight metrics
  // =========================================================================
  private renderTotalWarArrow(
    ctx: CanvasRenderingContext2D,
    start: Vector2D,
    end: Vector2D,
    waypoints: Vector2D[] | undefined,
    curveControl: Vector2D | undefined,
    color: string,
    isExecuting: boolean,
    ghostUnit?: Unit,
    finalHeading?: number,
    showMetrics?: boolean
  ) {
    ctx.save();

    // 1. Build smooth curve points
    let points: Vector2D[] = [];
    if (waypoints && waypoints.length > 1) {
      points = [start, ...waypoints, end];
    } else if (curveControl) {
      // Sample quadratic Bezier curve
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const inv = 1 - t;
        const x = inv * inv * start.x + 2 * inv * t * curveControl.x + t * t * end.x;
        const y = inv * inv * start.y + 2 * inv * t * curveControl.y + t * t * end.y;
        points.push({ x, y });
      }
    } else {
      points = [start, end];
    }

    if (points.length < 2) {
      ctx.restore();
      return;
    }

    // Calculate total path distance (1 px ≈ 33 meters)
    let totalDist = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalDist += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    }
    const distMeters = Math.round(totalDist * 33);
    const marchMins = Math.max(1, Math.round(distMeters / 75));

    // 2. Translucent outer ribbon glow
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 7.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // 3. Main core tactical arrow path
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isExecuting) {
      ctx.setLineDash([9, 5]);
      ctx.lineDashOffset = -this.animFrame * 0.55;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();

    // 4. Animated Total War Marching Chevrons (>> >> >>) along the curve
    const chevronInterval = 38;
    const animOffset = (this.animFrame * 0.7) % chevronInterval;
    let accum = animOffset;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (segLen < 1) continue;
      const segAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      while (accum < segLen) {
        const t = accum / segLen;
        const cx = p1.x + (p2.x - p1.x) * t;
        const cy = p1.y + (p2.y - p1.y) * t;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(segAngle);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-4, -4);
        ctx.lineTo(2, 0);
        ctx.lineTo(-4, 4);
        ctx.stroke();
        ctx.restore();

        accum += chevronInterval;
      }
      accum -= segLen;
    }

    // 5. Broad Military Arrowhead at Destination
    const lastP = points[points.length - 1];
    const prevP = points[points.length - 2];
    const finalAngle = Math.atan2(lastP.y - prevP.y, lastP.x - prevP.x);
    const arrowLen = 14;

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(lastP.x, lastP.y);
    ctx.lineTo(
      lastP.x - arrowLen * Math.cos(finalAngle - Math.PI / 6),
      lastP.y - arrowLen * Math.sin(finalAngle - Math.PI / 6)
    );
    ctx.lineTo(
      lastP.x - (arrowLen * 0.45) * Math.cos(finalAngle),
      lastP.y - (arrowLen * 0.45) * Math.sin(finalAngle)
    );
    ctx.lineTo(
      lastP.x - arrowLen * Math.cos(finalAngle + Math.PI / 6),
      lastP.y - arrowLen * Math.sin(finalAngle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 6. Total War Ghost Unit Silhouette at Destination
    if (ghostUnit) {
      const heading = finalHeading !== undefined ? finalHeading : finalAngle;
      const gw = ghostUnit.width || 50;
      const gh = ghostUnit.depth || 16;

      ctx.save();
      ctx.translate(lastP.x, lastP.y);
      ctx.rotate(heading);

      ctx.fillStyle = ghostUnit.faction === 'french' ? 'rgba(0, 51, 204, 0.22)' : 'rgba(204, 17, 17, 0.22)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.rect(-gw / 2, -gh / 2, gw, gh);
      ctx.fill();
      ctx.stroke();

      // Front direction arrow
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(gw / 2 + 3, 0);
      ctx.lineTo(gw / 2 - 2, -2.5);
      ctx.lineTo(gw / 2 - 2, 2.5);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    // 7. Tactical Distance & Flight Tag
    if (showMetrics && totalDist > 40) {
      const midIdx = Math.floor(points.length / 2);
      const midPt = points[midIdx];

      ctx.save();
      const tag = `${distMeters.toLocaleString()}m • ~${marchMins} min`;
      ctx.font = 'bold 9px Arial, sans-serif';
      const tw = ctx.measureText(tag).width;

      ctx.fillStyle = 'rgba(250, 245, 235, 0.95)';
      ctx.fillRect(midPt.x - tw / 2 - 4, midPt.y - 18, tw + 8, 14);
      ctx.strokeStyle = '#554433';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(midPt.x - tw / 2 - 4, midPt.y - 18, tw + 8, 14);

      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tag, midPt.x, midPt.y - 11);
      ctx.restore();
    }

    ctx.restore();
  }

  // Active Orders Drawing
  private renderActiveOrders(ctx: CanvasRenderingContext2D, orders: ManeuverOrder[], units: Unit[]) {
    for (const order of orders) {
      const unit = units.find((u) => u.id === order.unitId);
      if (!unit) continue;
      const color = unit.faction === 'french' ? '#0033cc' : '#cc1111';

      this.renderTotalWarArrow(
        ctx,
        unit.position,
        order.destination,
        order.waypoints,
        order.curveControl,
        color,
        true,
        unit,
        order.finalHeading,
        false
      );
    }
  }

  private renderDraftingArrow(ctx: CanvasRenderingContext2D, drawingOrder: DraftingManeuver) {
    const { startUnit, currentTarget, waypoints, curveOffset, curveControl, finalHeading } = drawingOrder;
    const color = startUnit.faction === 'french' ? '#0033cc' : '#cc1111';

    // Calculate curveControl from curveOffset if not explicitly supplied
    let activeControl = curveControl;
    if (!activeControl && curveOffset) {
      const midX = (startUnit.position.x + currentTarget.x) / 2;
      const midY = (startUnit.position.y + currentTarget.y) / 2;
      const dx = currentTarget.x - startUnit.position.x;
      const dy = currentTarget.y - startUnit.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const perpX = -dy / dist;
        const perpY = dx / dist;
        activeControl = { x: midX + perpX * curveOffset, y: midY + perpY * curveOffset };
      }
    }

    this.renderTotalWarArrow(
      ctx,
      startUnit.position,
      currentTarget,
      waypoints,
      activeControl,
      color,
      false,
      startUnit,
      finalHeading,
      true
    );
  }

  private renderUnitRangeArc(ctx: CanvasRenderingContext2D, unit: Unit) {
    ctx.save();
    ctx.translate(unit.position.x, unit.position.y);
    const radius = Math.min(130, unit.range);
    const cone = Math.PI / 3;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, unit.heading - cone / 2, unit.heading + cone / 2);
    ctx.closePath();

    ctx.fillStyle = unit.faction === 'french' ? 'rgba(0, 51, 204, 0.08)' : 'rgba(204, 17, 17, 0.08)';
    ctx.fill();
    ctx.strokeStyle = unit.faction === 'french' ? 'rgba(0, 51, 204, 0.5)' : 'rgba(204, 17, 17, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.restore();
  }

  // =========================================================================
  // 12. MILITARY UNIT CHITS (EXACT NATO / WEST POINT SYMBOLOGY)
  // French Royal Blue (#0033cc) vs Allied Red (#cc1111)
  // Upright, sharp typography matching media_1789975155849.png
  // =========================================================================
  private renderMilitaryUnits(
    ctx: CanvasRenderingContext2D,
    units: Unit[],
    selectedUnitId: string | null,
    hoveredUnitId: string | null
  ) {
    for (const unit of units) {
      if (unit.status === 'shattered') continue;

      const isSelected = unit.id === selectedUnitId;
      const isHovered = unit.id === hoveredUnitId;
      const isFrench = unit.faction === 'french';

      const w = (unit.width || 50) * 0.6;
      const h = (unit.depth || 16) * 0.6;
      const primaryColor = isFrench ? '#0033cc' : '#cc1111';

      ctx.save();
      ctx.translate(unit.position.x, unit.position.y);

      // Rotated Unit Block (Orientation of battle line)
      ctx.save();
      ctx.rotate(unit.heading);

      // Subtle Chit Drop Shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 1.5;
      ctx.shadowOffsetY = 1.5;

      // Formation / Symbology Specific Tactical Drawing:
      if (this.symbology === 'nato') {
        // ==========================================
        // NATO STANDARD OPERATIONAL COUNTER
        // ==========================================
        const natoW = Math.max(34, w);
        const natoH = 18;

        ctx.fillStyle = primaryColor;
        ctx.fillRect(-natoW / 2, -natoH / 2, natoW, natoH);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-natoW / 2, -natoH / 2, natoW, natoH);

        ctx.shadowColor = 'transparent';

        // NATO Symbology inside chit
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.3;
        if (unit.type === 'infantry' || unit.type === 'guard') {
          // Infantry Cross (X)
          ctx.beginPath();
          ctx.moveTo(-natoW / 2 + 6, -natoH / 2 + 4);
          ctx.lineTo(natoW / 2 - 6, natoH / 2 - 4);
          ctx.moveTo(natoW / 2 - 6, -natoH / 2 + 4);
          ctx.lineTo(-natoW / 2 + 6, natoH / 2 - 4);
          ctx.stroke();
          if (unit.type === 'guard') {
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (unit.type === 'cavalry') {
          // Cavalry / Armor diagonal slash (/)
          ctx.beginPath();
          ctx.moveTo(-natoW / 2 + 6, natoH / 2 - 4);
          ctx.lineTo(natoW / 2 - 6, -natoH / 2 + 4);
          ctx.stroke();
        } else if (unit.type === 'artillery') {
          // Artillery solid round (•)
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // HQ / Command flagpole
          ctx.beginPath();
          ctx.moveTo(-natoW / 2 + 8, natoH / 2 - 4);
          ctx.lineTo(-natoW / 2 + 8, -natoH / 2 + 4);
          ctx.lineTo(2, -natoH / 2 + 8);
          ctx.lineTo(-natoW / 2 + 8, 0);
          ctx.stroke();
        }

        // Forward march / facing direction indicator pip
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(natoW / 2 + 5, 0);
        ctx.lineTo(natoW / 2 - 1, -4);
        ctx.lineTo(natoW / 2 - 1, 4);
        ctx.closePath();
        ctx.fill();

      } else if (unit.formation === 'column') {
        // ==========================================
        // MARCHING / ATTACK COLUMN (Narrow & Deep)
        // Array of 3 stacked battalion blocks marching in echelon
        // ==========================================
        const colW = 18;
        const numBlocks = 3;
        const blockLen = 14;
        const gap = 4;
        const totalLen = numBlocks * blockLen + (numBlocks - 1) * gap;

        for (let i = 0; i < numBlocks; i++) {
          const bx = -totalLen / 2 + i * (blockLen + gap);
          ctx.fillStyle = primaryColor;
          ctx.fillRect(bx, -colW / 2, blockLen, colW);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(bx, -colW / 2, blockLen, colW);
        }

        ctx.shadowColor = 'transparent';

        // Column Head March Direction Arrow
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(totalLen / 2 + 4, 0);
        ctx.lineTo(totalLen / 2 - 2, -4);
        ctx.lineTo(totalLen / 2 - 2, 4);
        ctx.closePath();
        ctx.fill();

      } else if (unit.formation === 'square') {
        // ==========================================
        // INFANTRY SQUARE (Hollow Anti-Cavalry Box)
        // 4 outer battalion walls with empty center
        // ==========================================
        const sqSize = 34;
        const wallThick = 7;

        ctx.fillStyle = primaryColor;
        ctx.fillRect(-sqSize / 2, -sqSize / 2, sqSize, sqSize);

        // Hollow interior showing ground
        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(
          -sqSize / 2 + wallThick,
          -sqSize / 2 + wallThick,
          sqSize - wallThick * 2,
          sqSize - wallThick * 2
        );

        ctx.shadowColor = 'transparent';

        // Center Regimental Standard
        ctx.fillStyle = primaryColor;
        ctx.fillRect(-2.5, -2.5, 5, 5);

        // Outer Bayonet spikes along all 4 perimeter faces
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        for (let x = -sqSize / 2 + 4; x <= sqSize / 2 - 4; x += 6) {
          ctx.beginPath();
          ctx.moveTo(x, -sqSize / 2);
          ctx.lineTo(x, -sqSize / 2 - 2.5);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(x, sqSize / 2);
          ctx.lineTo(x, sqSize / 2 + 2.5);
          ctx.stroke();
        }
        for (let y = -sqSize / 2 + 4; y <= sqSize / 2 - 4; y += 6) {
          ctx.beginPath();
          ctx.moveTo(-sqSize / 2, y);
          ctx.lineTo(-sqSize / 2 - 2.5, y);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(sqSize / 2, y);
          ctx.lineTo(sqSize / 2 + 2.5, y);
          ctx.stroke();
        }

      } else if (unit.type === 'cavalry' && (unit.id === 'fr_murat' || unit.id === 'fr_bessieres')) {
        // Tactical Cavalry Reserve Ellipse
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = 2.0;
        ctx.fillStyle = isFrench ? 'rgba(0, 51, 204, 0.06)' : 'rgba(204, 17, 17, 0.06)';
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // ==========================================
        // BATTLE LINE (Broad Frontage, Maximum Firepower)
        // ==========================================
        const lineW = Math.max(64, w);
        const lineH = Math.min(14, h);

        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.rect(-lineW / 2, -lineH / 2, lineW, lineH);
        ctx.fill();

        ctx.shadowColor = 'transparent';

        // Frontage Battalion Ticks
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        for (let s = 1; s <= 5; s++) {
          const sx = -lineW / 2 + (lineW / 6) * s;
          ctx.beginPath();
          ctx.moveTo(sx, -lineH / 2);
          ctx.lineTo(sx, lineH / 2);
          ctx.stroke();
        }

        // Front Firing Line Indicator (Front Facing Pip)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(lineW / 2 + 3, 0);
        ctx.lineTo(lineW / 2 - 2, -3);
        ctx.lineTo(lineW / 2 - 2, 3);
        ctx.closePath();
        ctx.fill();
      }

      // HOLDING GROUND DEFENSIVE ENTRENCHMENT / ABATIS
      if (unit.status === 'holding') {
        ctx.save();
        ctx.strokeStyle = '#15803d';
        ctx.lineWidth = 1.8;
        const frontX = (unit.formation === 'column' ? 28 : unit.formation === 'square' ? 22 : w / 2) + 4;
        const spanY = (unit.formation === 'column' ? 12 : unit.formation === 'square' ? 18 : h / 2) + 2;

        ctx.beginPath();
        ctx.moveTo(frontX, -spanY);
        for (let y = -spanY; y <= spanY; y += 8) {
          ctx.lineTo(frontX + 3.5, y + 4);
          ctx.lineTo(frontX, y + 8);
        }
        ctx.stroke();
        ctx.restore();
      }

      // COMBAT MUZZLE FLASHES
      if (unit.status === 'engaging') {
        ctx.save();
        const frontX = (unit.formation === 'column' ? 14 : unit.formation === 'square' ? 20 : w / 2) + 2;
        const spanY = (unit.formation === 'column' ? 8 : unit.formation === 'square' ? 14 : h / 2);
        
        ctx.strokeStyle = '#fef08a'; // Yellow/white flash
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        for (let y = -spanY; y <= spanY; y += 4) {
          if (Math.random() > 0.4) {
             ctx.moveTo(frontX, y);
             ctx.lineTo(frontX + 6 + Math.random() * 4, y);
          }
        }
        ctx.stroke();
        
        // Orange core
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore(); // Restore orientation so text is ALWAYS STRICTLY UPRIGHT!

      const drawW = this.symbology === 'nato' ? Math.max(34, w) : w;
      const drawH = this.symbology === 'nato' ? 18 : h;

      // Selection Halo
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#eab308' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(-drawW / 2 - 4, -drawH / 2 - 4, drawW + 8, drawH + 8);
      }

      // Echelon Markings above unit block (****, ***, **, GD)
      let echelon = 'XX';
      if (unit.type === 'headquarters') echelon = 'XXXX';
      else if (unit.corps.includes('Corps') || unit.corps.includes('Reserve') || unit.corps.includes('Wing')) echelon = 'XXX';
      else if (unit.type === 'guard') echelon = 'GD';

      ctx.fillStyle = primaryColor;
      ctx.font = 'bold 8.5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(echelon, 0, -drawH / 2 - 1);

      // EXTERNAL UNIT LABELS (Razor-sharp, exactly as in media_1789975155849.png)
      ctx.font = 'bold 9.5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(unit.name, 0, drawH / 2 + 2);

      // In Combat Clashing Indicator
      if (unit.status === 'engaging') {
        ctx.fillStyle = '#b91c1c';
        ctx.font = 'bold 12px Arial, sans-serif';
        ctx.fillText('⚔', w / 2 + 8, -6);
      }

      ctx.restore();
    }
  }

  // =========================================================================
  // 13. GUNPOWDER SMOKE EFFECTS
  // =========================================================================
  public spawnSmoke(x: number, y: number, count: number = 2) {
    for (let i = 0; i < count; i++) {
      this.smokeParticles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        radius: 6 + Math.random() * 8,
        alpha: 0.45,
        maxAlpha: 0.45,
        vx: 0.1 + (Math.random() - 0.5) * 0.1,
        vy: -0.1 - Math.random() * 0.15,
        life: 0,
        maxLife: 45 + Math.random() * 25,
      });
    }
  }

  private updateAndRenderSmoke(ctx: CanvasRenderingContext2D, state: SimulationState) {
    if (state.isRunning) {
      for (const unit of state.units) {
        if (unit.status === 'engaging' && Math.random() < 0.25) {
          this.spawnSmoke(unit.position.x, unit.position.y, 2);
        }
      }
    }

    ctx.save();
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.radius += 0.15;
      p.alpha = p.maxAlpha * (1 - p.life / p.maxLife);

      if (p.life >= p.maxLife) {
        this.smokeParticles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(156, 163, 175, ${p.alpha})`;
      ctx.fill();
    }
    ctx.restore();
  }

  // =========================================================================
  // 14. AUTHENTIC WEST POINT ATLAS CARTOUCHE & MAP LEGEND
  // Exact layout from media_1789975155849.png
  // =========================================================================
  private renderAtlasCartouche(ctx: CanvasRenderingContext2D, state: SimulationState) {
    ctx.save();
    ctx.translate(970, 610);
    ctx.scale(0.75, 0.75);
    
    const bw = 282;
    const bh = 172;
    const bx = -bw;
    const by = -bh;

    // Card background
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(bx, by, bw, bh);

    // Double frame
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(bx + 2, by + 2, bw - 4, bh - 4);

    // Source credit
    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 8px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('JCATS TOPO DATASET', bx + bw / 2, by + 12);

    // Main Title
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText('OPERATION', bx + bw / 2, by + 30);
    ctx.font = '900 22px Arial, sans-serif';
    ctx.fillText('AUSTERLITZ', bx + bw / 2, by + 52);

    // Dynamic situation time
    const timeHours = Math.floor(state.timeMinutes / 60) + 7;
    const timeMins = Math.floor(state.timeMinutes % 60);
    const formattedHour = `${String(timeHours).padStart(2, '0')}${String(timeMins).padStart(2, '0')} HRS`;
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillStyle = '#4b5563';
    ctx.fillText(`SIMULATED T+${Math.floor(state.timeMinutes)} MIN // ${formattedHour}`, bx + bw / 2, by + 70);

    // Faction Swatches
    // ALLIED (Red)
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(bx + 20, by + 86, 42, 10);
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#111827';
    ctx.fillText('REDFOR', bx + 70, by + 95);

    // FRENCH (Blue)
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(bx + 20, by + 104, 42, 10);
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText('BLUFOR', bx + 70, by + 113);

    // Landmark Keys
    const landmarks = [
      { sym: 'S', name: 'SANTON HILL', y: by + 86 },
      { sym: 'V', name: 'STARE VINOHRADY', y: by + 102 },
      { sym: 'Z', name: 'ZURAN HILL', y: by + 118 },
    ];

    for (const lm of landmarks) {
      ctx.beginPath();
      ctx.arc(bx + 185, lm.y + 4, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#1f2937';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 6.5px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lm.sym, bx + 185, lm.y + 4);

      ctx.fillStyle = '#111827';
      ctx.font = 'bold 9.5px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(lm.name, bx + 195, lm.y + 7);
    }

    // Scale Bar (Miles & Kilometers)
    const scaleY = by + 142;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1;

    // Miles Scale
    ctx.beginPath();
    ctx.moveTo(bx + 35, scaleY);
    ctx.lineTo(bx + 145, scaleY);
    ctx.stroke();

    const mileMarks = [
      { dist: '0', x: bx + 35 },
      { dist: '0.5', x: bx + 55 },
      { dist: '1', x: bx + 80 },
      { dist: '2', x: bx + 115 },
      { dist: '3', x: bx + 145 },
    ];
    for (const m of mileMarks) {
      ctx.beginPath();
      ctx.moveTo(m.x, scaleY - 3);
      ctx.lineTo(m.x, scaleY + 3);
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 8px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.dist, m.x, scaleY - 4);
    }
    ctx.font = 'bold 8px Arial, sans-serif';
    ctx.fillText('MILES', bx + 90, scaleY + 8);

    // Kilometers Scale
    const kmY = scaleY + 16;
    ctx.beginPath();
    ctx.moveTo(bx + 160, kmY);
    ctx.lineTo(bx + 270, kmY);
    ctx.stroke();

    const kmMarks = [
      { dist: '0', x: bx + 160 },
      { dist: '1', x: bx + 185 },
      { dist: '2', x: bx + 212 },
      { dist: '3', x: bx + 240 },
      { dist: '4', x: bx + 270 },
    ];
    for (const k of kmMarks) {
      ctx.beginPath();
      ctx.moveTo(k.x, kmY - 3);
      ctx.lineTo(k.x, kmY + 3);
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 8px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(k.dist, k.x, kmY - 4);
    }
    ctx.font = 'bold 8px Arial, sans-serif';
    ctx.fillText('KILOMETERS', bx + 215, kmY + 8);

    ctx.restore();
  }

  // =========================================================================
  // 15. AUTHENTIC NORTH ARROW (BOTTOM-LEFT)
  // =========================================================================
  private renderNorthArrow(ctx: CanvasRenderingContext2D) {
    ctx.save();
    const nx = 18;
    const ny = 530;

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 1.2;

    // Arrow line
    ctx.beginPath();
    ctx.moveTo(nx, ny + 35);
    ctx.lineTo(nx, ny - 15);
    ctx.stroke();

    // Crossbar
    ctx.beginPath();
    ctx.moveTo(nx - 5, ny + 20);
    ctx.lineTo(nx + 5, ny + 20);
    ctx.stroke();

    // Arrowhead
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(nx, ny - 20);
    ctx.lineTo(nx - 3, ny - 10);
    ctx.lineTo(nx + 3, ny - 10);
    ctx.closePath();
    ctx.fill();

    // 'N'
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', nx, ny - 24);

    ctx.restore();
  }
}
