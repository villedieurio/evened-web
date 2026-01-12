// app.js — Evened Web (Feed + Session)
// Data model (pérenne):
// - data/feed.json
// - data/sessions/<session_id>/session.json
// - data/sessions/<session_id>/events.csv
// - data/sessions/<session_id>/detections.csv
// - data/sessions/<session_id>/timeseries.csv (option)

const PATHS = {
  feed: "./data/feed.json"
};

function $(id){ return document.getElementById(id); }

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
function normalizeBool(v){
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}
function safeText(v){ return (v == null) ? "" : String(v); }

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
    if(!lines[i].trim()) continue;
    const parts = splitCSVLine(lines[i]);
    const obj = {};
    for(let j=0;j<headers.length;j++){
      obj[headers[j]] = (parts[j] ?? "").trim();
    }
    rows.push(obj);
  }
  return rows;
}
function splitCSVLine(line){
  const out = [];
  let cur = "";
  let inQ = false;
  for(let i=0;i<line.length;i++){
    const c = line[i];
    if(c === '"'){
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

function getQueryId(){
  const params = new URLSearchParams(location.search);
  return params.get("id");
}
function setQueryId(id){
  const url = new URL(location.href);
  url.searchParams.set("id", id);
  history.pushState({}, "", url);
}
function clearQueryId(){
  const url = new URL(location.href);
  url.searchParams.delete("id");
  history.pushState({}, "", url);
}

function showFeed(){
  $("feedView").classList.remove("hidden");
  $("sessionView").classList.add("hidden");
  $("btnHome").classList.add("hidden");
  $("topSubtitle").textContent = "Feed des sessions";
}
function showSession(){
  $("feedView").classList.add("hidden");
  $("sessionView").classList.remove("hidden");
  $("btnHome").classList.remove("hidden");
}

function renderTop(msg="", isError=false){
  $("topError").textContent = isError ? msg : "";
  $("topNote").textContent = !isError ? msg : "";
}

function sortSessions(list, mode){
  const arr = [...list];
  if(mode === "duration"){
    arr.sort((a,b) => (b.kpis_public?.duration_total_s ?? 0) - (a.kpis_public?.duration_total_s ?? 0));
  } else if(mode === "species"){
    arr.sort((a,b) => (b.kpis_public?.species_unique_count ?? 0) - (a.kpis_public?.species_unique_count ?? 0));
  } else if(mode === "detections"){
    arr.sort((a,b) => (b.kpis_public?.detections_count ?? 0) - (a.kpis_public?.detections_count ?? 0));
  } else {
    // newest: start_time desc (ISO)
    arr.sort((a,b) => String(b.start_time ?? "").localeCompare(String(a.start_time ?? "")));
  }
  return arr;
}

function renderFeed(feed){
  const search = $("feedSearch").value.trim().toLowerCase();
  const sortMode = $("feedSort").value;

  let sessions = feed.sessions ?? [];
  sessions = sortSessions(sessions, sortMode);

  if(search){
    sessions = sessions.filter(s => {
      const hay = [
        s.session_id, s.title, s.location_name,
        (s.top_species_public || []).map(x => x.common_name).join(" "),
        (s.top_species_public || []).map(x => x.species_code).join(" ")
      ].join(" ").toLowerCase();
      return hay.includes(search);
    });
  }

  $("feedCount").textContent = `${sessions.length} session(s)`;
  const grid = $("feedGrid");
  grid.innerHTML = sessions.map(s => {
    const k = s.kpis_public ?? {};
    const start = safeText(s.start_time).slice(0,19);
    const end = safeText(s.end_time).slice(0,19);
    const loc = s.location_name ? ` • ${s.location_name}` : "";
    const top = (s.top_species_public || []).slice(0,3).map(x => x.common_name).join(", ");

    return `
      <a class="feedItem" href="?id=${encodeURIComponent(s.session_id)}" data-id="${s.session_id}">
        <div style="display:flex; justify-content:space-between; gap:10px;">
          <div>
            <div style="font-weight:650;">${safeText(s.title || "Session")}</div>
            <div class="muted" style="font-size:12px;">${start} → ${end}${loc}</div>
          </div>
          <div class="muted" style="font-size:12px;">${safeText(s.session_id)}</div>
        </div>
        <div class="kpiRow">
          <span class="kpiMini">⏱️ ${fmtSec(k.duration_total_s)}</span>
          <span class="kpiMini">🎛️ ${fmtNum(k.events_count)} events</span>
          <span class="kpiMini">🐦 ${fmtNum(k.species_unique_count)} espèces</span>
          <span class="kpiMini">✅ ${fmtNum(k.detections_count)} détections</span>
        </div>
        <div class="muted" style="font-size:12px;">
          ${top ? `Top: ${top}` : "Top: —"}
        </div>
      </a>
    `;
  }).join("");

  // Interception click (SPA feel)
  grid.querySelectorAll("a[data-id]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = a.getAttribute("data-id");
      setQueryId(id);
      loadSessionById(id);
    });
  });
}

