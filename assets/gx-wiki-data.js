/* ============================================================
   GX WIKI — naming grammar, code tables and configuration rules
   Sources:
     · Summa/GX/GX Naming Convention.pptx (Infinera, 7 slides) — the grammar
     · GX BOM Configurator V3.0.xlsm, AUX sheet — chassis geometry, slot costs
     · ON Consolidated Roadmap Aug 2026 — GX Transcend v1.0 — portfolio shape
     · GX G30 Part Numbers 2026-08-06 / G40 PON List Aug 2026 — real PNs
   Where a table says "observed", it was derived from the part-number lists
   rather than stated in the naming deck — flagged so it can be confirmed.
   ============================================================ */

/* ---------- PN prefixes ---------- */
const PREFIX = {
  'G3S': { t:'G3x service module', d:'Current-generation sled or card for the G30-series chassis. The bulk of the OLS catalog.', src:'deck' },
  'GQS': { t:'Chassis / passive shelf', d:'Chassis bodies and passive AWG mux-demux shelves (OMD).', src:'observed' },
  'GLS': { t:'Groove-era line sled', d:'G30-generation service modules and controllers carried forward.', src:'observed' },
  'ZXS': { t:'OFP2 pluggable module', d:'Optical Formfactor Pluggable modules that seat in an OCC host, plus QSFP-DD client optics.', src:'observed' },
  'GFS': { t:'Fan module', d:'Chassis fan FRU.', src:'observed' },
  'GCS': { t:'Controller / I/O FRU', d:'FRCU controller units and field-replaceable I/O panels.', src:'observed' },
  'GPS': { t:'AC power module', d:'AC PEM.', src:'observed' },
  'GPU': { t:'DC power module', d:'DC PEM.', src:'observed' },
  'GKS': { t:'Mounting kit', d:'Rack, cabinet and ETSI mounting hardware.', src:'observed' },
  'G3K': { t:'Chassis kit', d:'Pre-bundled chassis + PSU + fan combinations ordered as one code.', src:'observed' },
  'GVS': { t:'Cable', d:'Power and patch cables. Tail is length, not band.', src:'observed' },
  'GS':  { t:'Software / licence', d:'NE software packages and feature licences.', src:'observed' },
  'LIC': { t:'Capacity licence', d:'Instant-bandwidth and rate licences.', src:'observed' },
  'TOM': { t:'Client optic', d:'Transmission Optical Module — grey client pluggables.', src:'observed' },
  'C':   { t:'Infinera pluggable', d:'ICE-X coherent pluggables, e.g. C-QD08CEXNC-GP.', src:'observed' },
};

/* ---------- form factor (fn) ---------- */
const FORM = {
  'G1': { t:'Groove / GX single-slot sled', n:'1 quarter-sled width', src:'deck' },
  'G2': { t:'Groove / GX dual-slot sled',   n:'2 quarter-sled widths', src:'deck' },
  'G3': { t:'Groove / GX triple-slot sled', n:'3 quarter-sled widths', src:'deck' },
  'G4': { t:'Groove / GX quad-slot sled',   n:'4 quarter-sled widths · multi-rail amps', src:'deck+observed' },
  'H3': { t:'Full-chassis triple-slot sled', n:'600 mm family. Not in the naming deck — observed on RD66.', src:'observed' },
  'H4': { t:'Full-chassis quad-slot sled',  n:'600 mm family. Not in the deck — observed on the 4-fibre hybrid.', src:'observed' },
  'C1': { t:'Compact single-slot sled', n:'G34c / G32c (ETSI/ANSI), 300 mm', src:'deck' },
  'C2': { t:'Compact dual-slot sled',   n:'G34c / G32c, 300 mm. Also reads as CFP2 on pluggables — use context.', src:'deck' },
  'D2': { t:'Compact dual-stage sled',  n:'300 mm, dual-stage amps. Not in the deck — observed on D2ILA / D2IRB.', src:'observed' },
  'O1': { t:'OFP1 module', n:'Optical Formfactor Pluggable gen 1', src:'deck' },
  'O2': { t:'OFP2 module', n:'Optical Formfactor Pluggable gen 2 — seats in an OCC', src:'deck' },
  'P1': { t:'PWS1 sled', n:'Passive WDM component shelf gen 1', src:'deck' },
  'P2': { t:'PWS2 sled', n:'Passive WDM component shelf gen 2', src:'deck' },
  'SP': { t:'SFP+', n:'pluggable', src:'deck' },
  'XP': { t:'XFP', n:'pluggable', src:'deck' },
  'C4': { t:'CFP4', n:'pluggable', src:'deck' },
  'Q8': { t:'QSFP28', n:'pluggable', src:'deck' },
  'QP': { t:'QSFP+', n:'pluggable', src:'deck' },
};

