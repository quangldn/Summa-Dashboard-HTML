/* ==========================================================================
   SUMMA — GX BOM engine
   --------------------------------------------------------------------------
   Pure functions over assets/gx-rules.json. No DOM, so the same file runs in
   the browser and under node for the regression harness.

   It follows the workbook's own Update_BOM order, because that order is what
   a Nokia BOM is checked against:

     1  chassis kit
     2  power configuration  (+ power cables, one per PEM)
     3  ethernet cables
     4  mounting kit
     5  controller configuration
     6  dust filter / air baffle / cable guide   (guide is dropped if a
        filter is fitted — the two share the same front position)
     7  sleds and slot fillers, plus each sled's own software PON
     8  line modules / cage fillers
     9  client pluggables
    10  embedded GX OS   (NE type x release x level x controller redundancy)
    11  encryption support
    12  NMS licences     (+ L0 restoration, L0/L1 automation)

   Weight and power are then rolled up from the finished BOM by PON, exactly
   as Process_Power_Weigth does: category CHASSIS counts as chassis power,
   everything else as sled power.
   ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GXBOM = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let R = null;                      // the rule set

  const NA = v => v === null || v === undefined || v === '' ||
                  v === 'NA' || v === 'N/A';

  /* The PON master's own type codes, in the order a Nokia BOM reads. */
  const TYPE_ORDER = ['KT', 'HW', 'SW', 'NSW', 'ASW', 'IBW', 'SV'];
  const TYPE_LABEL = {
    KT: 'Kits and common equipment',
    HW: 'Hardware',
    SW: 'Element software',
    NSW: 'Node software',
    ASW: 'Application software',
    IBW: 'Bandwidth licences',
    SV: 'Services',
  };

  function init(rules) { R = rules; return api; }
  function rules() { return R; }

  /* ---------------------------------------------------------------- lookup */

  function list(name) {
    if (NA(name)) return [];
    return R.optionLists[name] || R.optionLists[name + '_LIST'] || [];
  }

  function ponInfo(pon) {
    return R.pons[pon] || null;
  }

  function itemInfo(pon) {
    return R.items[pon] || null;
  }

  function chassisNames() {
    return Object.keys(R.chassis).filter(n => (R.chassis[n].slotGroups || []).length);
  }

  function chassis(name) { return R.chassis[name] || null; }

  function variant(chassisName, kitPon) {
    const c = chassis(chassisName);
    if (!c) return null;
    return c.variants.find(v => v.kitPon === kitPon) || c.variants[0] || null;
  }

  /* ------------------------------------------------------------ slot model */

  /* The legality tables are keyed by a short chassis token ("G34c") while the
     chassis itself is named "G34c/G34Xc"; slotGroups carries the link. */
  function legalityFor(chassisName, group) {
    const c = chassis(chassisName);
    if (!c || !group) return [];
    const key = c.legalityChassis || chassisName.split('/')[0];
    const g = (R.slotLegality[key] || {})[group];
    return g || [];
  }

  function sledWidth(chassisName, slotIndex, sledName) {
    const c = chassis(chassisName);
    const group = (c.slotGroups || [])[slotIndex];
    const row = legalityFor(chassisName, group).find(e => e.sled === sledName);
    if (row) return row.width || 1;
    const s = R.sleds[sledName];
    return (s && s.slots) || 1;
  }

  /* Slot layout with multi-slot cards resolved.

     A width-N card sits in its own slot and swallows the N-1 slots after it.
     Those become 'covered': they hold nothing and must not be offered. This
     is why G34c's even slots list only EMPTY — every card there is width 2
     and is placed from the odd slot beside it. */
  function slotPlan(cfg) {
    const c = chassis(cfg.chassisType);
    if (!c) return [];
    const groups = c.slotGroups || [];
    const n = groups.length;
    const plan = [];
    /* Slot *numbers* follow the UI grid, which can be wider than the service
       slot count: G32 has four cards per row but five grid columns, so its
       second row is labelled 6-9, not 5-8. The workbook numbers them that way
       and so does the label on the chassis, so match it. */
    const perRow = c.sledSlotsPerRow || c.slotsPerRow || n;
    const uiPerRow = c.slotsPerRow || perRow;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / perRow);
      plan.push({
        index: i,
        row: row,
        column: i % perRow,
        label: String((c.startSlot || 1) + row * uiPerRow + (i % perRow)),
        group: groups[i],
        sled: null,
        width: 1,
        covered: false,
        coveredBy: null,
        overflow: false,
      });
    }
    for (let i = 0; i < n; i++) {
      const sled = (cfg.slots[i] || {}).sled;
      if (NA(sled) || sled === 'EMPTY') continue;
      if (plan[i].covered) continue;
      const w = sledWidth(cfg.chassisType, i, sled);
      plan[i].sled = sled;
      plan[i].width = w;
      for (let k = 1; k < w; k++) {
        if (i + k >= n) { plan[i].overflow = true; break; }
        plan[i + k].covered = true;
        plan[i + k].coveredBy = i;
      }
    }
    return plan;
  }

  /* What may go in this slot, given what is already placed around it. */
  function legalSleds(cfg, slotIndex) {
    const c = chassis(cfg.chassisType);
    if (!c) return [];
    const plan = slotPlan(cfg);
    const n = plan.length;
    const group = (c.slotGroups || [])[slotIndex];
    const out = [];
    for (const e of legalityFor(cfg.chassisType, group)) {
      if (e.sled === 'EMPTY') { out.push({ sled: 'EMPTY', width: 1, fits: true }); continue; }
      const w = e.width || 1;
      let fits = true, why = null;
      if (slotIndex + w > n) { fits = false; why = 'runs past the last slot'; }
      for (let k = 1; k < w && fits; k++) {
        const t = plan[slotIndex + k];
        if (t.sled) { fits = false; why = 'slot ' + t.label + ' is taken by ' + t.sled; }
        else if (t.covered && t.coveredBy !== slotIndex) {
          fits = false; why = 'slot ' + t.label + ' is covered by ' + plan[t.coveredBy].sled;
        }
      }
      const s = R.sleds[e.sled];
      out.push({
        sled: e.sled, width: w, fits: fits, why: why,
        category: s ? s.classification : null,
        pons: s ? s.requiredPons : [],
      });
    }
    return out;
  }

  /* Cage / port model for a placed sled.
     linePluggableSlots[j] = line cages on the j-th slot of the card,
     clientCages[j]        = client cages on the j-th slot. A width-2 card
     therefore has two independent banks, and the workbook validates each
     against its own list (CLIENT VALIDATION S1/S2/S3). */
  function sledPorts(sledName) {
    const s = R.sleds[sledName];
    if (!s) return { line: [], client: [] };
    const lineTable = s.lineValidationTable;
    const line = [];
    (s.linePluggableSlots || []).forEach((cnt, j) => {
      for (let i = 0; i < (cnt || 0); i++) {
        line.push({ bank: j, index: i, table: lineTable });
      }
    });
    const client = [];
    (s.clientCages || []).forEach((cnt, j) => {
      const table = (s.clientValidationTables || [])[j] ||
                    (s.clientValidationTables || [])[0];
      for (let i = 0; i < (cnt || 0); i++) {
        client.push({ bank: j, index: i, table: table });
      }
    });
    return { line: line, client: client };
  }

  /* ------------------------------------------------------------- BOM build */

  function Bom() {
    this.lines = [];
    this.index = new Map();
    this.warnings = [];
  }
  Bom.prototype.add = function (pon, qty, source) {
    if (NA(pon)) return;
    const each = Array.isArray(pon) ? pon : String(pon).split(';');
    const inc = qty === undefined ? 1 : qty;
    for (let p of each) {
      p = String(p).trim();
      if (!p || p === 'NA') continue;
      if (this.index.has(p)) {
        const line = this.index.get(p);
        line.qty += inc;
        if (source && line.sources.indexOf(source) < 0) line.sources.push(source);
        continue;
      }
      const info = ponInfo(p) || {};
      const line = {
        pon: p,
        description: info.description || (itemInfo(p) || {}).sled || '',
        family: info.productFamily || null,
        category: info.productCategory || null,
        type: info.type || null,
        typeLabel: TYPE_LABEL[info.type] || 'Other',
        phase: info.itemPhase || null,
        salesStatus: info.salesStatus || null,
        materialNumber: info.materialNumber || null,
        availability: info.availability || null,
        qty: inc,
        sources: source ? [source] : [],
        known: !!ponInfo(p),
      };
      this.lines.push(line);
      this.index.set(p, line);
    }
  };

  function optionRow(table, name) {
    const rows = (R.adders.power[table] || R.adders.power[table + '_LIST'] ||
                  R.adders.controller[table] || R.adders.controller[table + '_LIST'] ||
                  R.adders.mountKits[table] || R.adders.mountKits[table + '_LIST'] ||
                  R.adders.cables[table] || R.adders.cables[table + '_LIST'] || []);
    return rows.find(r => (r.option || r.description) === name) || null;
  }

  function powerOptions(cfg) {
    const v = variant(cfg.chassisType, cfg.variant);
    if (!v || NA(v.powerOptionsTable)) return [];
    return R.adders.power[v.powerOptionsTable + '_LIST'] ||
           R.adders.power[v.powerOptionsTable] || [];
  }
  function controllerOptions(cfg) {
    const v = variant(cfg.chassisType, cfg.variant);
    if (!v || NA(v.controllerOptionsTable)) return [];
    return R.adders.controller[v.controllerOptionsTable + '_LIST'] ||
           R.adders.controller[v.controllerOptionsTable] || [];
  }
  function mountKitOptions(cfg) {
    const v = variant(cfg.chassisType, cfg.variant);
    if (!v || NA(v.mountingKitsTable)) return [];
    return R.adders.mountKits[v.mountingKitsTable + '_LIST'] ||
           R.adders.mountKits[v.mountingKitsTable] || [];
  }
  function powerCableOptions(cfg) {
    const v = variant(cfg.chassisType, cfg.variant);
    if (!v || NA(v.powerCablesTable) || /IN THE KIT/i.test(v.powerCablesTable)) return [];
    return R.adders.cables[v.powerCablesTable + '_LIST'] ||
           R.adders.cables[v.powerCablesTable] || [];
  }
  function ethernetCableOptions(cfg) {
    const v = variant(cfg.chassisType, cfg.variant);
    if (!v || NA(v.ethernetCables) || /LOCAL PROCUREMENT/i.test(v.ethernetCables)) return [];
    return R.adders.cables[v.ethernetCables + '_LIST'] ||
           R.adders.cables[v.ethernetCables] || [];
  }

  function releasesFor(chassisName) {
    const row = (R.releases.NE_RELEASE_LIST || [])
      .find(r => r.NE === chassisName);
    const key = row ? String(row['RELEASE LIST']).replace(/S$/, '_LIST') : 'GX_RELEASE_LIST';
    return R.releases[key] || R.releases.GX_RELEASE_LIST || [];
  }

  function nmsTable(chassisName) {
    const stem = chassisName.split('/')[0];
    return R.licences.nms[stem + '_NMS_PONS_MAPPING'] || [];
  }

  function defaultConfig(chassisName) {
    const c = chassis(chassisName);
    const v = (c && c.variants[0]) || null;
    const n = (c && (c.slotGroups || []).length) || 0;
    const pw = v ? (R.adders.power[v.powerOptionsTable + '_LIST'] || []) : [];
    const ct = v ? (R.adders.controller[v.controllerOptionsTable + '_LIST'] || []) : [];
    return {
      name: chassisName + ' config',
      chassisType: chassisName,
      variant: v ? v.kitPon : null,
      powerOption: pw.length ? pw[0].option : null,
      controllerOption: ct.length ? ct[0].option : null,
      mountingKit: null,
      powerCable: null,
      ethernetCable: null,
      dustFilter: false,
      airBaffle: false,
      cableGuide: false,
      fillers: true,
      release: (releasesFor(chassisName)[0]) || null,
      swLevel: 'Basic',
      encryption: false,
      nmsEnable: false,
      nmsType: (nmsTable(chassisName)[0] || {}).configType || null,
      l0Restoration: false,
      l0l1Automation: false,
      slots: Array.from({ length: n }, () => ({ sled: 'EMPTY', line: {}, client: {} })),
    };
  }

  function buildBOM(cfg) {
    const bom = new Bom();
    const c = chassis(cfg.chassisType);
    if (!c) { bom.warnings.push('unknown chassis ' + cfg.chassisType); return finish(bom, cfg); }
    const v = variant(cfg.chassisType, cfg.variant);
    if (!v) { bom.warnings.push('no chassis kit selected'); return finish(bom, cfg); }

    /* 1 — chassis kit */
    bom.add(v.kitPon, 1, 'chassis');

    /* 2 — power configuration, then one power cable per PEM */
    let pemCount = 0;
    if (cfg.powerOption) {
      const row = powerOptions(cfg).find(r => r.option === cfg.powerOption);
      if (row) {
        pemCount = row.pemCount || 0;
        bom.add(row.requiredPons, 1, 'power');
        if (cfg.powerCable) {
          const cab = powerCableOptions(cfg).find(r => r.description === cfg.powerCable);
          if (cab && cab.pon) bom.add(cab.pon, pemCount || 1, 'power cable');
        }
      }
    }

    /* 3 — ethernet cables */
    if (cfg.ethernetCable) {
      const eth = ethernetCableOptions(cfg).find(r => r.description === cfg.ethernetCable);
      if (eth && eth.pon) bom.add(eth.pon, 1, 'ethernet');
    }

    /* 4 — mounting kit */
    if (cfg.mountingKit) {
      const kit = mountKitOptions(cfg).find(r => r.description === cfg.mountingKit);
      if (kit && kit.pon) bom.add(kit.pon, 1, 'mounting');
    }

    /* 5 — controller */
    if (cfg.controllerOption) {
      const row = controllerOptions(cfg).find(r => r.option === cfg.controllerOption);
      if (row) bom.add(row.requiredPons, 1, 'controller');
    }

    /* 6 — front-panel extras. The workbook drops the cable guide whenever a
           dust filter is fitted; both occupy the same front position. */
    if (cfg.dustFilter && !NA(v.airFilterPon)) bom.add(v.airFilterPon, 1, 'air filter');
    if (cfg.airBaffle && !NA(v.airBafflePon)) bom.add(v.airBafflePon, 1, 'air baffle');
    if (cfg.cableGuide && !cfg.dustFilter && !NA(v.cableGuidePon)) {
      bom.add(v.cableGuidePon, 1, 'cable guide');
    }

    /* 7 — sleds, fillers, sled software */
    const plan = slotPlan(cfg);
    plan.forEach((p, i) => {
      if (p.covered) return;
      const sledName = p.sled;
      if (!sledName || sledName === 'EMPTY') {
        if (cfg.fillers && !NA(v.sledFillerPon)) {
          /* G34c's filler is a double-width blank: half a part per empty slot. */
          const each = v.sledFillerPon === 'G3S-G34CSF2Z-00' ? 0.5 : 1;
          bom.add(v.sledFillerPon, each, 'filler');
        }
        return;
      }
      const s = R.sleds[sledName];
      if (!s) { bom.warnings.push('slot ' + p.label + ': unknown sled ' + sledName); return; }
      bom.add(s.requiredPons, 1, 'slot ' + p.label);
      if (!NA(s.sledSw)) bom.add(s.sledSw, 1, 'slot ' + p.label + ' sw');
      if (p.overflow) {
        bom.warnings.push('slot ' + p.label + ': ' + sledName + ' is ' + p.width +
                          ' slots wide and runs past the end of the chassis');
      }

      /* 8/9 — line modules and client pluggables on this card */
      const sel = cfg.slots[i] || {};
      const ports = sledPorts(sledName);
      ports.line.forEach(port => {
        const key = 'L' + port.bank + '.' + port.index;
        const val = (sel.line || {})[key];
        if (NA(val)) return;
        const row = list(port.table).find(r => r.description === val || r.pon === val);
        if (!row) { bom.warnings.push('slot ' + p.label + ': unknown line module ' + val); return; }
        if (row.pon === 'IBW') { addIbw(bom, sledName, row, 'slot ' + p.label); return; }
        bom.add(row.pon, 1, 'slot ' + p.label + ' line');
      });
      ports.client.forEach(port => {
        const key = 'C' + port.bank + '.' + port.index;
        const val = (sel.client || {})[key];
        if (NA(val)) return;
        const row = list(port.table).find(r => r.description === val || r.pon === val);
        if (!row) { bom.warnings.push('slot ' + p.label + ': unknown client ' + val); return; }
        if (row.pon === 'TRIB') return;      // trib ports carry no part
        bom.add(row.pon, 1, 'slot ' + p.label + ' client');
      });
    });

    /* 10 — embedded GX OS */
    if (cfg.release && cfg.swLevel) {
      const ne = cfg.chassisType;
      const row = (R.licences.neSoftware || []).find(r =>
        r.ne === ne && r.neRelease === cfg.release && r.swLevel === cfg.swLevel &&
        r.controllerRedundancy === cfg.controllerOption);
      if (row) bom.add(row.requiredPons, 1, 'GX OS');
      else bom.warnings.push('no GX OS licence for ' + ne + ' / ' + cfg.release +
                             ' / ' + cfg.swLevel + ' / ' + (cfg.controllerOption || '—'));
    }

    /* 11 — encryption */
    if (cfg.encryption && !NA(c.encryptionPon)) bom.add(c.encryptionPon, 1, 'encryption');

    /* 12 — NMS */
    if (c.nmsLicence && cfg.nmsEnable && cfg.nmsType) {
      const row = nmsTable(cfg.chassisType).find(r => r.configType === cfg.nmsType);
      if (row) {
        bom.add(row.nmsPon, 1, 'NMS');
        if (cfg.l0Restoration) bom.add(row.l0Restoration, 1, 'NMS L0 restoration');
        if (cfg.l0l1Automation) bom.add(row.l0l1Automation, 1, 'NMS L0/L1 automation');
      }
    }

    return finish(bom, cfg, pemCount);
  }

  /* IBW: a licence bought in capacity units, not a part per port. */
  function addIbw(bom, sledName, row, source) {
    const table = R.optionLists[sledName + '_IBW'] ||
                  R.optionLists[sledName.slice(0, 4) + '_IBW'];
    if (!table) { bom.warnings.push(source + ': no IBW table for ' + sledName); return; }
    const match = table.find(r => r.description === row.description || r.pon === row.pon);
    if (!match) { bom.warnings.push(source + ': IBW combination not supported'); return; }
    const cap = parseInt(String(match.description || '').replace(/[^0-9].*$/, ''), 10);
    const gran = match.granularity_g || match['granularity_(g)'] || match.min_capacity;
    const units = (cap && gran) ? Math.ceil(cap / gran) : 1;
    bom.add(match.pon, units, source + ' IBW');
  }

  /* Weight and power roll-up, by PON, off the finished BOM. */
  function finish(bom, cfg, pemCount) {
    const c = chassis(cfg.chassisType) || {};
    const sum = { chassis: [0, 0, 0], sled: [0, 0, 0] };
    let weight = 0;
    for (const line of bom.lines) {
      const it = itemInfo(line.pon);
      if (!it) continue;
      if (it.weightKg) weight += it.weightKg * line.qty;
      const bucket = it.category === 'CHASSIS' ? sum.chassis : sum.sled;
      bucket[0] += (it.w25 || 0) * line.qty;
      bucket[1] += (it.w40 || 0) * line.qty;
      bucket[2] += (it.w55 || 0) * line.qty;
    }
    const total = [0, 1, 2].map(i => sum.chassis[i] + sum.sled[i]);

    let feed = null, headroom = null;
    if (cfg.powerOption) {
      const row = powerOptions(cfg).find(r => r.option === cfg.powerOption);
      if (row && row.pemPowerW) {
        feed = row.pemPowerW;
        headroom = [0, 1, 2].map(i => (feed[i] || 0) - total[i]);
      }
    }

    const plan = slotPlan(cfg);
    const used = plan.filter(p => p.sled || p.covered).length;

    bom.summary = {
      chassisType: cfg.chassisType,
      ru: c.ru || null,
      weightKg: Math.round(weight * 100) / 100,
      power: { chassis: sum.chassis, sled: sum.sled, total: total },
      feedCapacityW: feed,
      headroomW: headroom,
      pemCount: pemCount || 0,
      slotsUsed: used,
      slotsTotal: plan.length,
      lineCount: bom.lines.length,
      partCount: bom.lines.reduce((a, l) => a + l.qty, 0),
    };
    const notShippable = bom.lines.filter(l =>
      l.salesStatus && !/shippable/i.test(l.salesStatus));
    if (notShippable.length) {
      bom.summary.notShippable = notShippable.map(l => ({
        pon: l.pon, status: l.salesStatus, phase: l.phase }));
    }
    if (headroom && headroom.some(h => h < 0)) {
      bom.warnings.push('power draw exceeds the selected PEM configuration at ' +
        ['25 °C', '40 °C', '55 °C'].filter((_, i) => headroom[i] < 0).join(' / '));
    }
    return bom;
  }

  /* Several configs in one node, or several nodes in a network: the roll-up is
     the same operation, so it is one function. */
  function mergeBOMs(boms, multipliers) {
    const out = new Bom();
    boms.forEach((b, i) => {
      const m = (multipliers && multipliers[i]) || 1;
      b.lines.forEach(l => out.add(l.pon, l.qty * m, l.sources[0]));
      b.warnings.forEach(w => { if (out.warnings.indexOf(w) < 0) out.warnings.push(w); });
    });
    const sum = { chassis: [0, 0, 0], sled: [0, 0, 0] };
    let weight = 0, ru = 0, parts = 0;
    boms.forEach((b, i) => {
      const m = (multipliers && multipliers[i]) || 1;
      const s = b.summary || {};
      weight += (s.weightKg || 0) * m;
      ru += (s.ru || 0) * m;
      parts += (s.partCount || 0) * m;
      [0, 1, 2].forEach(k => {
        sum.chassis[k] += ((s.power && s.power.chassis[k]) || 0) * m;
        sum.sled[k] += ((s.power && s.power.sled[k]) || 0) * m;
      });
    });
    out.summary = {
      weightKg: Math.round(weight * 100) / 100,
      ru: ru,
      power: { chassis: sum.chassis, sled: sum.sled,
               total: [0, 1, 2].map(i => sum.chassis[i] + sum.sled[i]) },
      lineCount: out.lines.length,
      partCount: parts,
      configCount: boms.length,
    };
    const ns = out.lines.filter(l => l.salesStatus && !/shippable/i.test(l.salesStatus));
    if (ns.length) {
      out.summary.notShippable = ns.map(l => ({
        pon: l.pon, status: l.salesStatus, phase: l.phase }));
    }
    return out;
  }

  /* ----------------------------------------------------------------- export */

  function toCSV(bom, opts) {
    const o = opts || {};
    const head = ['PON', 'Description', 'Type', 'Family', 'Sales status',
                  'Material number', 'Qty'];
    if (o.sources) head.push('Where used');
    const esc = s => {
      s = s === null || s === undefined ? '' : String(s);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [head.join(',')];
    const lines = o.sorted ? bom.lines.slice().sort(sortLines) : bom.lines;
    for (const l of lines) {
      const r = [l.pon, l.description, l.typeLabel || l.type, l.family,
                 l.salesStatus, l.materialNumber, l.qty];
      if (o.sources) r.push((l.sources || []).join(' · '));
      rows.push(r.map(esc).join(','));
    }
    return rows.join('\n');
  }

  function sortLines(a, b) {
    const ai = TYPE_ORDER.indexOf(String(a.type || '').toUpperCase());
    const bi = TYPE_ORDER.indexOf(String(b.type || '').toUpperCase());
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return String(a.pon).localeCompare(String(b.pon));
  }

  const api = {
    init, rules, chassisNames, chassis, variant, defaultConfig,
    slotPlan, legalSleds, sledPorts, sledWidth, legalityFor,
    powerOptions, controllerOptions, mountKitOptions,
    powerCableOptions, ethernetCableOptions, releasesFor, nmsTable,
    list, ponInfo, itemInfo,
    buildBOM, mergeBOMs, toCSV, sortLines,
  };
  return api;
}));
