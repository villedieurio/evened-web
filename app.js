// app.js
const DATA = {
  session: "./data/session.json",
  events: "./data/events.csv",
  detections: "./data/detections.csv",
  timeseries: "./data/timeseries.csv" // optionnel
};

function fmtSec(s) {
  if (!isFinite(s)) return "—";
  const sec = Math.round(Number(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  if (m > 0) return `${m}m ${String(r).padStart(2,"0")}s`;
  return `${r}s`;
}
function fmtNum(n, digits=0){
  if (!isFinite(n)) return "—";
  return Number(n).toFixed(digits);
}

async function fetchText(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.text();
}
async function fetchJson(url){
  const r = await fetch(url, { cache: "no-store" });
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return await r.json();
}

// CSV parser simple (OK pour tes fichiers)
function parseCSV(csvText){
  const lines = csvText.trim().split(/\r?\n/);
  if(lines.length <= 1) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const parts = splitCSVLine(lines[i]);
    const obj = {};
    for(let j=0;j<headers.length;j++){
      obj[headers[j]] = (parts[j] ?? "").trim();
    }
    rows.push(obj);
  }
  return rows;
}

// Split qui respecte les guillemets
function splitCSVLine(line){
  const out = [];
  let cur = "";
  let inQ = false;
  for(let i=0;i<line.length;i++){
    const c = line[i];
    if(c === '"'){
      // double quote escaped
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; }
      else inQ = !inQ;
    } else if(c === "," && !inQ){
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function byDesc(get){
  return (a,b) => (get(b) - get(a));
}

function normalizeBool(v){
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function buildTopSpeciesFromDetections(detections){
  // detections attendues: is_public + detection_duration_s + species_code/common_name
  const m = new Map();
  for(const d of detections){
    if(!normalizeBool(d.is_public)) continue;
    const code = d.species_code;
    if(!code || code === "nocall") continue;
    const key = code;
    const name = d.common_name || code;
    const conf = Number(d.confidence);
    const dur = Number(d.detection_duration_s || (Number(d.t_end_s)-Number(d.t_start_s)) || 0);

    if(!m.has(key)){
      m.set(key, { species_code: code, common_name: name, detections: 0, duration_s: 0, confidence_max: 0 });
    }
    const o = m.get(key);
    o.detections += 1;
    o.duration_s += (isFinite(dur) ? dur : 0);
    o.confidence_max = Math.max(o.confidence_max, isFinite(conf) ? conf : 0);
  }
  return Array.from(m.values());
}

function renderKpis(summary){
  // on préfère stats_public (Strava public)
  const st = summary.stats_public ?? summary.stats ?? {};
  const kpis = [
    { label:"Durée totale", value: fmtSec(st.duration_total_s) },
    { label:"Events", value: fmtNum(st.events_count) },
    { label:"Temps actif", value: fmtSec(st.active_time_s) },
    { label:"Ratio actif", value: isFinite(Number(st.active_ratio)) ? `${fmtNum(Number(st.active_ratio)*100,1)}%` : "—" },
    { label:"Détections (pub)", value: fmtNum(st.detections_count) },
    { label:"Espèces (pub)", value: fmtNum(st.species_unique_count) },
    { label:"Event max", value: fmtSec(st.event_duration_max_s) },
    { label:"Confiance max", value: isFinite(Number((summary.records_public ?? summary.records ?? {}).highest_confidence)) ? fmtNum((summary.records_public ?? summary.records).highest_confidence, 4) : "—" }
  ];
  const el = document.getElementById("kpis");
  el.innerHTML = kpis.map(k => `
    <div class="kpi">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
    </div>
  `).join("");
}

function renderHeader(summary){
  const s = summary.session;
  document.getElementById("title").textContent = `Evened — ${s.title || "Session"}`;
  const start = s.start_time || "";
  const end = s.end_time || "";
  const loc = (s.location && s.location.name) ? ` • ${s.location.name}` : "";
  document.getElementById("subtitle").textContent = `${start} → ${end}${loc}`;

  const rec = summary.recorder ?? {};
  document.getElementById("pill-device").textContent = `🎙️ ${rec.device || "Device"} • v${rec.version || "?"}`;
  const p = summary.params ?? {};
  const thr = (p.threshold != null) ? `thr ${p.threshold}` : "thr ?";
  const ev = (p.min_event_duration_s != null) ? `minEvent ${p.min_event_duration_s}s` : "minEvent ?";
  document.getElementById("pill-params").textContent = `⚙️ ${thr} • ${ev}`;
}

function renderTopSpecies(speciesList, metric="count"){
  let items = [...speciesList];
  if(metric === "duration"){
    items.sort(byDesc(o => o.duration_s));
  } else {
    items.sort(byDesc(o => o.detections));
  }
  items = items.slice(0, 12);

  const rows = items.map((o, idx) => `
    <tr>
      <td class="muted">${idx+1}</td>
      <td><strong>${o.common_name}</strong><div class="muted">${o.species_code}</div></td>
      <td class="right">${fmtNum(o.detections)}</td>
      <td class="right">${fmtSec(o.duration_s)}</td>
      <td class="right">${fmtNum(o.confidence_max,4)}</td>
    </tr>
  `).join("");

  document.getElementById("topSpecies").innerHTML = `
    <div style="overflow:auto; margin-top:10px;">
      <table>
        <thead>
          <tr>
            <th>#</th><th>Espèce</th>
            <th class="right">Détections</th>
            <th class="right">Durée</th>
            <th class="right">Conf max</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderEventsTable(events){
  const q = document.getElementById("q").value.trim().toLowerCase();
  const onlyDetected = document.getElementById("onlyDetected").checked;
  const onlyMulti = document.getElementById("onlyMulti").checked;

  let filtered = events;

  if(onlyDetected){
    filtered = filtered.filter(e => Number(e.public_detections_count) > 0);
  }
  if(onlyMulti){
    filtered = filtered.filter(e => Number(e.public_species_unique) >= 2);
  }
  if(q){
    filtered = filtered.filter(e => {
      const hay = [
        e.event_id,
        e.public_top_species_by_count,
        e.public_top_species_by_duration,
        e.public_species_unique,
        e.public_detections_count
      ].map(x => String(x ?? "")).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  document.getElementById("eventsCount").textContent =
    `${filtered.length} / ${events.length} events`;

  const tbody = document.getElementById("eventsTbody");
  tbody.innerHTML = filtered.slice(0, 600).map((e, idx) => `
    <tr>
      <td class="muted">${idx+1}</td>
      <td>
        <div><strong>${e.event_id}</strong></div>
        <div class="muted">${(e.start_time || "").slice(11,19)} → ${(e.end_time || "").slice(11,19)}</div>
      </td>
      <td class="right">${fmtSec(e.duration_s)}</td>
      <td class="right">${fmtNum(e.public_detections_count)}</td>
      <td class="right">${fmtNum(e.public_species_unique)}</td>
      <td>${e.public_top_species_by_count ? `<span class="badge">${e.public_top_species_by_count}</span>` : `<span class="muted">—</span>`}</td>
      <td class="right">${fmtSec(e.public_total_duration_s)}</td>
    </tr>
  `).join("");

  if(filtered.length > 600){
    tbody.insertAdjacentHTML("beforeend", `
      <tr><td colspan="7" class="muted">Affichage limité à 600 lignes (filtre pour préciser).</td></tr>
    `);
  }
}

let chartInstance = null;
function renderChart(timeseries){
  const note = document.getElementById("chart-note");

  if(!timeseries || timeseries.length === 0){
    note.textContent = "Aucun timeseries.csv → graphe désactivé.";
    return;
  }
  note.textContent = `${timeseries.length} points`;

  // x = index (simple), y = rms_p95 (ou peak)
  const labels = timeseries.map(r => (r.timestamp || "").slice(11,19));
  const rms = timeseries.map(r => Number(r.rms_p95 || r.rms_mean || 0));
  const thr = timeseries.map(r => Number(r.threshold || 0));

  const ctx = document.getElementById("chart");
  if(chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "rms_p95", data: rms, borderWidth: 1, pointRadius: 0, tension: 0.2 },
        { label: "threshold", data: thr, borderWidth: 1, pointRadius: 0, tension: 0.0 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: { beginAtZero: true }
      }
    }
  });
}

async function main(){
  const summary = await fetchJson(DATA.session);
  renderHeader(summary);
  renderKpis(summary);

  // events enriched
  const eventsCsv = await fetchText(DATA.events);
  const events = parseCSV(eventsCsv).map(r => ({
    ...r,
    duration_s: Number(r.duration_s),
    public_detections_count: Number(r.public_detections_count || 0),
    public_species_unique: Number(r.public_species_unique || 0),
    public_total_duration_s: Number(r.public_total_duration_s || 0)
  }));

  // detections public
  const detCsv = await fetchText(DATA.detections);
  const detections = parseCSV(detCsv);

  // top species (recalcul UI – tu peux aussi les lire du summary si tu veux)
  const topSpecies = buildTopSpeciesFromDetections(detections);
  const metricSelect = document.getElementById("speciesMetric");
  renderTopSpecies(topSpecies, metricSelect.value);
  metricSelect.addEventListener("change", () => renderTopSpecies(topSpecies, metricSelect.value));

  // events table
  const rerenderEvents = () => renderEventsTable(events);
  document.getElementById("q").addEventListener("input", rerenderEvents);
  document.getElementById("onlyDetected").addEventListener("change", rerenderEvents);
  document.getElementById("onlyMulti").addEventListener("change", rerenderEvents);
  renderEventsTable(events);

  // timeseries optionnel
  try{
    const tsCsv = await fetchText(DATA.timeseries);
    const ts = parseCSV(tsCsv);
    renderChart(ts);
  } catch(err){
    renderChart([]);
  }
}

main().catch(err => {
  console.error(err);
  document.getElementById("subtitle").textContent = `Erreur: ${err.message}`;
});
