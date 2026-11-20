import {
  OSM_BUILDINGS,
  OSM_NODES,
  OSM_ROADS,
  OSM_ZONES,
  OsmBuildingPolygon,
  OsmCampusZone,
  OsmRoadPolyline,
  SUPPLEMENTAL_BUILDINGS,
  SUPPLEMENTAL_ROADS,
  SUPPLEMENTAL_ZONES,
} from './osmCampusData';

export type BuildingStyle =
  | 'gate'
  | 'auditorium'
  | 'academic-crimson'
  | 'academic-sandstone'
  | 'foodcourt'
  | 'sports'
  | 'tuckshop'
  | 'hostel'
  | 'park';

export type TimeOfDay = 'morning' | 'golden' | 'night';
export type CameraMode = 'walk' | 'drone';

export interface PlacePhotoAsset {
  uri: string;
  attributions: Array<{ displayName: string; uri: string | null }>;
}

export interface GmpPlaceRecord {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  worldX: number;
  worldZ: number;
  primaryType?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  photos: PlacePhotoAsset[];
}

export interface MapCalibration {
  offsetX: number;
  offsetZ: number;
  baseWidth: number;
  baseHeight: number;
  scaleX: number;
  scaleZ: number;
  rotationDeg: number;
  opacity: number;
  visible: boolean;
}

export const DEFAULT_MAP_CALIBRATION: MapCalibration = {
  offsetX: -69,
  offsetZ: 3.5,
  baseWidth: 871,
  baseHeight: 760,
  scaleX: 1,
  scaleZ: 1,
  rotationDeg: 0,
  opacity: 0.78,
  visible: true,
};

export interface CampusLandmark {
  id: string;
  name: string;
  shortLabel: string;
  zone: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotationY?: number;
  polygon?: Array<[number, number]>;
  osmId?: string;
  entranceX?: number;
  entranceZ?: number;
  style: BuildingStyle;
  summary: string;
  highlights: string[];
  matchKeywords: string[];
}

export interface CampusToken {
  id: string;
  x: number;
  z: number;
  label: string;
}

/** Exact center of the Google Maps view: @30.5152191, 76.6603307 */
export const CAMPUS_ORIGIN = {
  lat: 30.5152191,
  lng: 76.6603307,
  pinLat: 30.5160865,
  pinLng: 76.6597778,
  elevationM: 291,
};

export const CAMPUS_BOUNDS = {
  minX: -435,
  maxX: 295,
  minZ: -345,
  maxZ: 365,
};

const METERS_PER_DEG_LAT = 111319.9;
const METERS_PER_DEG_LNG = 111319.9 * Math.cos((CAMPUS_ORIGIN.lat * Math.PI) / 180);

export function worldToGps(x: number, z: number): { lat: number; lng: number } {
  return {
    lat: CAMPUS_ORIGIN.lat - z / METERS_PER_DEG_LAT,
    lng: CAMPUS_ORIGIN.lng + x / METERS_PER_DEG_LNG,
  };
}

export function gpsToWorld(lat: number, lng: number): { x: number; z: number } {
  return {
    x: (lng - CAMPUS_ORIGIN.lng) * METERS_PER_DEG_LNG,
    z: (CAMPUS_ORIGIN.lat - lat) * METERS_PER_DEG_LAT,
  };
}

export const ALL_CAMPUS_BUILDINGS: OsmBuildingPolygon[] = [
  ...OSM_BUILDINGS,
  ...SUPPLEMENTAL_BUILDINGS,
];

export const ALL_CAMPUS_ROADS: OsmRoadPolyline[] = [
  ...OSM_ROADS,
  ...SUPPLEMENTAL_ROADS,
];

export const ALL_CAMPUS_ZONES: OsmCampusZone[] = [
  ...OSM_ZONES,
  ...SUPPLEMENTAL_ZONES,
];

export { OSM_NODES };

function findBuilding(osmId: string): OsmBuildingPolygon | undefined {
  return ALL_CAMPUS_BUILDINGS.find((b) => b.id === osmId);
}

