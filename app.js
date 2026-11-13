// The explainer site. index.json (written by tools/publish.py) lists every video; this page draws the library and
// the player from it. What a viewer has watched lives only in their own browser (localStorage), which is what the
// New and Updated badges are worked out from.
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
	const e = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v == null || v === false) continue;
		if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
		else if (k === "text") e.textContent = v;
		else e.setAttribute(k, v === true ? "" : v);
	}
	for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
	return e;
};

const store = {
	get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
	set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window: nothing remembered */ } },
};

const DAY = 86400, WEEK = 7 * DAY;
const now = () => Date.now() / 1000;
// The first visit: videos from more than a week before it are not "new" to this viewer, or a first visit
// would show every video in the library as New.
if (!store.get("ex.first")) store.set("ex.first", now());

let IDX = { videos: [], playlists: [] }, BY = new Map();

// ---- what this viewer has seen --------------------------------------------------------------------------------

const seen = () => store.get("ex.seen", {});
function markSeen(v) { const s = seen(); s[v.id] = v.v; store.set("ex.seen", s); }
function markAllSeen() { const s = seen(); for (const v of IDX.videos) s[v.id] = v.v; store.set("ex.seen", s); }
const wasUpdated = (v) => v.updated > v.added;   // replaced after it first went up
// "new": never opened, and put up around or after this viewer's first visit.
// "upd": opened at an older version, or never opened but replaced around or after the first visit.
function badge(v) {
	const s = seen()[v.id], since = store.get("ex.first") - WEEK;
	if (s === v.v) return null;
	if (s) return "upd";
	if (v.added >= since) return "new";
	if (wasUpdated(v) && v.updated >= since) return "upd";
	return null;
}
const pos = (v) => { const p = store.get("ex.pos", {})[v.id]; return p && p.v === v.v ? p.t : 0; };
function savePos(v, t) {
	const all = store.get("ex.pos", {});
	if (t < 2 || t > Math.max(v.dur - 10, v.dur * 0.95)) delete all[v.id];   // barely started, or finished
	else all[v.id] = { v: v.v, t: Math.round(t) };
	store.set("ex.pos", all);
}

// ---- formatting -------------------------------------------------------------------------------------------------

const mmss = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${x}` : `${m}:${x}`; };
function ago(t) {
	const d = now() - t;
	if (d < 3600) return "just now";
	if (d < DAY) return `${Math.floor(d / 3600)} h ago`;
	if (d < 2 * DAY) return "yesterday";
	if (d < 14 * DAY) return `${Math.floor(d / DAY)} days ago`;
	return new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(t * 1000).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
let toastTimer;
function toast(msg) {
	$("#toast")?.remove();
	document.body.append(el("div", { id: "toast", role: "status", text: msg }));
	clearTimeout(toastTimer); toastTimer = setTimeout(() => $("#toast")?.remove(), 2200);
}

// ---- cards ------------------------------------------------------------------------------------------------------

function card(v, extra = {}) {
	const b = badge(v), p = pos(v);
	return el("a", { class: "card" + (extra.playing ? " playing" : ""), href: `#/${encodeURIComponent(v.id)}` + (extra.list ? `?list=${encodeURIComponent(extra.list)}` : ""), "data-id": v.id },
		el("div", { class: "thumb" },
			el("img", { src: v.thumb, alt: "", loading: "lazy" }),
			b && el("span", { class: "badge " + b, text: b === "new" ? "New" : "Updated" }),
			el("span", { class: "dur", text: mmss(v.dur) }),
			p > 0 && el("span", { class: "progress", style: `width:${Math.min(100, (100 * p) / v.dur)}%` })),
		el("div", {},
			el("div", { class: "title", text: v.title }),
			el("div", { class: "meta", text: wasUpdated(v) ? `Updated ${ago(v.updated)}` : `Added ${ago(v.added)}` })));
}

// ---- library ----------------------------------------------------------------------------------------------------

const SORTS = { updated: ["Recently changed", (a, b) => b.updated - a.updated], added: ["Newest", (a, b) => b.added - a.added], title: ["A–Z", (a, b) => a.title.localeCompare(b.title)] };

function library() {
	const q = $(".search input").value.trim().toLowerCase();
	const main = $("#main");
	if (!IDX.videos.length) { main.replaceChildren(el("p", { class: "empty", text: "No videos yet." })); return; }
	if (q) {
		const words = q.split(/\s+/);
		const hits = IDX.videos.filter((v) => words.every((w) => (v.title + " " + v.id.replace(/_/g, " ")).toLowerCase().includes(w)));
		main.replaceChildren(el("section", {},
			el("div", { class: "sechead" }, el("h2", { text: "Search" }), el("span", { class: "count", text: `${hits.length} of ${IDX.videos.length}` })),
			hits.length ? el("div", { class: "grid" }, hits.map((v) => card(v))) : el("p", { class: "empty", text: "Nothing matches." })));
		return;
	}
	const out = [];
	const fresh = IDX.videos.filter(badge).sort((a, b) => b.updated - a.updated);
	if (fresh.length) out.push(el("section", { id: "fresh" },
		el("div", { class: "sechead" }, el("h2", { text: "New and updated" }), el("span", { class: "count", text: fresh.length }),
			el("button", { class: "link", onclick: () => { markAllSeen(); library(); }, text: "Mark all seen" })),
		el("div", { class: "row" }, fresh.map((v) => card(v)))));
	for (const pl of IDX.playlists) {
		const vids = pl.ids.map((id) => BY.get(id)).filter(Boolean);
		if (!vids.length) continue;
		out.push(el("section", { class: "playlist" },
			el("div", { class: "sechead" }, el("h2", { text: pl.name }), el("span", { class: "count", text: vids.length })),
			el("div", { class: "row" }, vids.map((v) => card(v, { list: pl.name })))));
	}
	const sort = store.get("ex.sort", "updated") in SORTS ? store.get("ex.sort", "updated") : "updated";
	const sel = el("select", { "aria-label": "Sort", onchange: (e) => { store.set("ex.sort", e.target.value); library(); } },
		Object.entries(SORTS).map(([k, [label]]) => el("option", { value: k, selected: k === sort, text: label })));
	out.push(el("section", { id: "all" },
		el("div", { class: "sechead" }, el("h2", { text: "All videos" }), el("span", { class: "count", text: IDX.videos.length }), sel),
		el("div", { class: "grid" }, [...IDX.videos].sort(SORTS[sort][1]).map((v) => card(v)))));
	main.replaceChildren(...out);
}

