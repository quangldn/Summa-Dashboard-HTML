/* ============================================================
   SUMMA — APAC Datacenter Map
   Leaflet (CDN). Plots major hyperscaler cloud regions across APAC.
   Multiple vendors in the same city are arranged in a small ring
   so all are visible.
   ============================================================ */

const VENDOR_COLOR = {
  aws:      '#FF9900',
  azure:    '#008AD7',
  gcp:      '#34A853',
  meta:     '#1877F2',
  oracle:   '#C74634',
  alibaba:  '#FF6A00',
  tencent:  '#00A6FB',
};

const VENDOR_LABEL = {
  aws: 'AWS', azure: 'Microsoft Azure', gcp: 'Google Cloud',
  meta: 'Meta', oracle: 'Oracle Cloud',
  alibaba: 'Alibaba Cloud', tencent: 'Tencent Cloud',
};

// Each entry: vendor, city, lat, lng, region (vendor's region code/name)
// Major APAC hyperscaler regions. Not exhaustive — focused on the
// regions an SE in Vietnam/APAC actually quotes against.
const REGIONS = [
  // ---------------- Singapore ----------------
  { v: 'aws',     city: 'Singapore', lat: 1.3521, lng: 103.8198, r: 'ap-southeast-1' },
  { v: 'azure',   city: 'Singapore', lat: 1.3521, lng: 103.8198, r: 'Southeast Asia' },
  { v: 'gcp',     city: 'Singapore', lat: 1.3521, lng: 103.8198, r: 'asia-southeast1' },
  { v: 'meta',    city: 'Singapore', lat: 1.3521, lng: 103.8198, r: 'SIN DC' },
  { v: 'oracle',  city: 'Singapore', lat: 1.3521, lng: 103.8198, r: 'ap-singapore-1' },
  { v: 'alibaba', city: 'Singapore', lat: 1.3521, lng: 103.8198, r: 'ap-southeast-1' },
  { v: 'tencent', city: 'Singapore', lat: 1.3521, lng: 103.8198, r: 'ap-singapore' },

  // ---------------- Hong Kong ----------------
  { v: 'aws',     city: 'Hong Kong', lat: 22.3193, lng: 114.1694, r: 'ap-east-1' },
  { v: 'azure',   city: 'Hong Kong', lat: 22.3193, lng: 114.1694, r: 'East Asia' },
  { v: 'gcp',     city: 'Hong Kong', lat: 22.3193, lng: 114.1694, r: 'asia-east2' },
  { v: 'alibaba', city: 'Hong Kong', lat: 22.3193, lng: 114.1694, r: 'cn-hongkong' },
  { v: 'tencent', city: 'Hong Kong', lat: 22.3193, lng: 114.1694, r: 'ap-hongkong' },

  // ---------------- Tokyo ----------------
  { v: 'aws',     city: 'Tokyo', lat: 35.6895, lng: 139.6917, r: 'ap-northeast-1' },
  { v: 'azure',   city: 'Tokyo', lat: 35.6895, lng: 139.6917, r: 'Japan East' },
  { v: 'gcp',     city: 'Tokyo', lat: 35.6895, lng: 139.6917, r: 'asia-northeast1' },
  { v: 'oracle',  city: 'Tokyo', lat: 35.6895, lng: 139.6917, r: 'ap-tokyo-1' },
  { v: 'alibaba', city: 'Tokyo', lat: 35.6895, lng: 139.6917, r: 'ap-northeast-1' },
  { v: 'tencent', city: 'Tokyo', lat: 35.6895, lng: 139.6917, r: 'ap-tokyo' },

  // ---------------- Osaka ----------------
  { v: 'aws',    city: 'Osaka', lat: 34.6937, lng: 135.5023, r: 'ap-northeast-3' },
  { v: 'azure',  city: 'Osaka', lat: 34.6937, lng: 135.5023, r: 'Japan West' },
  { v: 'gcp',    city: 'Osaka', lat: 34.6937, lng: 135.5023, r: 'asia-northeast2' },
  { v: 'oracle', city: 'Osaka', lat: 34.6937, lng: 135.5023, r: 'ap-osaka-1' },

  // ---------------- Seoul ----------------
  { v: 'aws',     city: 'Seoul', lat: 37.5665, lng: 126.9780, r: 'ap-northeast-2' },
  { v: 'azure',   city: 'Seoul', lat: 37.5665, lng: 126.9780, r: 'Korea Central' },
  { v: 'gcp',     city: 'Seoul', lat: 37.5665, lng: 126.9780, r: 'asia-northeast3' },
  { v: 'oracle',  city: 'Seoul', lat: 37.5665, lng: 126.9780, r: 'ap-seoul-1' },
  { v: 'tencent', city: 'Seoul', lat: 37.5665, lng: 126.9780, r: 'ap-seoul' },

  // ---------------- Sydney ----------------
  { v: 'aws',    city: 'Sydney', lat: -33.8688, lng: 151.2093, r: 'ap-southeast-2' },
  { v: 'azure',  city: 'Sydney', lat: -33.8688, lng: 151.2093, r: 'Australia East' },
  { v: 'gcp',    city: 'Sydney', lat: -33.8688, lng: 151.2093, r: 'australia-southeast1' },
  { v: 'oracle', city: 'Sydney', lat: -33.8688, lng: 151.2093, r: 'ap-sydney-1' },

  // ---------------- Melbourne ----------------
  { v: 'aws',    city: 'Melbourne', lat: -37.8136, lng: 144.9631, r: 'ap-southeast-4' },
  { v: 'azure',  city: 'Melbourne', lat: -37.8136, lng: 144.9631, r: 'Australia Southeast' },
  { v: 'gcp',    city: 'Melbourne', lat: -37.8136, lng: 144.9631, r: 'australia-southeast2' },
  { v: 'oracle', city: 'Melbourne', lat: -37.8136, lng: 144.9631, r: 'ap-melbourne-1' },

  // ---------------- Jakarta ----------------
  { v: 'aws',     city: 'Jakarta', lat: -6.2088, lng: 106.8456, r: 'ap-southeast-3' },
  { v: 'azure',   city: 'Jakarta', lat: -6.2088, lng: 106.8456, r: 'Indonesia Central' },
  { v: 'gcp',     city: 'Jakarta', lat: -6.2088, lng: 106.8456, r: 'asia-southeast2' },
  { v: 'oracle',  city: 'Jakarta', lat: -6.2088, lng: 106.8456, r: 'ap-jakarta-1' },
  { v: 'alibaba', city: 'Jakarta', lat: -6.2088, lng: 106.8456, r: 'ap-southeast-5' },
  { v: 'tencent', city: 'Jakarta', lat: -6.2088, lng: 106.8456, r: 'ap-jakarta' },

  // ---------------- Kuala Lumpur / Malaysia ----------------
  { v: 'aws',     city: 'Kuala Lumpur', lat: 3.1390, lng: 101.6869, r: 'ap-southeast-5' },
  { v: 'azure',   city: 'Kuala Lumpur', lat: 3.1390, lng: 101.6869, r: 'Malaysia West' },
  { v: 'gcp',     city: 'Kuala Lumpur', lat: 3.1390, lng: 101.6869, r: 'Malaysia (announced)' },
  { v: 'alibaba', city: 'Kuala Lumpur', lat: 3.1390, lng: 101.6869, r: 'ap-southeast-3' },

  // ---------------- Bangkok ----------------
  { v: 'aws',     city: 'Bangkok', lat: 13.7563, lng: 100.5018, r: 'ap-southeast-7' },
  { v: 'gcp',     city: 'Bangkok', lat: 13.7563, lng: 100.5018, r: 'Thailand (announced)' },
  { v: 'alibaba', city: 'Bangkok', lat: 13.7563, lng: 100.5018, r: 'ap-southeast-6' },
  { v: 'tencent', city: 'Bangkok', lat: 13.7563, lng: 100.5018, r: 'ap-bangkok' },

  // ---------------- Mumbai ----------------
  { v: 'aws',     city: 'Mumbai', lat: 19.0760, lng: 72.8777, r: 'ap-south-1' },
  { v: 'azure',   city: 'Mumbai', lat: 19.0760, lng: 72.8777, r: 'West India' },
  { v: 'gcp',     city: 'Mumbai', lat: 19.0760, lng: 72.8777, r: 'asia-south1' },
  { v: 'oracle',  city: 'Mumbai', lat: 19.0760, lng: 72.8777, r: 'ap-mumbai-1' },
  { v: 'alibaba', city: 'Mumbai', lat: 19.0760, lng: 72.8777, r: 'ap-south-1' },
  { v: 'tencent', city: 'Mumbai', lat: 19.0760, lng: 72.8777, r: 'ap-mumbai' },

  // ---------------- Delhi / Hyderabad / Chennai / Pune ----------------
  { v: 'gcp',    city: 'Delhi', lat: 28.6139, lng: 77.2090, r: 'asia-south2' },
  { v: 'aws',    city: 'Hyderabad', lat: 17.3850, lng: 78.4867, r: 'ap-south-2' },
  { v: 'oracle', city: 'Hyderabad', lat: 17.3850, lng: 78.4867, r: 'ap-hyderabad-1' },
  { v: 'azure',  city: 'Chennai', lat: 13.0827, lng: 80.2707, r: 'South India' },
  { v: 'azure',  city: 'Pune', lat: 18.5204, lng: 73.8567, r: 'Central India' },

  // ---------------- Taiwan ----------------
  { v: 'gcp',     city: 'Changhua', lat: 24.0518, lng: 120.5161, r: 'asia-east1' },
  { v: 'azure',   city: 'Taipei', lat: 25.0330, lng: 121.5654, r: 'Taiwan North (announced)' },

  // ---------------- Auckland ----------------
  { v: 'aws',   city: 'Auckland', lat: -36.8485, lng: 174.7633, r: 'ap-southeast-6 (announced)' },
  { v: 'azure', city: 'Auckland', lat: -36.8485, lng: 174.7633, r: 'New Zealand North' },

  // ---------------- Canberra ----------------
  { v: 'azure', city: 'Canberra', lat: -35.2809, lng: 149.1300, r: 'Australia Central' },

  // ---------------- Mainland China (Alibaba / Tencent strongholds) ----------------
  { v: 'alibaba', city: 'Hangzhou',  lat: 30.2741, lng: 120.1551, r: 'cn-hangzhou' },
  { v: 'alibaba', city: 'Beijing',   lat: 39.9042, lng: 116.4074, r: 'cn-beijing' },
  { v: 'alibaba', city: 'Shanghai',  lat: 31.2304, lng: 121.4737, r: 'cn-shanghai' },
  { v: 'alibaba', city: 'Shenzhen',  lat: 22.5431, lng: 114.0579, r: 'cn-shenzhen' },
  { v: 'tencent', city: 'Beijing',   lat: 39.9042, lng: 116.4074, r: 'ap-beijing' },
  { v: 'tencent', city: 'Shanghai',  lat: 31.2304, lng: 121.4737, r: 'ap-shanghai' },
  { v: 'tencent', city: 'Guangzhou', lat: 23.1291, lng: 113.2644, r: 'ap-guangzhou' },
  { v: 'tencent', city: 'Chengdu',   lat: 30.5728, lng: 104.0668, r: 'ap-chengdu' },

  // ---------------- Korea — Chuncheon ----------------
  { v: 'oracle', city: 'Chuncheon', lat: 37.8813, lng: 127.7298, r: 'ap-chuncheon-1' },

  // ---------------- Busan ----------------
  { v: 'azure',  city: 'Busan', lat: 35.1796, lng: 129.0756, r: 'Korea South' },
];