function findZone(osmId: string): OsmCampusZone | undefined {
  return ALL_CAMPUS_ZONES.find((z) => z.id === osmId);
}

interface LandmarkConfig {
  id: string;
  osmId?: string;
  zoneOsmId?: string;
  name: string;
  shortLabel: string;
  zone: string;
  fallbackX?: number;
  fallbackZ?: number;
  fallbackW?: number;
  fallbackD?: number;
  levels?: number;
  height?: number;
  rotationY?: number;
  entranceX?: number;
  entranceZ?: number;
  style: BuildingStyle;
  summary: string;
  highlights: string[];
  matchKeywords: string[];
}

const LANDMARK_CONFIGS: LandmarkConfig[] = [
  {
    id: 'nh7-main-gate',
    name: 'NH-7 Main Campus Gate',
    shortLabel: 'Main Gate',
    zone: 'Northwest Entry · NH-7',
    fallbackX: -108.17,
    fallbackZ: -298.69,
    fallbackW: 24,
    fallbackD: 10,
    height: 11,
    rotationY: -0.66,
    entranceX: -100,
    entranceZ: -289,
    style: 'gate',
    summary:
      'Official NH-7 entrance gateway branching directly off the Chandigarh–Patiala National Highway into the northern campus avenue.',
    highlights: ['NH-7 Highway Archway', 'Main Security Plaza', 'Chitkara Visitor Parking'],
    matchKeywords: ['gate', 'entrance', 'chitkara university'],
  },
  {
    id: 'admission-block',
    osmId: 'osm-1315461632',
    name: 'Admission Block',
    shortLabel: 'Admission Block',
    zone: 'North Entry Corridor',
    levels: 2,
    entranceX: -130,
    entranceZ: -263,
    style: 'academic-crimson',
    summary:
      'First stop inside the NH-7 Main Gate handling student admissions, counselling, and visitor orientation.',
    highlights: ['Admissions Desk', 'Counselling Lounge', 'NH-7 Entry Walk'],
    matchKeywords: ['admission', 'admissions', 'counselling'],
  },
  {
    id: 'babbage-block',
    osmId: 'osm-429234298',
    name: 'Babbage Block',
    shortLabel: 'Babbage Block',
    zone: 'North Academic Quarter',
    levels: 6,
    entranceX: -39,
    entranceZ: -245,
    style: 'academic-crimson',
    summary:
      'Six-storey academic block overlooking Alpha Zone lawns and the open-air Amphitheatre in north campus.',
    highlights: ['6 Floors', 'Engineering Labs', 'Amphitheatre Overlook'],
    matchKeywords: ['babbage'],
  },
  {
    id: 'le-corbusier-block',
    osmId: 'osm-408496837',
    name: 'Le Corbusier Block',
    shortLabel: 'Le Corbusier',
    zone: 'North Campus · Architecture',
    levels: 4,
    entranceX: -13,
    entranceZ: -206,
    style: 'academic-sandstone',
    summary:
      'Chitkara School of Planning & Architecture studios directly adjacent to the Amphitheatre and Square Two.',
    highlights: ['Design Studios', 'Model Workshop', 'Critique Galleries'],
    matchKeywords: ['corbusier', 'architecture', 'design'],
  },
  {
    id: 'square-two',
    osmId: 'sup-square-two',
    name: 'Square Two',
    shortLabel: 'Square Two',
    zone: 'Northeast Food & Social Hub',
    levels: 2,
    entranceX: 38,
    entranceZ: -210,
    style: 'foodcourt',
    summary:
      'Popular student food court and outdoor plaza east of Le Corbusier Block and beside the Campus Water Tower.',
    highlights: ['Student Food Stalls', 'Outdoor Cafes', 'Water Tower Plaza'],
    matchKeywords: ['square two', 'square 2', 'food', 'cafe'],
  },
  {
    id: 'alpha-zone',
    zoneOsmId: 'zone-408496849',
    name: 'Alpha Zone & Amphitheatre',
    shortLabel: 'Alpha Zone',
    zone: 'North Cultural Park',
    height: 4,
    entranceX: -72,
    entranceZ: -175,
    style: 'park',
    summary:
      'Expansive green cultural park featuring the Alpha Fountain, open-air festival Stage, and Socrates Hall lawn.',
    highlights: ['Open-Air Stage', 'Alpha Fountain', 'Lawns & Amphitheatre'],
    matchKeywords: ['alpha', 'fountain', 'amphitheatre', 'stage'],
  },
  {
    id: 'teresa-hostel',
    osmId: 'osm-508227154',
    name: 'Teresa Girls Hostel & Mass Comm',
    shortLabel: 'Teresa Hostel',
    zone: 'Northwest Residential Wing',
    levels: 5,
    entranceX: -134,
    entranceZ: -222,
    style: 'hostel',
    summary:
      'Northwest residential complex beside Mass Communication Block, Old Girls Hostel (OGH), and Socrates Hall.',
    highlights: ['Teresa Hostel Wing', 'Mass Comm Studio', 'OGH Courtyard'],
    matchKeywords: ['teresa', 'girls hostel', 'mass communication', 'ogh'],
  },
  {
    id: 'football-ground',
    zoneOsmId: 'zone-408496852',
    name: 'Football Ground & Athletics Courts',
    shortLabel: 'Football Ground',
    zone: 'West Sports Complex',
    height: 3,
    entranceX: -188,
    entranceZ: -160,
    style: 'sports',
    summary:
      'West campus outdoor athletics cluster uniting Football Ground 2, Basketball, Tennis, and Volleyball courts.',
    highlights: ['Football Turf', 'Basketball & Tennis Courts', 'Volleyball Court'],
    matchKeywords: ['football', 'basketball', 'tennis', 'volleyball'],
  },
  {
    id: 'newton-block',
    osmId: 'osm-408496839',
    name: 'Newton Block',
    shortLabel: 'Newton Block',
    zone: 'Central Academic West',
    levels: 3,
    entranceX: -76,
    entranceZ: -137,
    style: 'academic-sandstone',
    summary:
      'Three-storey courtyard academic building fronting Chitkara Woods and the main west-central spine.',
    highlights: ['Walkable Inner Courtyard', 'Lecture Halls', 'Chitkara Woods Edge'],
    matchKeywords: ['newton'],
  },
  {
    id: 'edison-block',
    osmId: 'osm-408496838',
    name: 'Edison Block',
    shortLabel: 'Edison Block',
    zone: 'Central Campus Core',
    levels: 3,
    entranceX: -12,
    entranceZ: -126,
    style: 'academic-crimson',
    summary:
      'Multi-wing engineering block anchored right next to the central Chitkara University pin and Saraswati Mata shrine.',
    highlights: ['Multi-Wing Engineering Labs', 'Central Lawn Quad', 'Faculty Suites'],
    matchKeywords: ['edison', 'chitkara university'],
  },
  {
    id: 'turing-block',
    osmId: 'osm-508227188',
    name: 'Turing Block',
    shortLabel: 'Turing Block',
    zone: 'Central Spine · CSE Tower',
    levels: 7,
    entranceX: 1,
    entranceZ: -116,
    style: 'academic-crimson',
    summary:
      'Seven-storey landmark tower housing Computer Science & Engineering classrooms, computing labs, and auditoriums.',
    highlights: ['7-Storey CSE Tower', 'Computing Labs', 'De Morgan Courtyard'],
    matchKeywords: ['turing', 'computer', 'cse'],
  },
  {
    id: 'de-morgan-block',
    osmId: 'osm-408496848',
    name: 'De Morgan Block',
    shortLabel: 'De Morgan',
    zone: 'Central Academic Spine',
    levels: 4,
    entranceX: -9,
    entranceZ: -112,
    style: 'academic-sandstone',
    summary:
      'Slender academic wing flanking the central north–south promenade immediately opposite Turing Block.',
    highlights: ['Mathematics & Humanities', 'Turing Promenade', 'Seminar Rooms'],
    matchKeywords: ['de morgan', 'morgan'],
  },
  {
    id: 'flemming-block',
    osmId: 'osm-429238758',
    name: 'Flemming Block',
    shortLabel: 'Flemming Block',
    zone: 'East-Central Health Sciences',
    levels: 4,
    entranceX: 4,
    entranceZ: -54,
    style: 'academic-sandstone',
    summary:
      'E-shaped courtyard block housing Pharmacy, Health Sciences, and research laboratories north of Omega Zone.',
    highlights: ['Pharmacy & Biotech Labs', 'Courtyard Wings', 'North Track View'],
    matchKeywords: ['flemming', 'fleming', 'pharmacy', 'nursing'],
  },
  {
    id: 'galileo-block',
    osmId: 'osm-408496841',
    name: 'Galileo Block',
    shortLabel: 'Galileo Block',
    zone: 'West-Central Academic Spine',
    levels: 4,
    entranceX: -94,
    entranceZ: -49,
    style: 'academic-crimson',
    summary:
      'U-shaped academic complex flanking Beta Zone lawn and Chitkara Woods along the central east-west road.',
    highlights: ['Applied Sciences', 'Beta Zone Overlook', 'Central Courtyard'],
    matchKeywords: ['galileo'],
  },
  {
    id: 'sportorium',
    osmId: 'osm-408496850',
    name: 'Sportorium',
    shortLabel: 'Sportorium',
    zone: 'West Athletics Wing',
    levels: 3,
    entranceX: -212,
    entranceZ: -86,
    style: 'academic-sandstone',
    summary:
      '104-meter indoor sports & athletic center housing badminton, table tennis, squash, and fitness facilities.',
    highlights: ['Indoor Arena', 'Badminton & Fitness', 'Gate 4 Approach'],
    matchKeywords: ['sportorium', 'sports'],
  },
  {
    id: 'exploretorium',
    osmId: 'osm-408496851',
    name: 'Exploretorium',
    shortLabel: 'Exploretorium',
    zone: 'West Campus Flagship Auditorium',
    levels: 4,
    entranceX: -306,
    entranceZ: -92,
    style: 'auditorium',
    summary:
      'Flagship convention auditorium at the western campus loop overlooking the West Campus Retention Pond.',
    highlights: ['Grand Auditorium', 'West Loop Plaza', 'Lakefront Overlook'],
    matchKeywords: ['exploretorium', 'auditorium'],
  },
  {
    id: 'explore-hub',
    osmId: 'osm-408496843',
    name: 'Explore Hub',
    shortLabel: 'Explore Hub',
    zone: 'Central Innovation Plaza',
    levels: 3,
    entranceX: -70,
    entranceZ: -6,
    style: 'academic-crimson',
    summary:
      'Student innovation and collaboration building bridging Galileo Block, PYTHAGORAS, and Square One.',
    highlights: ['Student Clubs', 'Co-Working Hall', 'Central Walkway'],
    matchKeywords: ['explore hub', 'hub'],
  },
  {
    id: 'pythagoras-block',
    osmId: 'osm-408496842',
    name: 'PYTHAGORAS Block',
    shortLabel: 'PYTHAGORAS',
    zone: 'Central-West Academic Spine',
    levels: 2,
    entranceX: -102,
    entranceZ: 16,
    style: 'academic-sandstone',
    summary:
      '74-meter academic and classroom corridor linking Square One, Explore Hub, and Hospitality Block.',
    highlights: ['Lecture Corridors', 'Tuc Shop Walkway', 'Square One Approach'],
    matchKeywords: ['pythagoras'],
  },
  {
    id: 'square-one',
    osmId: 'osm-508227181',
    name: 'Square One',
    shortLabel: 'Square One',
    zone: 'Central Student Food Court',
    levels: 2,
    entranceX: -24,
    entranceZ: 22,
    style: 'foodcourt',
    summary:
      'Iconic central campus food court and hangout plaza sitting between Omega Zone Cricket Ground and PYTHAGORAS.',
    highlights: ['Central Food Court', 'Outdoor Plaza', 'Tuck Shop Hub'],
    matchKeywords: ['square one', 'square 1', 'food court', 'canteen'],
  },
  {
    id: 'hospitality-block',
    osmId: 'osm-508227156',
    name: 'Hospitality Block',
    shortLabel: 'Hospitality',
    zone: 'Chitkara School of Hospitality',
    levels: 3,
    entranceX: -72,
    entranceZ: 36,
    style: 'academic-sandstone',
    summary:
      'Hospitality, culinary studios, and hotel management training wing bordering the pedestrian plaza.',
    highlights: ['Culinary Studios', 'Training Restaurant', 'Student Plaza'],
    matchKeywords: ['hospitality', 'culinary'],
  },
  {
    id: 'tq-corridor',
    osmId: 'osm-508227180',
    name: 'TQ Academic Spine & Café',
    shortLabel: 'TQ Corridor',
    zone: 'Central-South Promenade',
    levels: 3,
    entranceX: -22,
    entranceZ: 40,
    style: 'academic-crimson',
    summary:
      '85-meter academic corridor opening directly onto the popular TQ student hangout and pedestrian court.',
    highlights: ['TQ Café Terrace', 'Academic Corridor', 'Road to Twin Halls'],
    matchKeywords: ['tq', 'cafe'],
  },
  {
    id: 'omega-playground',
    zoneOsmId: 'zone-408496854',
    name: 'Play Ground & Omega Zone',
    shortLabel: 'Play Ground',
    zone: 'Center-East Cricket Oval',
    height: 4,
    entranceX: 0,
    entranceZ: 40,
    style: 'sports',
    summary:
      'Full-scale green cricket and athletics oval occupying the heart of east campus beside Turing and Pie Hostel.',
    highlights: ['Cricket Pitch & Oval', 'Running Track', 'Floodlight Towers'],
    matchKeywords: ['play ground', 'playground', 'omega', 'cricket'],
  },
  {
    id: 'pie-hostel',
    osmId: 'osm-479355316',
    name: 'Pie Hostel & East Residential',
    shortLabel: 'Pie Hostel',
    zone: 'East Residential Quarter',
    levels: 7,
    entranceX: 162,
    entranceZ: 56,
    style: 'hostel',
    summary:
      'Seven-storey twin residential towers lining the eastern forest avenue right next to the Play Ground.',
    highlights: ['7-Storey Towers', 'East Forest Path', 'Hostel Courtyard'],
    matchKeywords: ['pie hostel', 'hostel'],
  },
  {
    id: 'rockfeller-building',
    osmId: 'osm-1479815885',
    name: 'Rockfeller Building',
    shortLabel: 'Rockfeller',
    zone: 'South Academic & Convention Plaza',
    levels: 5,
    entranceX: -12,
    entranceZ: 136,
    style: 'auditorium',
    summary:
      'Five-storey twin southern academic & convention hall anchoring the central south promenade alongside Martin Luther.',
    highlights: ['5-Storey Twin Complex', 'Convention Hall', 'South Courtyard'],
    matchKeywords: ['rockfeller', 'rockefeller'],
  },
  {
    id: 'martin-luther',
    osmId: 'osm-1479815886',
    name: 'Martin Luther Building',
    shortLabel: 'Martin Luther',
    zone: 'South Academic & Convention Plaza',
    levels: 5,
    entranceX: -10,
    entranceZ: 138,
    style: 'auditorium',
    summary:
      'Five-storey eastern twin of Rockfeller Building along the south campus avenue toward the SE hostels.',
    highlights: ['5-Storey Academic Hall', 'Twin White-Roof Halls', 'South Avenue'],
    matchKeywords: ['martin luther', 'luther'],
  },
  {
    id: 'vasco-da-gama',
    osmId: 'osm-508227189',
    name: 'Vasco Da Gama Hostel',
    shortLabel: 'Vasco Da Gama',
    zone: 'Southeast Residential',
    levels: 5,
    entranceX: 159,
    entranceZ: 109,
    style: 'hostel',
    summary:
      'Residential hostel block along the southeast campus boulevard adjacent to Boys Hostel and Pie Hostel.',
    highlights: ['Hostel Courtyard', 'SE Campus Road', 'Dining Hall'],
    matchKeywords: ['vasco da gama', 'vasco'],
  },
  {
    id: 'boys-hostel',
    osmId: 'osm-508227152',
    name: 'Boys Hostel & SE Wings',
    shortLabel: 'Boys Hostel',
    zone: 'Southeast Residential Sector',
    levels: 5,
    entranceX: 98,
    entranceZ: 170,
    style: 'tuckshop',
    summary:
      'Main Boys Hostel quad connected to the three parallel SE hostel wings and evening student tuck facilities.',
    highlights: ['L-Shaped Quad', '3 Parallel SE Wings', 'Perimeter Road Loop'],
    matchKeywords: ['boys hostel', 'hostel', 'tuck'],
  },
];