// ---- player -----------------------------------------------------------------------------------------------------

// The small copy on phones (half the data), the full render elsewhere; the HD button swaps and is remembered.
const wantHD = () => store.get("ex.hd", !matchMedia("(max-width: 760px)").matches);

function watch(id, listName) {
	const v = BY.get(id);
	if (!v) { $("#main").replaceChildren(el("p", { class: "empty" }, "That video isn't here. ", el("a", { href: "#/", style: "color:var(--accent)", text: "All videos" }))); return; }
	const pl = listName && IDX.playlists.find((p) => p.name === listName);
	const queue = pl ? pl.ids.map((x) => BY.get(x)).filter(Boolean) : [...IDX.videos].sort((a, b) => b.updated - a.updated);
	const next = pl ? queue[queue.indexOf(v) + 1] : null;
	const status = badge(v);
	markSeen(v);

	const hd = () => wantHD() || !v.small;
	const video = el("video", { controls: true, playsinline: true, preload: "metadata", poster: v.thumb, src: hd() ? v.src : v.small });
	video.addEventListener("loadedmetadata", () => { const p = pos(v); if (p && !video.dataset.resumed) { video.currentTime = p; video.dataset.resumed = 1; } }, { once: false });
	let last = 0;
	video.addEventListener("timeupdate", () => { if (Math.abs(video.currentTime - last) > 5) { last = video.currentTime; savePos(v, last); } });
	video.addEventListener("pause", () => savePos(v, video.currentTime));
	video.addEventListener("ended", () => { savePos(v, v.dur); if (next) location.hash = `#/${encodeURIComponent(next.id)}?list=${encodeURIComponent(pl.name)}`; });

	const hdBtn = v.small && el("button", { "aria-pressed": String(hd()), title: "Full quality (uses more data)", text: "HD",
		onclick: (e) => {
			store.set("ex.hd", !hd());
			const t = video.currentTime, playing = !video.paused;
			video.src = hd() ? v.src : v.small;
			video.dataset.resumed = 1;
			video.addEventListener("loadedmetadata", () => { video.currentTime = t; if (playing) video.play().catch(() => {}); }, { once: true });
			e.currentTarget.setAttribute("aria-pressed", String(hd()));
		} });
	const share = el("button", { text: "Copy link", onclick: async () => {
		const url = location.origin + location.pathname + `#/${encodeURIComponent(v.id)}`;
		try { await navigator.clipboard.writeText(url); toast("Link copied"); } catch { prompt("Copy this link", url); }
	} });

	const meta = el("div", { class: "meta" },
		el("span", { text: mmss(v.dur) }),
		el("span", { text: `Added ${ago(v.added)}` }),
		wasUpdated(v) && el("span", { class: "updated", text: `Updated ${ago(v.updated)}` + (status === "upd" ? " · changed since you last watched" : "") }));

	const side = el("aside", { class: "side" },
		el("h3", { text: pl ? `${pl.name} · ${queue.indexOf(v) + 1} of ${queue.length}` : "More videos" }),
		el("div", { class: "list" }, (pl ? queue : queue.filter((x) => x !== v).slice(0, 12)).map((x) => card(x, { list: pl?.name, playing: x === v }))));

	$("#main").replaceChildren(el("div", { class: "watch" },
		el("div", { class: "player" }, video,
			el("div", { class: "info" }, el("h1", { text: v.title }), meta, el("div", { class: "actions" }, hdBtn, share,
				next && el("a", { href: `#/${encodeURIComponent(next.id)}?list=${encodeURIComponent(pl.name)}`, text: "Next ›" })))),
		side));
	document.title = v.title + " · Explainers";
	scrollTo(0, 0);
	if (pl) side.querySelector(".playing")?.scrollIntoView({ block: "nearest" });
}

// ---- routing ----------------------------------------------------------------------------------------------------

function route() {
	const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
	const list = new URLSearchParams(query).get("list");
	document.title = "Explainers";
	if (path) watch(decodeURIComponent(path), list); else library();
}

async function load() {
	try {
		const r = await fetch("index.json", { cache: "no-cache" });
		if (!r.ok) throw new Error(r.status);
		IDX = await r.json();
	} catch (e) {
		$("#main").replaceChildren(el("p", { class: "empty", text: "Couldn't load the video list. Try again in a moment." }));
		return;
	}
	IDX.playlists ||= [];
	BY = new Map(IDX.videos.map((v) => [v.id, v]));
	route();
}

addEventListener("hashchange", route);
$(".search input").addEventListener("input", () => { if (location.hash.length > 2) history.replaceState(null, "", "#/"); library(); });
load();