/* ---------- functionality (ZZ) — longest match wins ---------- */
const FUNC = {
  // filters & switches
  'RD':   { t:'ROADM degree', g:'Filters & switches', src:'deck' },
  'WS':   { t:'WSS — wavelength selective switch', g:'Filters & switches', src:'deck' },
  'OMD':  { t:'AWG mux / demux', g:'Filters & switches', src:'deck' },
  'CAD':  { t:'Colourless add/drop', g:'Filters & switches', src:'deck' },
  'CDC':  { t:'Colourless-directionless-contentionless add/drop', g:'Filters & switches', src:'deck' },
  'CD':   { t:'CD add/drop', g:'Filters & switches', src:'deck' },
  'DGE':  { t:'Dynamic gain equaliser', g:'Filters & switches', src:'observed' },
  // amplifiers
  'PB':   { t:'Pre-amp + booster combined', g:'Amplifiers', src:'deck' },
  'PA':   { t:'Pre-amp only', g:'Amplifiers', src:'deck' },
  'BA':   { t:'Booster only', g:'Amplifiers', src:'deck' },
  'PAOH': { t:'Pre-amp with OSC', g:'Amplifiers', src:'deck' },
  'PAOU': { t:'Pre-amp with OSC, ultra-high power', g:'Amplifiers', src:'deck' },
  'BAH':  { t:'Booster, high gain range', g:'Amplifiers', src:'deck' },
  'BAX':  { t:'Booster, extended gain range', g:'Amplifiers', src:'deck' },
  'RPB':  { t:'Raman pump, backward', g:'Amplifiers', src:'deck' },
  'RPU':  { t:'Raman pump, universal (fwd + bwd)', g:'Amplifiers', src:'deck' },
  'HR':   { t:'Hybrid Raman / EDFA', g:'Amplifiers', src:'deck' },
  'ILA':  { t:'Integrated line amplifier', g:'Amplifiers', src:'observed' },
  'IL':   { t:'Integrated line amplifier (short form)', g:'Amplifiers', src:'observed' },
  'IRB':  { t:'Integrated Raman + booster (hybrid)', g:'Amplifiers', src:'observed' },
  'PBAL': { t:'Pre-amp + booster, long gain range', g:'Amplifiers', src:'observed' },
  // control / monitoring
  'OCC':  { t:'Optical carrier card — OFP2 host', g:'Control & monitoring', src:'deck' },
  'OTDR': { t:'Optical time-domain reflectometer', g:'Control & monitoring', src:'observed' },
  'OCM':  { t:'Optical channel monitor', g:'Control & monitoring', src:'observed' },
  'OPS':  { t:'Optical protection switch', g:'Control & monitoring', src:'observed' },
  'OTSC': { t:'OTS channel / supervisory', g:'Control & monitoring', src:'observed' },
  // transponders
  'CHM':  { t:'Coherent channel module — transponder / muxponder', g:'Transponders', src:'deck' },
  'UTM':  { t:'Universal transponder module — ADM sled', g:'Transponders', src:'deck' },
  'SPN':  { t:'Switchponder module', g:'Transponders', src:'deck' },
  'UCM':  { t:'Universal channel module (G40)', g:'Transponders', src:'deck' },
  'PTM':  { t:'Packet transport module — PLE', g:'Transponders', src:'observed' },
  // chassis & common
  'CHAS': { t:'Chassis body', g:'Chassis & common equipment', src:'observed' },
  'FAN':  { t:'Fan module', g:'Chassis & common equipment', src:'observed' },
  'PSU':  { t:'Power supply module', g:'Chassis & common equipment', src:'observed' },
  'FRCU': { t:'Field-replaceable controller unit', g:'Chassis & common equipment', src:'observed' },
  'FRIO': { t:'Field-replaceable I/O unit', g:'Chassis & common equipment', src:'observed' },
  'CON':  { t:'Controller', g:'Chassis & common equipment', src:'observed' },
  'FCF':  { t:'Front cover filter', g:'Chassis & common equipment', src:'observed' },
  'SF':   { t:'Slot filler', g:'Chassis & common equipment', src:'observed' },
  'CFI':  { t:'Controller filler', g:'Chassis & common equipment', src:'observed' },
  'PSFI': { t:'PSU filler', g:'Chassis & common equipment', src:'observed' },
  'CHMFI':{ t:'CHM slot filler plate', g:'Chassis & common equipment', src:'observed' },
  'RAKIT':{ t:'Rack mounting kit', g:'Chassis & common equipment', src:'observed' },
  'CAKIT':{ t:'Cabinet mounting kit', g:'Chassis & common equipment', src:'observed' },
  'IKIT': { t:'Installation / mounting kit', g:'Chassis & common equipment', src:'observed' },
  'CBLG': { t:'Cable guide', g:'Chassis & common equipment', src:'observed' },
  'AFZZ': { t:'Air filter', g:'Chassis & common equipment', src:'observed' },
};

