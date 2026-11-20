import * as THREE from 'three';
import {
  ALL_CAMPUS_BUILDINGS,
  ALL_CAMPUS_ROADS,
  ALL_CAMPUS_ZONES,
  CAMPUS_LANDMARKS,
  CAMPUS_TOKENS,
  CampusLandmark,
  DEFAULT_MAP_CALIBRATION,
  GmpPlaceRecord,
  MapCalibration,
  OSM_NODES,
} from './campusData';
import { OsmBuildingPolygon } from './osmCampusData';
import { CampusTextureSet } from './textures';

export interface PolygonCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  polygon: Array<[number, number]>;
  landmarkId?: string;
}

export interface TokenInstance {
  id: string;
  label: string;
  x: number;
  z: number;
  group: THREE.Group;
  collected: boolean;
}

export interface FacadePhotoSlot {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  frame: THREE.Group;
}

export interface BuiltCampusWorld {
  worldGroup: THREE.Group;
  colliders: PolygonCollider[];
  clickableMeshes: THREE.Object3D[];
  landmarkMarkers: Map<string, THREE.Mesh>;
  facadeSlots: Map<string, FacadePhotoSlot>;
  dynamicPlaceGroup: THREE.Group;
  tokens: TokenInstance[];
  windowMaterial: THREE.MeshStandardMaterial;
  lampBulbMaterial: THREE.MeshStandardMaterial;
  mapOverlayMesh: THREE.Mesh;
  mapOverlayMaterial: THREE.MeshBasicMaterial;
  applyMapCalibration: (cal: MapCalibration) => void;
  setBuildingFacadePhoto: (landmarkId: string, dataUrl: string | null) => void;
  syncDynamicGooglePlaces: (places: GmpPlaceRecord[]) => void;
  dispose: () => void;
}

/** Signed area in (x, -z) plane; >0 means CCW for THREE.Shape */
function signedArea2D(ring: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    const y1 = -z1;
    const y2 = -z2;
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function cleanRing(pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length < 3) return pts;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(x - prev[0], z - prev[1]) > 0.05) {
      out.push([x, z]);
    }
  }
  if (
    out.length > 3 &&
    Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.05
  ) {
    out.pop();
  }
  return out;
}

function ensureCCW(ring: Array<[number, number]>): Array<[number, number]> {
  const cleaned = cleanRing(ring);
  return signedArea2D(cleaned) < 0 ? [...cleaned].reverse() : cleaned;
}

/** Offset a closed 2D polygon outward (positive dist) or inward (negative dist) cleanly */
function offsetPolygon2D(ring: Array<[number, number]>, dist: number): Array<[number, number]> {
  if (Math.abs(dist) < 0.001 || ring.length < 3) return ring;
  const ccw = ensureCCW(ring);
  const n = ccw.length;
  const result: Array<[number, number]> = [];

  for (let i = 0; i < n; i++) {
    const prev = ccw[(i - 1 + n) % n];
    const curr = ccw[i];
    const next = ccw[(i + 1) % n];

    // Edges in world (x, z); outward normal in (x, -z) CCW means right-hand normal in XZ!
    const dx1 = curr[0] - prev[0];
    const dz1 = curr[1] - prev[1];
    const len1 = Math.hypot(dx1, dz1) || 1;
    // Outward normal for edge in CCW (x, -z): tangent (dx, -dz) -> right normal (-dz, -dx) in (x, -z) => (-dz, +dx) in (x, z)
    const nx1 = -dz1 / len1;
    const nz1 = dx1 / len1;

    const dx2 = next[0] - curr[0];
    const dz2 = next[1] - curr[1];
    const len2 = Math.hypot(dx2, dz2) || 1;
    const nx2 = -dz2 / len2;
    const nz2 = dx2 / len2;

    let bx = nx1 + nx2;
    let bz = nz1 + nz2;
    const blen = Math.hypot(bx, bz);
    if (blen < 0.001) {
      result.push([curr[0] + nx1 * dist, curr[1] + nz1 * dist]);
    } else {
      bx /= blen;
      bz /= blen;
      const dot = Math.max(0.45, bx * nx1 + bz * nz1);
      const scale = Math.min(dist * 1.8, dist / dot);
      result.push([curr[0] + bx * scale, curr[1] + bz * scale]);
    }
  }
  return result;
}

/**
 * Extrude a closed [x, z] polygon upright from y = yBase to y = yBase + height
 * at exact world (x, z) coordinates (no center shift unless offsetX/Z passed).
 */
function createExtrudedPolygonGeo(
  ring: Array<[number, number]>,
  height: number,
  yBase = 0,
  offsetX = 0,
  offsetZ = 0,
  uvScale = 0.075,
): THREE.BufferGeometry {
  const ccw = ensureCCW(ring);
  const shape = new THREE.Shape();
  ccw.forEach(([x, z], idx) => {
    const sx = x - offsetX;
    const sy = -(z - offsetZ);
    if (idx === 0) shape.moveTo(sx, sy);
    else shape.lineTo(sx, sy);
  });
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  if (yBase !== 0) geo.translate(0, yBase, 0);

  const uv = geo.getAttribute('uv');
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
    }
    uv.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return geo;
}

/** Flat polygon ground mesh lying in XZ at elevation y */
function createGroundPolygonGeo(
  ring: Array<[number, number]>,
  y = 0.02,
  uvScale = 0.04,
): THREE.BufferGeometry {
  const ccw = ensureCCW(ring);
  const shape = new THREE.Shape();
  ccw.forEach(([x, z], idx) => {
    if (idx === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);

  const uv = geo.getAttribute('uv');
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale);
    }
    uv.needsUpdate = true;
  }
  return geo;
}

