(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const pct = v => v == null ? "n/a" : (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  const cls = v => v == null ? "" : v < 0 ? "neg" : "pos";
  const inr = v => (v >= 0 ? "+" : "-") + Math.abs(Math.round(v)).toLocaleString("en-IN");
  const sign = v => v >= 0 ? css("--pos") : css("--neg");
  let D, charts = [], current = "overview";

  const TABS = [["overview", "Overview"], ["valuation", "Valuation"], ["returns", "Index Returns"], ["sectors", "Sectors"], ["flows", "FII / DII"]];

  async function init() {
    try {
      const r = await fetch("data/dashboard.json?t=" + Date.now());
      if (!r.ok) throw new Error(r.status);
      D = await r.json();
    } catch (e) {
      $("#view").innerHTML = `<div class="banner warn">Could not load data: ${esc(e.message)}</div>`;
      return;
    }
    $("#asof").textContent = `Live NSE data · last refreshed ${D.generated_at}`;
    $("#tabs").innerHTML = TABS.map(([id, n]) => `<button class="tab" role="tab" data-id="${id}" aria-selected="false">${esc(n)}</button>`).join("");
    $("#tabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) show(b.dataset.id); });
    show((location.hash || "").slice(1) || "overview");
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => show(current));
  }

  function show(id) {
    if (!TABS.some(t => t[0] === id)) id = "overview";
    current = id;
    history.replaceState(null, "", "#" + id);
    document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.id === id));
    charts.forEach(c => c.destroy());
    charts = [];
    $("#view").innerHTML = { overview, valuation, returns, sectors, flows }[id]();
    $("#view").querySelectorAll("canvas[data-chart]").forEach(cv => charts.push(makeChart(cv, JSON.parse(cv.dataset.chart))));
    scrollTo(0, 0);
  }

  const card = (l, v, n, c = "") => `<div class="card ${c}"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div><div class="n">${esc(n)}</div></div>`;
  const chartBox = (title, cfg, tall) =>
    `<div class="chartbox${tall ? " tall" : ""}"><h4>${esc(title)}</h4><div class="cv"><canvas data-chart="${esc(JSON.stringify(cfg))}"></canvas></div></div>`;

  function makeChart(cv, cfg) {
    const ink = css("--muted"), line = css("--line");
    const h = !!cfg.horizontal, ax = h ? "x" : "y";
    return new Chart(cv, {
      type: "bar",
      data: {
        labels: cfg.labels,
        datasets: cfg.datasets.map(d => ({ label: d.label, data: d.data, backgroundColor: d.colors || d.color, borderRadius: 3 })),
      },
      options: {
        indexAxis: h ? "y" : "x", responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: cfg.datasets.length > 1, labels: { color: ink } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${cfg.unit === "pct" ? pct(c.parsed[ax]) : c.parsed[ax]}` } },
        },
        scales: { x: { ticks: { color: ink }, grid: { color: line } }, y: { ticks: { color: ink }, grid: { color: line } } },
      },
    });
  }

  function overview() {
    const n50 = D.valuation.find(v => v.name === "Nifty 50"), sc = D.valuation.find(v => v.name === "Nifty Smallcap 250");
    const r50 = D.returns.find(r => r.name === "Nifty 50");
    const f = D.flows;
    let out = `<h2 class="sheet">Market snapshot</h2><p class="subtitle">Latest available NSE close. Use the tabs above for detail.</p><div class="cards">`;
    out += card("Nifty 50 P/E", n50.pe.toFixed(1), `${n50.vs10 > 0 ? "+" : ""}${n50.vs10.toFixed(1)}% vs 10Y avg (${n50.avg10})`);
    out += card("Nifty 50 · 1 year", pct(r50.y1), `1M ${pct(r50.m1)} · 6M ${pct(r50.m6)}`, cls(r50.y1));
    out += card("Smallcap 250 P/E", sc.pe.toFixed(1), `${sc.zone !== "—" ? sc.zone : "Within range"} · ${sc.vs10 > 0 ? "+" : ""}${sc.vs10.toFixed(1)}% vs 10Y avg`, sc.zone !== "—" ? "neg" : "");
    if (f) out += card(`FII net · ${f.date}`, inr(f.fii) + " Cr", `DII ${inr(f.dii)} Cr`, cls(f.fii));
    out += `</div>`;
    if (D.observation) {
      out += `<p class="note">1-month leader: <b>${esc(D.observation.best[0])}</b> (${pct(D.observation.best[1])}). Laggard: <b>${esc(D.observation.worst[0])}</b> (${pct(D.observation.worst[1])}).</p>`;
    }
    const live = D.sectors.filter(s => !s.static);
    out += chartBox("Sector 1-year return (live sectors)", {
      labels: live.map(s => s.name), unit: "pct", horizontal: true,
      datasets: [{ label: "1Y", data: live.map(s => +s.y1.toFixed(2)), colors: live.map(s => sign(s.y1)) }],
    }, true);
    return out;
  }

  function valuation() {
    let out = `<h2 class="sheet">Index valuation</h2><p class="subtitle">Trailing P/E from NSE vs reference 5-year and 10-year averages. Flag: expensive when P/E is 20% or more above an average, cheap when 20% or more below.</p>`;
    out += `<div class="tablewrap"><table><thead><tr><th>Index</th><th>P/E now</th><th>P/B now</th><th>5Y avg</th><th>10Y avg</th><th>vs 5Y</th><th>vs 10Y</th><th>Flag</th></tr></thead><tbody>`;
    for (const v of D.valuation) {
      out += `<tr><td>${esc(v.name)}</td><td class="num">${v.pe.toFixed(1)}</td><td class="num">${v.pb.toFixed(2)}</td><td class="num">${v.avg5}</td><td class="num">${v.avg10}</td>` +
        `<td class="num ${cls(-v.vs5)}">${v.vs5 > 0 ? "+" : ""}${v.vs5.toFixed(1)}%</td><td class="num ${cls(-v.vs10)}">${v.vs10 > 0 ? "+" : ""}${v.vs10.toFixed(1)}%</td><td>${esc(v.zone)}</td></tr>`;
    }
    out += `</tbody></table></div>`;
    out += chartBox("Current P/E vs averages", {
      labels: D.valuation.map(v => v.name),
      datasets: [
        { label: "P/E now", data: D.valuation.map(v => v.pe), color: css("--brand2") },
        { label: "5Y avg", data: D.valuation.map(v => v.avg5), color: "#e08a1e" },
        { label: "10Y avg", data: D.valuation.map(v => v.avg10), color: "#7d5ba6" },
      ],
    });
    out += `<div class="banner warn">${esc(D.static_note.split(". ")[0] + ".")} The NSE P/E basis differs slightly from the source of the averages, so read the gap as directional.</div>`;
    return out;
  }

  function retTable(rows, first) {
    let out = `<div class="tablewrap"><table><thead><tr><th>${first}</th><th>1 Month</th><th>3 Months</th><th>6 Months</th><th>1 Year</th></tr></thead><tbody>`;
    for (const r of rows) {
      out += `<tr><td>${esc(r.name)}${r.static ? ' <span class="note">(fixed, Jan 2026)</span>' : ""}</td>` +
        ["m1", "m3", "m6", "y1"].map(k => `<td class="num ${cls(r[k])}">${pct(r[k])}</td>`).join("") + `</tr>`;
    }
    return out + `</tbody></table></div>`;
  }

  function returns() {
    const r2 = k => D.returns.map(r => +r[k].toFixed(2));
    let out = `<h2 class="sheet">Index returns</h2><p class="subtitle">Price returns to the latest close.</p>` + retTable(D.returns, "Index");
    out += chartBox("Returns by period", {
      labels: D.returns.map(r => r.name), unit: "pct",
      datasets: [
        { label: "1M", data: r2("m1"), color: "#9db8d9" }, { label: "3M", data: r2("m3"), color: "#5b9bd5" },
        { label: "6M", data: r2("m6"), color: "#2e75b6" }, { label: "1Y", data: r2("y1"), color: "#1f3864" },
      ],
    });
    return out;
  }

  function sectors() {
    let out = `<h2 class="sheet">Sector returns</h2><p class="subtitle">NSE sector indices, sorted by 1-year return. Sectors marked fixed have no NSE index equivalent and are not refreshed.</p>` + retTable(D.sectors, "Sector");
    out += chartBox("1-year return by sector", {
      labels: D.sectors.map(s => s.name + (s.static ? " (fixed)" : "")), unit: "pct", horizontal: true,
      datasets: [{ label: "1Y", data: D.sectors.map(s => +s.y1.toFixed(2)), colors: D.sectors.map(s => s.static ? css("--muted") : sign(s.y1)) }],
    }, true);
    return out;
  }

  function flows() {
    const f = D.flows;
    if (!f) return `<div class="banner warn">FII/DII data was unavailable at the last refresh.</div>`;
    let out = `<h2 class="sheet">Institutional flows</h2><p class="subtitle">Equity cash market, net, latest session (${esc(f.date)}). NSE provisional data, INR crore.</p><div class="cards">`;
    out += card("FII / FPI net", inr(f.fii), f.fii >= 0 ? "Net buyer" : "Net seller", cls(f.fii));
    out += card("DII net", inr(f.dii), f.dii >= 0 ? "Net buyer" : "Net seller", cls(f.dii)) + `</div>`;
    out += chartBox("Net flow, latest session (INR Cr)", {
      labels: ["FII / FPI", "DII"],
      datasets: [{ label: "Net", data: [Math.round(f.fii), Math.round(f.dii)], colors: [sign(f.fii), sign(f.dii)] }],
    });
    return out;
  }

  init();
})();