/* ---------- performance / WSS suffixes ---------- */
const PERF = {
  'SM': { t:'Single WSS, medium performance', g:'ROADM-on-a-blade' },
  'TI': { t:'Twin WSS, intermediate range',  g:'ROADM-on-a-blade' },
  'TM': { t:'Twin WSS, medium performance',  g:'ROADM-on-a-blade' },
  'TH': { t:'Twin WSS, high performance',    g:'ROADM-on-a-blade' },
  'SG': { t:'Switchable gain',               g:'Amplifier gain' },
  'SGH':{ t:'Switchable gain, high performance', g:'Amplifier gain' },
  'SGM':{ t:'Switchable gain, medium performance', g:'Amplifier gain' },
  'SR': { t:'Short range',        g:'Amplifier gain' },
  'IR': { t:'Intermediate range', g:'Amplifier gain' },
  'LR': { t:'Long range',         g:'Amplifier gain' },
  'ER': { t:'Extended range',     g:'Amplifier gain' },
  'BR': { t:'Broad range',        g:'Amplifier gain' },
  'A':  { t:'Amplified',          g:'Variant' },
  'H':  { t:'High performance',   g:'Variant' },
  'S':  { t:'Standard performance', g:'Variant' },
  'M':  { t:'Medium performance', g:'Variant' },
  'E':  { t:'Expandable',         g:'Variant' },
  'L':  { t:'Long gain range',    g:'Variant (amps only)' },
  'I':  { t:'Intermediate gain range', g:'Variant (amps only)' },
  'T':  { t:'With timing',        g:'Variant (OCC)' },
};

/* ---------- band codes ---------- */
const BAND = {
  'N': { t:'Non-upgradeable C-band', thz:4.85, up:'Cannot be upgraded to L-band', src:'deck' },
  'C': { t:'Upgradeable C-band',     thz:4.85, up:'Upgradeable to L-band', src:'deck' },
  'W': { t:'Non-upgradeable Super C (C++)', thz:6.1, up:'Cannot be upgraded', src:'deck' },
  'X': { t:'Upgradeable Super C (C++)',     thz:6.1, up:'Upgradeable with Super L', src:'deck' },
  'Y': { t:'Super C + Super L',      thz:12.5, up:'Full dual band, incl. 300 GHz guard', src:'deck' },
  'L': { t:'L-band',                 thz:null, up:'Base L-band — NOT Super L. Super L only appears inside Y.', src:'deck' },
  'S': { t:'S-band',                 thz:null, up:'', src:'deck' },
  'O': { t:'O-band',                 thz:null, up:'', src:'deck' },
  'Z': { t:'Legacy Groove band code', thz:9.6, up:'Pre-standardisation. Historically std C + std L on RPBM/ILA parts. Check the source description.', src:'legacy' },
  '0': { t:'Band-agnostic / not applicable', thz:null, up:'Passive or band-independent item.', src:'observed' },
};