// ----------------------------------------------------------------
// Group by city → arrange overlapping vendor markers in a tight ring
// ----------------------------------------------------------------
function groupByCity(regions) {
  const map = new Map();
  regions.forEach((r) => {
    const key = `${r.city}|${r.lat.toFixed(3)}|${r.lng.toFixed(3)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return map;
}

function arrangeRing(items) {
  // Returns same items with lat/lng nudged into a small ring if >1.
  if (items.length === 1) return [{ ...items[0], _lat: items[0].lat, _lng: items[0].lng }];
  const radius = 0.45; // degrees — tight enough to read as "same city"
  return items.map((it, i) => {
    const angle = (2 * Math.PI * i) / items.length;
    return {
      ...it,
      _lat: it.lat + Math.sin(angle) * radius,
      _lng: it.lng + Math.cos(angle) * radius,
    };
  });
}

function initMap() {
  const map = L.map('map', {
    center: [10, 115],   // roughly between Vietnam & the Philippines
    zoom: 3,
    minZoom: 2,
    maxZoom: 8,
    worldCopyJump: false,
    scrollWheelZoom: true,
  });

  // CartoDB Positron — clean, neutral base layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  const groups = groupByCity(REGIONS);
  groups.forEach((items, key) => {
    const arranged = arrangeRing(items);
    // Optional: draw a faint line from each marker back to the city center
    if (arranged.length > 1) {
      const center = [items[0].lat, items[0].lng];
      arranged.forEach((it) => {
        L.polyline([center, [it._lat, it._lng]], {
          color: '#9aa3b8',
          weight: 1,
          opacity: 0.35,
        }).addTo(map);
      });
      L.circleMarker(center, {
        radius: 2,
        color: '#5A6072',
        fillColor: '#5A6072',
        fillOpacity: 0.7,
        weight: 1,
      }).addTo(map).bindTooltip(items[0].city, {
        permanent: true, direction: 'top', className: 'city-label',
        offset: [0, -4],
      });
    } else {
      // Single-vendor city — still label it
      L.circleMarker([items[0].lat, items[0].lng], {
        radius: 1.5, color: '#5A6072', fillOpacity: 0.7, weight: 1,
      }).addTo(map).bindTooltip(items[0].city, {
        permanent: true, direction: 'top', className: 'city-label',
        offset: [0, -4],
      });
    }

    arranged.forEach((it) => {
      const color = VENDOR_COLOR[it.v] || '#666';
      const marker = L.circleMarker([it._lat, it._lng], {
        radius: 7,
        color: '#fff',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.95,
      }).addTo(map);
      marker.bindPopup(
        `<strong>${VENDOR_LABEL[it.v] || it.v}</strong><br>` +
        `${it.city}<br>` +
        `<code>${it.r}</code>`
      );
    });
  });
}

// City-label styling injected here so map.js stays self-contained
const style = document.createElement('style');
style.textContent = `
  .leaflet-tooltip.city-label {
    background: rgba(255,255,255,0.85);
    border: none;
    box-shadow: 0 1px 2px rgba(0,0,0,0.12);
    color: #1A1F36;
    font-size: 11px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .leaflet-tooltip.city-label::before { display: none; }
`;
document.head.appendChild(style);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMap);
} else {
  initMap();
}
