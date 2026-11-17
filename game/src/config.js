// Solmaris — configuration: world size, road graph, districts, palette,
// shops, weapons, missions and tuning. One job: the numbers and the story
// data. Nothing here touches the canvas or the network.
export const WORLD_W = 3600;
export const WORLD_H = 2600;
export const ROAD_HALF = 32;
export const AVENUES = [200, 600, 1000, 1400, 1800, 2200, 2600, 3000, 3400];
export const STREETS = [200, 560, 920, 1280, 1640, 2000, 2360];
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmaris-save-v5';

export const DISTRICTS = [
  { name: 'Marina Bay', x0: 0, y0: 0, x1: 1250, y1: 1100, ground: '#c9b183', water: true },
  { name: 'Old Harbor', x0: 0, y0: 1100, x1: 1250, y1: 2600, ground: '#b7a06e', water: true },
  { name: 'Palm Court', x0: 1250, y0: 0, x1: 2350, y1: 1500, ground: '#a8b06a', water: false },
  { name: 'Sunvale', x0: 2350, y0: 0, x1: 3600, y1: 1500, ground: '#c2a15e', water: false },
  { name: 'Coral Heights', x0: 1250, y0: 1500, x1: 3600, y1: 2600, ground: '#9db3a4', water: false },
];

export const DISTRICT_COLORS = {
  'Marina Bay': ['#e8dcc3', '#d9c9a8', '#f2e6cf', '#cdb98f'],
  'Old Harbor': ['#b98d5f', '#a67c52', '#c99a6b', '#8f6b45'],
  'Palm Court': ['#7fae7a', '#68a06a', '#93bd85', '#5d945f'],
  'Sunvale': ['#e0a458', '#d18f3f', '#eab96e', '#c07f33'],
  'Coral Heights': ['#7d9bb5', '#6a8aa6', '#93aec6', '#5d7d99'],
};

export const SHOPS = [
  { id: 'taco', name: 'Taco Sol', kind: 'food', x: 1000, y: 560, color: '#e2703a',
    goods: [{ key: 'snack', label: 'Sol Taco — heal 40', price: 10 },
            { key: 'meal', label: 'Fiesta Platter — heal full', price: 25 }] },
  { id: 'lumen', name: 'Lumen Outfits', kind: 'gear', x: 1800, y: 1280, color: '#7a5fd0',
    goods: [{ key: 'bat', label: 'Harbor Bat', price: 80 },
            { key: 'vest', label: 'Padded Vest — armor 50', price: 150 }] },
  { id: 'arms', name: 'Harbor Arms', kind: 'arms', x: 600, y: 2000, color: '#3f6d8e',
    goods: [{ key: 'pistol', label: 'P9 Pistol', price: 250 },
            { key: 'ammo', label: 'Pistol Ammo x12', price: 30 }] },
];

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, range: 46, rate: 0.32 },
  bat: { name: 'Harbor Bat', damage: 26, range: 62, rate: 0.45 },
  pistol: { name: 'P9 Pistol', damage: 34, range: 420, rate: 0.28 },
};

// The Solmaris Job — six missions. Steps are generic: goto / steal / deliver /
// shoot / getHeat / escape / hold. Marker plazas are open ground, never inside
// a building, so the marker is always reachable.
export const MISSIONS = [
  { id: 1, title: 'First Wheels', reward: 150,
    brief: 'Mara Kade: "Rae, you need wheels before anything else. Take any car on the street — nobody here locks theirs."',
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', x: 1800, y: 920, r: 90, text: 'Drive to the Palm Court plaza' },
    ] },
  { id: 2, title: 'Taco Run', reward: 300,
    brief: 'Mara Kade: "Taco Sol has a package for the Marina. Pick it up, keep it quiet, and be quick."',
    steps: [
      { type: 'goto', x: 1000, y: 560, r: 80, text: 'Pick up the package at Taco Sol' },
      { type: 'goto', x: 600, y: 560, r: 90, text: 'Deliver the package to Marina Bay' },
    ] },
  { id: 3, title: 'Loud Harbor', reward: 600,
    brief: 'Mara Kade: "Rivals moved into Old Harbor. Three lookouts, all armed. Make it loud — they need to hear us."',
    steps: [
      { type: 'shoot', count: 3, x: 600, y: 2000, r: 320, text: 'Take out 3 lookouts at Old Harbor' },
    ] },
  { id: 4, title: 'Heat Check', reward: 1000,
    brief: 'Mara Kade: "The crew needs to know you can shake a tail. Get the cops on you — then vanish."',
    steps: [
      { type: 'getHeat', level: 2, text: 'Raise your wanted level to 2 stars' },
      { type: 'escape', text: 'Lose the cops — get back to 0 stars' },
    ] },
  { id: 5, title: 'Three Corners', reward: 2000,
    brief: 'Mara Kade: "Final rehearsal. Hit three drops across the city before the clock runs out."',
    steps: [
      { type: 'goto', x: 3000, y: 560, r: 90, time: 75, text: 'Drop 1 of 3 — Sunvale' },
      { type: 'goto', x: 1000, y: 2000, r: 90, time: 75, text: 'Drop 2 of 3 — Old Harbor' },
      { type: 'goto', x: 2600, y: 2000, r: 90, time: 75, text: 'Drop 3 of 3 — Coral Heights' },
    ] },
  { id: 6, title: 'The Solmaris Job', reward: 5000,
    brief: 'Mara Kade: "Tonight we take the Marina vault. Get in, hold the door, get out. Then we are done — rich."',
    steps: [
      { type: 'goto', x: 600, y: 920, r: 90, text: 'Reach the Marina vault' },
      { type: 'hold', x: 600, y: 920, r: 90, seconds: 6, text: 'Hold E at the vault door — crack it open' },
      { type: 'goto', x: 1800, y: 1640, r: 100, text: 'Escape to the Palm Court hideout' },
    ] },
];

export const STORY = {
  hero: 'Rae Voss',
  fixer: 'Mara Kade',
  city: 'Solmaris',
  intro: 'Rae Voss came to Solmaris with a busted scooter and a name nobody knew. Mara Kade runs the city\'s quiet jobs — and she just offered Rae six of them.',
  outro: 'The vault is open, the cops are lost, and Solmaris finally knows the name Rae Voss.',
};

export const TUNING = {
  walkSpeed: 175,
  carAccel: 300,
  carBrake: 420,
  carMax: 430,
  carReverseMax: 160,
  carTurn: 2.6,
  trafficCount: 16,
  pedCount: 30,
  copCarMax: 6,
  wantedDecayQuiet: 10,
  wantedDecayPerStar: 6,
  bustedFine: 100,
  startMoney: 120,
};