/* ---------- chassis catalog: naming deck + V3.0 AUX geometry ---------- */
const CHASSIS = [
  { n:'G25',   series:'G20', depth:'—',      ff:'n/a', rows:null, slots:null, ru:null, life:'brownfield',
    note:'NID / pizza-box, no sleds. LH and subsea optimised. Drops out of greenfield.' },
  { n:'G30',   series:'G30', depth:'300 mm', ff:'FF1', rows:1, slots:4, ru:null, life:'brownfield',
    note:'Original Groove shelf. Not being renamed. Drops out of greenfield.' },
  { n:'G31',   series:'G30', depth:'600 mm', ff:'FF1', rows:1, slots:4, ru:1, life:'both',
    note:'Single controller only — which is why hyperscaler builds skip it.' },
  { n:'G32',   series:'G30', depth:'600 mm', ff:'FF1', rows:2, slots:8, ru:2, life:'both', note:'' },
  { n:'G32E',  series:'G30', depth:'600 mm', ff:'FF1', rows:2, slots:8, ru:2, life:'greenfield',
    note:'E = enables double-height slots. The only shelf that takes RD66.' },
  { n:'G32c',  series:'G30', depth:'300 mm', ff:'FF2', rows:2, slots:4, ru:2, life:'both',
    note:'Compact 2 RU. R9.3. Full ordering item set appeared in the Aug-2026 PN list.' },
  { n:'G34c',  series:'G30', depth:'300 mm', ff:'FF2', rows:4, slots:8, ru:4, life:'both',
    note:'The workhorse ILA shelf. 4 rows x 2 slots = 8 — not 4.' },
  { n:'G34Xc', series:'G30', depth:'300 mm', ff:'FF2', rows:4, slots:8, ru:4, life:'both',
    note:'X = backplane "Xross" pairing. High-speed backplane variant of G34c.' },
  { n:'G34L',  series:'G30', depth:'600 mm', ff:'FF1', rows:null, slots:8, ru:4, life:'greenfield',
    note:'L0 only. R9.2 on OpenConfig OS, R10.1 on Converged OS.' },
  { n:'G38c',  series:'G30', depth:'300 mm', ff:'FF2', rows:null, slots:16, ru:8, life:'greenfield',
    note:'Densest 300 mm shelf. LTR R10.1, GA R10.2.' },
  { n:'G42',   series:'G40', depth:'600 mm', ff:'FF3', rows:2, slots:4, ru:3, life:'both',
    note:'Transponder shelf — CHM6 / CHM7 / UCM4. G40-A+/D+/MA+ etc. are pre-bundled kits around it.' },
];

/* ---------- sled categories ---------- */
const SLED_CAT = [
  { c:'CHM', t:'Coherent Channel Module', r:'Transponders and muxponders' },
  { c:'UTM', t:'Universal Transponder Module', r:'ADM sled' },
  { c:'SPN', t:'Switchponder Module', r:'Switching sled (packet / L2)' },
  { c:'UCM', t:'Universal Channel Module (G40 only)', r:'10G grooming and ADM — UCM4 = 400G' },
  { c:'PTM', t:'Packet Transport Module', r:'PLE transport over pseudowires (R10.0)' },
];

