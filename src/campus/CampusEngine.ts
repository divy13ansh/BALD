import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { campusAudio } from './audio';
import { buildCampusWorld, BuiltCampusWorld } from './campusBuilder';
import {
  CAMPUS_BOUNDS,
  CAMPUS_LANDMARKS,
  CameraMode,
  CampusLandmark,
  GmpPlaceRecord,
  MapCalibration,
  TimeOfDay,
  worldToGps,
} from './campusData';
import { createStudentAvatar, PlayerAvatarRig } from './playerAvatar';
import { createCampusTextures, CampusTextureSet } from './textures';

export interface CampusHudSnapshot {
  playerX: number;
  playerZ: number;
  headingRad: number;
  lat: number;
  lng: number;
  speedMps: number;
  nearbyLandmark: CampusLandmark | null;
  discoveredIds: string[];
  collectedTokenIds: string[];
  totalTokens: number;
  totalLandmarks: number;
  lastEventText: string | null;
}

export interface CampusEngineCallbacks {
  onHudUpdate: (snapshot: CampusHudSnapshot) => void;
  onSelectLandmark: (landmark: CampusLandmark) => void;
  onSelectGmpPlace: (placeId: string) => void;
  onContextLost: (lost: boolean) => void;
}

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _skyTarget = new THREE.Color();
const _sunColorTarget = new THREE.Color();
const _hemiSkyTarget = new THREE.Color();
const _hemiGroundTarget = new THREE.Color();

interface LightingPreset {
  skyHex: number;
  fogDensity: number;
  sunHex: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  rimIntensity: number;
  windowEmissive: number;
  lampEmissive: number;
}

