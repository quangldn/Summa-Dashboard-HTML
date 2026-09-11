/* ============================================================
   1830 GX PORTFOLIO — data
   Source of truth:
     · ON Consolidated Roadmap Aug 2026 — GX Transcend v1.0.pptx
       (slides 9–19: chassis, ROADM, amplifiers, Raman, hybrid,
        add/drop, muxponders; slides 21–35: release contents)
     · GX G30 Part Numbers (2026-08-06).xlsx  — ordering PNs
     · GX G40 PON List (Aug 2026).xlsx        — G42 PNs
     · 1830 GX PowerDraw R9.0_V1.xlsx          — measured power/weight
   Regenerate this file when a new quarterly roadmap lands.
   ============================================================ */

/* Releases in SHIP-DATE order — note R9.3 (Dec 2026) ships BEFORE
   R9.2 (Feb 2027), so release number is not a usable sort key. */
const RELEASES = [
  { k:'GA',     label:'GA',          date:'shipping',   ord:0,  shipped:true  },
  { k:'R9.0',   label:'R9.0',        date:'Apr 2026',   ord:1,  shipped:true  },
  { k:'R8.1',   label:'R8.1',        date:'2025',       ord:-1, shipped:true  },
  { k:'R9.1',   label:'R9.1',        date:'Aug 2026',   ord:2,  shipped:true  },
  { k:'R9.1.1', label:'R9.1.1',      date:'Sep 2026',   ord:3,  shipped:true  },
  { k:'R9.3',   label:'R9.3',        date:'Dec 2026',   ord:4,  shipped:false },
  { k:'R9.2',   label:'R9.2',        date:'Feb 2027',   ord:5,  shipped:false,
    note:'OpenConfig / multi-rail track — not targeted at traditional GX customers' },
  { k:'R10.0',  label:'R10.0',       date:'May 2027',   ord:6,  shipped:false },
  { k:'R10.1',  label:'R10.1',       date:'Aug 2027',   ord:7,  shipped:false },
  { k:'R10.2',  label:'R10.2',       date:'Dec 2027',   ord:8,  shipped:false },
  { k:'R11.x',  label:'R11.x/12.x',  date:'2028–2029',  ord:9,  shipped:false },
  { k:'TBD',    label:'TBD',         date:'unscheduled',ord:99, shipped:false },
];
const REL = Object.fromEntries(RELEASES.map(r => [r.k, r]));

/* Release highlights — what each release actually brings to the OLS. */
const RELEASE_NOTES = {
  'R9.0':   'Metro DCI OLS · CHMQ6 lab-trial · CHM7/7X encryption.',
  'R9.1':   'CHM7 L-band (LTR) · RD66 Express (LTR) · CHMQ6 full sled support.',
  'R9.1.1': 'CHM7 L-band GA · 800G QSFP-DD sled (CHMQ6) GA.',
  'R9.3':   'G32c 2RU 300 mm chassis · RD66TH · CHM7 Super-L + RD32 Super-L (LTR) · CHMS8 · 8-degree ROADM for HSC OLS · L0 protection (1:4 Super C+L OPSM).',
  'R9.2':   'Multi-rail OLS — C+L EDFA sled with built-in DGE/OTDR/OCM, passive AWG mux. OpenConfig API customers only (Google GLS on GX hardware).',
  'R10.0':  'Super C + Super L OLS and transponder · RD32TH-L · OMS protection on 600 mm HSC OLS · CHMS8 · PTM2C.',
  'R10.1':  '600 mm multi-rail hybrid Raman/EDFA · high-density Super C+L add/drop · 300 mm multi-rail ILA (LTR) · coherent sensing (subsea).',
  'R10.2':  '300 mm multi-rail hybrid Raman/EDFA GA · G38c GA · terrestrial coherent sensing.',
  'R11.x':  'Huron and Superior pluggable OT · G23 air-cooled and G12 liquid-cooled shelves · CHM8x · full C+L 2.4T/wave.',
};