const SLED_LETTERS = [
  ['G', 'Green — encryption capable'],
  ['R', 'R-class optics (ZR / XR / OR). R-800 = 800G'],
  ['T', 'CloudwaveT'],
  ['Q', 'QSFP-DD'],
  ['S', 'OSFP'],
  ['X', 'ICE-X TROSA'],
  ['MT', 'Metro'],
  ['SM', 'Super Metro'],
  ['C (uppercase, on a sled)', 'The G34c variant of that sled — UTM2C, SPN2C'],
  ['c (lowercase, on a chassis)', 'Compact, 300 mm depth'],
];

/* ---------- acronyms ---------- */
const ACRONYMS = [
  ['CHM','Coherent Channel Module'], ['UTM','Universal Transponder Module'],
  ['SPN','Switchponder Module'], ['UCM','Universal Channel Module (G40)'],
  ['OCC','Optical Carrier Card — T suffix = with timing (OCC2T)'],
  ['OFP / OFP2','Optical Formfactor Pluggable — sub-module form factor'],
  ['RPBM','Raman Pump Backward, Medium performance'],
  ['SGH','Switchable Gain, High performance'],
  ['ILA','Inline Amplifier — a site with amplification but no add/drop'],
  ['OLS','Optical Line System — the amplifier and ROADM layer'],
  ['OMD','Optical Mux/Demux — passive AWG'],
  ['DGE','Dynamic Gain Equaliser'], ['OTDR','Optical Time-Domain Reflectometer'],
  ['OPS / OPSM','Optical Protection Switch (Module)'],
  ['MRA','Multi-Rail Amplifier — four amplifier rails in one card'],
  ['BaaN','Blade as a Network Element — each sled managed as its own NE'],
  ['PLE','Private Line Emulation — transport over pseudowires'],
  ['FRU','Field Replaceable Unit'], ['FRCU','Field Replaceable Controller Unit'],
  ['PEM','Power Entry Module'], ['LTR','Lab Trial Readiness'], ['GA','General Availability'],
  ['CPQ','Configure Price Quote — the quoting hand-off'],
];

/* ---------- V3.0 configuration rules ---------- */
const V30_SLOTS = [
  { pn:'G3S-D2ILASGM-Z0',  sled:'D2ILA',    slots:4, cls:'ILA' },
  { pn:'G3S-C2ILASGH-X0',  sled:'BiDiEDFA', slots:2, cls:'ILA' },
  { pn:'G3S-C2RPBLZZ-W0',  sled:'Raman (backward, low span loss)', slots:2, cls:'ROADM' },
  { pn:'G3S-C2RPBMZZ-Y0',  sled:'Raman (backward, med perf)',      slots:2, cls:'ROADM' },
  { pn:'G3S-G1RPBMZZ-W0',  sled:'Raman (backward, med perf)',      slots:1, cls:'ROADM' },
  { pn:'G3S-G1RPBMZZ-Y0',  sled:'Raman (backward, med perf)',      slots:1, cls:'ROADM' },
  { pn:'G3S-G2PBALZZ-N0',  sled:'PBAL',    slots:2, cls:'ROADM' },
  { pn:'G3S-H3RD66TM-Z0',  sled:'RD66TM',  slots:3, cls:'ROADM', conflict:true },
  { pn:'G3S-H3RD66TH-Z0',  sled:'RD66TH',  slots:3, cls:'ROADM', conflict:true },
  { pn:'G3S-G3RD32TH-X0',  sled:'RD32TH',  slots:3, cls:'ROADM' },
  { pn:'G3S-C2RD12TI-W0',  sled:'RD12TI',  slots:2, cls:'ROADM' },
  { pn:'G3S-G2RD20TM-N0',  sled:'RD20TM',  slots:2, cls:'ROADM' },
  { pn:'G3S-G2RD09SM-N1',  sled:'RD09SM',  slots:2, cls:'ROADM' },
  { pn:'G3S-G1CAD10A-W0',  sled:'CAD10A',  slots:1, cls:'ROADM' },
  { pn:'G3S-G1CDC8D6-Y0',  sled:'CDC8D6',  slots:1, cls:'ROADM' },
  { pn:'GLS-G30OCC2T-00',  sled:'OCC2T',   slots:2, cls:'OFP2CC' },
  { pn:'G3S-C2OCC2EZ-00',  sled:'OCC2E',   slots:2, cls:'OFP2CC' },
  { pn:'ZXS-O2CAD16A-00',  sled:'CAD16',   slots:1, cls:'OFP2' },
  { pn:'ZXS-O2CDC4D4-Y0',  sled:'CDC4D4',  slots:1, cls:'OFP2' },
  { pn:'ZXS-O2OTSCSZ-W0',  sled:'OTSC',    slots:1, cls:'OFP2' },
  { pn:'ZXS-O2OTDR8E-Y0',  sled:'OTDR8E',  slots:1, cls:'OFP2' },
  { pn:'ZXS-O2BAXZZZ-00',  sled:'BAX',     slots:1, cls:'OFP2' },
];

