import * as THREE from 'three';

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

export interface CampusTextureSet {
  crimsonBrick: THREE.CanvasTexture;
  sandstone: THREE.CanvasTexture;
  windowFacade: THREE.CanvasTexture;
  windowEmissive: THREE.CanvasTexture;
  asphaltRoad: THREE.CanvasTexture;
  plazaPaver: THREE.CanvasTexture;
  campusGrass: THREE.CanvasTexture;
  basketballCourt: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  createSignTexture: (title: string, subtitle?: string, accent?: string) => THREE.CanvasTexture;
  dispose: () => void;
}

export function createCampusTextures(maxAnisotropy: number): CampusTextureSet {
  const createdTextures: THREE.Texture[] = [];
  const track = <T extends THREE.Texture>(t: T): T => {
    createdTextures.push(t);
    return t;
  };

  // 1. Chitkara Crimson Architectural Brick
  const [brickC, brickCtx] = createCanvas(256, 256);
  brickCtx.fillStyle = '#7e2024';
  brickCtx.fillRect(0, 0, 256, 256);
  const rows = 16;
  const cols = 8;
  const bh = 256 / rows;
  const bw = 256 / cols;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let c = -1; c <= cols; c++) {
      const shade = 0.88 + Math.sin(r * 7.3 + c * 13.1) * 0.12;
      const red = Math.round(138 * shade);
      const green = Math.round(35 * shade);
      const blue = Math.round(38 * shade);
      brickCtx.fillStyle = `rgb(${red},${green},${blue})`;
      brickCtx.fillRect(c * bw + offset + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
  }
  const crimsonBrick = track(finalizeColorTexture(brickC, maxAnisotropy, 3, 2));

  // 2. Warm Sandstone / Concrete Architectural Cladding
  const [sandC, sandCtx] = createCanvas(256, 256);
  sandCtx.fillStyle = '#ddd6ca';
  sandCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 64) {
    for (let x = 0; x < 256; x += 64) {
      const v = 216 + Math.round(Math.sin(x * 0.2 + y * 0.3) * 8);
      sandCtx.fillStyle = `rgb(${v}, ${v - 7}, ${v - 17})`;
      sandCtx.fillRect(x + 1, y + 1, 62, 62);
    }
  }
  sandCtx.strokeStyle = 'rgba(110, 102, 92, 0.25)';
  sandCtx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    sandCtx.beginPath();
    sandCtx.moveTo(i, 0);
    sandCtx.lineTo(i, 256);
    sandCtx.stroke();
    sandCtx.beginPath();
    sandCtx.moveTo(0, i);
    sandCtx.lineTo(256, i);
    sandCtx.stroke();
  }
  const sandstone = track(finalizeColorTexture(sandC, maxAnisotropy, 3, 2));

  // 3. Curtain-Wall Glass & Mullion Grid (Day + Night Emissive)
  const [winC, winCtx] = createCanvas(256, 256);
  const [winEmC, winEmCtx] = createCanvas(256, 256);
  winCtx.fillStyle = '#1e293b';
  winCtx.fillRect(0, 0, 256, 256);
  winEmCtx.fillStyle = '#000000';
  winEmCtx.fillRect(0, 0, 256, 256);

  const winCols = 4;
  const winRows = 4;
  const ww = 256 / winCols;
  const wh = 256 / winRows;
  for (let r = 0; r < winRows; r++) {
    for (let c = 0; c < winCols; c++) {
      const x = c * ww + 5;
      const y = r * wh + 6;
      const w = ww - 10;
      const h = wh - 12;

      const grad = winCtx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, '#6497b8');
      grad.addColorStop(0.55, '#2b4f6e');
      grad.addColorStop(1, '#182b3e');
      winCtx.fillStyle = grad;
      winCtx.fillRect(x, y, w, h);

      // Subtle sky reflection streak
      winCtx.fillStyle = 'rgba(255,255,255,0.14)';
      winCtx.beginPath();
      winCtx.moveTo(x + 2, y + 2);
      winCtx.lineTo(x + w * 0.48, y + 2);
      winCtx.lineTo(x + 2, y + h * 0.6);
      winCtx.closePath();
      winCtx.fill();

      // Lit classroom windows for night preset
      const isLit = ((r * 3 + c * 5) % 3) !== 0;
      if (isLit) {
        winEmCtx.fillStyle = r % 2 === 0 ? '#ffd89a' : '#cde4ff';
        winEmCtx.fillRect(x + 1, y + 1, w - 2, h - 2);
      }
    }
  }
  const windowFacade = track(finalizeColorTexture(winC, maxAnisotropy, 3, 2));
  const windowEmissive = track(finalizeColorTexture(winEmC, maxAnisotropy, 3, 2));

  // 4. Asphalt Road Texture
  const [roadC, roadCtx] = createCanvas(256, 256);
  roadCtx.fillStyle = '#2d333d';
  roadCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const rx = Math.random() * 256;
    const ry = Math.random() * 256;
    const g = 38 + Math.floor(Math.random() * 26);
    roadCtx.fillStyle = `rgb(${g},${g + 3},${g + 8})`;
    roadCtx.fillRect(rx, ry, 2, 2);
  }
  // Subtle road edge stripes
  roadCtx.fillStyle = 'rgba(241, 245, 249, 0.72)';
  roadCtx.fillRect(8, 0, 5, 256);
  roadCtx.fillRect(243, 0, 5, 256);
  // Dashed center line
  roadCtx.fillStyle = 'rgba(250, 204, 21, 0.85)';
  for (let y = 12; y < 256; y += 48) {
    roadCtx.fillRect(125, y, 6, 24);
  }
  const asphaltRoad = track(finalizeColorTexture(roadC, maxAnisotropy, 1, 6));

  // 5. Interlocking Plaza Pavers
  const [paverC, paverCtx] = createCanvas(256, 256);
  paverCtx.fillStyle = '#b9afa2';
  paverCtx.fillRect(0, 0, 256, 256);
  const pSize = 32;
  for (let y = 0; y < 256; y += pSize) {
    for (let x = 0; x < 256; x += pSize) {
      const tone = ((x / pSize + y / pSize) % 2 === 0 ? 196 : 182) + Math.round(Math.sin(x + y) * 6);
      paverCtx.fillStyle = `rgb(${tone}, ${tone - 9}, ${tone - 21})`;
      paverCtx.fillRect(x + 1, y + 1, pSize - 2, pSize - 2);
    }
  }
  const plazaPaver = track(finalizeColorTexture(paverC, maxAnisotropy, 6, 6));

  // 6. Campus Lawn Grass Texture
  const [grassC, grassCtx] = createCanvas(256, 256);
  grassCtx.fillStyle = '#3f6e3a';
  grassCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const gx = Math.random() * 256;
    const gy = Math.random() * 256;
    const gShade = 95 + Math.floor(Math.random() * 34);
    grassCtx.fillStyle = `rgb(${Math.floor(gShade * 0.56)}, ${gShade}, ${Math.floor(gShade * 0.52)})`;
    grassCtx.fillRect(gx, gy, 3, 3);
  }
  const campusGrass = track(finalizeColorTexture(grassC, maxAnisotropy, 28, 28));

  // 7. Outdoor Basketball Court Texture
  const [courtC, courtCtx] = createCanvas(512, 256);
  courtCtx.fillStyle = '#255c88';
  courtCtx.fillRect(0, 0, 512, 256);
  courtCtx.fillStyle = '#b3472f';
  courtCtx.fillRect(24, 20, 464, 216);
  courtCtx.strokeStyle = '#f8fafc';
  courtCtx.lineWidth = 4;
  courtCtx.strokeRect(24, 20, 464, 216);
  courtCtx.beginPath();
  courtCtx.moveTo(256, 20);
  courtCtx.lineTo(256, 236);
  courtCtx.stroke();
  courtCtx.beginPath();
  courtCtx.arc(256, 128, 34, 0, Math.PI * 2);
  courtCtx.stroke();
  // Keys
  courtCtx.strokeRect(24, 82, 86, 92);
  courtCtx.strokeRect(402, 82, 86, 92);
  courtCtx.beginPath();
  courtCtx.arc(110, 128, 32, -Math.PI / 2, Math.PI / 2);
  courtCtx.stroke();
  courtCtx.beginPath();
  courtCtx.arc(402, 128, 32, Math.PI / 2, (Math.PI * 3) / 2);
  courtCtx.stroke();
  const basketballCourt = track(finalizeColorTexture(courtC, maxAnisotropy, 1, 1));
  basketballCourt.wrapS = THREE.ClampToEdgeWrapping;
  basketballCourt.wrapT = THREE.ClampToEdgeWrapping;

  // 8. Soft Radial Contact Shadow Texture
  const [shadC, shadCtx] = createCanvas(128, 128);
  const sGrad = shadCtx.createRadialGradient(64, 64, 4, 64, 64, 60);
  sGrad.addColorStop(0, 'rgba(6, 10, 18, 0.55)');
  sGrad.addColorStop(0.55, 'rgba(6, 10, 18, 0.22)');
  sGrad.addColorStop(1, 'rgba(6, 10, 18, 0)');
  shadCtx.fillStyle = sGrad;
  shadCtx.fillRect(0, 0, 128, 128);
  const contactShadow = track(new THREE.CanvasTexture(shadC));
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  // 9. Crisp Building Signage Generator
  const createSignTexture = (
    title: string,
    subtitle = 'CHITKARA UNIVERSITY',
    accent = '#b91c1c',
  ): THREE.CanvasTexture => {
    const [sc, sctx] = createCanvas(512, 144);
    sctx.fillStyle = '#0f172a';
    sctx.fillRect(0, 0, 512, 144);

    // Accent top bar
    sctx.fillStyle = accent;
    sctx.fillRect(0, 0, 512, 14);

    // Inner hairline frame
    sctx.strokeStyle = 'rgba(255,255,255,0.18)';
    sctx.lineWidth = 3;
    sctx.strokeRect(8, 20, 496, 114);

    sctx.fillStyle = '#f8fafc';
    sctx.font = 'bold 42px "Plus Jakarta Sans", system-ui, sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText(title.toUpperCase(), 256, 66);

    sctx.fillStyle = '#94a3b8';
    sctx.font = '600 18px "JetBrains Mono", monospace';
    sctx.fillText(subtitle.toUpperCase(), 256, 108);

    const tex = track(new THREE.CanvasTexture(sc));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    crimsonBrick,
    sandstone,
    windowFacade,
    windowEmissive,
    asphaltRoad,
    plazaPaver,
    campusGrass,
    basketballCourt,
    contactShadow,
    createSignTexture,
    dispose: () => {
      createdTextures.forEach((t) => t.dispose());
    },
  };
}
