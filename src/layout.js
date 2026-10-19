// Island layout data. World axes: +x east, +z south (towards the default camera), +y up.
// All distances in metres. Every structure, road and path is defined here so the
// generators stay data-driven and connections can be checked in one place.

export const G = 1.6;            // road surface level
export const CURB = 0.15;        // sidewalk / plaza height above road
export const WALK = G + CURB;    // pedestrian level
export const GREEN_TOP = WALK + 0.3;

// Island seawall outline (closed Catmull-Rom control points).
export const OUTLINE = [
  [-48, -43], [-24, -53], [2, -56], [30, -52], [52, -39], [60, -18], [62, 6], [58, 28],
  [44, 40], [22, 43], [0, 43], [-22, 42], [-42, 36], [-56, 22], [-61, 2], [-58, -22],
];

// Small pocket beach outside the southern seawall, framed by two rocky points.
// x0..x1: along-shore extent of the sand; width: max dry-sand width (wall foot to
// still-water line); top: sand height at the wall foot. The plan shape itself is
// generated from these by src/world/coastField.js so it follows the real seawall.
export const BEACH = { x0: -34.5, x1: 11.5, width: 12.4, top: 0.78 };
// Dominant swell arrives from the west-south-west (Arabian Sea monsoon swell):
// unit vector pointing towards where the waves come from (+x east, +z south).
export const SWELL_FROM = [-0.93, 0.36];

// Metro: straight viaduct through the station with central median pillars and roads on both sides.
export const METRO = {
  station: [20, -35.5],
  slope: 0.45,           // dz/dx of the alignment (runs WNW -> ESE)
  deckTop: G + 7.5,
  platformTop: G + 8.6,
  halfLength: 34,        // finite island viaduct: starts and stops cleanly on the island
  pierSpacing: 22,
  stationLen: 28,
  stationWidth: 16,
  medianWidth: 2.84,     // central median width housing the metro pillars
  roadOffset: 4.35,      // lateral offset (+v and -v) of the two road carriageways flanking the pillars
  roadWidth: 5.8,        // width of each carriageway on either side of the central pillars
};

const _mLen = Math.hypot(1, METRO.slope);
const _mdx = 1 / _mLen, _mdz = METRO.slope / _mLen;
const metroPt = (u, v) => [
  +(METRO.station[0] + u * _mdx - v * _mdz).toFixed(2),
  +(METRO.station[1] + u * _mdz + v * _mdx).toFixed(2),
];

// Roads. Kerala drives on the left. `closed` roads are loops.
// Includes the twin carriageways (`metroNorth` and `metroSouth`) on both sides of the central metro pillars.
export const ROADS = {
  ring: {
    width: 7,
    closed: true,
    pts: [
      [30, -10.5], [8, -10.5], [-14, -10.5], [-34, -11], [-46, -5.5], [-50, 6], [-48, 20], [-40, 29],
      [-22, 32], [0, 33], [18, 32], [31, 27], [36, 14], [36, 0], [34, -8],
    ],
  },
  avenue: { width: 7, closed: false, pts: [[5, -10.5], [5, 4], [5, 20], [5, 33]] },
  lane: { width: 6, closed: false, pts: [[5, 4], [-6, 4], [-14, 6], [-18.5, 12], [-20, 22], [-21, 32]] },
  metroNorth: {
    width: METRO.roadWidth,
    closed: false,
    pts: [-34, -17, 0, 17, 34].map((u) => metroPt(u, -METRO.roadOffset)),
  },
  metroSouth: {
    width: METRO.roadWidth,
    closed: false,
    pts: [-34, -17, 0, 17, 34].map((u) => metroPt(u, METRO.roadOffset)),
  },
  metroLink: {
    width: 6,
    closed: false,
    pts: [[33.2, -9.2], [34.4, -16.5], metroPt(19.5, METRO.roadOffset)],
  },
};