const OMD_SHELVES = [
  { n:'OMD32E', ru:1 }, { n:'OMD40E', ru:1 }, { n:'OMD48S', ru:1 },
  { n:'OMD42-L', ru:2 }, { n:'OMD48E', ru:2 }, { n:'OMD64', ru:2 }, { n:'OMD64S', ru:2 },
];

/* ---------- corrections and open conflicts ---------- */
const CORRECTIONS = [
  { t:'“L” means L-band, not Super L', sev:'correction',
    d:'The naming deck is explicit: the band code L is base L-band. Super L only ever appears bundled into Y (Super C + Super L). Any page tagged Super L purely because the PN ends -L0 is wrong unless the source description says Super L in words.',
    hit:'G3S-C2ILASGH-L0 · G3S-G3RD32TH-L0 · ZXS-O2DGE2M2-L0' },
  { t:'RD66 slot cost — 3 or 6?', sev:'conflict',
    d:'The V3.0 configurator scores RD66TM/TH at 3 slots; the Aug-2026 roadmap deck says 6. Both are Nokia, same month. The likely reconciliation is that the deck counts half-height positions across a 2 RU sled while the tool counts within its row model — but V3.0 itself lists “RD66TM not fully modelled” as a known limitation, so neither can simply be trusted.',
    hit:'G3S-H3RD66TM-Z0 · G3S-H3RD66TH-Z0' },
  { t:'V3.0 power and weight rows carry neighbours’ values', sev:'conflict',
    d:'D2ILASGM-Z0 shows the BiDiEDFA figures (62/100/100 W, 2.4 kg) where PowerDraw says 110/145/180 W, 4.4 kg. C2RPBM-Y1/-Y2 show the RPBL figures. Rule: AUX is authoritative for slots and geometry, PowerDraw for power and weight.',
    hit:'G3S-D2ILASGM-Z0 · G3S-C2RPBMZZ-Y1 · G3S-C2RPBMZZ-Y2' },
  { t:'Form-factor letters H, R and D are undocumented', sev:'gap',
    d:'The naming deck lists G1–G4 and C1/C2 only. Real PNs also use H3/H4 (full-chassis multi-slot) and D2 (compact dual-stage), and the configurator’s chassis-family rule keys off G/H/R meaning 600 mm and C/D meaning 300 mm. The deck needs an update, or these are exceptions worth confirming.',
    hit:'G3S-H3RD66TM-Z0 · G3S-H4IRB4SG-Z2 · G3S-D2ILASGM-Z0' },
  { t:'OMDs are shelves, not cards', sev:'correction',
    d:'V3.0 models every OMD as its own chassis type with its own RU and no slot cost. Treating an OMD as a card in the termination shelf both consumes a slot it should not and hides 1–2 RU of passive shelf from the rack budget.',
    hit:'GQS-OMD32EZZ-N0 · GQS-OMD48EZZ-00 · GQS-OMD64ZZZ-00' },
  { t:'G34c has 8 slots, not 4', sev:'correction',
    d:'V3.0 AUX: 4 rows x 2 slots per row. The roadmap deck agrees. A 4-slot assumption undercounts shelves as soon as fibre-pair count rises.',
    hit:'G34c · G34Xc' },
];
