// A generic 14-inch laptop hologram (no brand, no model) for the walkthrough renderer's tests
// (hologram.emphasis.test.mjs, test/e2e/scenarios/tour-render.mjs). It is written the way
// show_hologram writes one: +x front, +y up, +z right, mm, outer parts first, the case parts tone
// "secondary", and an explode vector along each part's way out (the battery comes out downwards,
// through the bottom cover). Boxes and one cylinder: it builds at once, with nothing to mesh.
export const LAPTOP = Object.freeze({
  title: 'Laptop',
  subtitle: '14-inch laptop · 324 × 221 × 18 mm base',
  units: 'mm',
  view: 'front-left',
  groups: [
    { id: 'case', name: 'Case' },
    { id: 'display', name: 'Display' },
    { id: 'power', name: 'Power' },
    { id: 'board', name: 'Board and storage' },
    { id: 'cooling', name: 'Cooling' },
    { id: 'input', name: 'Keyboard and touchpad' },
  ],
  parts: [
    { id: 'bottom-cover', name: 'Bottom cover (D cover)', aka: ['base cover'], group: 'case', tone: 'secondary', info: 'Aluminium bottom panel held by captive screws. It is the only part you remove to reach the battery, memory and SSD.', material: 'Aluminium', explode: [0, -70, 0], anchor: [60, 0, -120], shapes: [{ type: 'box', size: [220, 2, 324], at: [0, 1, 0] }] },
    { id: 'palm-rest', name: 'Palm rest (C cover)', aka: ['top case'], group: 'case', tone: 'secondary', info: 'Top of the base, with the keyboard and touchpad set into it.', material: 'Aluminium', explode: [0, 80, 0], anchor: [90, 18, 120], shapes: [{ type: 'box', size: [220, 2, 324], at: [0, 17, 0] }] },
    { id: 'lid', name: 'Display lid (A cover)', group: 'display', tone: 'secondary', info: 'Back of the screen.', material: 'Aluminium', explode: [-60, 0, 0], shapes: [{ type: 'box', size: [4, 212, 324], at: [-118, 124, 0] }] },
    { id: 'display', name: 'Display panel', aka: ['screen'], group: 'display', tone: 'primary', info: '14-inch 1920 x 1080 IPS panel.', material: 'Glass, LCD', explode: [-30, 0, 0], shapes: [{ type: 'box', size: [3, 200, 310], at: [-114, 124, 0] }] },
    { id: 'hinges', name: 'Hinges', group: 'display', tone: 'primary', info: 'Two steel hinges that hold the lid to the base.', material: 'Steel', explode: [-20, 20, 0], shapes: [{ type: 'box', size: [14, 10, 20], at: [-108, 18, -130] }, { type: 'box', size: [14, 10, 20], at: [-108, 18, 130] }] },
    { id: 'keyboard', name: 'Keyboard', group: 'input', tone: 'primary', info: 'Spill-resistant keyboard, held from below.', material: 'Plastic, steel plate', explode: [0, 120, 0], shapes: [{ type: 'box', size: [110, 3, 290], at: [-40, 15, 0] }] },
    { id: 'touchpad', name: 'Touchpad', aka: ['trackpad'], group: 'input', tone: 'primary', info: 'Glass touchpad on its own small board.', material: 'Mylar, PCB', explode: [0, 110, 0], shapes: [{ type: 'box', size: [65, 2, 100], at: [80, 15, 0] }] },
    { id: 'battery', name: 'Battery (57 Wh)', aka: ['battery pack'], group: 'power', tone: 'warning', info: 'Three-cell lithium-ion pack along the front of the base, held by screws and a cable plugged into the board.', material: 'Li-ion cells, plastic frame', explode: [0, -45, 0], shapes: [{ type: 'box', size: [80, 7, 260], at: [62, 6, 0] }] },
    { id: 'battery-connector', name: 'Battery connector', group: 'power', tone: 'accent', info: 'Unplug this first when you work inside: it cuts the power to the board.', material: 'Plastic, copper', explode: [0, -30, 0], shapes: [{ type: 'box', size: [8, 3, 22], at: [18, 7, 60] }] },
    { id: 'motherboard', name: 'Motherboard', aka: ['system board'], group: 'board', tone: 'primary', info: 'Main board with the soldered processor and one memory slot.', material: 'PCB', explode: null, shapes: [{ type: 'box', size: [100, 2, 300], at: [-48, 6, 0] }] },
    { id: 'ram', name: 'RAM (SO-DIMM)', aka: ['memory'], group: 'board', tone: 'primary', info: 'One memory module in a slot; more is soldered to the board.', material: 'PCB, chips', explode: [0, -38, 0], shapes: [{ type: 'box', size: [30, 3, 70], at: [-30, 8, 40] }] },
    { id: 'ssd', name: 'M.2 SSD', aka: ['solid state drive'], group: 'board', tone: 'primary', info: 'M.2 2280 NVMe drive, one screw.', material: 'PCB, flash chips', explode: [0, -36, 0], shapes: [{ type: 'box', size: [22, 2, 80], at: [-25, 8, -70] }] },
    { id: 'wifi', name: 'Wi-Fi card', aka: ['wireless card'], group: 'board', tone: 'primary', info: 'Wi-Fi card with two antenna leads.', material: 'PCB', explode: [0, -32, 0], shapes: [{ type: 'box', size: [22, 2, 30], at: [-60, 8, -120] }] },
    { id: 'fan', name: 'Cooling fan', group: 'cooling', tone: 'primary', info: 'Blower fan that pulls air through the bottom vents.', material: 'Plastic', explode: [0, -55, 0], shapes: [{ type: 'cylinder', r: 30, h: 8, at: [-65, 10, 105] }] },
    { id: 'heatsink', name: 'Heat pipe and heatsink', group: 'cooling', tone: 'primary', info: 'Copper heat pipe that carries heat from the processor to the fan.', material: 'Copper', explode: [0, -50, 0], shapes: [{ type: 'box', size: [24, 3, 120], at: [-70, 11, 40] }] },
    { id: 'speakers', name: 'Speakers', group: 'input', tone: 'primary', info: 'Two small speakers that fire down through the bottom cover.', material: 'Plastic, magnets', explode: [0, -40, 0], shapes: [{ type: 'box', size: [30, 6, 40], at: [70, 6, -140] }, { type: 'box', size: [30, 6, 40], at: [70, 6, 140] }] },
  ],
  notes: ['A simplified model for the walkthrough tests.'],
});

/** The case parts of LAPTOP (tone "secondary"). */
export const LAPTOP_SHELLS = Object.freeze(['bottom-cover', 'palm-rest', 'lid']);