/* status: 'ga' = available today · 'por' = plan of record · 'poi' = plan of intent */
const GX = [

/* ---------------------------------------------------------- CHASSIS 600mm */
{ cat:'chassis', grp:'Chassis — 600 mm', name:'G31', pn:'GQS-G31CHASZ-00', rel:'GA', status:'ga',
  shelf:['G31'], form:'1 RU / 600 mm', slots:4, ru:1, apps:'L0 and L1',
  spec:{ 'Service slots':'4', 'Controller FRU':'Single', 'I/O FRU':'Single',
         'Fans':'3 rear, 1:N', 'Power supply':'2 PSU rear, 1+1', 'PSU type':'AC / DC',
         'Mounting':'19" / 23" / sliding rails', 'Measured power':'93.5 W typ · 321 W max (w/ fans + FRCU + 2 PEM)',
         'Weight':'9.57 kg' },
  note:'Single controller only — excluded from hyperscaler builds for that reason.' },

{ cat:'chassis', grp:'Chassis — 600 mm', name:'G32', pn:'G3S-G32CHASZ-00', rel:'GA', status:'ga',
  shelf:['G32'], form:'2 RU / 600 mm', slots:8, ru:2, apps:'L0 and L1',
  spec:{ 'Service slots':'8 · 1 RU sleds', 'Controller FRU':'Single / dual (optional)', 'I/O FRU':'Dual',
         'Fans':'3 rear, 1:N', 'Power supply':'4 PSU rear, 1+1 or 1:N', 'PSU type':'AC / DC',
         'Mounting':'19" / 23" / sliding rails', 'Measured power':'140 W typ · 339 W max (w/ fans + FRCU + 3 PEM)',
         'Weight':'19.68 kg' } },

{ cat:'chassis', grp:'Chassis — 600 mm', name:'G32E', pn:'G3S-G32CHASE-00', rel:'GA', status:'ga',
  shelf:['G32E'], form:'2 RU / 600 mm', slots:8, ru:2, apps:'L0 and L1 (future)',
  spec:{ 'Service slots':'8 · 2 RU sleds', 'Controller FRU':'Single / dual (optional)', 'I/O FRU':'Dual',
         'Fans':'3 rear, 1:N', 'Power supply':'4 PSU rear, 1+1 or 1:N', 'PSU type':'AC / DC',
         'Mounting':'19" / 23" / sliding rails', 'Measured power':'inherits G32 baseline' },
  note:'The only shelf that takes RD66 — 2 RU sled height is what the 6-slot ROADM needs.' },

{ cat:'chassis', grp:'Chassis — 600 mm', name:'G34L', pn:null, rel:'R9.2', status:'por',
  shelf:['G34L'], form:'4 RU / 600 mm', slots:8, ru:4, apps:'L0 only',
  spec:{ 'Service slots':'8 · 1 and 2 RU sleds', 'Controller FRU':'Single / dual (optional)', 'I/O FRU':'Dual',
         'Fans':'3 rear, 1:N', 'Power supply':'2 PSU rear, 1+1', 'PSU type':'AC / DC',
         'Mounting':'19" / 23"' },
  note:'R9.2 on OpenConfig OS, R10.1 on Converged OS — the date you can quote depends on which OS the customer runs.' },

{ cat:'chassis', grp:'Chassis — 600 mm', name:'G42', pn:'G42', rel:'GA', status:'ga',
  shelf:['G42'], form:'3 RU / 600 mm', slots:4, ru:3, apps:'L1',
  spec:{ 'Service slots':'4', 'Controller FRU':'Single / dual (optional)', 'I/O FRU':'Single',
         'Fans':'5 rear, 1:N + 2 controller fans', 'Power supply':'4 PSU rear, 1+1 or 1:N', 'PSU type':'AC / DC',
         'Mounting':'19" / 23"', 'PEM capacity':'2200 W', 'Weight':'17.3 kg' },
  note:'Transponder shelf — CHM6 / CHM7 / UCM4. Not an OLS shelf.' },

/* ---------------------------------------------------------- CHASSIS 300mm */
{ cat:'chassis', grp:'Chassis — 300 mm', name:'G34c / G34Xc', pn:'G3S-G34CCHAS-00', rel:'GA', status:'ga',
  shelf:['G34c'], form:'4 RU / 300 mm', slots:8, ru:4, apps:'L0, L1, ILA',
  spec:{ 'Service slots':'8', 'Controller FRU':'Single / dual (optional)', 'I/O FRU':'Integrated with controller',
         'Fans':'2 front, 1+1', 'Power supply':'2 PSU front, 1+1', 'PSU type':'AC / DC',
         'Mounting':'19" / 23" / sliding rails', 'PEM capacity':'1300 W',
         'Measured power':'69 W typ · 89 W max@40 °C · 381 W max@55 °C (fan ramp)', 'Weight':'12.56 kg' },
  note:'The workhorse ILA shelf. G34Xc is the high-speed-backplane variant.' },

{ cat:'chassis', grp:'Chassis — 300 mm', name:'G32c', pn:'G3S-G32CCHAS-00', rel:'R9.3', status:'por',
  shelf:['G32c'], form:'2 RU / 300 mm', slots:4, ru:2, apps:'L0, L1, ILA',
  spec:{ 'Service slots':'4', 'Controller FRU':'Single', 'I/O FRU':'Integrated with controller',
         'Fans':'1 front', 'Power supply':'2 PSU front, 1+1', 'PSU type':'AC / DC',
         'Mounting':'19" / 23" / sliding rails' },
  note:'Full ordering item set appeared in the Aug-2026 PN list — controller, fan, AC and DC PEM, six mount kits including a 600 mm-cabinet baffle.' },

{ cat:'chassis', grp:'Chassis — 300 mm', name:'G38c', pn:null, rel:'R10.2', status:'poi',
  shelf:['G38c'], form:'8 RU / 300 mm', slots:16, ru:8, apps:'L0 · L1 TBC',
  spec:{ 'Service slots':'16', 'Controller FRU':'Single / dual (optional)', 'I/O FRU':'Integrated with controller',
         'Fans':'4 front, 1:N', 'Power supply':'TBD', 'PSU type':'AC / DC', 'Mounting':'19" / 23"' },
  note:'Lab-trial in R10.1, GA in R10.2. Densest 300 mm shelf — 16 slots.' },

/* ---------------------------------------------------------- ROADM */
{ cat:'roadm', grp:'ROADM modules', name:'RD09SM-N1', pn:'G3S-G2RD09SM-N1', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm', slots:2, deg:9, band:'4.8 THz — Std C',
  spec:{ 'WSS ports':'1 × 9', 'WSS type':'Single WSS, medium performance', 'Span loss (no Raman)':'0 – 30 dB',
         'L-band extendable':'No', 'Mid-stage access':'No', 'Direct connect':'Yes', 'Fixed add/drop':'Yes',
         'Colourless A/D':'CAD16 (max 16 ch)', 'CD A/D':'WS04 + CAD16', 'CDC A/D':'—' } },

{ cat:'roadm', grp:'ROADM modules', name:'RD20TM', pn:'G3S-G2RD20TM-N0', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm', slots:2, deg:20, band:'4.8 THz — Std C',
  spec:{ 'WSS ports':'1 × 20', 'WSS type':'Twin WSS, medium performance', 'Span loss (no Raman)':'0 – 32.5 dB',
         'L-band extendable':'No', 'Mid-stage access':'No', 'Direct connect':'Yes', 'Fixed add/drop':'Yes',
         'Colourless A/D':'CAD10', 'CDC A/D':'CDC8D6' } },

{ cat:'roadm', grp:'ROADM modules', name:'RD12TI', pn:'G3S-C2RD12TI-W0', rel:'GA', status:'ga',
  shelf:['G34c'], form:'300 mm', slots:2, deg:12, band:'6.1 THz — Super C',
  spec:{ 'WSS ports':'1 × 12', 'WSS type':'Twin WSS, intermediate range', 'Span loss (no Raman)':'0 – 29 dB',
         'L-band extendable':'No', 'Mid-stage access':'Yes', 'Direct connect':'Yes', 'Fixed add/drop':'Yes',
         'Colourless A/D':'CAD16', 'CDC A/D':'CDC4D4', 'Measured power':'80 W typ · 110 W max', 'Weight':'3.35 kg' },
  note:'The only compact-shelf ROADM — makes ROADM termination possible in a 300 mm rack today.' },

{ cat:'roadm', grp:'ROADM modules', name:'RD32TH-C', pn:'G3S-G3RD32TH-X0', rel:'GA', status:'ga',
  shelf:['G32','G32E'], form:'600 mm', slots:3, deg:32, band:'6.1 THz — Super C',
  spec:{ 'WSS ports':'1 × 32', 'WSS type':'Twin WSS, high performance', 'Span loss (no Raman)':'0 – 33 dB',
         'L-band extendable':'Yes — 1 upgrade port for Super L', 'Mid-stage access':'No', 'Direct connect':'Yes',
         'Fixed add/drop':'Yes', 'Colourless A/D':'CAD10', 'CDC A/D':'CDC8D6',
         'Measured power':'93 W typ · 130 W max', 'Weight':'3.8 kg' },
  note:'G32 / G32E only.' },

{ cat:'roadm', grp:'ROADM modules', name:'RD66TM', pn:'G3S-H3RD66TM-Z0', rel:'R8.1', status:'ga',
  shelf:['G32E'], form:'600 mm', slots:6, deg:66, band:'9.6 THz — Std C + L',
  spec:{ 'WSS ports':'1 × 66', 'WSS type':'Twin WSS, medium performance', 'Span loss (no Raman)':'0 – 33 dB',
         'Mid-stage access':'No', 'Direct connect':'Yes', 'Fixed add/drop':'No',
         'Colourless A/D':'Y-cable — R9.3 tbc', 'CDC A/D':'No',
         'Measured power':'185 W typ · 255 W max', 'Weight':'6.36 kg' },
  note:'One card covers C and L. G32E only — it needs the 2 RU sled height and six slots.' },

{ cat:'roadm', grp:'ROADM modules', name:'RD66TH', pn:'G3S-H3RD66TH-Z0', rel:'R9.3', status:'por',
  shelf:['G32E'], form:'600 mm', slots:6, deg:66, band:'9.6 THz — Std C + L',
  spec:{ 'WSS ports':'1 × 66', 'WSS type':'Twin WSS, high performance', 'Span loss (no Raman)':'0 – 33 dB',
         'Mid-stage access':'No', 'Direct connect':'Yes', 'Fixed add/drop':'No',
         'Colourless A/D':'Y-cable — R9.3 tbc', 'CDC A/D':'No' },
  note:'Moved out to R9.3 in the Aug-2026 roadmap — was previously tracked at R9.0.' },

{ cat:'roadm', grp:'ROADM modules', name:'RD32TH-L', pn:'G3S-G3RD32TH-L0', rel:'R10.0', status:'por',
  shelf:['G32','G32E'], form:'600 mm', slots:3, deg:32, band:'5.5 THz — Super L',
  spec:{ 'WSS ports':'1 × 32', 'WSS type':'Twin WSS, high performance', 'Span loss (no Raman)':'0 – 33 dB',
         'Mid-stage access':'No', 'Direct connect':'Yes', 'Fixed add/drop':'No',
         'Colourless A/D':'CAD4 in R10.1', 'CDC A/D':'CDC8D6' },
  note:'Pairs with RD32TH-C to build Super C + Super L. Lab-trial in R9.3, GA R10.0. The Aug-2026 PN sheet still shows a stale "R8.2 tbc" for this item.' },

/* ---------------------------------------------------------- AMPS C+L */
{ cat:'amp', grp:'Amplifiers — C + L', name:'O2BAXZZZ-00', pn:'ZXS-O2BAXZZZ-00', rel:'GA', status:'ga',
  shelf:['G31','G32','G30c'], form:'OFP2 module', slots:0, band:'4.8 THz — Std C',
  spec:{ 'EDFA type':'VGA — variable gain', 'Configurations':'Terminal', 'Span loss (no Raman)':'0 – 35 dB',
         'Max output power':'20.8 dBm', 'Max gain (no tilt)':'22 dB', 'NF at max gain':'5.2 dB',
         'Max power @55 °C':'11 W', 'Weight':'0.2 kg' } },

{ cat:'amp', grp:'Amplifiers — C + L', name:'PAOHxR-R6', pn:'81.71T-O2PAOHxR-R6', rel:'GA', status:'ga',
  shelf:['G31','G32','G30c'], form:'OFP2 module', slots:0, band:'4.8 THz — Std C',
  spec:{ 'EDFA type':'VGA — variable gain', 'Configurations':'Terminal (pre-amp)',
         'Max output power':'21.3 dBm', 'Max gain (no tilt)':'I / L / E: 18 / 26 / 35 dB',
         'NF at max gain':'I / L / E: 7.2 / 6.0 / 6.0 dB', 'Max power @55 °C':'11 W', 'Weight':'0.43 kg' },
  note:'Three reach variants: IR, LR, ER.' },

{ cat:'amp', grp:'Amplifiers — C + L', name:'D2ILASGM-Z0', pn:'G3S-D2ILASGM-Z0', rel:'GA', status:'ga',
  shelf:['G34c'], form:'300 mm · 4-slot, 2 RU', slots:4, band:'9.6 THz — Std C + L',
  spec:{ 'EDFA type':'SGA — switched gain', 'Configurations':'ILA / Terminal', 'Span loss (no Raman)':'0 – 30 dB',
         'Max output power':'21.8 dBm', 'Max gain (no tilt)':'27 dB', 'NF at max gain':'6.6 dB',
         'Mid-stage access':'No', 'Max power @55 °C':'180 W',
         'Measured power':'110 W typ · 145 W max@40 · 180 W max@55', 'Weight':'4.4 kg' },
  note:'Dual-stage C+L ILA amp with integrated OTDR and DGE — the default compact ILA card.' },

{ cat:'amp', grp:'Amplifiers — C + L', name:'G2PBALZZ-N0', pn:'G3S-G2PBALZZ-N0', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm · 2-slot, 1 RU', slots:2, band:'4.8 THz — Std C',
  spec:{ 'EDFA type':'VGA — variable gain', 'Configurations':'Terminal', 'Span loss (no Raman)':'0 – 30 dB',
         'Max output power':'22.3 dBm (BA) · 20.5 dBm (PA)', 'Max gain (no tilt)':'22 dB (BA) · 26 dB (PA)',
         'NF at max gain':'5.1 dB (BA) · 5.8 dB (PA)', 'Mid-stage access':'No', 'Max power @55 °C':'120 W' },
  note:'Booster for MUX-terminated sites. GA in R9.1 after an R9.0 proof-of-concept.' },

{ cat:'amp', grp:'Amplifiers — C + L', name:'G4ILA4SG-Z0 / G4ILA4SM-Z0', pn:'G3S-G4ILA4SM-Z0', rel:'R9.2', status:'por',
  shelf:['G34L','G32E'], form:'600 mm · 4-slot, 1 RU', slots:4, band:'9.6 THz — Std C + L', mra:true,
  spec:{ 'EDFA type':'SGA — switched gain', 'Configurations':'ILA / Terminal', 'Span loss (no Raman)':'0 – 30 dB',
         'Max output power':'22.5 dBm (C) · 21.5 dBm (L)', 'Max gain (no tilt)':'27 dB', 'NF at max gain':'6.0 dB',
         'Mid-stage access':'No', 'Max power @55 °C':'275 W (4 rails)' },
  note:'Four-rail multi-rail amp. SG variant R9.2 (OpenConfig, blade-as-a-NE), SM variant R10.0 on Converged OS. M = GX platform in/out, G = MSA standard.' },

/* ---------------------------------------------------------- AMPS Super C + Super L */
{ cat:'amp', grp:'Amplifiers — Super C + Super L', name:'C2ILASGH-X0', pn:'G3S-C2ILASGH-X0', rel:'GA', status:'ga',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'6.1 THz — Super C',
  spec:{ 'EDFA type':'SGA — switched gain', 'Configurations':'ILA / Terminal', 'Span loss (no Raman)':'0 – 33 dB',
         'Max output power':'22.9 dBm', 'Max gain (no tilt)':'28 dB', 'NF at max gain':'5.4 dB',
         'L-band extendable':'Yes', 'OSC capability':'OC3', 'Mid-stage access':'Yes', 'Integrated DGE':'No',
         'Max power @55 °C':'135 W', 'Measured power':'62 W typ · 90 W max', 'Weight':'2.4 kg' } },

{ cat:'amp', grp:'Amplifiers — Super C + Super L', name:'C2ILASQH-L0', pn:null, rel:'R10.0', status:'por',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'5.5 THz — Super L',
  spec:{ 'EDFA type':'SGA — switched gain', 'Configurations':'ILA', 'Span loss (no Raman)':'0 – 33 dB',
         'Max output power':'23.2 dBm', 'Max gain (no tilt)':'29.5 dB', 'NF at max gain':'7.9 dB',
         'Integrated DGE':'Yes', 'Mid-stage access':'No', 'Max power @55 °C':'120 W' } },

{ cat:'amp', grp:'Amplifiers — Super C + Super L', name:'C2ILASGH-L0', pn:'G3S-C2ILASGH-L0', rel:'R10.2', status:'poi',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'5.5 THz — Super L',
  spec:{ 'EDFA type':'SGA — switched gain', 'Configurations':'ILA', 'Span loss (no Raman)':'0 – 33 dB',
         'Max output power':'23.2 dBm', 'Max gain (no tilt)':'29.5 dB', 'NF at max gain':'7.8 dB',
         'Integrated DGE':'No', 'Mid-stage access':'No', 'Max power @55 °C':'110 W' },
  conflict:'The Aug-2026 PN sheet lists this PN at R9.1 on G34c; the Aug-2026 roadmap puts it at R10.2. Confirm with PLM before quoting a date.' },

{ cat:'amp', grp:'Amplifiers — Super C + Super L', name:'C2ILASGH-X1', pn:null, rel:'R10.2', status:'poi',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'6.1 THz — Super C',
  spec:{ 'EDFA type':'SGA — switched gain', 'Configurations':'ILA', 'Span loss (no Raman)':'0 – 33 dB',
         'Max output power':'24 dBm', 'Max gain (no tilt)':'28 dB', 'NF at max gain':'6.0 dB',
         'L-band extendable':'Yes', 'OSC capability':'OC3 (R10.2) · 1 GE future', 'Integrated DGE':'No',
         'Max power @55 °C':'90 W' } },

{ cat:'amp', grp:'Amplifiers — Super C + Super L', name:'C2ILASQH-X1', pn:null, rel:'R10.2', status:'poi',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'6.1 THz — Super C',
  spec:{ 'EDFA type':'SGA — switched gain', 'Configurations':'ILA', 'Span loss (no Raman)':'0 – 33 dB',
         'Max output power':'24 dBm', 'Max gain (no tilt)':'28 dB', 'NF at max gain':'6.0 dB',
         'L-band extendable':'Yes', 'OSC capability':'OC3 (R10.2) · 1 GE future', 'Integrated DGE':'Yes',
         'Max power @55 °C':'110 W' } },

/* ---------------------------------------------------------- RAMAN */
{ cat:'raman', grp:'Raman modules', name:'G1RPBM-Wx', pn:'G3S-G1RPBMZZ-W0 / -W1 / -W2', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm · 1-slot, 1 RU', slots:1, band:'6.1 THz — Super C',
  spec:{ 'Pumps':'4', 'Total pump power':'29.7 dBm', 'Max Raman gain':'8 – 18 dB', 'Span loss support':'12 – 48 dB',
         'DWDM port':'W0 recessed w/ 25 m cable · W1 LC adapter on faceplate · W2 duplex LC on faceplate',
         'Max power @55 °C':'80 W', 'Measured power':'33 W typ · 80 W max', 'Weight':'1.18 kg' } },

{ cat:'raman', grp:'Raman modules', name:'G1RPBM-Yx', pn:'G3S-G1RPBMZZ-Y0 / -Y1 / -Y2', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm · 1-slot, 1 RU', slots:1, band:'12.2 THz — Super C + Super L',
  spec:{ 'Pumps':'5', 'Total pump power':'29.7 dBm', 'Max Raman gain':'8 – 17 dB', 'Span loss support':'12 – 48 dB',
         'DWDM port':'Y0 recessed w/ 25 m cable · Y1 LC adapter · Y2 duplex LC on faceplate',
         'Max power @55 °C':'80 W', 'Measured power':'35 W typ · 80 W max', 'Weight':'1.18 kg' } },

{ cat:'raman', grp:'Raman modules', name:'C2RPBL-Wx', pn:'G3S-C2RPBLZZ-W0 / -W1 / -W2', rel:'GA', status:'ga',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'6.1 THz — Super C', unidir:true,
  spec:{ 'Pumps':'2', 'Total pump power':'28.3 dBm', 'Max Raman gain':'8 – 16 dB', 'Span loss support':'12 – 48 dB',
         'Max power @55 °C':'60 W', 'Measured power':'37 W typ · 60 W max', 'Weight':'1.96 kg' } },

{ cat:'raman', grp:'Raman modules', name:'C2RPBM-Yx', pn:'G3S-C2RPBMZZ-Y0 / -Y1 / -Y2', rel:'GA', status:'ga',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'12.2 THz — Super C + Super L', unidir:true,
  spec:{ 'Pumps':'6', 'Total pump power':'29.7 dBm', 'Max Raman gain':'8 – 18 dB', 'Span loss support':'12 – 48 dB',
         'Max power @55 °C':'102 W', 'Measured power':'54 W typ · 85 W max@40 · 102 W max@55', 'Weight':'1.96 kg' },
  note:'Unidirectional — two per fiber pair per ILA site, one per direction.' },

{ cat:'raman', grp:'Raman modules', name:'C2RPBL4-Z2', pn:null, rel:'R10.1', status:'por',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'9.6 THz — Std C + L',
  spec:{ 'Pumps':'4', 'Total pump power':'29.7 dBm', 'Max Raman gain':'8 – 18 dB', 'Span loss support':'12 – 48 dB',
         'DWDM port':'Duplex LC on faceplate', 'Max power @55 °C':'90 W (TBC)' } },

{ cat:'raman', grp:'Raman modules', name:'C2RPBM5-Y2', pn:null, rel:'R10.1', status:'por',
  shelf:['G34c'], form:'300 mm · 2-slot, 1 RU', slots:2, band:'12.2 THz — Super C + Super L',
  spec:{ 'Pumps':'5', 'Total pump power':'29.7 dBm', 'Max Raman gain':'8 – 18 dB', 'Span loss support':'12 – 48 dB',
         'DWDM port':'Duplex LC on faceplate', 'Max power @55 °C':'90 W (TBC)' } },

{ cat:'raman', grp:'Raman modules', name:'G2RPB4M-Y2', pn:'G3S-G2RPB4M-Y2', rel:'TBD', status:'poi',
  shelf:['G32E','G34L'], form:'600 mm · 2-slot, 1 RU', slots:2, band:'12.2 THz — Super C + Super L', mra:true,
  spec:{ 'Pumps':'16 TBC (4 amps)', 'Total pump power':'29.7 dBm', 'Max Raman gain':'8 – 18 dB',
         'Span loss support':'12 – 48 dB', 'DWDM port':'Y2 duplex LC on faceplate', 'Max power @55 °C':'200 W TBC (4 amps)' },
  conflict:'Roadmap shows TBD; the configurator previously carried R10.1. Treat the date as unconfirmed.' },

/* ---------------------------------------------------------- HYBRID */
{ cat:'hybrid', grp:'Hybrid Raman / EDFA', name:'D2IRB1SM-Z2', pn:'G3S-D2IRB1SM-Z2', rel:'R10.2', status:'poi',
  shelf:['G34c','G38c'], form:'300 mm · 4-slot, 2 RU', slots:4, band:'9.6 THz — Std C + L',
  spec:{ 'Configurations':'ILA', 'Max output power':'22.5 dBm (C) · 20.5 dBm (L)',
         'Max gain with Raman':'40 dB', 'Raman wavelengths':'4', 'Total Raman pump power':'29.7 dBm',
         'Span loss with Raman':'0 – 42 dB', 'Special features':'DGE and OTDR integrated',
         'DWDM port':'Z2 duplex LC on faceplate', 'Max power @55 °C':'180 W' },
  note:'Demo in R10.0, LTR R10.1, GA R10.2 — EDFA and Raman in one compact card.' },

{ cat:'hybrid', grp:'Hybrid Raman / EDFA', name:'H4IRB4SG-Z2 / H4IRB4SM-Z2', pn:'G3S-H4IRB4SG-Z2', rel:'R10.1', status:'por',
  shelf:['G34L','G32E'], form:'600 mm · 8-slot, 2 RU', slots:8, band:'9.6 THz — Std C + L', mra:true,
  spec:{ 'Configurations':'ILA / Terminal', 'Max output power':'22.5 dBm (C) · 21.5 dBm (L)',
         'Max gain with Raman':'40 dB', 'Raman wavelengths':'5', 'Total Raman pump power':'30.5 dBm',
         'Span loss with Raman':'0 – 45 dB (TBC)', 'Special features':'DGE and OTDR integrated',
         'DWDM port':'Z2 duplex LC on faceplate', 'Max power @55 °C':'550 W (4 rails, TBC)' },
  note:'Eight slots — a G32E or G34L carries exactly one.' },

/* ---------------------------------------------------------- ADD/DROP */
{ cat:'ad', grp:'Add / drop modules', name:'CAD10A-W0', pn:'G3S-G1CAD10A-W0', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm · 1-slot', slots:1, band:'6.1 THz — Super C',
  spec:{ 'Add/drop type':'Colourless', 'Ports':'1 : 10', 'Amplifier':'Variable-gain EDFA',
         'ROADM compatibility':'RD20 / RD32 / RD66', 'Measured power':'24 W typ · 30 W max', 'Weight':'1.0 kg' } },

{ cat:'ad', grp:'Add / drop modules', name:'CDC8D6-Y0', pn:'G3S-G1CDC8D6-Y0', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm · 1-slot', slots:1, band:'12.2 THz — Super C + Super L',
  spec:{ 'Add/drop type':'CDC', 'Ports':'6 add/drop × 8 directions', 'Amplifier':'No',
         'ROADM compatibility':'RD20 / RD32 / RD66', 'Measured power':'8.9 W typ · 9.6 W max', 'Weight':'1.0 kg' } },

{ cat:'ad', grp:'Add / drop modules', name:'CDC4D4-Y0', pn:'ZXS-O2CDC4D4-Y0', rel:'GA', status:'ga',
  shelf:['G31','G32','G34c'], form:'OFP2 module', slots:0, band:'12.2 THz — Super C + Super L',
  spec:{ 'Add/drop type':'CDC', 'Ports':'4 add/drop × 4 directions', 'Amplifier':'No',
         'ROADM compatibility':'RD12', 'Measured power':'0.4 W typ · 0.5 W max', 'Weight':'0.16 kg' } },

{ cat:'ad', grp:'Add / drop modules', name:'CAD16A-N0', pn:'ZXS-O2CAD16A-00', rel:'GA', status:'ga',
  shelf:['G31','G32','G34c'], form:'OFP2 module', slots:0, band:'4.8 THz — Std C',
  spec:{ 'Add/drop type':'Colourless', 'Ports':'1 : 16', 'Amplifier':'Variable-gain EDFA',
         'ROADM compatibility':'RD09', 'Measured power':'9 W typ · 11 W max', 'Weight':'0.2 kg' } },

{ cat:'ad', grp:'Add / drop modules', name:'CAD4AD-W0', pn:null, rel:'R10.1', status:'por',
  shelf:['G31','G32'], form:'600 mm · 1-slot', slots:1, band:'6.1 THz — Super C',
  spec:{ 'Add/drop type':'Colourless', 'Ports':'1 : 4 × 2 — 8 A/D ports total', 'Amplifier':'Variable-gain EDFA',
         'ROADM compatibility':'RD20 / RD32' } },

{ cat:'ad', grp:'Add / drop modules', name:'CAD4AD-L0', pn:null, rel:'R10.1', status:'por',
  shelf:['G31','G32'], form:'600 mm · 1-slot', slots:1, band:'5.5 THz — Super L',
  spec:{ 'Add/drop type':'Colourless', 'Ports':'1 : 4 × 2 — 8 A/D ports total', 'Amplifier':'Variable-gain EDFA',
         'ROADM compatibility':'RD32' },
  note:'Unlocks colourless add/drop on the Super L side of a Super C + Super L build.' },

/* ---------------------------------------------------------- XPONDERS — G42 */
{ cat:'xpdr', grp:'Transponders — G42 (3 RU / 600 mm)', name:'CHM6-xx', pn:'CHM6-C4 / -C6 / -C8', rel:'GA', status:'ga',
  shelf:['G42'], form:'G42 sled', band:'ICE-6 · 96 GBaud', line:'2 × 800G embedded',
  spec:{ 'Line side':'2 × 800G embedded · programmable 100G–800G · BPSK–64QAM + PCS · 32–96 GBaud · FEC 20% / 33% · extended L-band',
         'Client side':'16 × 100G / 4 × 400G', 'Client types':'100GE, 400GE, OTU4',
         'Encryption':'ODUk AES-256 (R6.2)', 'Regeneration':'3R supported',
         'Protection':'SNC, Y-cable · digital triggers over FlexILS · over GX OLS from R9.0', 'Weight':'4.3 kg' } },

{ cat:'xpdr', grp:'Transponders — G42 (3 RU / 600 mm)', name:'CHM7-xx', pn:'CHM7D-C6 / -C8', rel:'GA', status:'ga',
  shelf:['G42'], form:'G42 sled', band:'ICE-7 · 140 GBaud', line:'2 × 1.2T embedded',
  spec:{ 'Line side':'2 × 1200G embedded · programmable 100G–1200G',
         'Client side':'100G breakout / 6 × 400G / 3 × 800G',
         'Client types':'100GE, 400GE, OTU4 · 800GE DR8/LR8 (R9.3) · 800GE FR4/LR4 (R10.0)',
         'Encryption':'ODUk AES-256', 'Regeneration':'3R supported (R9.1)',
         'Protection':'digital triggers over FlexILS (R9.3) and GX OLS (R10.0) · SNC 100GE/OTU4 (R9.3) · SNC 400GE (R10.0)',
         'Weight':'4.1 kg' } },

{ cat:'xpdr', grp:'Transponders — G42 (3 RU / 600 mm)', name:'UCM4', pn:'GX-UCM4', rel:'GA', status:'ga',
  shelf:['G42'], form:'G42 sled', band:'grey', line:'4 × 100G client-only',
  spec:{ 'Line side':'4 × 100G grey QSFP28 — ODU4 LR4', 'Client side':'40 × 10G / 4 × 100G',
         'Client types':'100GbE, 10GbE, OTU2, OTU2e, OC192, STM64',
         'Encryption':'ODUk AES-256 (HW ready)', 'Protection':'Y-cable', 'Weight':'3.54 kg' } },

/* ---------------------------------------------------------- XPONDERS — G31/G32 */
{ cat:'xpdr', grp:'Transponders — G31 / G32 (600 mm)', name:'CHM7X', pn:'G3S-G2CHM7XC06EF-W0 (Type 6/8/14)', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm sled', band:'ICE-7', line:'2 × 1.2T embedded',
  spec:{ 'Client side':'400G DR4 (400GE, 4×100GE) · 400G XDR',
         'Client types':'100GE, OTU4, 200GE, 400GE, 800GE · 400GE split 2×200G · 800GE split 2×400G · OTN+Eth mixing not supported',
         'Encryption':'ODUk AES-256 (R9.1)', 'Regeneration':'3R support (R9.3)',
         'Switching':'flexible 100G routing · 2×400G, 8×100G per line · client splitting',
         'Protection':'OCh protection with OPSM · digital triggers (R10.0)',
         'Measured power':'330 W typ · 345 W max@40 · 360 W max@55', 'Weight':'2.96 kg' } },

{ cat:'xpdr', grp:'Transponders — G31 / G32 (600 mm)', name:'CHMQ6', pn:'G3S-G1CHMQ6Z-00', rel:'R9.1.1', status:'ga',
  shelf:['G31','G32'], form:'600 mm sled', band:'ICE-X pluggable', line:'3 × 800G QSFP-DD',
  spec:{ 'Line side':'3 × 800G DWDM · ICE-X 400G/800G QSFP-DD',
         'Client types':'100GE, 400GE', 'Encryption':'MACsec up to 2 × 800G line',
         'Regeneration':'3R support (R10.0)', 'Switching':'flexible 100G routing · client splitting',
         'Protection':'OCh protection with OPSM · SNC (R10.0) · digital triggers (R10.1)',
         'Measured power':'176 W typ · 201 W max', 'Weight':'1.5 kg' },
  note:'High-density thin muxponder — the low-cost Metro DCI play.' },

{ cat:'xpdr', grp:'Transponders — G31 / G32 (600 mm)', name:'CHMS8', pn:null, rel:'R10.0', status:'por',
  shelf:['G31','G32'], form:'600 mm sled', band:'ICE-X pluggable', line:'4 × 800G OSFP',
  spec:{ 'Line side':'4 × 800G DWDM · ICE-X 400G/800G OSFP · 8 ports',
         'Encryption':'MACsec', 'Regeneration':'3R support',
         'Switching':'flexible 100G routing · client splitting', 'Protection':'OCh protection with OPSM · SNC' },
  note:'3.2T OSFP thin muxponder. Lab-trial in R9.3.' },

{ cat:'xpdr', grp:'Transponders — G31 / G32 (600 mm)', name:'SPN2', pn:'G3S-G2SPN2ZZ-00', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm sled', band:'pluggable', line:'4 × up to 400G',
  spec:{ 'Line side':'4 × up to 400G pluggable', 'Client side':'6 × QSFP-DD/56/28/+ cages — 10G to 400G',
         'Client types':'10GE, OTU2/2e, 100GE, OTU4, FC32, 400GE', 'Encryption':'ODUk AES-256 (HW ready)',
         'Switching':'ADM support · OTN switch · SNC protection · hairpin',
         'Protection':'unidirectional 1+1 SNC', 'Measured power':'205 W typ · 220 W max', 'Weight':'2.45 kg' } },

{ cat:'xpdr', grp:'Transponders — G31 / G32 (600 mm)', name:'CHM1R', pn:'GLS-G30CHM1R-00', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm sled', band:'coherent', line:'up to 400G',
  spec:{ 'Line side':'100G/200G QPSK · 200G 16QAM · 300G 8QAM · 400G 16QAM',
         'Client side':'4 × 100GE/OTU4 · 8 × 100GE · 2 × 400GE', 'Client types':'400GE, 100GE, OTU4',
         'Encryption':'ODUk AES-256 (R6.0)', 'Regeneration':'3R support',
         'Measured power':'108 W typ · 120 W max', 'Weight':'1.48 kg' } },

{ cat:'xpdr', grp:'Transponders — G31 / G32 (600 mm)', name:'CHM2TX', pn:'GLS-CHM2TMTX-01', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm sled', band:'coherent', line:'100G – 500G',
  spec:{ 'Line side':'100G to 500G · 27% and 15% SDFEC',
         'Client side':'up to 10 × 100G/OTU4 or 2 × 400G, or a mix up to 2 × 500G',
         'Client types':'400GE, 100GE, OTU4', 'Encryption':'ODUk AES-256 (HW ready)',
         'Measured power':'240 W typ · 270 W max', 'Weight':'1.9 kg' } },

{ cat:'xpdr', grp:'Transponders — G31 / G32 (600 mm)', name:'UTM2', pn:'G3S-G30UTM2Z-01', rel:'GA', status:'ga',
  shelf:['G31','G32'], form:'600 mm sled', band:'pluggable', line:'2 × 200G CFP2-DCO',
  spec:{ 'Line side':'2 × 200G pluggable · 2 × CFP2-DCO · 100G QPSK, 200G 8QAM, 200G 16QAM · 15% FEC',
         'Client side':'2 × 100G / 20 × 10G / 12 × 1GE',
         'Client types':'10GE, OC192/STM64, OTU2/2e, 1GbE, STM16/OC48, BiDi SFP+',
         'Encryption':'ODUk AES-256 (HW ready)', 'Switching':'ADM support',
         'Protection':'unidirectional 1+1 SNC', 'Measured power':'128 W typ · 135 W max', 'Weight':'1.6 kg' } },

/* ---------------------------------------------------------- XPONDERS — G34c */
{ cat:'xpdr', grp:'Transponders — G34c (300 mm)', name:'SPN2c', pn:'G3S-C2SPN2CZ-00', rel:'GA', status:'ga',
  shelf:['G34c'], form:'300 mm sled', band:'pluggable', line:'4 × up to 400G',
  spec:{ 'Line side':'4 × up to 400G pluggable, 4 × QSFP-DD · FlexO or XR · OTN/OFEC, XR/SDFEC',
         'Client side':'6 × QSFP-DD/56/28/+ cages — 10G to 400G',
         'Client types':'10GE, OTU2/2e, 100GE, OTU4, FC32, 400GE', 'Encryption':'ODUk AES-256 (HW ready)',
         'Switching':'ADM support · OTN switch · hairpin', 'Regeneration':'HW ready up to 300G',
         'Protection':'unidirectional 1+1 SNC', 'Measured power':'190 W typ · 210 W max', 'Weight':'2.3 kg' } },

{ cat:'xpdr', grp:'Transponders — G34c (300 mm)', name:'PTM2C', pn:'G3S-C2PTM2CZ-00', rel:'R10.0', status:'por',
  shelf:['G32c','G34c'], form:'300 mm sled', band:'pluggable', line:'2 × 400G PLE',
  spec:{ 'Line side':'2 × QSFP-DD pluggable · 400GE line rate · PLE transport via pseudowires · P2P today, switched PSN future',
         'Client side':'16 × SFP+ (10G) · 3 × QSFP28 (100G)',
         'Client types':'10GE, OTU2/2e, 100GE, OTU4',
         'Switching':'bit-transparent client mapping to PLE · ODU4/ODU2 mux-demux future',
         'Protection':'1+1 pseudowire redundancy' },
  note:'First item to carry a release in the new G32c column of the Aug-2026 PN list.' },
];