const LIGHTING_PRESETS: Record<TimeOfDay, LightingPreset> = {
  morning: {
    skyHex: 0xb9daf2,
    fogDensity: 0.0011,
    sunHex: 0xfff5e4,
    sunIntensity: 2.1,
    sunPos: [140, 210, 120],
    hemiSkyHex: 0xaed9f7,
    hemiGroundHex: 0x4f6147,
    hemiIntensity: 0.85,
    rimIntensity: 0.45,
    windowEmissive: 0.0,
    lampEmissive: 0.15,
  },
  golden: {
    skyHex: 0xe6b892,
    fogDensity: 0.0015,
    sunHex: 0xffb366,
    sunIntensity: 2.2,
    sunPos: [-240, 75, 110],
    hemiSkyHex: 0xf7c59f,
    hemiGroundHex: 0x433b38,
    hemiIntensity: 0.72,
    rimIntensity: 0.55,
    windowEmissive: 0.35,
    lampEmissive: 0.85,
  },
  night: {
    skyHex: 0x0b1528,
    fogDensity: 0.0018,
    sunHex: 0x9bb8ff,
    sunIntensity: 0.75,
    sunPos: [-120, 155, -95],
    hemiSkyHex: 0x263b5e,
    hemiGroundHex: 0x111827,
    hemiIntensity: 0.62,
    rimIntensity: 0.35,
    windowEmissive: 1.4,
    lampEmissive: 2.2,
  },
};

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class CampusEngine {
  private container: HTMLElement;
  private callbacks: CampusEngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private droneControls: OrbitControls;

  private textures: CampusTextureSet;
  private campus: BuiltCampusWorld;
  private avatar: PlayerAvatarRig;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;

  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  private cameraMode: CameraMode = 'walk';
  private timeOfDay: TimeOfDay = 'morning';
  private keys: Record<string, boolean> = {};
  private virtualInput = { x: 0, y: 0 };

  // Start on central promenade between Turing, Edison & Chitkara Central Pin
  private playerPos = new THREE.Vector3(-10.8, 0, -102);
  private playerVelY = 0;
  private isGrounded = true;
  private playerYaw = 0;
  private currentSpeed = 0;
  private footstepTimer = 0;

  private orbitYaw = Math.PI;
  private orbitPitch = 0.34;
  private orbitDistance = 16.5;
  private isDraggingWalkCam = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private pointerDownPos = { x: 0, y: 0 };

  private cameraFlyTarget: THREE.Vector3 | null = null;
  private cameraFlyPos: THREE.Vector3 | null = null;

  private discoveredIds = new Set<string>(['turing-block', 'edison-block']);
  private collectedTokenIds = new Set<string>();
  private nearbyLandmark: CampusLandmark | null = null;
  private lastEventText: string | null = 'Full OSM & Satellite Campus Loaded';
  private hudEmitAccumulator = 0;

  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private customMapTexture: THREE.Texture | null = null;

  private bursts: Array<{
    points: THREE.Points;
    velocities: Float32Array;
    age: number;
  }> = [];

  constructor(container: HTMLElement, callbacks: CampusEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    const initPreset = LIGHTING_PRESETS.morning;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(initPreset.skyHex);
    this.fog = new THREE.FogExp2(initPreset.skyHex, initPreset.fogDensity);
    this.scene.fog = this.fog;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(56, width / height, 0.3, 1500);
    this.camera.position.set(-10.8, 9.5, -118);

    this.droneControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.droneControls.enableDamping = !this.isSoftwareGl;
    this.droneControls.dampingFactor = 0.06;
    this.droneControls.maxPolarAngle = Math.PI / 2 - 0.06;
    this.droneControls.minDistance = 24;
    this.droneControls.maxDistance = 580;
    this.droneControls.target.set(-60, 2, -20);
    this.droneControls.enabled = false;
    this.droneControls.addEventListener('start', () => {
      this.cameraFlyTarget = null;
      this.cameraFlyPos = null;
    });

    this.hemiLight = new THREE.HemisphereLight(
      initPreset.hemiSkyHex,
      initPreset.hemiGroundHex,
      initPreset.hemiIntensity,
    );
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(initPreset.sunHex, initPreset.sunIntensity);
    this.sunLight.position.set(
      initPreset.sunPos[0] - 60,
      initPreset.sunPos[1],
      initPreset.sunPos[2],
    );
    this.sunLight.target.position.set(-60, 0, 0);
    this.scene.add(this.sunLight.target);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 920;
    const d = 385;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0xc7d9ff, initPreset.rimIntensity);
    this.rimLight.position.set(-180, 95, -130);
    this.scene.add(this.rimLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createCampusTextures(maxAniso);
    this.campus = buildCampusWorld(this.textures);
    this.scene.add(this.campus.worldGroup);

    this.avatar = createStudentAvatar(this.textures.contactShadow);
    this.avatar.root.position.copy(this.playerPos);
    this.avatar.root.rotation.y = this.playerYaw;
    this.scene.add(this.avatar.root);

    this.raycaster.layers.set(1);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitHud(true);
    this.tick();
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = () => {
    this.callbacks.onContextLost(false);
  };

  private onResize = () => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (
      document.activeElement &&
      ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
    ) {
      return;
    }
    this.keys[e.code] = true;

    if (e.code === 'Space' && this.cameraMode === 'walk' && this.isGrounded) {
      this.playerVelY = 8.4;
      this.isGrounded = false;
      campusAudio.playJump();
    }

    if (e.code === 'KeyE' && this.nearbyLandmark) {
      this.callbacks.onSelectLandmark(this.nearbyLandmark);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    if (this.cameraMode === 'walk') {
      this.isDraggingWalkCam = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.cameraMode === 'walk' && this.isDraggingWalkCam) {
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      this.orbitYaw -= dx * 0.0055;
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.0045, 0.08, 1.15);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    this.isDraggingWalkCam = false;
    const movedDist = Math.hypot(
      e.clientX - this.pointerDownPos.x,
      e.clientY - this.pointerDownPos.y,
    );
    if (movedDist < 6 && e.target === this.renderer.domElement) {
      this.handleCanvasClick(e);
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (this.cameraMode === 'walk') {
      this.orbitDistance = THREE.MathUtils.clamp(
        this.orbitDistance + e.deltaY * 0.014,
        6.5,
        40,
      );
    }
  };

  private handleCanvasClick(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObjects(this.campus.clickableMeshes, false);
    if (hits.length > 0) {
      const landmarkId = hits[0].object.userData.landmarkId as string | undefined;
      if (landmarkId) {
        const lm = CAMPUS_LANDMARKS.find((item) => item.id === landmarkId);
        if (lm) {
          this.callbacks.onSelectLandmark(lm);
          return;
        }
      }
      const gmpPlaceId = hits[0].object.userData.gmpPlaceId as string | undefined;
      if (gmpPlaceId) {
        this.callbacks.onSelectGmpPlace(gmpPlaceId);
      }
    }
  }

  public syncGooglePlaces(places: GmpPlaceRecord[]) {
    this.campus.syncDynamicGooglePlaces(places);
    if (places.length > 0) {
      this.lastEventText = `Synced ${places.length} live Google Maps places`;
      this.emitHud(true);
    }
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    if (mode === 'drone') {
      this.droneControls.enabled = true;
      this.cameraFlyTarget = new THREE.Vector3(this.playerPos.x, 2, this.playerPos.z);
      this.cameraFlyPos = new THREE.Vector3(
        this.playerPos.x + 65,
        105,
        this.playerPos.z + 95,
      );
    } else {
      this.droneControls.enabled = false;
      this.cameraFlyTarget = null;
      this.cameraFlyPos = null;
    }
  }

  public setTimeOfDay(preset: TimeOfDay) {
    this.timeOfDay = preset;
  }

  public setVirtualInput(x: number, y: number) {
    this.virtualInput.x = x;
    this.virtualInput.y = y;
  }

  public teleportToCoordinates(x: number, z: number, label?: string) {
    this.playerPos.set(
      THREE.MathUtils.clamp(x, CAMPUS_BOUNDS.minX, CAMPUS_BOUNDS.maxX),
      0,
      THREE.MathUtils.clamp(z + 8, CAMPUS_BOUNDS.minZ, CAMPUS_BOUNDS.maxZ),
    );
    this.playerVelY = 0;
    this.isGrounded = true;
    this.playerYaw = Math.PI;
    this.orbitYaw = Math.PI;
    this.avatar.root.position.copy(this.playerPos);
    this.avatar.root.rotation.y = this.playerYaw;
    if (label) {
      this.lastEventText = `Arrived at ${label}`;
    }
    if (this.cameraMode === 'drone') {
      this.cameraFlyTarget = new THREE.Vector3(x, 3, z);
      this.cameraFlyPos = new THREE.Vector3(x + 42, 56, z + 58);
    }
    this.emitHud(true);
  }

  public teleportToLandmark(landmarkId: string) {
    const lm = CAMPUS_LANDMARKS.find((item) => item.id === landmarkId);
    if (!lm) return;

    const targetX = lm.entranceX ?? lm.x;
    const targetZ =
      lm.entranceZ ?? (lm.style === 'sports' || lm.style === 'park' ? lm.z : lm.z + lm.depth / 2 + 8);
    const [safeX, safeZ] = this.resolveCollisions(targetX, targetZ);

    this.playerPos.set(safeX, 0, safeZ);
    this.playerVelY = 0;
    this.isGrounded = true;
    const lookYaw = Math.atan2(lm.x - safeX, lm.z - safeZ);
    this.playerYaw = lookYaw;
    this.orbitYaw = lookYaw + Math.PI;
    this.avatar.root.position.copy(this.playerPos);
    this.avatar.root.rotation.y = this.playerYaw;

    if (!this.discoveredIds.has(lm.id)) {
      this.discoveredIds.add(lm.id);
      campusAudio.playLandmarkDiscovered();
    }
    this.nearbyLandmark = lm;
    this.lastEventText = `Arrived at ${lm.shortLabel}`;

    if (this.cameraMode === 'drone') {
      this.cameraFlyTarget = new THREE.Vector3(lm.x, 3, lm.z);
      this.cameraFlyPos = new THREE.Vector3(lm.x + 56, 78, lm.z + 78);
    }
    this.emitHud(true);
  }

  public setMapCalibration(cal: MapCalibration) {
    this.campus.applyMapCalibration(cal);
  }

  public setBuildingFacadePhoto(landmarkId: string, dataUrl: string | null) {
    this.campus.setBuildingFacadePhoto(landmarkId, dataUrl);
  }

  public setCustomMapOverlay(dataUrl: string | null, opacity = 0.78) {
    if (!dataUrl) {
      this.campus.mapOverlayMaterial.visible = false;
      this.campus.mapOverlayMaterial.opacity = 0;
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.load(dataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this.customMapTexture?.dispose();
      this.customMapTexture = tex;
      this.campus.mapOverlayMaterial.map = tex;
      this.campus.mapOverlayMaterial.opacity = opacity;
      this.campus.mapOverlayMaterial.visible = true;
      this.campus.mapOverlayMaterial.needsUpdate = true;
    });
  }

  public setCustomMapOpacity(opacity: number) {
    this.campus.mapOverlayMaterial.opacity = opacity;
    this.campus.mapOverlayMaterial.visible = opacity > 0.02 && !!this.campus.mapOverlayMaterial.map;
  }

  public resetDefaultSatelliteMap(opacity = 0.78) {
    this.setCustomMapOverlay('/assets/aistudio/image_f7d534df.png', opacity);
  }

  private resolveCollisions(nextX: number, nextZ: number): [number, number] {
    let x = THREE.MathUtils.clamp(nextX, CAMPUS_BOUNDS.minX, CAMPUS_BOUNDS.maxX);
    let z = THREE.MathUtils.clamp(nextZ, CAMPUS_BOUNDS.minZ, CAMPUS_BOUNDS.maxZ);
    const radius = 0.75;

    for (let i = 0; i < this.campus.colliders.length; i++) {
      const c = this.campus.colliders[i];
      // Fast broadphase AABB reject
      if (
        x < c.minX - radius ||
        x > c.maxX + radius ||
        z < c.minZ - radius ||
        z > c.maxZ + radius
      ) {
        continue;
      }

      const ring = c.polygon;
      const n = ring.length;
      if (n < 3) continue;

      // Exact closest point on polygon boundary segments
      let bestDistSq = Infinity;
      let bestCx = x;
      let bestCz = z;
      let inside = false;

      for (let e = 0, prev = n - 1; e < n; prev = e++) {
        const [ax, az] = ring[prev];
        const [bx, bz] = ring[e];

        // Ray-cast point-in-polygon check
        if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az + 1e-9) + ax) {
          inside = !inside;
        }

        const abx = bx - ax;
        const abz = bz - az;
        const abLenSq = abx * abx + abz * abz;
        const t = abLenSq > 1e-6 ? THREE.MathUtils.clamp(((x - ax) * abx + (z - az) * abz) / abLenSq, 0, 1) : 0;
        const cx = ax + abx * t;
        const cz = az + abz * t;
        const distSq = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestCx = cx;
          bestCz = cz;
        }
      }

      if (inside || bestDistSq < radius * radius) {
        const dist = Math.sqrt(bestDistSq);
        if (dist > 0.0001) {
          const dirX = (x - bestCx) / dist;
          const dirZ = (z - bestCz) / dist;
          if (inside) {
            // Push strictly outside nearest edge
            x = bestCx - dirX * radius;
            z = bestCz - dirZ * radius;
          } else {
            x = bestCx + dirX * radius;
            z = bestCz + dirZ * radius;
          }
        } else {
          x += radius;
        }
      }
    }
    return [x, z];
  }

  private spawnTokenBurst(x: number, y: number, z: number) {
    const count = 18;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const angle = (i / count) * Math.PI * 2;
      const spd = 2.5 + Math.random() * 3.5;
      velocities[i * 3] = Math.cos(angle) * spd;
      velocities[i * 3 + 1] = 2.5 + Math.random() * 4.0;
      velocities[i * 3 + 2] = Math.sin(angle) * spd;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.45,
      transparent: true,
      opacity: 1,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ points, velocities, age: 0 });
  }

  private updateLighting(delta: number) {
    const preset = LIGHTING_PRESETS[this.timeOfDay];
    const k = 3.2;

    _skyTarget.setHex(preset.skyHex);
    (this.scene.background as THREE.Color).lerp(_skyTarget, 1 - Math.exp(-k * delta));
    this.fog.color.copy(this.scene.background as THREE.Color);
    this.fog.density = THREE.MathUtils.damp(this.fog.density, preset.fogDensity, k, delta);

    _sunColorTarget.setHex(preset.sunHex);
    this.sunLight.color.lerp(_sunColorTarget, 1 - Math.exp(-k * delta));
    this.sunLight.intensity = THREE.MathUtils.damp(
      this.sunLight.intensity,
      preset.sunIntensity,
      k,
      delta,
    );
    this.sunLight.position.x = THREE.MathUtils.damp(
      this.sunLight.position.x,
      preset.sunPos[0] - 60,
      k,
      delta,
    );
    this.sunLight.position.y = THREE.MathUtils.damp(this.sunLight.position.y, preset.sunPos[1], k, delta);
    this.sunLight.position.z = THREE.MathUtils.damp(this.sunLight.position.z, preset.sunPos[2], k, delta);

    _hemiSkyTarget.setHex(preset.hemiSkyHex);
    _hemiGroundTarget.setHex(preset.hemiGroundHex);
    this.hemiLight.color.lerp(_hemiSkyTarget, 1 - Math.exp(-k * delta));
    this.hemiLight.groundColor.lerp(_hemiGroundTarget, 1 - Math.exp(-k * delta));
    this.hemiLight.intensity = THREE.MathUtils.damp(
      this.hemiLight.intensity,
      preset.hemiIntensity,
      k,
      delta,
    );
    this.rimLight.intensity = THREE.MathUtils.damp(
      this.rimLight.intensity,
      preset.rimIntensity,
      k,
      delta,
    );

    this.campus.windowMaterial.emissiveIntensity = THREE.MathUtils.damp(
      this.campus.windowMaterial.emissiveIntensity,
      preset.windowEmissive,
      k,
      delta,
    );
    this.campus.lampBulbMaterial.emissiveIntensity = THREE.MathUtils.damp(
      this.campus.lampBulbMaterial.emissiveIntensity,
      preset.lampEmissive,
      k,
      delta,
    );
  }

  private updatePlayerAndCamera(delta: number, elapsed: number) {
    let inputForward =
      (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) -
      (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    let inputRight =
      (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) -
      (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);

    if (Math.abs(this.virtualInput.x) > 0.05 || Math.abs(this.virtualInput.y) > 0.05) {
      inputRight += this.virtualInput.x;
      inputForward += this.virtualInput.y;
    }

    const sprinting = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const maxSpeed = sprinting ? 24 : 13.5;

    if (this.cameraMode === 'walk' && (inputForward !== 0 || inputRight !== 0)) {
      _forward.set(-Math.sin(this.orbitYaw), 0, -Math.cos(this.orbitYaw)).normalize();
      _right.set(Math.cos(this.orbitYaw), 0, -Math.sin(this.orbitYaw)).normalize();
      _moveDir
        .set(0, 0, 0)
        .addScaledVector(_forward, inputForward)
        .addScaledVector(_right, inputRight);

      if (_moveDir.lengthSq() > 0.001) {
        _moveDir.normalize();
        this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, maxSpeed, 12, delta);
        const nextX = this.playerPos.x + _moveDir.x * this.currentSpeed * delta;
        const nextZ = this.playerPos.z + _moveDir.z * this.currentSpeed * delta;
        const [resolvedX, resolvedZ] = this.resolveCollisions(nextX, nextZ);
        this.playerPos.x = resolvedX;
        this.playerPos.z = resolvedZ;

        const targetYaw = Math.atan2(_moveDir.x, _moveDir.z);
        let diff = targetYaw - this.playerYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.playerYaw += diff * (1 - Math.exp(-14 * delta));
      }
    } else {
      this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, 0, 14, delta);
    }

    if (!this.isGrounded) {
      this.playerVelY -= 22 * delta;
      this.playerPos.y += this.playerVelY * delta;
      if (this.playerPos.y <= 0) {
        this.playerPos.y = 0;
        this.playerVelY = 0;
        this.isGrounded = true;
      }
    }

    this.avatar.root.position.copy(this.playerPos);
    this.avatar.root.rotation.y = this.playerYaw;
    const speedRatio = THREE.MathUtils.clamp(this.currentSpeed / 13.5, 0, 1.5);
    this.avatar.updateAnimation(speedRatio, this.isGrounded, elapsed, delta);

    if (this.isGrounded && this.currentSpeed > 2.5) {
      this.footstepTimer -= delta * (sprinting ? 1.5 : 1.0);
      if (this.footstepTimer <= 0) {
        campusAudio.playFootstep();
        this.footstepTimer = 0.36;
      }
    }

    if (this.cameraMode === 'walk') {
      const horizDist = this.orbitDistance * Math.cos(this.orbitPitch);
      const vertDist = this.orbitDistance * Math.sin(this.orbitPitch) + 2.2;

      _camTarget.set(this.playerPos.x, this.playerPos.y + 2.0, this.playerPos.z);
      _desiredCamPos.set(
        this.playerPos.x + Math.sin(this.orbitYaw) * horizDist,
        this.playerPos.y + vertDist,
        this.playerPos.z + Math.cos(this.orbitYaw) * horizDist,
      );

      this.camera.position.lerp(_desiredCamPos, 1 - Math.exp(-10 * delta));
      this.camera.lookAt(_camTarget);
    } else {
      if (this.cameraFlyTarget && this.cameraFlyPos) {
        this.droneControls.target.lerp(this.cameraFlyTarget, 1 - Math.exp(-5 * delta));
        this.camera.position.lerp(this.cameraFlyPos, 1 - Math.exp(-5 * delta));
        if (
          this.camera.position.distanceTo(this.cameraFlyPos) < 0.8 &&
          this.droneControls.target.distanceTo(this.cameraFlyTarget) < 0.8
        ) {
          this.cameraFlyTarget = null;
          this.cameraFlyPos = null;
        }
      }
      this.droneControls.update();
    }
  }

  private updateWorldAndQuest(delta: number, elapsed: number) {
    this.campus.landmarkMarkers.forEach((marker, id) => {
      marker.rotation.y += delta * 1.4;
      const discovered = this.discoveredIds.has(id);
      const mat = marker.material as THREE.MeshStandardMaterial;
      mat.color.setHex(discovered ? 0x10b981 : 0xef4444);
      mat.emissive.setHex(discovered ? 0x065f46 : 0x991b1b);
      marker.position.y += Math.sin(elapsed * 2.2) * delta * 0.35;
    });

    for (let i = 0; i < this.campus.tokens.length; i++) {
      const tok = this.campus.tokens[i];
      if (tok.collected) continue;

      tok.group.rotation.y += delta * 2.4;
      tok.group.position.y = 1.45 + Math.sin(elapsed * 2.8 + i) * 0.25;

      const dist = Math.hypot(this.playerPos.x - tok.x, this.playerPos.z - tok.z);
      if (dist < 2.8) {
        tok.collected = true;
        tok.group.visible = false;
        this.collectedTokenIds.add(tok.id);
        this.lastEventText = `Collected Crest: ${tok.label}`;
        this.spawnTokenBurst(tok.x, 1.5, tok.z);
        campusAudio.playTokenPickup();
        this.emitHud(true);
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += delta;
      const posAttr = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let p = 0; p < posAttr.count; p++) {
        b.velocities[p * 3 + 1] -= 9.8 * delta;
        posAttr.setXYZ(
          p,
          posAttr.getX(p) + b.velocities[p * 3] * delta,
          posAttr.getY(p) + b.velocities[p * 3 + 1] * delta,
          posAttr.getZ(p) + b.velocities[p * 3 + 2] * delta,
        );
      }
      posAttr.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.age / 0.75);
      if (b.age >= 0.75) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }

    let closest: CampusLandmark | null = null;
    let closestDist = Infinity;
    for (let i = 0; i < CAMPUS_LANDMARKS.length; i++) {
      const lm = CAMPUS_LANDMARKS[i];
      const hw = lm.width * 0.5 + 11;
      const hd = lm.depth * 0.5 + 11;
      const dx = Math.max(0, Math.abs(this.playerPos.x - lm.x) - lm.width * 0.5);
      const dz = Math.max(0, Math.abs(this.playerPos.z - lm.z) - lm.depth * 0.5);
      const edgeDist = Math.hypot(dx, dz);
      const inBox =
        Math.abs(this.playerPos.x - lm.x) <= hw && Math.abs(this.playerPos.z - lm.z) <= hd;
      if (inBox && edgeDist < closestDist) {
        closestDist = edgeDist;
        closest = lm;
      }
    }

    if (closest && !this.discoveredIds.has(closest.id)) {
      this.discoveredIds.add(closest.id);
      this.lastEventText = `Discovered ${closest.shortLabel}`;
      campusAudio.playLandmarkDiscovered();
      this.emitHud(true);
    }
    if (this.nearbyLandmark?.id !== closest?.id) {
      this.nearbyLandmark = closest;
      this.emitHud(true);
    }
  }

  private emitHud(force = false) {
    if (!force && this.hudEmitAccumulator < 0.1) return;
    this.hudEmitAccumulator = 0;
    const gps = worldToGps(this.playerPos.x, this.playerPos.z);
    this.callbacks.onHudUpdate({
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      headingRad: this.playerYaw,
      lat: gps.lat,
      lng: gps.lng,
      speedMps: this.currentSpeed,
      nearbyLandmark: this.nearbyLandmark,
      discoveredIds: Array.from(this.discoveredIds),
      collectedTokenIds: Array.from(this.collectedTokenIds),
      totalTokens: this.campus.tokens.length,
      totalLandmarks: CAMPUS_LANDMARKS.length,
      lastEventText: this.lastEventText,
    });
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick = () => {
    if (this.disposed) return;
    const rawDelta = this.clock.getDelta();
    const delta = Math.min(rawDelta, 0.1);
    const elapsed = this.clock.elapsedTime;

    this.updateLighting(delta);
    this.updatePlayerAndCamera(delta, elapsed);
    this.updateWorldAndQuest(delta, elapsed);

    this.hudEmitAccumulator += delta;
    this.emitHud(false);

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.droneControls.dispose();
    this.campus.dispose();
    this.textures.dispose();
    this.customMapTexture?.dispose();
    this.renderer.dispose();

    if (canvas.parentElement === this.container) {
      this.container.removeChild(canvas);
    }
  }
}
