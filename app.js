(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const pct = v => v == null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  const num = (v, d = 2) => v == null ? "n/a" : Number(v).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
  const cls = v => v == null ? "" : v < 0 ? "neg" : v > 0 ? "pos" : "";
  const inr = v => (v >= 0 ? "+" : "-") + Math.abs(Math.round(v)).toLocaleString("en-IN");
  const sign = v => v >= 0 ? css("--pos") : css("--neg");
  let D, M, charts = [], current = "overview";

  const TABS = [["overview", "Overview"], ["markets", "Markets"], ["flows", "Flows"], ["fx", "FX & Commodities"], ["global", "Global"],
    ["valuation", "Valuation"], ["returns", "Index Returns"], ["sectors", "Sectors"], ["derived", "Derived"], ["status", "Data status"]];
  const NEEDS_M = ["markets", "fx", "global", "derived"];

  async function getJSON(p) { const r = await fetch(p + "?t=" + Date.now()); if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }

  async function init() {
    try { D = await getJSON("data/dashboard.json"); }
    catch (e) { $("#view").innerHTML = `<div class="banner warn">Could not load data: ${esc(e.message)}</div>`; return; }
    try { M = await getJSON("data/market.json"); } catch (e) { M = null; }
    $("#asof").textContent = `End-of-day data · last refreshed ${(M && M.generated_at) || D.generated_at}`;
    const tabs = TABS.filter(([id]) => M || !NEEDS_M.includes(id));
    $("#tabs").innerHTML = tabs.map(([id, n]) => `<button class="tab" role="tab" data-id="${id}" aria-selected="false">${esc(n)}</button>`).join("");
    $("#tabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) show(b.dataset.id); });
    show((location.hash || "").slice(1) || "overview");
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => show(current));
  }

  const VIEWS = () => ({ overview, markets, flows, fx, global: globalView, valuation, returns, sectors, derived, status });
  function show(id) {
    const views = VIEWS();
    if (!views[id] || (!M && NEEDS_M.includes(id))) id = "overview";
    current = id;
    history.replaceState(null, "", "#" + id);
    document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.id === id));
    charts.forEach(c => c.destroy());
    charts = [];
    $("#view").innerHTML = views[id]();
    $("#view").querySelectorAll("canvas[data-chart]").forEach(cv => charts.push(makeChart(cv, JSON.parse(cv.dataset.chart))));
    if (id === "markets") wireIndices();
    scrollTo(0, 0);
  }

  const card = (l, v, n, c = "") => `<div class="card ${c}"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div><div class="n">${esc(n)}</div></div>`;
  const chartBox = (title, cfg, tall) =>
    `<div class="chartbox${tall ? " tall" : ""}"><h4>${esc(title)}</h4><div class="cv"><canvas data-chart="${esc(JSON.stringify(cfg))}"></canvas></div></div>`;
  const table = (heads, rows, id = "") => `<div class="tablewrap"><table${id ? ` id="${id}"` : ""}><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  const sect = t => `<h3 class="section">${esc(t)}</h3>`;

  function makeChart(cv, cfg) {
    const ink = css("--muted"), line = css("--line");
    const h = !!cfg.horizontal, ax = h ? "x" : "y";
    return new Chart(cv, {
      type: "bar",
      data: { labels: cfg.labels, datasets: cfg.datasets.map(d => ({ label: d.label, data: d.data, backgroundColor: d.colors || d.color, borderRadius: 3 })) },
      options: {
        indexAxis: h ? "y" : "x", responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: cfg.datasets.length > 1, labels: { color: ink } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${cfg.unit === "pct" ? pct(c.parsed[ax]) : num(c.parsed[ax], 0)}` } } },
        scales: { x: { ticks: { color: ink }, grid: { color: line } }, y: { ticks: { color: ink }, grid: { color: line } } },
      },
    });
  }

  function spark(arr) {
    if (!arr || arr.length < 2) return "";
    const w = 84, h = 24, mn = Math.min(...arr), mx = Math.max(...arr), r = mx - mn || 1;
    const pts = arr.map((v, i) => `${(i / (arr.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join(" ");
    const c = arr[arr.length - 1] >= arr[0] ? css("--pos") : css("--neg");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline fill="none" stroke="${c}" stroke-width="1.6" points="${pts}"/></svg>`;
  }

  // ---------------------------------------------------------------- overview
  function overview() {
    const n50 = D.valuation.find(v => v.name === "Nifty 50"), sc = D.valuation.find(v => v.name === "Nifty Smallcap 250");
    const r50 = D.returns.find(r => r.name === "Nifty 50");
    const f = D.flows;
    let out = `<h2 class="sheet">Market snapshot</h2><p class="subtitle">Latest available close. Use the tabs above for detail.</p><div class="cards">`;
    out += card("Nifty 50 P/E", n50.pe.toFixed(1), `${n50.vs10 > 0 ? "+" : ""}${n50.vs10.toFixed(1)}% vs 10Y avg (${n50.avg10})`);
    out += card("Nifty 50 · 1 year", pct(r50.y1), `1M ${pct(r50.m1)} · 6M ${pct(r50.m6)}`, cls(r50.y1));
    out += card("Smallcap 250 P/E", sc.pe.toFixed(1), `${sc.zone !== "—" ? sc.zone : "Within range"} · ${sc.vs10 > 0 ? "+" : ""}${sc.vs10.toFixed(1)}% vs 10Y avg`, sc.zone !== "—" ? "neg" : "");
    if (f) out += card(`FII net · ${f.date}`, inr(f.fii) + " Cr", `DII ${inr(f.dii)} Cr`, cls(f.fii));
    if (M) {
      const n = M.nse, fxr = M.yahoo.fx.find(x => x.name === "USD / INR"), br = M.yahoo.commodities.find(x => x.name.startsWith("Brent")), gd = M.yahoo.commodities.find(x => x.name.startsWith("Gold"));
      if (n.vix) out += card("India VIX", n.vix.last.toFixed(2), `${pct(n.vix.chg1d)} today · 52W ${n.vix.lo52}–${n.vix.hi52}`, "");
      if (n.gift) out += card("Gift Nifty", num(n.gift.last, 1), `${pct(n.gift.chg_pct)} vs prev close`, cls(n.gift.chg_pct));
      out += card("Advances / declines", `${num(n.breadth.advances, 0)} / ${num(n.breadth.declines, 0)}`, `${(100 * n.breadth.advances / (n.breadth.advances + n.breadth.declines)).toFixed(0)}% of stocks advancing`);
      if (fxr) out += card("USD / INR", fxr.last.toFixed(2), `1Y ${pct(fxr.y1)} (positive = rupee weaker)`);
      if (br) out += card("Brent (USD/bbl)", br.last.toFixed(2), `1D ${pct(br.chg1d)} · 1Y ${pct(br.y1)}`, cls(-br.chg1d));
      if (gd) out += card("Gold (USD/oz)", num(gd.last, 0), `1D ${pct(gd.chg1d)} · 1Y ${pct(gd.y1)}`, cls(gd.chg1d));
    }
    out += `</div>`;
    if (D.observation) out += `<p class="note">1-month leader: <b>${esc(D.observation.best[0])}</b> (${pct(D.observation.best[1])}). Laggard: <b>${esc(D.observation.worst[0])}</b> (${pct(D.observation.worst[1])}).</p>`;
    const live = D.sectors.filter(s => !s.static);
    out += chartBox("Sector 1-year return (live sectors)", { labels: live.map(s => s.name), unit: "pct", horizontal: true,
      datasets: [{ label: "1Y", data: live.map(s => +s.y1.toFixed(2)), colors: live.map(s => sign(s.y1)) }] }, true);
    return out;
  }

  // ---------------------------------------------------------------- markets
  function markets() {
    const n = M.nse, b = n.breadth;
    let out = `<h2 class="sheet">Market breadth and movers</h2><p class="subtitle">NSE, ${esc(n.market_status || "")} · ${esc(n.trade_date || "")}</p><div class="cards">`;
    out += card("Advances", num(b.advances, 0), `${num(b.declines, 0)} declines · ${num(b.unchanged, 0)} unchanged`, "pos");
    if (n.vix) out += card("India VIX", n.vix.last.toFixed(2), `${pct(n.vix.chg1d)} · 1M ago ${n.vix.m1_ago} · 1Y ago ${n.vix.y1_ago}`);
    if (n.gift) out += card("Gift Nifty", num(n.gift.last, 1), `${pct(n.gift.chg_pct)} · expiry ${n.gift.expiry}`, cls(n.gift.chg_pct));
    if (n.mcap) out += card("NSE market cap", `₹${num(n.mcap.lakh_cr, 1)} lakh cr`, `USD ${n.mcap.usd_tn} trillion`);
    out += card("Circuit hitters", `${n.circuit.upper} up / ${n.circuit.lower} down`, "Upper / lower circuit, all securities");
    out += card("52-week highs / lows", `${n.high52.count} / ${n.low52.count}`, `EQ series: ${n.high52.count_eq} / ${n.low52.count_eq}`);
    out += card("Block deals", `${n.block_deals.count}`, `₹${n.block_deals.total_value_cr} cr traded`);
    out += `</div>`;
    const mv = l => table(["Stock", "LTP", "Change"], l.map(x => `<tr><td>${esc(x.symbol)}</td><td class="num">${num(x.ltp)}</td><td class="num ${cls(x.chg)}">${pct(x.chg)}</td></tr>`));
    out += sect("Nifty 50 movers") + `<div class="grid2"><div><div class="subhead">Top gainers</div>${mv(n.gainers)}</div><div><div class="subhead">Top losers</div>${mv(n.losers)}</div></div>`;
    out += sect("Most active by value") + table(["Stock", "LTP", "Change", "Traded (₹ cr)"], n.most_active.map(x => `<tr><td>${esc(x.symbol)}</td><td class="num">${num(x.ltp)}</td><td class="num ${cls(x.chg)}">${pct(x.chg)}</td><td class="num">${num(x.value_cr, 1)}</td></tr>`));
    out += sect("Largest block deals") + table(["Stock", "Price", "Quantity", "Value (₹ cr)"], n.block_deals.top.map(x => `<tr><td>${esc(x.symbol)}</td><td class="num">${num(x.price)}</td><td class="num">${num(x.qty, 0)}</td><td class="num">${num(x.value_cr, 1)}</td></tr>`));
    const w = l => table(["Stock", "LTP", "Change"], l.top.map(x => `<tr><td>${esc(x.symbol)}</td><td class="num">${num(x.ltp)}</td><td class="num ${cls(x.chg)}">${pct(x.chg)}</td></tr>`));
    out += sect("52-week highs and lows (EQ series, biggest movers)") + `<div class="grid2"><div><div class="subhead">Highs</div>${w(n.high52)}</div><div><div class="subhead">Lows</div>${w(n.low52)}</div></div>`;
    if (n.options && n.options.length) {
      out += sect("Nifty options positioning") + table(["Expiry", "PCR (OI)", "PCR (vol)", "Max pain", "ATM IV %", "Support", "Resistance"],
        n.options.map(o => `<tr><td>${esc(o.expiry)}</td><td class="num">${o.pcr_oi}</td><td class="num">${o.pcr_vol}</td><td class="num">${num(o.max_pain, 0)}</td><td class="num">${o.atm_iv}</td><td class="num">${num(o.support, 0)}</td><td class="num">${num(o.resistance, 0)}</td></tr>`));
      out += `<p class="note">PCR = put OI / call OI. Support and resistance are the strikes with the most put and call open interest. These describe crowd positioning, not forecasts.</p>`;
    }
    out += sect(`All NSE indices (${n.indices.length})`) + `<input id="idxq" class="search" type="search" placeholder="Filter indices, e.g. bank, pharma, midcap" aria-label="Filter indices">`;
    out += table(["Index", "Last", "1D", "1M", "1Y", "P/E", "P/B", "From 52W high"], [], "idxtbl");
    return out;
  }

  function wireIndices() {
    const n = M.nse.indices;
    let key = "index", dir = 1;
    const tb = $("#idxtbl tbody"), q = $("#idxq");
    const heads = ["index", "last", "chg1d", "m1", "y1", "pe", "pb", "from_hi"];
    const draw = () => {
      const f = (q.value || "").toLowerCase();
      const rows = n.filter(r => r.index.toLowerCase().includes(f)).sort((a, b) => {
        const x = a[key], y = b[key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
      });
      tb.innerHTML = rows.map(r => `<tr><td>${esc(r.index)}</td><td class="num">${num(r.last)}</td><td class="num ${cls(r.chg1d)}">${pct(r.chg1d)}</td><td class="num ${cls(r.m1)}">${pct(r.m1)}</td><td class="num ${cls(r.y1)}">${pct(r.y1)}</td><td class="num">${r.pe == null ? "" : r.pe.toFixed(1)}</td><td class="num">${r.pb == null ? "" : r.pb.toFixed(2)}</td><td class="num ${cls(r.from_hi)}">${pct(r.from_hi)}</td></tr>`).join("");
    };
    document.querySelectorAll("#idxtbl th").forEach((th, i) => th.addEventListener("click", () => { const k = heads[i]; dir = key === k ? -dir : 1; key = k; draw(); }));
    q.addEventListener("input", draw);
    draw();
  }

  // ---------------------------------------------------------------- flows
  function flows() {
    const f = D.flows, fl = M && M.flows, led = (M && M.flow_ledger) || [];
    if (!f && !fl) return `<div class="banner warn">FII/DII data was unavailable at the last refresh.</div>`;
    let out = `<h2 class="sheet">Institutional flows</h2><p class="subtitle">Equity cash market, net, INR crore. NSE provisional data.</p><div class="cards">`;
    if (f) {
      out += card(`FII / FPI net · ${f.date}`, inr(f.fii), f.fii >= 0 ? "Net buyer" : "Net seller", cls(f.fii));
      out += card(`DII net · ${f.date}`, inr(f.dii), f.dii >= 0 ? "Net buyer" : "Net seller", cls(f.dii));
    }
    out += `</div>`;
    if (fl) {
      out += sect("Totals from the daily ledger") + `<div class="banner warn">Tracked since ${esc(fl.tracked_since)} (${fl.n_days} trading days). Totals cover only the days tracked so far, so they are lower than full month, quarter or year totals until enough days accumulate.</div>`;
      out += table(["Period", "Days tracked", "FII net (₹ cr)", "DII net (₹ cr)"], [["Month to date (" + fl.start_month + ")", fl.mtd], ["Quarter to date (FY quarter)", fl.qtd], ["Financial year to date", fl.fytd]]
        .map(([l, s]) => `<tr><td>${esc(l)}</td><td class="num">${s.days}</td><td class="num ${cls(s.fii)}">${inr(s.fii)}</td><td class="num ${cls(s.dii)}">${inr(s.dii)}</td></tr>`));
    }
    if (led.length) {
      const last = led.slice(-30);
      out += chartBox("Daily net flow, last " + last.length + " sessions (₹ cr)", { labels: last.map(r => r.date.slice(5)), datasets: [
        { label: "FII net", data: last.map(r => Math.round(r.fii_net)), color: "#2e75b6" }, { label: "DII net", data: last.map(r => Math.round(r.dii_net)), color: "#e08a1e" }] });
      out += sect("Daily ledger") + table(["Date", "FII buy", "FII sell", "FII net", "DII buy", "DII sell", "DII net"], led.slice().reverse().slice(0, 60).map(r =>
        `<tr><td>${esc(r.date)}</td><td class="num">${num(r.fii_buy, 0)}</td><td class="num">${num(r.fii_sell, 0)}</td><td class="num ${cls(r.fii_net)}">${inr(r.fii_net)}</td><td class="num">${num(r.dii_buy, 0)}</td><td class="num">${num(r.dii_sell, 0)}</td><td class="num ${cls(r.dii_net)}">${inr(r.dii_net)}</td></tr>`));
    }
    return out;
  }

  // ---------------------------------------------------------------- fx / global
  function yTable(list, yields) {
    const ch = v => v == null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(yields ? 1 : 2) + (yields ? " bp" : "%");
    return table(["Instrument", "Last", "1D", "1M", "1Y", "60-day", "As of"], list.map(x =>
      `<tr><td>${esc(x.name)}</td><td class="num">${num(x.last, x.last < 10 ? 3 : 2)}</td><td class="num ${cls(x.chg1d)}">${ch(x.chg1d)}</td><td class="num ${cls(x.m1)}">${ch(x.m1)}</td><td class="num ${cls(x.y1)}">${ch(x.y1)}</td><td>${spark(x.spark)}</td><td>${esc(x.asof)}</td></tr>`));
  }
  function fx() {
    const y = M.yahoo, rbi = M.rbi;
    let out = `<h2 class="sheet">FX, rates and commodities</h2><p class="subtitle">End-of-day. Yahoo Finance and RBI. Each row shows its own last-close date.</p>`;
    out += sect("Currencies") + yTable(y.fx) + `<p class="note">USD/INR up means the rupee is weaker.</p>`;
    out += sect("US Treasury yields") + yTable(y.us_rates, true) + `<p class="note">The India 10-year G-sec yield has no reliable free source, so it is not shown. Yahoo's 13-week series is the T-bill, not the 2-year note.</p>`;
    out += sect("Commodities") + yTable(y.commodities);
    if (rbi) {
      out += sect("RBI policy rates (current)") + table(["Rate", "%"], Object.entries(rbi.rates).filter(([, v]) => v != null).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.toFixed(2)}</td></tr>`));
      out += `<p class="note">Read from the RBI homepage on ${esc(rbi.asof)}. Reference rates: ${Object.entries(rbi.ref_fx).filter(([, v]) => v != null).map(([k, v]) => `${esc(k)} ${v}`).join(" · ")}.</p>`;
    }
    return out;
  }
  function globalView() {
    return `<h2 class="sheet">Global markets</h2><p class="subtitle">Equity indices, volatility and crypto. Each market shows its own last-close date.</p>` + yTable(M.yahoo.global);
  }

  // ---------------------------------------------------------------- derived
  function derived() {
    let out = `<h2 class="sheet">Derived metrics</h2><p class="subtitle">Calculated from the data on the other tabs. The method is shown for every metric.</p>`;
    const groups = [...new Set(M.derived.map(d => d.group))];
    for (const g of groups) {
      out += sect(g) + table(["Metric", "Value", "How calculated", "Note", "As of"], M.derived.filter(d => d.group === g).map(d =>
        `<tr><td>${esc(d.name)}</td><td class="num"><b>${esc(typeof d.value === "number" ? num(d.value, Math.abs(d.value) >= 1000 ? 0 : 2) : d.value)}</b> ${esc(d.unit)}</td><td>${esc(d.how)}</td><td>${esc(d.note)}</td><td>${esc(d.asof)}</td></tr>`));
    }
    return out;
  }

  // ---------------------------------------------------------------- valuation / returns / sectors
  function valuation() {
    let out = `<h2 class="sheet">Index valuation</h2><p class="subtitle">Trailing P/E from NSE vs reference 5-year and 10-year averages. Flag: expensive when P/E is 20% or more above an average, cheap when 20% or more below.</p>`;
    out += table(["Index", "P/E now", "P/B now", "5Y avg", "10Y avg", "vs 5Y", "vs 10Y", "Flag"], D.valuation.map(v =>
      `<tr><td>${esc(v.name)}</td><td class="num">${v.pe.toFixed(1)}</td><td class="num">${v.pb.toFixed(2)}</td><td class="num">${v.avg5}</td><td class="num">${v.avg10}</td>` +
      `<td class="num ${cls(-v.vs5)}">${v.vs5 > 0 ? "+" : ""}${v.vs5.toFixed(1)}%</td><td class="num ${cls(-v.vs10)}">${v.vs10 > 0 ? "+" : ""}${v.vs10.toFixed(1)}%</td><td>${esc(v.zone)}</td></tr>`));
    out += chartBox("Current P/E vs averages", { labels: D.valuation.map(v => v.name), datasets: [
      { label: "P/E now", data: D.valuation.map(v => v.pe), color: css("--brand2") }, { label: "5Y avg", data: D.valuation.map(v => v.avg5), color: "#e08a1e" },
      { label: "10Y avg", data: D.valuation.map(v => v.avg10), color: "#7d5ba6" }] });
    out += `<div class="banner warn">${esc(D.static_note.split(". ")[0] + ".")} The NSE P/E basis differs slightly from the source of the averages, so read the gap as directional.</div>`;
    return out;
  }

  function retTable(rows, first) {
    return table([first, "1 Month", "3 Months", "6 Months", "1 Year"], rows.map(r => `<tr><td>${esc(r.name)}${r.static ? ' <span class="note">(fixed, Jan 2026)</span>' : ""}</td>` +
      ["m1", "m3", "m6", "y1"].map(k => `<td class="num ${cls(r[k])}">${pct(r[k])}</td>`).join("") + `</tr>`));
  }
  function returns() {
    const r2 = k => D.returns.map(r => +r[k].toFixed(2));
    return `<h2 class="sheet">Index returns</h2><p class="subtitle">Price returns to the latest close.</p>` + retTable(D.returns, "Index") +
      chartBox("Returns by period", { labels: D.returns.map(r => r.name), unit: "pct", datasets: [
        { label: "1M", data: r2("m1"), color: "#9db8d9" }, { label: "3M", data: r2("m3"), color: "#5b9bd5" },
        { label: "6M", data: r2("m6"), color: "#2e75b6" }, { label: "1Y", data: r2("y1"), color: "#1f3864" }] });
  }
  function sectors() {
    let out = `<h2 class="sheet">Sector returns and valuation</h2><p class="subtitle">NSE sector indices, sorted by 1-year return. Sectors marked fixed have no NSE index equivalent and are not refreshed.</p>` + retTable(D.sectors, "Sector") +
      chartBox("1-year return by sector", { labels: D.sectors.map(s => s.name + (s.static ? " (fixed)" : "")), unit: "pct", horizontal: true,
        datasets: [{ label: "1Y", data: D.sectors.map(s => +s.y1.toFixed(2)), colors: D.sectors.map(s => s.static ? css("--muted") : sign(s.y1)) }] }, true);
    const pe = D.sectors.filter(s => s.pe != null);
    if (pe.length) {
      const avg = (v, short) => v == null ? "n/a" : v.toFixed(1) + (short ? "*" : "");
      const vs = v => v == null ? "n/a" : (v > 0 ? "+" : "") + v.toFixed(1) + "%";
      const flag = z => z == null ? "" : z.startsWith("EXPENSIVE") ? `<span class="neg"><b>${esc(z)}</b></span>` : z.startsWith("CHEAP") ? `<span class="pos"><b>${esc(z)}</b></span>` : esc(z);
      out += sect("Sector valuation: P/E vs 5-year and 10-year averages");
      out += table(["Sector", "P/E now", "5Y avg (median)", "10Y avg (median)", "vs 5Y", "vs 10Y", "Zone"], D.sectors.map(s => `<tr><td>${esc(s.name)}${s.static ? ' <span class="note">(fixed, Jan 2026)</span>' : ""}</td>` +
        (s.pe == null ? `<td class="num" colspan="6">n/a</td>` :
          `<td class="num">${s.pe.toFixed(1)}</td><td class="num">${avg(s.avg5, s.short5)}</td><td class="num">${avg(s.avg10, s.short10)}</td>` +
          `<td class="num ${cls(s.vs5 == null ? null : -s.vs5)}">${vs(s.vs5)}</td><td class="num ${cls(s.vs10 == null ? null : -s.vs10)}">${vs(s.vs10)}</td><td>${flag(s.zone)}</td>`) + `</tr>`));
      const live = pe.filter(s => !s.static);
      out += chartBox("P/E now vs 5-year and 10-year average (live sectors)", { labels: live.map(s => s.name), datasets: [
        { label: "P/E now", data: live.map(s => s.pe), color: css("--brand2") }, { label: "5Y avg (median)", data: live.map(s => s.avg5), color: "#e08a1e" },
        { label: "10Y avg (median)", data: live.map(s => s.avg10), color: "#7d5ba6" }] }, true);
      out += `<div class="banner warn">Averages are the median of weekly NSE index P/E readings on the same basis as "P/E now". The median is used because NSE's P/E series has data breaks and earnings-collapse spikes (for example Smallcap 250 printed over 3,000 in 2016) that make a plain mean meaningless. * marks an index whose history is shorter than the window. Expensive means 20% or more above an average, cheap 20% or more below. Fixed rows are January 2026 figures on a different (Bloomberg) basis.</div>`;
    }
    return out;
  }

  // ---------------------------------------------------------------- data status
  function status() {
    let out = `<h2 class="sheet">Data status</h2><p class="subtitle">What on this site refreshes, and how fresh it is. Live means refreshed from end-of-day public data by the daily job (or on demand), not a streaming feed.</p>`;
    out += table(["Item", "Status", "Data as of", "Last refreshed"], (D.freshness || []).map(f => {
      const c = f.status === "LIVE" ? "pos" : f.status === "STATIC" ? "neg" : "";
      return `<tr><td>${esc(f.item)}</td><td class="${c}"><b>${esc(f.status)}</b></td><td>${esc(f.as_of)}</td><td>${esc(f.last_refreshed)}</td></tr>`;
    }));
    out += `<div class="banner warn">${esc(D.static_note)}</div>`;
    return out;
  }

  init();
})();