/* ============================================================
   Derived fields — parsed from the spec strings above so the data
   stays human-editable. Adding a module means writing prose specs,
   not maintaining a parallel set of numbers.
   ============================================================ */
(function derive() {
  const num  = t => { const m = String(t).match(/-?[\d.]+/); return m ? parseFloat(m[0]) : null; };
  const nums = t => (String(t).match(/-?[\d.]+/g) || []).map(parseFloat);
  const max  = t => { const a = nums(t); return a.length ? Math.max(...a) : null; };
  const yes  = t => /^yes/i.test(String(t || ''));

  GX.forEach(d => {
    const sp = d.spec || {};
    const g = k => sp[k];
    const any = (...keys) => { for (const k of keys) if (sp[k] != null) return sp[k]; return null; };

    d.thz    = num((d.band || '').match(/([\d.]+)\s*THz/i)?.[1]);
    d.nf     = num(g('NF at max gain'));
    d.pout   = max(any('Max output power'));
    d.gain   = max(any('Max gain (no tilt)', 'Max gain with Raman'));
    d.spanHi = max(any('Span loss (no Raman)', 'Span loss support', 'Span loss with Raman'));
    d.pw55   = num(any('Max power @55 °C'));
    d.kg     = num(g('Weight'));
    d.pumps  = num(any('Pumps', 'Raman wavelengths'));
    d.ports  = num(any('WSS ports', 'Ports'));

    const cfg  = String(any('Configurations', 'Supported configurations') || '');
    const feat = [g('Special features'), d.note, JSON.stringify(sp)].join(' ');
    d.caps = {
      mra:      !!d.mra,
      unidir:   !!d.unidir,
      dge:      yes(g('Integrated DGE')) || /\bDGE\b/.test(feat),
      otdr:     /OTDR/i.test(feat),
      midstage: yes(g('Mid-stage access')),
      lext:     yes(g('L-band extendable')),
      term:     /terminal/i.test(cfg),
      ila:      /\bILA\b/.test(cfg),
      osc:      !!g('OSC capability'),
      amp:      /EDFA|amplifier/i.test(String(any('Amplifier', 'EDFA type') || '')) &&
                !/^no$/i.test(String(g('Amplifier') || '')),
      encrypt:  /AES-256|MACsec/i.test(String(g('Encryption') || g('Encryption capabilities') || '')),
      regen:    /3R/i.test(String(g('Regeneration') || '')),
      protect:  !!g('Protection'),
    };
  });
})();

/* Which add/drop structures each ROADM takes — read off the ROADM table so the
   detail view can answer "what pairs with this?" both ways. */
const AD_PAIRS = (() => {
  const map = new Map();
  GX.filter(d => d.cat === 'roadm').forEach(r => {
    const txt = [r.spec['Colourless A/D'], r.spec['CD A/D'], r.spec['CDC A/D']].filter(Boolean).join(' ');
    map.set(r.name, txt);
  });
  return map;
})();