function renderSessionHeader(summary){
  const s = summary.session ?? {};
  const rec = summary.recorder ?? {};
  const p = summary.params ?? {};

  $("sessionTitle").textContent = `🌿 ${s.title || "Session"} — ${s.session_id || ""}`;
  const loc = (s.location && s.location.name) ? s.location.name : "";
  $("sessionSubtitle").textContent =
    `${safeText(s.start_time)} → ${safeText(s.end_time)}${loc ? ` • ${loc}` : ""}`;

  $("pillDevice").textContent = `🎙️ ${rec.device || "Device"} • v${rec.version || "?"}`;
  $("pillParams").textContent =
    `⚙️ thr ${p.threshold ?? "?"} • minEvent ${p.min_event_duration_s ?? "?"}s • prebuf ${p.prebuffer_s ?? "?"}s`;
  $("pillLocation").textContent = `📍 ${loc || "—"}`;
}

function renderSessionKpis(summary){
  const stPub = summary.stats_public ?? summary.stats ?? {};
  const recPub = summary.records_public ?? summary.records ?? {};
  const kpis = [
    { label:"Durée totale", value: fmtSec(stPub.duration_total_s) },
    { label:"Events", value: fmtNum(stPub.events_count) },
    { label:"Temps actif", value: fmtSec(stPub.active_time_s) },
    { label:"Ratio actif", value: isFinite(Number(stPub.active_ratio)) ? `${fmtNum(Number(stPub.active_ratio)*100,1)}%` : "—" },
    { label:"Détections (pub)", value: fmtNum(stPub.detections_count) },
    { label:"Espèces (pub)", value: fmtNum(stPub.species_unique_count) },
    { label:"Event max", value: fmtSec(stPub.event_duration_max_s) },
    { label:"Conf max", value: isFinite(Number(recPub.highest_confidence)) ? fmtNum(recPub.highest_confidence,4) : "—" }
  ];
  $("kpis").innerHTML = kpis.map(k => `
    <div class="kpi">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
    </div>
  `).join("");
}

function buildTopSpeciesFromDetections(detections){
  // attente: is_public + detection_duration_s + species_code/common_name + confidence
  const m = new Map();
  for(const d of detections){
    if(!normalizeBool(d.is_public)) continue;
    const code = d.species_code;
    if(!code || code === "nocall") continue;

    const name = d.common_name || code;
    const conf = Number(d.confidence);
    const dur = Number(d.detection_duration_s || (Number(d.t_end_s)-Number(d.t_start_s)) || 0);

    if(!m.has(code)){
      m.set(code, { species_code: code, common_name: name, detections: 0, duration_s: 0, confidence_max: 0 });
    }
    const o = m.get(code);
    o.detections += 1;
    o.duration_s += (isFinite(dur) ? dur : 0);
    o.confidence_max = Math.max(o.confidence_max, isFinite(conf) ? conf : 0);
  }
  return Array.from(m.values());
}