export const CAMPUS_LANDMARKS: CampusLandmark[] = LANDMARK_CONFIGS.map((cfg) => {
  const bldg = cfg.osmId ? findBuilding(cfg.osmId) : undefined;
  const zone = cfg.zoneOsmId ? findZone(cfg.zoneOsmId) : undefined;
  const src = bldg || zone;

  const levels = cfg.levels || bldg?.levels || 3;
  const height = cfg.height ?? Math.max(8, levels * 3.8);

  return {
    id: cfg.id,
    osmId: cfg.osmId || cfg.zoneOsmId,
    name: cfg.name,
    shortLabel: cfg.shortLabel,
    zone: cfg.zone,
    x: src ? src.cx : (cfg.fallbackX ?? 0),
    z: src ? src.cz : (cfg.fallbackZ ?? 0),
    width: src ? Math.round(src.width) : (cfg.fallbackW ?? 20),
    depth: src ? Math.round(src.depth) : (cfg.fallbackD ?? 20),
    height,
    rotationY: cfg.rotationY,
    polygon: src?.polygon,
    entranceX: cfg.entranceX,
    entranceZ: cfg.entranceZ,
    style: cfg.style,
    summary: cfg.summary,
    highlights: cfg.highlights,
    matchKeywords: cfg.matchKeywords,
  };
});