/** Mitered continuous flat ribbon along a 2D [x, z] polyline */
function createRoadRibbonGeo(
  points: Array<[number, number]>,
  width: number,
  y: number,
): THREE.BufferGeometry {
  const halfW = width / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let accumDist = 0;
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    if (i > 0) {
      accumDist += Math.hypot(curr[0] - points[i - 1][0], curr[1] - points[i - 1][1]);
    }

    let nx = 0;
    let nz = 0;
    if (i === 0) {
      const next = points[1];
      const dx = next[0] - curr[0];
      const dz = next[1] - curr[1];
      const l = Math.hypot(dx, dz) || 1;
      nx = -dz / l;
      nz = dx / l;
    } else if (i === points.length - 1) {
      const prev = points[i - 1];
      const dx = curr[0] - prev[0];
      const dz = curr[1] - prev[1];
      const l = Math.hypot(dx, dz) || 1;
      nx = -dz / l;
      nz = dx / l;
    } else {
      const prev = points[i - 1];
      const next = points[i + 1];
      const dx1 = curr[0] - prev[0];
      const dz1 = curr[1] - prev[1];
      const l1 = Math.hypot(dx1, dz1) || 1;
      const dx2 = next[0] - curr[0];
      const dz2 = next[1] - curr[1];
      const l2 = Math.hypot(dx2, dz2) || 1;
      const n1x = -dz1 / l1;
      const n1z = dx1 / l1;
      const n2x = -dz2 / l2;
      const n2z = dx2 / l2;
      let mx = n1x + n2x;
      let mz = n1z + n2z;
      const ml = Math.hypot(mx, mz);
      if (ml < 0.001) {
        nx = n1x;
        nz = n1z;
      } else {
        mx /= ml;
        mz /= ml;
        const miter = Math.min(1.8, 1 / Math.max(0.5, mx * n1x + mz * n1z));
        nx = mx * miter;
        nz = mz * miter;
      }
    }

    positions.push(curr[0] - nx * halfW, y, curr[1] - nz * halfW);
    positions.push(curr[0] + nx * halfW, y, curr[1] + nz * halfW);
    uvs.push(0, accumDist / 10);
    uvs.push(1, accumDist / 10);

    if (i < points.length - 1) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function pointInPolygon(px: number, pz: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    const intersect =
      zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function getBBox(ring: Array<[number, number]>) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function buildCampusWorld(textures: CampusTextureSet): BuiltCampusWorld {
  const worldGroup = new THREE.Group();
  const dynamicPlaceGroup = new THREE.Group();
  const colliders: PolygonCollider[] = [];
  const clickableMeshes: THREE.Object3D[] = [];
  const landmarkMarkers = new Map<string, THREE.Mesh>();
  const facadeSlots = new Map<string, FacadePhotoSlot>();
  const tokens: TokenInstance[] = [];
  const facadeCustomTextures = new Map<string, THREE.Texture>();

  // Shared PBR Materials
  const grassMat = new THREE.MeshStandardMaterial({
    map: textures.campusGrass,
    roughness: 0.94,
    metalness: 0.0,
  });

  const outerPlainsMat = new THREE.MeshStandardMaterial({
    color: 0x3b5834,
    roughness: 0.96,
    metalness: 0.0,
  });

  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltRoad,
    roughness: 0.85,
    metalness: 0.04,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const secondaryRoadMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    map: textures.asphaltRoad,
    roughness: 0.88,
    metalness: 0.03,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const highwayMat = new THREE.MeshStandardMaterial({
    color: 0xd9c27e,
    map: textures.asphaltRoad,
    roughness: 0.78,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const plazaMat = new THREE.MeshStandardMaterial({
    map: textures.plazaPaver,
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const crimsonBrickMat = new THREE.MeshStandardMaterial({
    map: textures.crimsonBrick,
    roughness: 0.86,
    metalness: 0.04,
  });

  const sandstoneMat = new THREE.MeshStandardMaterial({
    map: textures.sandstone,
    roughness: 0.78,
    metalness: 0.05,
  });

  const whiteRoofMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.65,
    metalness: 0.08,
  });

  const hostelRoofMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.72,
    metalness: 0.08,
  });

  const darkConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.82,
    metalness: 0.12,
  });

  const charcoalSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.32,
    metalness: 0.78,
  });

  const brushedAlumMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.25,
    metalness: 0.85,
  });

  const windowMaterial = new THREE.MeshStandardMaterial({
    map: textures.windowFacade,
    emissiveMap: textures.windowEmissive,
    emissive: new THREE.Color(0xffdfa8),
    emissiveIntensity: 0.0,
    roughness: 0.16,
    metalness: 0.62,
  });

  const lampBulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: new THREE.Color(0xffcf70),
    emissiveIntensity: 0.2,
    roughness: 0.3,
    metalness: 0.1,
  });

  // 1. Extended Punjab Plains & Full Campus Turf
  const outerGround = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), outerPlainsMat);
  outerGround.rotation.x = -Math.PI / 2;
  outerGround.position.set(-60, -0.05, 0);
  outerGround.receiveShadow = true;
  worldGroup.add(outerGround);

  const campusTurf = new THREE.Mesh(new THREE.PlaneGeometry(920, 820), grassMat);
  campusTurf.rotation.x = -Math.PI / 2;
  campusTurf.position.set(-65, 0, 5);
  campusTurf.receiveShadow = true;
  worldGroup.add(campusTurf);

  // Calibrated Real Google Maps Satellite Ground Overlay
  const mapOverlayMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: DEFAULT_MAP_CALIBRATION.opacity,
    depthWrite: false,
    visible: DEFAULT_MAP_CALIBRATION.visible,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mapOverlayMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(DEFAULT_MAP_CALIBRATION.baseWidth, DEFAULT_MAP_CALIBRATION.baseHeight),
    mapOverlayMaterial,
  );
  mapOverlayMesh.rotation.x = -Math.PI / 2;
  mapOverlayMesh.position.set(
    DEFAULT_MAP_CALIBRATION.offsetX,
    0.02,
    DEFAULT_MAP_CALIBRATION.offsetZ,
  );
  worldGroup.add(mapOverlayMesh);

  const applyMapCalibration = (cal: MapCalibration) => {
    mapOverlayMesh.position.set(cal.offsetX, 0.02, cal.offsetZ);
    mapOverlayMesh.scale.set(cal.scaleX, cal.scaleZ, 1);
    mapOverlayMesh.rotation.set(-Math.PI / 2, 0, THREE.MathUtils.degToRad(-cal.rotationDeg));
    mapOverlayMaterial.opacity = cal.opacity;
    mapOverlayMaterial.visible = cal.visible && !!mapOverlayMaterial.map;
  };

  new THREE.TextureLoader().load(
    '/assets/aistudio/image_f7d534df.png',
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mapOverlayMaterial.map = tex;
      mapOverlayMaterial.needsUpdate = true;
    },
    undefined,
    () => {
      mapOverlayMaterial.visible = false;
    },
  );

  // 2. Continuous OSM Surveyed Road Network (NH-7 + Campus Avenues + Footways)
  ALL_CAMPUS_ROADS.forEach((road) => {
    if (road.points.length < 2) return;
    let width = 5.6;
    let y = 0.036;
    let mat: THREE.Material = roadMat;

    if (road.highway === 'trunk') {
      width = 10.5;
      y = 0.044;
      mat = highwayMat;
    } else if (road.highway === 'trunk_link') {
      width = 6.8;
      y = 0.042;
      mat = highwayMat;
    } else if (road.highway === 'unclassified') {
      width = 7.4;
      y = 0.038;
      mat = roadMat;
    } else if (road.highway === 'service') {
      width = 5.8;
      y = 0.035;
      mat = secondaryRoadMat;
    } else if (road.highway === 'pedestrian') {
      width = 5.0;
      y = 0.046;
      mat = plazaMat;
    } else if (road.highway === 'footway') {
      width = 2.6;
      y = 0.048;
      mat = plazaMat;
    }

    const geo = createRoadRibbonGeo(road.points, width, y);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    worldGroup.add(mesh);
  });

  // 3. Surveyed Zones, Sports Fields, Park Lawns, Amphitheatre, Stage, Water Tower & Pond
  const parkingMat = new THREE.MeshStandardMaterial({
    color: 0x3f4754,
    roughness: 0.9,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const parkLawnMat = new THREE.MeshStandardMaterial({
    color: 0x3b7a3d,
    roughness: 0.9,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const sportsTurfMat = new THREE.MeshStandardMaterial({
    color: 0x2d7432,
    roughness: 0.88,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const tennisCourtMat = new THREE.MeshStandardMaterial({
    color: 0x1e6091,
    roughness: 0.78,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const volleyballCourtMat = new THREE.MeshStandardMaterial({
    color: 0xc27c4e,
    roughness: 0.92,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c4a6e,
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 1.0,
  });

  ALL_CAMPUS_ZONES.forEach((zone) => {
    if (zone.polygon.length < 3) return;

    if (zone.kind === 'water') {
      const bank = new THREE.Mesh(
        createExtrudedPolygonGeo(offsetPolygon2D(zone.polygon, 2.2), 0.35, 0),
        sandstoneMat,
      );
      bank.receiveShadow = true;
      const water = new THREE.Mesh(createGroundPolygonGeo(zone.polygon, 0.37, 0.05), waterMat);
      worldGroup.add(bank, water);
      const bbox = getBBox(zone.polygon);
      colliders.push({ ...bbox, polygon: ensureCCW(zone.polygon) });
      return;
    }

    if (zone.kind === 'water_tower') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 1.2, 20), darkConcreteMat);
      base.position.set(zone.cx, 0.6, zone.cz);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.3, 14, 18), sandstoneMat);
      shaft.position.set(zone.cx, 8.2, zone.cz);
      shaft.castShadow = true;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 2.4, 3.6, 24), whiteRoofMat);
      bowl.position.set(zone.cx, 16.8, zone.cz);
      bowl.castShadow = true;
      const tankTop = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.6, 3.2, 24), crimsonBrickMat);
      tankTop.position.set(zone.cx, 20.1, zone.cz);
      tankTop.castShadow = true;
      worldGroup.add(base, shaft, bowl, tankTop);
      const bbox = getBBox(zone.polygon);
      colliders.push({ ...bbox, polygon: ensureCCW(zone.polygon) });
      return;
    }

    if (zone.kind === 'stage') {
      const stageBase = new THREE.Mesh(
        createExtrudedPolygonGeo(zone.polygon, 1.4, 0),
        sandstoneMat,
      );
      stageBase.castShadow = true;
      stageBase.receiveShadow = true;
      const canopy = new THREE.Mesh(
        createExtrudedPolygonGeo(offsetPolygon2D(zone.polygon, -1.5), 0.45, 5.2),
        charcoalSteelMat,
      );
      canopy.castShadow = true;
      worldGroup.add(stageBase, canopy);
      return;
    }

    if (zone.kind === 'amphitheatre') {
      for (let tier = 0; tier < 4; tier++) {
        const inset = -tier * 2.1;
        const ring = offsetPolygon2D(zone.polygon, inset);
        const step = new THREE.Mesh(
          createExtrudedPolygonGeo(ring, 0.65, tier * 0.65),
          tier % 2 === 0 ? sandstoneMat : crimsonBrickMat,
        );
        step.receiveShadow = true;
        step.castShadow = true;
        worldGroup.add(step);
      }
      return;
    }

    if (zone.kind === 'parking') {
      const pad = new THREE.Mesh(createGroundPolygonGeo(zone.polygon, 0.028, 0.05), parkingMat);
      pad.receiveShadow = true;
      worldGroup.add(pad);
      return;
    }

    if (zone.kind === 'basketball') {
      const pad = new THREE.Mesh(
        createGroundPolygonGeo(zone.polygon, 0.032, 0.04),
        parkingMat,
      );
      const courtPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(34, 19),
        new THREE.MeshStandardMaterial({ map: textures.basketballCourt, roughness: 0.72 }),
      );
      courtPlane.rotation.x = -Math.PI / 2;
      courtPlane.position.set(zone.cx, 0.055, zone.cz);
      const courtNorth = new THREE.Mesh(
        new THREE.PlaneGeometry(34, 19),
        new THREE.MeshStandardMaterial({ map: textures.basketballCourt, roughness: 0.72 }),
      );
      courtNorth.rotation.x = -Math.PI / 2;
      courtNorth.position.set(zone.cx, 0.055, zone.cz - 11);
      courtPlane.position.set(zone.cx, 0.055, zone.cz + 11);
      worldGroup.add(pad, courtPlane, courtNorth);
      return;
    }

    if (zone.kind === 'tennis') {
      const court = new THREE.Mesh(
        createGroundPolygonGeo(zone.polygon, 0.042, 0.05),
        tennisCourtMat,
      );
      court.receiveShadow = true;
      const net = new THREE.Mesh(new THREE.BoxGeometry(14, 1.0, 0.15), whiteRoofMat);
      net.position.set(zone.cx, 0.55, zone.cz);
      worldGroup.add(court, net);
      return;
    }

    if (zone.kind === 'volleyball') {
      const court = new THREE.Mesh(
        createGroundPolygonGeo(zone.polygon, 0.042, 0.05),
        volleyballCourtMat,
      );
      const net = new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, 0.12), whiteRoofMat);
      net.position.set(zone.cx, 1.15, zone.cz);
      worldGroup.add(court, net);
      return;
    }

    if (zone.kind === 'soccer') {
      const turf = new THREE.Mesh(
        createGroundPolygonGeo(zone.polygon, 0.032, 0.05),
        sportsTurfMat,
      );
      turf.receiveShadow = true;
      const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide });
      const centerCircle = new THREE.Mesh(new THREE.RingGeometry(7.2, 7.6, 36), lineMat);
      centerCircle.rotation.x = -Math.PI / 2;
      centerCircle.position.set(zone.cx, 0.05, zone.cz);
      const midLine = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 50), lineMat);
      midLine.rotation.x = -Math.PI / 2;
      midLine.position.set(zone.cx, 0.05, zone.cz);
      worldGroup.add(turf, centerCircle, midLine);
      return;
    }

    if (zone.id === 'zone-408496854') {
      // Omega Zone / Play Ground Cricket Oval
      const lawn = new THREE.Mesh(
        createGroundPolygonGeo(zone.polygon, 0.025, 0.04),
        parkLawnMat,
      );
      lawn.receiveShadow = true;
      const cx = 63;
      const cz = 42;
      const trackRing = new THREE.Mesh(new THREE.CylinderGeometry(48, 48, 0.14, 48), sandstoneMat);
      trackRing.scale.set(1.0, 1, 0.94);
      trackRing.position.set(cx, 0.07, cz);
      trackRing.receiveShadow = true;

      const ovalTurf = new THREE.Mesh(new THREE.CylinderGeometry(43.5, 43.5, 0.18, 48), sportsTurfMat);
      ovalTurf.scale.set(1.0, 1, 0.94);
      ovalTurf.position.set(cx, 0.09, cz);
      ovalTurf.receiveShadow = true;

      const pitch = new THREE.Mesh(
        new THREE.BoxGeometry(4, 0.22, 22),
        new THREE.MeshStandardMaterial({ color: 0xc2a378, roughness: 0.92 }),
      );
      pitch.position.set(cx, 0.11, cz);

      const boundary = new THREE.Mesh(
        new THREE.RingGeometry(41, 41.7, 56),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide }),
      );
      boundary.rotation.x = -Math.PI / 2;
      boundary.scale.set(1.0, 0.94, 1);
      boundary.position.set(cx, 0.21, cz);

      worldGroup.add(lawn, trackRing, ovalTurf, pitch, boundary);

      // 4 Floodlight Towers around Play Ground
      [
        [cx - 42, cz - 36],
        [cx + 42, cz - 36],
        [cx - 42, cz + 36],
        [cx + 42, cz + 36],
      ].forEach(([fx, fz]) => {
        const mast = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.44, 21, 8),
          charcoalSteelMat,
        );
        mast.position.set(fx, 10.5, fz);
        mast.castShadow = true;
        const head = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.5, 0.65), lampBulbMaterial);
        head.position.set(fx, 21.2, fz);
        head.lookAt(cx, 0, cz);
        worldGroup.add(mast, head);
      });
      return;
    }

    if (zone.kind === 'park' || zone.kind === 'grass' || zone.kind === 'forest') {
      const patch = new THREE.Mesh(
        createGroundPolygonGeo(zone.polygon, 0.024, 0.05),
        parkLawnMat,
      );
      patch.receiveShadow = true;
      worldGroup.add(patch);
    }
  });

  // Alpha Fountain at surveyed node (-29.29, -171.3)
  const fountainNode = OSM_NODES.find((n) => n.kind === 'fountain');
  if (fountainNode) {
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.8, 0.85, 24), sandstoneMat);
    basin.position.set(fountainNode.x, 0.42, fountainNode.z);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.92, 24), waterMat);
    water.position.set(fountainNode.x, 0.46, fountainNode.z);
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.9, 4.2, 12), brushedAlumMat);
    spire.position.set(fountainNode.x, 2.3, fountainNode.z);
    spire.castShadow = true;
    worldGroup.add(basin, water, spire);
    colliders.push({
      minX: fountainNode.x - 5.8,
      maxX: fountainNode.x + 5.8,
      minZ: fountainNode.z - 5.8,
      maxZ: fountainNode.z + 5.8,
      polygon: [
        [fountainNode.x - 5.5, fountainNode.z - 5.5],
        [fountainNode.x + 5.5, fountainNode.z - 5.5],
        [fountainNode.x + 5.5, fountainNode.z + 5.5],
        [fountainNode.x - 5.5, fountainNode.z + 5.5],
      ],
    });
  }

  // Central Saraswati Quad Spire near Chitkara University Pin
  const quadBase = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.4, 0.65, 24), sandstoneMat);
  quadBase.position.set(-14.89, 0.32, -79.69);
  const quadSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.85, 5.5, 8), charcoalSteelMat);
  quadSpire.position.set(-14.89, 3.1, -79.69);
  quadSpire.castShadow = true;
  const quadRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.14, 10, 24), brushedAlumMat);
  quadRing.position.set(-14.89, 6.2, -79.69);
  worldGroup.add(quadBase, quadSpire, quadRing);

  const addSignBoard = (
    parent: THREE.Object3D,
    title: string,
    subtitle: string,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    w = 9,
    h = 2.4,
  ) => {
    const tex = textures.createSignTexture(title, subtitle);
    const boardGroup = new THREE.Group();
    boardGroup.position.set(x, y, z);
    boardGroup.rotation.y = rotY;

    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.35),
      charcoalSteelMat,
    );
    boardGroup.add(backing);

    const faceMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.45,
      metalness: 0.1,
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
    face.position.z = 0.19;
    const faceBack = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
    faceBack.position.z = -0.19;
    faceBack.rotation.y = Math.PI;
    boardGroup.add(face, faceBack);

    parent.add(boardGroup);
  };

  /** Attach an initially-hidden real-photo architectural frame on a landmark's entrance */
  const createFacadePhotoFrame = (
    landmarkId: string,
    fx: number,
    fy: number,
    fz: number,
    rotY: number,
    w = 9.2,
    h = 5.4,
  ) => {
    const frame = new THREE.Group();
    frame.position.set(fx, fy, fz);
    frame.rotation.y = rotY;
    frame.visible = false;

    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.32, fy + h / 2, 0.32), charcoalSteelMat);
    postL.position.set(-w / 2 - 0.15, -(fy - h / 2) / 2, 0);
    const postR = new THREE.Mesh(new THREE.BoxGeometry(0.32, fy + h / 2, 0.32), charcoalSteelMat);
    postR.position.set(w / 2 + 0.15, -(fy - h / 2) / 2, 0);
    const backing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.28), charcoalSteelMat);

    const photoMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.4,
      metalness: 0.05,
    });
    const photoPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoMat);
    photoPlane.position.z = 0.16;
    const photoBack = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoMat);
    photoBack.position.z = -0.16;
    photoBack.rotation.y = Math.PI;

    frame.add(postL, postR, backing, photoPlane, photoBack);
    worldGroup.add(frame);
    facadeSlots.set(landmarkId, { mesh: photoPlane, material: photoMat, frame });
  };

  const registerLandmarkInteraction = (
    lm: CampusLandmark,
    proxyGroup: THREE.Object3D,
    markerY: number,
  ) => {
    let proxy: THREE.Mesh;
    if (lm.polygon && lm.polygon.length >= 3) {
      proxy = new THREE.Mesh(
        createExtrudedPolygonGeo(lm.polygon, Math.max(8, lm.height), 0),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
    } else {
      proxy = new THREE.Mesh(
        new THREE.BoxGeometry(lm.width, Math.max(8, lm.height), lm.depth),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.position.set(lm.x, Math.max(8, lm.height) / 2, lm.z);
    }
    proxy.layers.enable(1);
    proxy.userData.landmarkId = lm.id;
    proxyGroup.add(proxy);
    clickableMeshes.push(proxy);

    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.65,
    });
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 0), markerMat);
    marker.position.set(lm.x, markerY, lm.z);
    marker.layers.enable(1);
    marker.userData.landmarkId = lm.id;
    proxyGroup.add(marker);
    landmarkMarkers.set(lm.id, marker);
    clickableMeshes.push(marker);
  };

  // Map landmark entries by osmId for instant lookup when extruding OSM buildings
  const landmarkByOsmId = new Map<string, CampusLandmark>();
  CAMPUS_LANDMARKS.forEach((lm) => {
    if (lm.osmId) landmarkByOsmId.set(lm.osmId, lm);
  });

  // 4. Extrude EVERY Surveyed OSM Building + Supplemental Campus Building using its Exact Polygon!
  const buildingStyleFor = (b: OsmBuildingPolygon, lm?: CampusLandmark) => {
    if (lm) return lm.style;
    if (b.buildingType === 'hostel') return 'hostel';
    if (b.buildingType === 'auditorium') return 'auditorium';
    if (b.buildingType === 'foodcourt') return 'foodcourt';
    return 'academic-sandstone';
  };

  ALL_CAMPUS_BUILDINGS.forEach((b) => {
    if (b.polygon.length < 3) return;
    const lm = landmarkByOsmId.get(b.id);
    const style = buildingStyleFor(b, lm);
    const levels = b.levels ?? (style === 'hostel' ? 6 : style === 'auditorium' ? 3 : 3);
    const totalH = lm?.height ?? Math.max(8, levels * 3.8);

    const wallMat =
      style === 'academic-crimson'
        ? crimsonBrickMat
        : style === 'auditorium' || style === 'hostel'
          ? sandstoneMat
          : sandstoneMat;
    const roofMat =
      style === 'hostel' || style === 'foodcourt' || style === 'academic-crimson'
        ? style === 'hostel'
          ? hostelRoofMat
          : darkConcreteMat
        : whiteRoofMat;

    const bg = new THREE.Group();

    // Part 1: Architectural concrete plinth
    const plinth = new THREE.Mesh(
      createExtrudedPolygonGeo(offsetPolygon2D(b.polygon, 0.45), 0.75, 0),
      darkConcreteMat,
    );
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    bg.add(plinth);

    // Part 2: Main extruded building volume from exact polygon vertices
    const body = new THREE.Mesh(
      createExtrudedPolygonGeo(b.polygon, totalH - 1.2, 0.75),
      wallMat,
    );
    body.castShadow = true;
    body.receiveShadow = true;
    bg.add(body);

    // Part 3: Recessed/proud window curtain bands per floor along exact concave/convex perimeter
    const glassOutset = offsetPolygon2D(b.polygon, 0.14);
    const floorBands = Math.min(7, Math.max(1, Math.round((totalH - 2.5) / 3.8)));
    for (let f = 0; f < floorBands; f++) {
      const bandY = 1.9 + f * 3.6;
      if (bandY + 1.9 > totalH - 0.8) break;
      const bandMesh = new THREE.Mesh(
        createExtrudedPolygonGeo(glassOutset, 1.85, bandY),
        windowMaterial,
      );
      bg.add(bandMesh);
    }

    // Part 4: Roof coping / parapet cornice
    const parapet = new THREE.Mesh(
      createExtrudedPolygonGeo(offsetPolygon2D(b.polygon, 0.32), 0.7, totalH - 0.5),
      roofMat,
    );
    parapet.castShadow = true;
    parapet.receiveShadow = true;
    bg.add(parapet);

    // Part 5: Foodcourt colorful patio umbrellas for Square One & Square Two
    if (style === 'foodcourt') {
      const umbrellaColors = [0xea580c, 0xdc2626, 0xeab308, 0x0284c7];
      const patioZ = b.cz + b.depth / 2 + 3.2;
      for (let i = 0; i < 4; i++) {
        const ux = b.cx - 9 + i * 6;
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 2.8, 8),
          charcoalSteelMat,
        );
        pole.position.set(ux, 1.4, patioZ);
        const canopy = new THREE.Mesh(
          new THREE.ConeGeometry(2.0, 0.9, 8),
          new THREE.MeshStandardMaterial({ color: umbrellaColors[i], roughness: 0.7 }),
        );
        canopy.position.set(ux, 2.9, patioZ);
        bg.add(pole, canopy);
      }
    }

    worldGroup.add(bg);

    // Exact Polygon Collider (keeps inner courtyards of Edison, Newton, Galileo, Flemming, Vasco walkable!)
    const bbox = getBBox(b.polygon);
    colliders.push({
      ...bbox,
      polygon: ensureCCW(b.polygon),
      landmarkId: lm?.id,
    });

    // Signboard & Interactive Beacon for every named Landmark building
    if (lm) {
      const signX = lm.entranceX ?? b.cx;
      const signZ = lm.entranceZ ?? bbox.maxZ + 2.5;
      const dx = signX - b.cx;
      const dz = signZ - b.cz;
      const rotY = Math.atan2(dx, dz);

      addSignBoard(
        worldGroup,
        lm.shortLabel.toUpperCase(),
        lm.zone.toUpperCase(),
        signX,
        totalH > 10 ? 5.6 : 4.6,
        signZ,
        rotY,
        9.2,
        2.1,
      );
      createFacadePhotoFrame(lm.id, signX, 3.1, signZ, rotY, 8.8, 5.0);
      registerLandmarkInteraction(lm, worldGroup, totalH + 4.0);
    }
  });

  // 5. Special Landmark Structures (NH-7 Main Gate Arch + Alpha Zone + Football Ground + Play Ground Beacons)
  CAMPUS_LANDMARKS.forEach((lm) => {
    if (lm.osmId && landmarkByOsmId.has(lm.osmId) && ALL_CAMPUS_BUILDINGS.some((b) => b.id === lm.osmId)) {
      return; // Already built & registered above
    }

    if (lm.style === 'gate') {
      const g = new THREE.Group();
      g.position.set(lm.x, 0, lm.z);
      if (lm.rotationY) g.rotation.y = lm.rotationY;

      const leftPier = new THREE.Mesh(new THREE.BoxGeometry(4.2, 9.5, 4.2), crimsonBrickMat);
      leftPier.position.set(-9.5, 4.75, 0);
      leftPier.castShadow = true;

      const rightPier = new THREE.Mesh(new THREE.BoxGeometry(4.2, 9.5, 4.2), crimsonBrickMat);
      rightPier.position.set(9.5, 4.75, 0);
      rightPier.castShadow = true;

      const archBeam = new THREE.Mesh(new THREE.BoxGeometry(25, 2.5, 4.6), sandstoneMat);
      archBeam.position.set(0, 9.8, 0);
      archBeam.castShadow = true;

      const topCrest = new THREE.Mesh(new THREE.BoxGeometry(16, 1.3, 3.0), charcoalSteelMat);
      topCrest.position.set(0, 11.6, 0);

      g.add(leftPier, rightPier, archBeam, topCrest);
      addSignBoard(g, 'CHITKARA UNIVERSITY', 'NH-7 MAIN CAMPUS GATE', 0, 9.8, 2.5, 0, 13, 2.1);
      worldGroup.add(g);

      createFacadePhotoFrame(
        lm.id,
        lm.entranceX ?? lm.x + 8,
        3.4,
        lm.entranceZ ?? lm.z + 9,
        lm.rotationY ?? 0,
        10.5,
        5.8,
      );
      registerLandmarkInteraction(lm, worldGroup, 15.5);
    } else {
      // Zone Landmarks (Alpha Zone, Football Ground 2, Play Ground / Omega Zone)
      const signX = lm.entranceX ?? lm.x;
      const signZ = lm.entranceZ ?? lm.z;
      addSignBoard(
        worldGroup,
        lm.shortLabel.toUpperCase(),
        lm.zone.toUpperCase(),
        signX,
        4.2,
        signZ,
        0,
        9.6,
        2.2,
      );
      createFacadePhotoFrame(lm.id, signX, 3.2, signZ + 2, 0, 8.8, 5.0);
      registerLandmarkInteraction(lm, worldGroup, 11.5);
    }
  });

  // Also add subtle entrance pillars at secondary surveyed campus gates
  OSM_NODES.filter((n) => n.kind === 'gate' && Math.hypot(n.x - -108.17, n.z - -298.69) > 10).forEach(
    (gate) => {
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.5, 1.4), crimsonBrickMat);
      p1.position.set(gate.x - 4, 2.25, gate.z);
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.5, 1.4), crimsonBrickMat);
      p2.position.set(gate.x + 4, 2.25, gate.z);
      p1.castShadow = true;
      p2.castShadow = true;
      worldGroup.add(p1, p2);
    },
  );

  // 6. InstancedMesh Tree Groves (filtered cleanly against building footprints & road corridors)
  const buildingPolys = ALL_CAMPUS_BUILDINGS.map((b) => ensureCCW(offsetPolygon2D(b.polygon, 3.2)));
  const candidateTrees: Array<[number, number]> = [];

  // Dense South-West Plantation (matches satellite map bottom-left forest)
  for (let tx = -138; tx <= -32; tx += 12) {
    for (let tz = 94; tz <= 290; tz += 13) {
      candidateTrees.push([tx + ((tz * 3) % 5) - 2, tz + ((tx * 7) % 5) - 2]);
    }
  }
  // Chitkara Woods & West Lawn
  for (let tx = -128; tx <= -92; tx += 11) {
    for (let tz = -112; tz <= -86; tz += 11) {
      candidateTrees.push([tx, tz]);
    }
  }
  // East Forest Strip between Play Ground & Pie Hostel
  for (let tx = 132; tx <= 154; tx += 10) {
    for (let tz = -14; tz <= 96; tz += 12) {
      candidateTrees.push([tx, tz]);
    }
  }
  // Alpha Zone perimeter groves & West Lakefront trees
  for (let tx = -122; tx <= -24; tx += 16) {
    candidateTrees.push([tx, -166], [tx, -252]);
  }
  for (let tx = -385; tx <= -290; tx += 16) {
    candidateTrees.push([tx, 18], [tx, -34]);
  }
  // North-East grove north of Play Ground
  for (let tx = 86; tx <= 190; tx += 16) {
    for (let tz = -195; tz <= -95; tz += 18) {
      candidateTrees.push([tx, tz]);
    }
  }

  const treePositions = candidateTrees.filter(
    ([tx, tz]) => !buildingPolys.some((poly) => pointInPolygon(tx, tz, poly)),
  );

  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.44, 3.2, 7);
  trunkGeo.translate(0, 1.6, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 });

  const lowerCanopyGeo = new THREE.ConeGeometry(2.7, 4.6, 8);
  lowerCanopyGeo.translate(0, 4.6, 0);
  const upperCanopyGeo = new THREE.ConeGeometry(1.9, 3.8, 8);
  upperCanopyGeo.translate(0, 7.0, 0);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x265c34, roughness: 0.86 });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treePositions.length);
  const lowerInst = new THREE.InstancedMesh(lowerCanopyGeo, foliageMat, treePositions.length);
  const upperInst = new THREE.InstancedMesh(upperCanopyGeo, foliageMat, treePositions.length);
  trunkInst.castShadow = true;
  lowerInst.castShadow = true;
  upperInst.castShadow = true;

  const dummy = new THREE.Object3D();
  const tintColor = new THREE.Color();
  treePositions.forEach(([tx, tz], idx) => {
    const scale = 0.85 + ((idx * 17) % 30) / 100;
    dummy.position.set(tx, 0, tz);
    dummy.rotation.y = (idx * 1.13) % (Math.PI * 2);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);
    lowerInst.setMatrixAt(idx, dummy.matrix);
    upperInst.setMatrixAt(idx, dummy.matrix);

    tintColor.setHSL(0.35 + ((idx % 5) - 2) * 0.015, 0.44, 0.25 + (idx % 3) * 0.04);
    lowerInst.setColorAt(idx, tintColor);
    upperInst.setColorAt(idx, tintColor.clone().offsetHSL(0, 0, 0.05));
  });
  trunkInst.instanceMatrix.needsUpdate = true;
  lowerInst.instanceMatrix.needsUpdate = true;
  upperInst.instanceMatrix.needsUpdate = true;
  if (lowerInst.instanceColor) lowerInst.instanceColor.needsUpdate = true;
  if (upperInst.instanceColor) upperInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  lowerInst.computeBoundingSphere();
  upperInst.computeBoundingSphere();
  worldGroup.add(trunkInst, lowerInst, upperInst);

  // 7. Streetlamps along Main Spine, East-West Boulevard & West Loop
  const lampPositions: Array<[number, number]> = [
    [-16, -155], [-6, -155], [-16, -108], [-6, -108], [-16, -65], [-6, -65],
    [-16, -18], [-6, -18], [-16, 36], [-6, 36], [-16, 108], [-6, 108],
    [-65, -75], [-110, -75], [-165, -75], [-235, -75], [-290, -82],
    [45, -22], [95, -22], [145, -22], [156, 30], [156, 85],
  ];
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 5.2, 8);
  poleGeo.translate(0, 2.6, 0);
  const lampHeadGeo = new THREE.SphereGeometry(0.36, 10, 10);
  lampHeadGeo.translate(0, 5.3, 0);

  const lampPoles = new THREE.InstancedMesh(poleGeo, charcoalSteelMat, lampPositions.length);
  const lampBulbs = new THREE.InstancedMesh(lampHeadGeo, lampBulbMaterial, lampPositions.length);
  lampPositions.forEach(([lx, lz], idx) => {
    dummy.position.set(lx, 0, lz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    lampPoles.setMatrixAt(idx, dummy.matrix);
    lampBulbs.setMatrixAt(idx, dummy.matrix);
  });
  lampPoles.instanceMatrix.needsUpdate = true;
  lampBulbs.instanceMatrix.needsUpdate = true;
  lampPoles.computeBoundingSphere();
  lampBulbs.computeBoundingSphere();
  worldGroup.add(lampPoles, lampBulbs);

  // 8. Collectible Crest Tokens across Real Campus Hubs
  const tokenRingGeo = new THREE.TorusGeometry(0.65, 0.14, 10, 24);
  const tokenCoreGeo = new THREE.OctahedronGeometry(0.42, 0);
  const tokenMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xb45309,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.85,
  });
  const tokenCoreMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0x7f1d1d,
    emissiveIntensity: 0.4,
    roughness: 0.25,
    metalness: 0.6,
  });

  CAMPUS_TOKENS.forEach((tok) => {
    const tg = new THREE.Group();
    tg.position.set(tok.x, 1.45, tok.z);
    const ring = new THREE.Mesh(tokenRingGeo, tokenMat);
    const core = new THREE.Mesh(tokenCoreGeo, tokenCoreMat);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshBasicMaterial({
        map: textures.contactShadow,
        transparent: true,
        depthWrite: false,
        opacity: 0.45,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.41;
    tg.add(ring, core, shadow);
    worldGroup.add(tg);

    tokens.push({
      id: tok.id,
      label: tok.label,
      x: tok.x,
      z: tok.z,
      group: tg,
      collected: false,
    });
  });

  // 9. Dynamic User Facade Photo Binding
  const setBuildingFacadePhoto = (landmarkId: string, dataUrl: string | null) => {
    const slot = facadeSlots.get(landmarkId);
    if (!slot) return;
    if (!dataUrl) {
      slot.frame.visible = false;
      return;
    }
    new THREE.TextureLoader().load(dataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const prev = facadeCustomTextures.get(landmarkId);
      prev?.dispose();
      facadeCustomTextures.set(landmarkId, tex);
      slot.material.map = tex;
      slot.material.needsUpdate = true;
      slot.frame.visible = true;
    });
  };

  // 10. Dynamic Google Maps Place Beacons Group
  worldGroup.add(dynamicPlaceGroup);

  const syncDynamicGooglePlaces = (places: GmpPlaceRecord[]) => {
    while (dynamicPlaceGroup.children.length > 0) {
      const child = dynamicPlaceGroup.children[0];
      dynamicPlaceGroup.remove(child);
    }

    const kioskMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x0369a1,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.65,
    });

    places.forEach((p) => {
      if (p.worldX < -420 || p.worldX > 280 || p.worldZ < -335 || p.worldZ > 355) return;

      const nearExisting = CAMPUS_LANDMARKS.some(
        (lm) => Math.hypot(lm.x - p.worldX, lm.z - p.worldZ) < 16,
      );
      if (nearExisting) return;

      const pg = new THREE.Group();
      pg.position.set(p.worldX, 0, p.worldZ);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 0.5, 16), sandstoneMat);
      base.position.y = 0.25;

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.45, 5.2, 12),
        charcoalSteelMat,
      );
      pillar.position.y = 2.8;
      pillar.castShadow = true;

      const pin = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), kioskMat);
      pin.position.y = 6.6;
      pin.layers.enable(1);
      pin.userData.gmpPlaceId = p.placeId;

      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(4, 8, 4),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      proxy.position.y = 4;
      proxy.layers.enable(1);
      proxy.userData.gmpPlaceId = p.placeId;

      pg.add(base, pillar, pin, proxy);
      addSignBoard(pg, p.name.slice(0, 22), 'GOOGLE MAPS PLACE', 0, 4.4, 0.55, 0, 6.2, 1.6);
      dynamicPlaceGroup.add(pg);
      clickableMeshes.push(pin, proxy);
    });
  };

  const dispose = () => {
    facadeCustomTextures.forEach((t) => t.dispose());
    facadeCustomTextures.clear();
    worldGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material?.dispose();
        }
      }
    });
  };

  return {
    worldGroup,
    colliders,
    clickableMeshes,
    landmarkMarkers,
    facadeSlots,
    dynamicPlaceGroup,
    tokens,
    windowMaterial,
    lampBulbMaterial,
    mapOverlayMesh,
    mapOverlayMaterial,
    applyMapCalibration,
    setBuildingFacadePhoto,
    syncDynamicGooglePlaces,
    dispose,
  };
}