function renderTopSpecies(speciesList, metric="count"){
  let items = [...speciesList];
  if(metric === "duration"){
    items.sort((a,b) => (b.duration_s - a.duration_s));
  } else {
    items.sort((a,b) => (b.detections - a.detections));
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

  $("topSpecies").innerHTML = `
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
        <tbody>${rows || `<tr><td colspan="5" class="muted">Aucune détection publique.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderEventsTable(events){
  const q = $("q").value.trim().toLowerCase();
  const onlyDetected = $("onlyDetected").checked;
  const onlyMulti = $("onlyMulti").checked;

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

  $("eventsCount").textContent = `${filtered.length} / ${events.length} events`;

  const tbody = $("eventsTbody");
  tbody.innerHTML = filtered.slice(0, 600).map((e, idx) => `
    <tr>
      <td class="muted">${idx+1}</td>
      <td>
        <div><strong>${e.event_id}</strong></div>
        <div class="muted">${safeText(e.start_time).slice(11,19)} → ${safeText(e.end_time).slice(11,19)}</div>
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
  const note = $("chartNote");

  if(!timeseries || timeseries.length === 0){
    note.textContent = "Aucun timeseries.csv (optionnel).";
    if(chartInstance){ chartInstance.destroy(); chartInstance = null; }
    return;
  }
  note.textContent = `${timeseries.length} points`;

  const labels = timeseries.map(r => safeText(r.timestamp).slice(11,19));
  const rms = timeseries.map(r => Number(r.rms_p95 || r.rms_mean || 0));
  const thr = timeseries.map(r => Number(r.threshold || 0));

  const ctx = $("chart");
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

async function loadSessionById(sessionId){
  try{
    renderTop(`Chargement session ${sessionId}…`, false);
    $("topError").textContent = "";

    // Load feed first to get paths (pérenne)
    const feed = await fetchJson(PATHS.feed);
    const entry = (feed.sessions || []).find(s => s.session_id === sessionId);

    if(!entry){
      throw new Error(`Session ${sessionId} introuvable dans data/feed.json`);
    }

    // Build absolute paths (relative to data/)
    const base = "./data/";
    const sessionPath = base + entry.paths.session;
    const eventsPath  = base + entry.paths.events;
    const detPath     = base + entry.paths.detections;
    const tsPath      = base + entry.paths.timeseries;

    // Load session summary
    const summary = await fetchJson(sessionPath);
    showSession();
    $("topSubtitle").textContent = `Session ${sessionId}`;
    renderSessionHeader(summary);
    renderSessionKpis(summary);

    // Load events (enriched)
    const eventsCsv = await fetchText(eventsPath);
    const events = parseCSV(eventsCsv).map(r => ({
      ...r,
      duration_s: Number(r.duration_s),
      public_detections_count: Number(r.public_detections_count || 0),
      public_species_unique: Number(r.public_species_unique || 0),
      public_total_duration_s: Number(r.public_total_duration_s || 0)
    }));

    // Load detections
    const detCsv = await fetchText(detPath);
    const detections = parseCSV(detCsv);
    const topSpecies = buildTopSpeciesFromDetections(detections);
    renderTopSpecies(topSpecies, $("speciesMetric").value);

    // Species metric switch
    $("speciesMetric").onchange = () => renderTopSpecies(topSpecies, $("speciesMetric").value);

    // Events filters
    const rerenderEvents = () => renderEventsTable(events);
    $("q").oninput = rerenderEvents;
    $("onlyDetected").onchange = rerenderEvents;
    $("onlyMulti").onchange = rerenderEvents;
    renderEventsTable(events);

    // Timeseries (optionnel)
    try{
      const tsCsv = await fetchText(tsPath);
      const ts = parseCSV(tsCsv);
      renderChart(ts);
    } catch(_){
      renderChart([]);
    }

    renderTop(`OK — session chargée.`, false);

  } catch(err){
    console.error(err);
    renderTop(err.message, true);
    showFeed();
  }
}

async function init(){
  try{
    // Buttons
    $("btnHome").addEventListener("click", () => {
      clearQueryId();
      showFeed();
      renderTop("Feed des sessions", false);
    });

    // Handle back/forward
    window.addEventListener("popstate", () => {
      const id = getQueryId();
      if(id) loadSessionById(id);
      else showFeed();
    });

    // Load feed
    const feed = await fetchJson(PATHS.feed);

    // Subtitle note
    const updated = feed.updated_at ? ` • maj ${feed.updated_at}` : "";
    renderTop(`data/feed.json chargé${updated}`, false);

    // Feed render
    const rerender = () => renderFeed(feed);
    $("feedSearch").addEventListener("input", rerender);
    $("feedSort").addEventListener("change", rerender);
    renderFeed(feed);

    // If URL has session id, load it; otherwise show feed
    const id = getQueryId();
    if(id){
      await loadSessionById(id);
    } else {
      showFeed();
    }

  } catch(err){
    console.error(err);
    renderTop(err.message, true);
  }
}

init();
