/* ============================================================
   SUMMA — DCI transponder selection engine

   Pure functions over assets/xpdr-data.json. No DOM, so the same
   file runs in the browser and under node for the regression tests
   in tools/dci-cases.js.

   The shape of the problem, in Quang's words:

     A mid-rate muxponder (100G–400G) will take sub-100G, 100G and
     400G clients. Move up to 600G / 800G / 1.2T and the client side
     is normally 100G and above — so a requirement with a handful of
     10G services on it either drops to a mid-rate card, or keeps the
     high-rate card and cascades the sub-100G through an aggregator
     (16P200 in PSS, UCM4 in G42 behind a CHM6/CHM7, UTM2 in G31/G32).

   So the engine does not just filter. It reports, for each candidate,
   what the choice costs: extra slots, a cascade, a chassis that needs
   a deeper rack, or a card that has not shipped yet.
   ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DCI = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ----------------------------------------------------------
  // Client-side vocabulary
  // ----------------------------------------------------------

  var SUB100 = 100;   // anything below this is "sub-100G" for the cascade rule

  /* ----------------------------------------------------------
     Link challenge

     Step 2 of the method: you rarely get a card's headline rate on a real
     link. Reach, span loss, the number of ROADM hops and the OSNR on the day
     all pull it down, and how far down is a property of the LINK, not of any
     one card. So the challenge level derates each card off its OWN ceiling —
     an 800G card and a 1.2T card on the same hard link land on different
     rates, which is exactly the comparison worth seeing.

     The factor is applied to the ceiling and then snapped to a profile the
     card actually has, nearest wins, ties round up. On a dense 100G ladder
     that lands where "one step down / two steps down" lands; on a sparse
     ladder like S2AD800R's 400/600/800 it still lands on a real profile
     instead of inventing one.

     These are planning figures for shaping a bid, not a link budget. The
     real number comes out of WaveSuite.
     ---------------------------------------------------------- */
  var CHALLENGE = [
    { level: 1, factor: 1.00, label: 'Easy',
      hint: 'Short DCI, metro, low span loss — the card runs at its ceiling.' },
    { level: 2, factor: 0.80, label: 'Moderate',
      hint: 'Metro-regional, a few spans or a ROADM hop or two. ~80% of ceiling.' },
    { level: 3, factor: 0.60, label: 'Hard',
      hint: 'Regional to long haul, many spans, meaningful OSNR pressure. ~60%.' },
    { level: 4, factor: 0.50, label: 'Very hard',
      hint: 'Long haul / ULH, high loss or heavily filtered. ~50% of ceiling.' },
    { level: 5, factor: null, label: 'Known rate',
      hint: 'You already have the rate from a link budget — enter it directly.' },
  ];

  function challengeOf(level) {
    return CHALLENGE.filter(function (c) { return c.level === Number(level); })[0]
           || CHALLENGE[0];
  }

  /* Snap a target rate to the nearest profile the card actually offers.
     Ties round up, so a target sitting exactly between two profiles takes
     the faster one rather than quietly costing capacity. */
  function snapToProfile(rates, target) {
    if (!rates || !rates.length) return null;
    var best = null, bestGap = Infinity;
    rates.forEach(function (r) {
      var gap = Math.abs(r - target);
      if (gap < bestGap || (gap === bestGap && r > best)) { best = r; bestGap = gap; }
    });
    return best;
  }

  /* The best rate this card can hold up on a link of this difficulty. */
  function achievableRate(xpdr, level) {
    var c = challengeOf(level);
    if (c.factor == null) return xpdr.lineMaxG;      // level 5: caller supplies
    return snapToProfile(xpdr.lineRatesG, (xpdr.lineMaxG || 0) * c.factor);
  }

  // Cage classes, widest first. A cage can host anything in its own class
  // or narrower — a QSFP-DD cage takes a QSFP28 module, not the reverse.
  var CAGE_ORDER = ['QSFP-DD', 'QSFP28', 'QSFP+', 'SFP+', 'SFP'];

  function cageClass(typeStr) {
    var t = String(typeStr || '').toUpperCase();
    if (/DD-?800|QSFP56-DD|QSFP-?DD|QDD/.test(t)) return 'QSFP-DD';
    if (/QSFP28|QSFP56/.test(t)) return 'QSFP28';
    if (/QSFP\+/.test(t)) return 'QSFP+';
    if (/SFP28|SFP\+/.test(t)) return 'SFP+';
    if (/SFP/.test(t)) return 'SFP';
    return 'SFP+';
  }

  // The narrowest cage class a service can be delivered in.
  function serviceCage(svc, rateG) {
    if (rateG >= 400) return 'QSFP-DD';
    if (rateG >= 100) return 'QSFP28';
    if (rateG > 25) return 'QSFP+';
    return 'SFP+';
  }

  function rateOf(data, svc) {
    var r = data.serviceRateG[svc];
    return typeof r === 'number' ? r : 0;
  }

  // ----------------------------------------------------------
  // Cage inventory
  // ----------------------------------------------------------

  function inventory(xpdr) {
    var inv = {};
    CAGE_ORDER.forEach(function (c) { inv[c] = 0; });
    (xpdr.clientCages || []).forEach(function (c) {
      inv[cageClass(c.type)] += c.qty;
    });
    return inv;
  }

  function totalCages(inv) {
    return CAGE_ORDER.reduce(function (n, c) { return n + inv[c]; }, 0);
  }

  /* Try to seat a demand list in a cage inventory.

     Widest demand first, and each demand falls back to a wider cage when its
     own class is full — a 100GE client sits happily in a spare QSFP-DD cage.
     Breakout is offered but never assumed silently: four 100GE in one QSFP-DD
     cage is a real product (QSFP-DD 4x100G BASE-DR1) but it is a different
     optic and a different fibre plan, so it is reported. */
  function seat(demands, inv, opts) {
    var free = {}, used = {}, notes = [], ok = true;
    CAGE_ORDER.forEach(function (c) { free[c] = inv[c]; used[c] = 0; });

    var ordered = demands.slice().sort(function (a, b) {
      return CAGE_ORDER.indexOf(a.cage) - CAGE_ORDER.indexOf(b.cage);
    });

    ordered.forEach(function (d) {
      var need = d.qty;
      var start = CAGE_ORDER.indexOf(d.cage);
      for (var i = start; i >= 0 && need > 0; i--) {     // own class, then wider
        var take = Math.min(free[CAGE_ORDER[i]], need);
        free[CAGE_ORDER[i]] -= take;
        used[CAGE_ORDER[i]] += take;
        need -= take;
        if (take && i < start) {
          notes.push(d.qty + 'x ' + d.service + ' lands in a ' +
                     CAGE_ORDER[i] + ' cage');
        }
      }
      if (need > 0 && opts && opts.breakout && d.cage === 'QSFP28' && free['QSFP-DD'] > 0) {
        var cages = Math.ceil(need / 4);
        var take2 = Math.min(free['QSFP-DD'], cages);
        free['QSFP-DD'] -= take2;
        used['QSFP-DD'] += take2;
        var served = take2 * 4;
        notes.push(Math.min(need, served) + 'x ' + d.service +
                   ' only fits via 4x100G breakout in ' + take2 + ' QSFP-DD cage' +
                   (take2 > 1 ? 's' : ''));
        need -= served;
        if (need < 0) need = 0;
      }
      if (need > 0) { ok = false; d.short = need; }
    });

    return { ok: ok, free: free, used: used, notes: notes };
  }

  // ----------------------------------------------------------
  // Requirement normalisation
  // ----------------------------------------------------------

  function normalise(req, data) {
    var clients = (req.clients || [])
      .filter(function (c) { return c.service && c.qty > 0; })
      .map(function (c) {
        var r = rateOf(data, c.service);
        return {
          service: c.service,
          qty: Number(c.qty),
          rateG: r,
          cage: serviceCage(c.service, r),
          sub100: r > 0 && r < SUB100,
        };
      });

    return {
      lineRateG: Number(req.lineRateG) || null,
      clients: clients,
      totalClientG: clients.reduce(function (s, c) { return s + c.qty * c.rateG; }, 0),
      totalPorts: clients.reduce(function (s, c) { return s + c.qty; }, 0),
      hasSub100: clients.some(function (c) { return c.sub100; }),
      sub100Services: clients.filter(function (c) { return c.sub100; }),
      depth: req.depth || 'any',        // 'std' (600 mm) | 'deep' | 'any'
      // 'class' — a card counts if its line technology reaches this rate or
      //           beyond, running at the nearest profile it actually has.
      //           This is the normal case: an 800G-class card is a perfectly
      //           good 400G transponder, and picking one card that covers
      //           several rates is how you end up carrying fewer types.
      // 'exact'  — only cards with a profile at exactly this rate.
      // Step 2 of the method. Levels 1-4 derive the rate from the card's own
      // ceiling; level 5 means the rate in lineRateG is a known number from a
      // link budget and is used as given.
      challenge: Number(req.challenge) || 1,
      rateMatch: req.rateMatch || 'class',
      // Whether the design may spend more than one wavelength. Two 400G ports
      // often beat one 600G port; that is a line-system decision, not the
      // transponder's, so it is asked rather than assumed.
      multiLambda: req.multiLambda !== false,
      wson: !!req.wson,
      band: req.band || 'any',          // 'C' | 'L' | 'any'
      platform: req.platform || 'any',  // 'GX' | 'PSS' | 'any'
      includeRoadmap: !!req.includeRoadmap,
      breakout: req.breakout !== false, // allow 4x100G breakout by default
    };
  }

  // ----------------------------------------------------------
  // Hosts
  // ----------------------------------------------------------

  function hostsFor(xpdr, data, need) {
    var byId = {};
    data.hosts.forEach(function (h) { byId[h.id] = h; });

    return (xpdr.hosts || []).map(function (id) {
      return byId[id] || { id: id, name: id, depthClass: 'std', platform: xpdr.platform };
    }).filter(function (h) {
      // A 600 mm site cannot take a chassis that needs more than 600 mm.
      if (need.depth === 'std' && h.depthClass === 'deep') return false;
      return true;
    });
  }

  // ----------------------------------------------------------
  // Cascade
  // ----------------------------------------------------------

  function findCascade(xpdr, data, need, hosts) {
    if (!need.hasSub100) return null;

    // Which sub-100G services the card cannot land itself.
    var missing = need.sub100Services.filter(function (c) {
      return (xpdr.clientServices || []).indexOf(c.service) < 0;
    });
    if (!missing.length) return null;

    var hostIds = hosts.map(function (h) { return h.id; });

    var options = data.cascade.filter(function (cas) {
      if (cas.platform !== xpdr.platform) return false;
      if (!cas.hosts.some(function (h) { return hostIds.indexOf(h) >= 0; })) return false;
      if (cas.pairsWith && !cas.pairsWith.some(function (f) {
        return (xpdr.family || '').indexOf(f) === 0 || xpdr.name.indexOf(f) === 0;
      })) return false;
      return missing.every(function (c) { return cas.takes.indexOf(c.service) >= 0; });
    });

    if (!options.length) {
      return { resolved: false, missing: missing.map(function (c) { return c.service; }) };
    }
    var best = options.sort(function (a, b) { return a.slots - b.slots; })[0];
    return {
      resolved: true,
      via: best,
      missing: missing.map(function (c) { return c.service; }),
      ports: missing.reduce(function (s, c) { return s + c.qty; }, 0),
    };
  }

  // ----------------------------------------------------------
  // Scoring one candidate
  // ----------------------------------------------------------

  function evaluate(xpdr, data, need) {
    var fits = [], costs = [], blockers = [];

    // --- hard filters -------------------------------------------------
    if (need.platform !== 'any' && xpdr.platform !== need.platform) return null;

    if (!need.includeRoadmap && !xpdr.shipping) return null;

    if (need.band !== 'any' && (xpdr.band || []).indexOf(need.band) < 0) {
      blockers.push(need.band + '-band not supported (' + (xpdr.band || []).join('/') + ' only)');
    }

    /* Line rate — steps 2 and 3 of the method, resolved together.

       The challenge level sets a CEILING: the best rate this particular card
       can hold up on a link this hard. The traffic sets a FLOOR: what each
       carrier has to run if the load is split across the ports the card has.
       The answer is the cheapest point that satisfies both — the fewest
       wavelengths, each at the lowest profile that carries its share.

       Working the port count out here rather than assuming one carrier is
       what lets a 2x400G card and a 1x800G card be compared honestly for the
       same 800G of traffic. */
    var rates = xpdr.lineRatesG || [];
    var ports = xpdr.lineCarriers || 1;
    var portsAllowed = need.multiLambda ? ports : 1;
    var ceilingRate, effRate = null, carriersUsed = 1;

    if (need.challenge === 5) {
      // With a known rate there is no derate to apply, so what this card can
      // do on this link is simply its own ceiling. Using the ASKED rate here
      // instead would make every card look fully used — a 1.2T card told to
      // run 400G would read as right-sized, which is the exact over-spec the
      // scoring exists to catch.
      ceilingRate = xpdr.lineMaxG;
      // A known rate is a rate, not a ceiling to plan under: honour it, and
      // fall back to the class/exact matching that governed it before.
      if (need.lineRateG) {
        if (need.rateMatch === 'exact') {
          if (rates.indexOf(need.lineRateG) < 0) {
            blockers.push('no ' + fmtRate(need.lineRateG) + ' profile on the line');
          }
          effRate = need.lineRateG;
        } else {
          var at = rates.filter(function (r) { return r >= need.lineRateG; });
          if (!at.length) {
            blockers.push('line tops out at ' + fmtRate(xpdr.lineMaxG) +
                          ' — below the ' + fmtRate(need.lineRateG) + ' asked for');
            effRate = xpdr.lineMaxG;
          } else {
            effRate = at[0];
          }
        }
      } else {
        effRate = xpdr.lineMaxG;
      }
      carriersUsed = effRate ? Math.min(portsAllowed, Math.max(1,
        Math.ceil(need.totalClientG / effRate))) : 1;
    } else {
      ceilingRate = achievableRate(xpdr, need.challenge);
      if (!ceilingRate) {
        blockers.push('no line profile recorded for this card');
      } else {
        // Fewest wavelengths first, so one 800G beats two 400G when both work.
        for (var c = 1; c <= portsAllowed; c++) {
          var perCarrier = need.totalClientG / c;
          var fit = rates.filter(function (r) {
            return r >= perCarrier && r <= ceilingRate;
          });
          if (fit.length) { effRate = fit[0]; carriersUsed = c; break; }
        }
        if (effRate == null) {
          effRate = ceilingRate;
          carriersUsed = portsAllowed;
          blockers.push('client load ' + fmtRate(need.totalClientG) +
            ' will not fit — on a level-' + need.challenge + ' link this card ' +
            'holds up ' + fmtRate(ceilingRate) + ' per carrier' +
            (portsAllowed > 1 ? ' across ' + portsAllowed + ' carriers' : '') +
            ' (ceiling ' + fmtRate(xpdr.lineMaxG) + ')');
        }
      }
    }

    if (need.challenge !== 5 && ceilingRate && xpdr.lineMaxG &&
        ceilingRate < xpdr.lineMaxG) {
      costs.push('link derates this card from ' + fmtRate(xpdr.lineMaxG) +
                 ' to ' + fmtRate(ceilingRate) + ' at challenge level ' +
                 need.challenge);
    }

    var hosts = hostsFor(xpdr, data, need);
    if (!hosts.length) {
      if ((xpdr.hosts || []).length) {
        blockers.push(need.depth === 'std'
          ? 'only hosted in ' + xpdr.hosts.join(' / ') + ', which needs more than 600 mm'
          : 'no host chassis in scope');
      } else {
        blockers.push('no host shelf recorded in the source data');
      }
    }

    // WSON is a line-system property, not a transponder one. It never
    // disqualifies a transponder — it constrains what it has to ride on.
    if (need.wson && xpdr.platform === 'GX') {
      costs.push('L0 GMPLS/WSON needs a PSS photonic line system — this GX sled ' +
                 'would ride it as an alien wavelength');
    }

    // --- client side --------------------------------------------------
    var inv = inventory(xpdr);
    var cap = totalCages(inv);

    // A planning-guide-only card brings a shelf list, a slot count, power and
    // a line rate, but no cage inventory and no client-service list — the
    // roadmap slide that carries those is the one it does not have. Dropping
    // such cards hid most of the shipping PSS catalogue (S13X100, S2AD200,
    // S4X400, 20P200 among them), so instead they stay in the running with the
    // client side declared unverified: clients are taken as landable, the card
    // is told to say so, and the score is docked far enough that any card with
    // a confirmed client side of the same shape outranks it.
    var clientsUnverified = !!xpdr.clientsUnknown;

    // Services the card handles natively.
    var direct = [], viaCascade = [];
    need.clients.forEach(function (c) {
      if (clientsUnverified || (xpdr.clientServices || []).indexOf(c.service) >= 0) direct.push(c);
      else viaCascade.push(c);
    });

    var cascade = clientsUnverified ? null : findCascade(xpdr, data, need, hosts);

    var unsupported = viaCascade.filter(function (c) {
      if (!c.sub100) return true;                       // not a cascade case
      return !(cascade && cascade.resolved);
    });
    if (unsupported.length) {
      blockers.push('no client path for ' +
        unsupported.map(function (c) { return c.service; }).join(', '));
    }

    // A cascade is not free on the host card. The aggregator collects the
    // sub-100G services and hands them back as OTU4/100G, and that handoff
    // lands in a client cage on the transponder — so the uplinks have to be
    // seated alongside the direct clients, not counted somewhere else.
    var cascadedG = 0, uplinks = 0;
    if (cascade && cascade.resolved) {
      cascadedG = viaCascade.reduce(function (s, c) { return s + c.qty * c.rateG; }, 0);
      uplinks = Math.max(1, Math.ceil(cascadedG / SUB100));
    }

    var demands = direct.map(function (c) {
      return { service: c.service, qty: c.qty, cage: c.cage };
    });
    if (uplinks) {
      demands.push({ service: cascade.via.label + ' uplink', qty: uplinks, cage: 'QSFP28' });
    }

    var portsOnCard = direct.reduce(function (s, c) { return s + c.qty; }, 0) + uplinks;
    var seating = seat(demands, inv, { breakout: need.breakout });

    if (!seating.ok && !(clientsUnverified && !cap)) {
      blockers.push('not enough client cages — needs ' + portsOnCard +
                    ', card has ' + cap);
    }
    seating.notes.forEach(function (n) { costs.push(n); });

    // --- line capacity -------------------------------------------------
    // Fill is measured against the carriers the load actually needs, not
    // against every line port the card owns. A card with two 400G line ports
    // carrying 240G of client is 60% full on one wavelength with a spare port
    // — not 15% full across both. Reporting it the second way would punish
    // multi-carrier cards for capacity the design is not buying.
    var rate = effRate || xpdr.lineMaxG || 0;
    var maxCarriers = portsAllowed;
    var lineCap = rate * carriersUsed;
    var util = lineCap ? Math.round(need.totalClientG / lineCap * 100) : 0;

    // What the whole card could carry on this link, versus what it is asked
    // to. This is the number that separates a 2x400G card from a 2x800G card
    // for the same 800G of traffic — both light their ports, but only one of
    // them is being paid for at the rate it is used.
    var cardCap = (ceilingRate || rate) * ports;
    var cardUse = cardCap ? need.totalClientG / cardCap : 0;

    if (lineCap && need.totalClientG > rate * maxCarriers && !blockers.length) {
      blockers.push('client load ' + fmtRate(need.totalClientG) + ' exceeds ' +
        (maxCarriers > 1
          ? 'line capacity ' + fmtRate(rate * maxCarriers) + ' across all ' +
            maxCarriers + ' carriers'
          : 'a single ' + fmtRate(rate) + ' wavelength' +
            (ports > 1 ? ' (card has ' + ports + ' ports, but multi-wavelength is off)' : '')));
    }

    if (blockers.length) {
      return {
        xpdr: xpdr, host: hosts[0] || null, hosts: hosts, score: 0,
        blockers: blockers, fits: fits, costs: costs, cascade: cascade,
        inventory: inv, lineUtil: util, disqualified: true,
        effRateG: effRate, ceilingRateG: ceilingRate,
        carriersUsed: carriersUsed, carriersTotal: ports,
        lineClassG: xpdr.lineMaxG,
      };
    }

    // --- scoring --------------------------------------------------------
    // Everything below is a judgement call and is written to be legible
    // rather than clever: each term states a preference you could defend
    // out loud in a design review.
    var score = 0;

    // 1. Native client coverage beats a cascade, decisively.
    if (clientsUnverified) {
      score += 6;
      costs.push('client side not stated in the planning guide — this card has ' +
                 'no roadmap slide, so the cages and services above are not ' +
                 'confirmed. Check the card sheet before quoting it.');
    } else if (!cascade) {
      score += 40;
      fits.push('lands every client directly — no cascade card');
    } else if (cascade.resolved) {
      score += 12;
      costs.push('sub-100G (' + cascade.missing.join(', ') + ') needs a cascaded ' +
                 cascade.via.label + ' — ' + cascade.via.slots + ' more slot' +
                 (cascade.via.slots > 1 ? 's' : '') + ', handing back ' +
                 uplinks + 'x ' + cascade.via.handsOff + ' into this card');
    }

    // 2. Wavelength fill. This is the heaviest term in the whole model, and
    //    deliberately so: an under-filled wavelength is capacity paid for and
    //    not sold, which is how a bid gets beaten on price by someone who
    //    sized the same traffic properly.
    if (util >= 95) { score += 40; fits.push('wavelength runs at ' + util + '% fill'); }
    else if (util >= 85) { score += 34; fits.push('wavelength runs at ' + util + '% fill'); }
    else if (util >= 70) { score += 26; fits.push('wavelength runs at ' + util + '% fill'); }
    else if (util >= 55) { score += 16; costs.push('wavelength only ' + util + '% filled'); }
    else if (util >= 40) { score += 8;
      costs.push('wavelength only ' + util + '% filled — ' +
                 fmtRate(lineCap - need.totalClientG) + ' of capacity bought and unused'); }
    else if (util > 0) {
      costs.push('wavelength only ' + util + '% filled — ' +
                 fmtRate(lineCap - need.totalClientG) +
                 ' of capacity bought and unused; this rate is oversized for the load'); }

    // Wavelengths are the expensive unit on the line system, so say plainly
    // when the answer needs more than one, and when ports are left dark.
    if (carriersUsed > 1) {
      costs.push('needs ' + carriersUsed + ' x ' + fmtRate(rate) +
                 ' wavelengths on the line system');
    }
    if (ports > carriersUsed) {
      costs.push((ports - carriersUsed) + ' of ' + ports +
                 ' line port' + (ports > 2 ? 's' : '') + ' left unused');
    }

    // Running above the rate asked for is not free — it is a different
    // profile, with its own reach and its own spacing.
    if (effRate && need.lineRateG && effRate > need.lineRateG) {
      costs.push('no ' + fmtRate(need.lineRateG) + ' profile — nearest is ' +
                 fmtRate(effRate) + ', so the wavelength runs there');
    } else if (effRate && need.lineRateG && rates.indexOf(need.lineRateG) >= 0) {
      score += 8;
      fits.push('has a ' + fmtRate(need.lineRateG) + ' profile natively');
    }

    // 3. Port headroom. Some spare is good; a wall of spare cages is a card
    //    bought for a job it is not doing.
    //    A wall of idle cages is the same over-spec problem as an idle line
    //    rate: the customer is quoted a card sized for a bigger job.
    var spare = cap - portsOnCard;
    if (clientsUnverified && !cap) {
      // No cage count in the source. Score nothing either way rather than
      // reading the missing number as zero cages and paying out for it.
    } else if (spare >= 1 && spare <= Math.max(2, Math.ceil(portsOnCard / 2))) {
      score += 14; fits.push(spare + ' spare client cage' + (spare > 1 ? 's' : '') + ' for growth');
    } else if (spare === 0) {
      score += 11; costs.push('every client cage used — no room to grow');
    } else if (spare <= portsOnCard) {
      score += 8; costs.push(spare + ' client cages left unused');
    } else if (spare > 0) {
      score += 2;
      costs.push(spare + ' of ' + cap + ' client cages left unused — the card is ' +
                 'sized for a bigger job than this one');
    }

    // 4. Slot economy.
    var slots = (xpdr.slots || 1) + (cascade && cascade.resolved ? cascade.via.slots : 0);
    score += slots <= 1 ? 12 : slots === 2 ? 7 : 3;
    if (slots > (xpdr.slots || 1)) costs.push('total footprint ' + slots + ' slots including the cascade card');

    // 5. Shipping now beats shipping later.
    if (xpdr.shipping) { score += 9; }
    else { costs.push('not shipping yet — ' + (xpdr.release || 'roadmap only')); }

    // 6. Right-sizing the card against the rate it will actually run.
    //
    //    This term used to run the other way: a ceiling above the asked rate
    //    scored a bonus, on the reasoning that headroom leaves an upgrade
    //    path. That is true and it is also how you lose on price — a 1.2T
    //    card asked to carry 400G is silicon the customer pays for and the
    //    design never lights. Headroom is still reported, because it is worth
    //    knowing, but it is a note rather than a reward, and gross over-spec
    //    now costs the candidate its place.
    //    Measured across the whole card — rate times ports — because a card
    //    is bought whole. Two 400G ports carrying 800G is fully used; two
    //    800G ports carrying the same 800G is half-used and will be priced
    //    like the bigger card it is.
    if (cardCap) {
      var pct = Math.round(cardUse * 100);
      var shape = ports + ' x ' + fmtRate(ceilingRate || rate);
      if (cardUse >= 0.9) {
        score += 22;
        fits.push('card fully used — ' + shape + ' on this link, ' + pct + '% taken');
      } else if (cardUse >= 0.7) {
        score += 15;
        fits.push('card ' + pct + '% used (' + shape + ' on this link)');
      } else if (cardUse >= 0.5) {
        score += 6;
        costs.push('card only ' + pct + '% used — ' + shape +
                   ' on this link, so it is priced above what the design carries');
      } else {
        costs.push('card only ' + pct + '% used — ' + shape + ' on this link ' +
                   'against ' + fmtRate(need.totalClientG) + ' of traffic; a ' +
                   'smaller card carries this service for less');
      }
    }

    // 6b. Wavelengths. Between two cards that are equally well used, the one
    //     lighting fewer wavelengths wins — one 800G carrier costs less on
    //     the line system than two 400G carriers for the same traffic.
    score += carriersUsed === 1 ? 10 : carriersUsed === 2 ? 5 : 1;

    // 7. Depth. A card that also fits a shallow site is worth flagging as a fit;
    //    one that forces a deep rack is worth flagging as a cost.
    var anyStd = hosts.some(function (h) { return h.depthClass === 'std'; });
    if (!anyStd) {
      costs.push('every host chassis needs more than 600 mm — open rack or 700 mm+');
    } else if (need.depth === 'std') {
      score += 5; fits.push('fits a standard 600 mm cabinet');
    }

    if (xpdr.encryption && !/^(N\/A|-|No plans)$/i.test(String(xpdr.encryption).trim())) {
      fits.push('encryption: ' + xpdr.encryption.split('/')[0].trim());
    }

    return {
      xpdr: xpdr,
      host: hosts.find(function (h) { return h.depthClass === 'std'; }) || hosts[0],
      hosts: hosts,
      score: score,
      fits: fits,
      costs: costs,
      blockers: [],
      cascade: cascade,
      clientsUnverified: clientsUnverified,
      inventory: inv,
      capacity: cap,
      portsNeeded: portsOnCard,
      cascadeUplinks: uplinks,
      slots: slots,
      lineUtil: util,
      carriersUsed: carriersUsed,
      carriersTotal: ports,
      carriersAllowed: maxCarriers,
      lineCapacityG: lineCap,
      effRateG: effRate,
      ceilingRateG: ceilingRate,
      cardCapacityG: cardCap,
      cardUsePct: Math.round(cardUse * 100),
      lineClassG: xpdr.lineMaxG,
      disqualified: false,
    };
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  function fmtRate(g) {
    if (!g) return '—';
    return g >= 1000 ? (g / 1000).toFixed(g % 1000 ? 1 : 0) + 'T' : g + 'G';
  }

  function recommend(data, req, limit) {
    var need = normalise(req, data);
    var all = data.xpdr.map(function (x) { return evaluate(x, data, need); })
                      .filter(Boolean);

    var ok = all.filter(function (r) { return !r.disqualified; })
                .sort(function (a, b) {
                  if (b.score !== a.score) return b.score - a.score;
                  if (a.slots !== b.slots) return a.slots - b.slots;
                  return a.xpdr.name.localeCompare(b.xpdr.name);
                });

    var out = all.filter(function (r) { return r.disqualified; })
                 .sort(function (a, b) { return a.blockers.length - b.blockers.length; });

    return {
      need: need,
      ranked: ok.slice(0, limit || 5),
      rankedAll: ok,
      rejected: out,
      counts: { considered: all.length, viable: ok.length, rejected: out.length },
    };
  }

  /* Every line rate any in-scope card can run, for the rate selector. */
  function lineRates(data) {
    var s = {};
    data.xpdr.forEach(function (x) {
      (x.lineRatesG || []).forEach(function (r) { s[r] = true; });
    });
    return Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
  }

  /* Every client service any in-scope card can land, sorted fastest first. */
  function clientServices(data) {
    var s = {};
    data.xpdr.forEach(function (x) {
      (x.clientServices || []).forEach(function (v) { s[v] = true; });
    });
    data.cascade.forEach(function (c) {
      (c.takes || []).forEach(function (v) { if (data.serviceRateG[v] != null) s[v] = true; });
    });
    return Object.keys(s).sort(function (a, b) {
      return (data.serviceRateG[b] || 0) - (data.serviceRateG[a] || 0) || a.localeCompare(b);
    });
  }

  return {
    CHALLENGE: CHALLENGE,
    challengeOf: challengeOf,
    achievableRate: achievableRate,
    snapToProfile: snapToProfile,
    recommend: recommend,
    evaluate: evaluate,
    normalise: normalise,
    lineRates: lineRates,
    clientServices: clientServices,
    inventory: inventory,
    cageClass: cageClass,
    fmtRate: fmtRate,
    SUB100: SUB100,
  };
}));