export const CAMPUS_TOKENS: CampusToken[] = [
  { id: 'tok-1', x: -102, z: -290, label: 'NH-7 Main Gate Arch' },
  { id: 'tok-2', x: -120, z: -260, label: 'Admission Block Plaza' },
  { id: 'tok-3', x: -29, z: -171, label: 'Alpha Fountain' },
  { id: 'tok-4', x: 10, z: -244, label: 'Open-Air Amphitheatre' },
  { id: 'tok-5', x: 38, z: -210, label: 'Square Two Terrace' },
  { id: 'tok-6', x: -10, z: -110, label: 'Turing–De Morgan Quad' },
  { id: 'tok-7', x: -38, z: -135, label: 'Edison Courtyard' },
  { id: 'tok-8', x: -108, z: -135, label: 'Newton Courtyard' },
  { id: 'tok-9', x: -225, z: -160, label: 'Football Ground Center' },
  { id: 'tok-10', x: -306, z: -92, label: 'Exploretorium West Loop' },
  { id: 'tok-11', x: -212, z: -85, label: 'Sportorium Approach' },
  { id: 'tok-12', x: -48, z: -47, label: 'Beta Zone Lawn' },
  { id: 'tok-13', x: -42, z: 22, label: 'Square One Atrium' },
  { id: 'tok-14', x: -21, z: 50, label: 'TQ Café Courtyard' },
  { id: 'tok-15', x: 63, z: 42, label: 'Play Ground Pitch' },
  { id: 'tok-16', x: -10, z: 137, label: 'Rockfeller–Martin Avenue' },
  { id: 'tok-17', x: 162, z: 56, label: 'Pie Hostel Track' },
  { id: 'tok-18', x: 184, z: 279, label: 'SE Hostel Courtyard' },
];