// T-junctions: minor road end joins major road.
export const JUNCTIONS = [
  { minor: 'avenue', end: 'start', major: 'ring' },
  { minor: 'avenue', end: 'end', major: 'ring' },
  { minor: 'lane', end: 'start', major: 'avenue' },
  { minor: 'lane', end: 'end', major: 'ring' },
  { minor: 'metroLink', end: 'start', major: 'ring' },
  { minor: 'metroLink', end: 'end', major: 'metroSouth' },
];

// Zebra crossings: road + approximate world point.
export const CROSSINGS = [
  { road: 'ring', at: [17, -10.5] },   // station forecourt <-> east park
  { road: 'ring', at: [-10, 33] },     // centre park <-> beach stairs
  { road: 'ring', at: [36, 6] },       // east park <-> cafe
  { road: 'ring', at: [25, 30] },      // east park <-> pier
  { road: 'ring', at: [-50, 12] },     // graffiti block <-> west promenade
  { road: 'ring', at: [-12, -10.5] },  // apartment <-> west block
  { road: 'avenue', at: [5, -4] },
  { road: 'avenue', at: [5, 25] },
  { road: 'lane', at: [-20, 25] },
  { road: 'metroSouth', at: metroPt(-6, METRO.roadOffset) }, // station forecourt crossing
  { road: 'metroNorth', at: metroPt(-6, -METRO.roadOffset) },
];

// Buildings (axis aligned unless rot given). x,z = centre; w along x, d along z.
export const APARTMENT = { x: -16, z: -27.5, w: 15, d: 12, floors: 8, floorH: 3.2 };
export const GRAFFITI = { x: -32, z: 6, w: 12, d: 12, floors: 6, floorH: 3.2 };
export const CAFE = { x: 49.5, z: 5.5, w: 13, d: 11, h: 4.6 };
export const PAVILION = { x: 21, z: 13, size: 7 };
export const SHOP = { x: -32, z: 16.5, w: 9, d: 4.5 };      // pergola kiosk in front of graffiti block

export const BUS_SHELTERS = [
  { x: -1, z: -16.8, rot: 0 },         // station forecourt, faces ring (south)
  { x: 10.4, z: 15, rot: -Math.PI / 2 }, // avenue east side, faces west
  { x: -31, z: 37.6, rot: Math.PI },   // south promenade, faces ring (north)
];

// Pedestrian plazas kept free of planting (polygons).
export const PLAZAS = [
  // station forecourt (south of the metro boulevard & station entrance)
  [[-6, -14.5], [30, -14.5], [30, -21.5], [4, -33.5], [-6, -26]],
  // cafe forecourt and terrace
  [[40.5, -4], [58, -4], [58, 21], [40.5, 21]],
  // pier landing
  [[19, 34.5], [34, 30], [36, 42], [20, 44]],
  // beach stair head
  [[-13, 36], [-7, 36], [-7, 44], [-13, 44]],
  // apartment entrance
  [[-20, -21.5], [-12, -21.5], [-12, -16], [-20, -16]],
];

// Footpaths through planted areas (polyline, width).
export const PATHS = [
  { w: 2.4, pts: [[17, -7], [17, 2], [21, 13], [32.5, 14]] },
  { w: 2.4, pts: [[21, 13], [15, 22], [8.5, 25]] },
  { w: 2.2, pts: [[-10, 29.5], [-9, 18], [-3, 10], [1.5, 9]] },
  { w: 2.2, pts: [[-25.5, 6], [-22, 6]] },
  { w: 2.2, pts: [[-38, 6], [-46.5, 10], [-46.5, 12]] },
  { w: 2.2, pts: [[-32, 18.7], [-32, 27.5]] },
  { w: 2.4, pts: [[-12, -7], [-12, 0.5]] },
  { w: 2.4, pts: [[-8.5, -20], [-6.5, -31.5]] },            // links forecourt to metro boulevard sidewalk
  { w: 2.4, pts: [[-24, -24], [-38, -30], [-46, -34]] },
];

// Pier deck pieces: rectangles {cx, cz, w, d, rot}.
export const PIER = {
  root: [28, 41.6],
  deckTop: G,
};

export const SPAWN = { x: -10, z: 37.5, heading: Math.PI };
