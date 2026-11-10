/* PS Spinz. Routes: #/ (Inbox) and #/crate.
   Everything lives in one file in the repo, data/spinz.json: { crate, inbox, history }.
   - Reading: through the GitHub API when a GitHub key is saved on this device (always fresh),
     otherwise the published copy (read-only).
   - Writing: every Keep / Drop / tag change commits data/spinz.json through the GitHub API.
     The daily picker (see PICKER.md) commits to the same file, so writes re-read and retry on conflict.
   - Spotify (optional): log in once, and Keep adds the track to a "PS Spinz" playlist.
   All localStorage keys start with "spz-" so they never mix with the other PS apps on this site. */
(() => {
  const OWNER = "abratica", REPO = "ps-spinz", FILE = "data/spinz.json";
  const GH = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;
  const PLAYLIST_NAME = "PS Spinz";
  const ROLES = ["opener", "groover", "peak", "closer"];
  const LANES = { groovy: "Groovy", dark: "Dark" };
  const app = document.getElementById("app");

  /* ---------- small helpers ---------- */
  const store = {
    get(k) { try { return localStorage.getItem("spz-" + k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem("spz-" + k) : localStorage.setItem("spz-" + k, v); } catch { /* private mode */ } },
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cap = (s) => s ? s[0].toUpperCase() + s.slice(1) : "";
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const niceDate = (d) => {
    const dt = new Date(d + "T12:00:00");
    const t = today();
    if (d === t) return "Today";
    const y = new Date(t + "T12:00:00"); y.setDate(y.getDate() - 1);
    if (dt.toDateString() === y.toDateString()) return "Yesterday";
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
  const b64encode = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };

  /* ---------- theme ---------- */
  const darkMQ = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const themePref = () => { const v = store.get("theme"); return v === "light" || v === "dark" ? v : (darkMQ && darkMQ.matches ? "dark" : "light"); };
  const applyTheme = () => {
    const t = themePref();
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#000811" : "#000811";
  };
  if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener("change", applyTheme);
  applyTheme();

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(text, action, onAction, ms = 2600) {
    document.querySelector(".toast")?.remove();
    clearTimeout(toastTimer);
    const el = document.createElement("div");
    el.className = "toast"; el.setAttribute("role", "status");
    el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action)}</button>` : ""}`;
    if (action) el.querySelector("button").addEventListener("click", () => { el.remove(); onAction(); });
    document.body.appendChild(el);
    toastTimer = setTimeout(() => el.remove(), ms);
  }

  /* ---------- data: GitHub ---------- */
  let S = null;          // current state
  let sha = null;        // blob sha of data/spinz.json when read through the API
  let live = false;      // true when this device can save (GitHub key works)
  const ghKey = () => store.get("gh-token");

  async function ghRead() {
    const res = await fetch(GH + "?ref=main", {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${ghKey()}` },
    });
    if (!res.ok) { const e = new Error(`GitHub said ${res.status}`); e.status = res.status; throw e; }
    const j = await res.json();
    return { state: JSON.parse(b64decode(j.content)), sha: j.sha };
  }

  async function load() {
    if (ghKey()) {
      try { const r = await ghRead(); S = r.state; sha = r.sha; live = true; lastLoad = Date.now(); return; }
      catch (e) { live = false; console.warn("GitHub read failed, showing the published copy", e); }
    }
    const res = await fetch("data/spinz.json", { cache: "no-store" });
    S = await res.json();
  }

  // Commits run one at a time. Each one re-reads the file, applies the change and writes it,
  // so a pick the daily run added in the meantime is never lost.
  let chain = Promise.resolve();
  function commit(message, mutate) {
    mutate(S);                       // show it right away
    if (!live) { toast("Not saved: add your GitHub key in Settings"); return Promise.resolve(false); }
    chain = chain.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const fresh = attempt === 0 && sha ? { state: null, sha } : await ghRead();
          let next;
          if (fresh.state) { next = fresh.state; mutate(next); } else { next = S; }
          const res = await fetch(GH, {
            method: "PUT",
            headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${ghKey()}`, "Content-Type": "application/json" },
            body: JSON.stringify({ message, content: b64encode(JSON.stringify(next, null, 2) + "\n"), sha: fresh.sha, branch: "main" }),
          });
          if (res.ok) { const j = await res.json(); sha = j.content.sha; S = next; return true; }
          if (res.status === 409 || res.status === 422) { sha = null; continue; }   // file changed underneath: re-read and redo
          throw new Error(`GitHub said ${res.status}`);
        } catch (e) {
          if (attempt === 2) { console.error(e); toast("Couldn't save. Check your connection and try again."); return false; }
          sha = null;
        }
      }
      return false;
    });
    return chain;
  }

  /* ---------- state changes ---------- */
  const findPick = (st, key) => {
    for (const d of st.inbox) { const p = d.picks.find((x) => x.key === key); if (p) return { day: d, pick: p }; }
    return null;
  };
  const removePick = (st, key) => {
    for (const d of st.inbox) d.picks = d.picks.filter((p) => p.key !== key);
    st.inbox = st.inbox.filter((d) => d.picks.length);
  };

  function doKeep(key, lane, role) {
    const hit = findPick(S, key); if (!hit) return;
    const p = { ...hit.pick }, pickedOn = hit.day.date, t = today();
    commit(`Keep: ${p.title}`, (st) => {
      const cur = findPick(st, key);
      const src = cur ? cur.pick : p;
      removePick(st, key);
      if (!st.crate.some((c) => c.key === key)) {
        st.crate.unshift({ key, title: src.title, artists: src.artists, spotify: src.spotify ?? null, lane, role: role || null, from: "pick", added: t, why: src.why || null });
      }
      if (!st.history.some((h) => h.key === key && h.decision === "keep")) {
        st.history.push({ key, title: src.title, artists: src.artists, spotify: src.spotify ?? null, decision: "keep", lane, role: role || null, pickedOn, decidedOn: t });
      }
    });
    render();
    if (p.spotify && sp.connected()) sp.add([p.spotify]).then(() => toast("Kept · added to your PS Spinz playlist")).catch((e) => toast(e.message));
    else toast("Kept · in your crate");
  }

  // Drops wait a few seconds so Undo can cancel them; leaving the app saves right away.
  const pendingDrops = new Map();
  function doDrop(key) {
    const hit = findPick(S, key); if (!hit || pendingDrops.has(key)) return;
    const card = app.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (card) card.classList.add("gone");
    setTimeout(() => { if (pendingDrops.has(key)) render(); }, 220);   // after the fade, take it out of the list
    const fire = () => {
      pendingDrops.delete(key);
      const p = { ...hit.pick }, pickedOn = hit.day.date, t = today();
      commit(`Drop: ${p.title}`, (st) => {
        removePick(st, key);
        if (!st.history.some((h) => h.key === key && h.decision === "drop")) {
          st.history.push({ key, title: p.title, artists: p.artists, spotify: p.spotify ?? null, decision: "drop", lane: p.lane || null, role: null, pickedOn, decidedOn: t });
        }
      });
      render();
    };
    const timer = setTimeout(fire, 4500);
    pendingDrops.set(key, { timer, fire });
    toast(`Dropped ${hit.pick.title}`, "Undo", () => {
      clearTimeout(timer); pendingDrops.delete(key); render();
    }, 4500);
  }
  function flushDrops() { for (const { timer, fire } of [...pendingDrops.values()]) { clearTimeout(timer); fire(); } }
  let lastLoad = 0;
  async function refresh() {
    if (!live || pendingDrops.size || Date.now() - lastLoad < 5000) return;
    await chain;                                  // let any save finish first
    try { const r = await ghRead(); S = r.state; sha = r.sha; lastLoad = Date.now(); render(); } catch { /* offline: keep what's shown */ }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDrops();
    else refresh();
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) refresh(); });
  window.addEventListener("pagehide", flushDrops);

  async function pasteLink(key) {
    if (!live) { toast("Add your GitHub key in Settings to save"); return; }
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { /* permission denied: ask instead */ }
    if (!/open\.spotify\.com\/(intl-[a-z]+\/)?track\/[A-Za-z0-9]{22}|spotify:track:[A-Za-z0-9]{22}/.test(text)) text = prompt("Paste the Spotify link for this track") || "";
    const m = /track[/:]([A-Za-z0-9]{22})/.exec(text);
    if (!m) { if (text) toast("That doesn't look like a Spotify track link"); return; }
    const id = m[1];
    const t = [...S.crate, ...S.inbox.flatMap((d) => d.picks)].find((x) => x.key === key);
    commit(`Spotify link: ${t ? t.title : key}`, (st) => {
      for (const x of [...st.crate, ...st.inbox.flatMap((d) => d.picks)]) if (x.key === key) x.spotify = id;
    });
    render();
    const inCrate = S.crate.some((c) => c.key === key);
    if (inCrate && sp.connected()) sp.add([id]).then(() => toast("Linked · added to your playlist")).catch(() => toast("Linked"));
    else toast("Linked");
  }

  function setTags(key, patch) {
    commit(`Tag: ${S.crate.find((c) => c.key === key)?.title || key}`, (st) => {
      const c = st.crate.find((x) => x.key === key); if (c) Object.assign(c, patch);
      const h = [...st.history].reverse().find((x) => x.key === key && x.decision === "keep"); if (h) Object.assign(h, patch);
    });
  }

  function removeFromCrate(key) {
    const c = S.crate.find((x) => x.key === key); if (!c) return;
    const t = today();
    commit(`Remove from crate: ${c.title}`, (st) => {
      st.crate = st.crate.filter((x) => x.key !== key);
      st.history.push({ key, title: c.title, artists: c.artists, spotify: c.spotify ?? null, decision: "removed", lane: c.lane, role: c.role || null, pickedOn: null, decidedOn: t });
    });
    if (c.spotify && sp.connected()) sp.remove(c.spotify).catch(() => {});
    openKey = null; render();
    toast(`Removed ${c.title}`);
  }

  /* ---------- Spotify (PKCE, no server) ---------- */
  const sp = (() => {
    const REDIRECT = new URL("./", location.href).href;
    const SCOPES = "playlist-read-private playlist-modify-private playlist-modify-public";
    const clientId = () => store.get("sp-client");
    const tok = () => { try { return JSON.parse(store.get("sp-token") || "null"); } catch { return null; } };
    const rand = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join(""); };
    const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    async function login() {
      if (!clientId()) throw new Error("Add your Spotify Client ID first");
      const verifier = rand(64), state = rand(16);
      store.set("sp-verifier", verifier); store.set("sp-state", state);
      const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
      const q = new URLSearchParams({ response_type: "code", client_id: clientId(), scope: SCOPES, redirect_uri: REDIRECT, code_challenge_method: "S256", code_challenge: challenge, state });
      location.href = "https://accounts.spotify.com/authorize?" + q;
    }
    async function tokenCall(body) {
      const res = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error_description || j.error || `Spotify login failed (${res.status})`);
      const old = tok();
      store.set("sp-token", JSON.stringify({ access: j.access_token, refresh: j.refresh_token || old?.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 }));
    }
    async function finishLogin() {
      const q = new URLSearchParams(location.search);
      if (!q.has("code") && !q.has("error")) return false;
      const clean = () => history.replaceState(null, "", REDIRECT + location.hash);
      if (q.get("error")) { clean(); toast("Spotify login was cancelled"); return true; }
      if (q.get("state") !== store.get("sp-state")) { clean(); toast("Spotify login didn't match. Try again."); return true; }
      try {
        await tokenCall({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: REDIRECT, client_id: clientId(), code_verifier: store.get("sp-verifier") });
        toast("Spotify connected");
      } catch (e) { toast(e.message, null, null, 5000); }
      store.set("sp-verifier", null); store.set("sp-state", null); clean();
      return true;
    }
    async function access() {
      const t = tok(); if (!t) throw new Error("Spotify isn't connected");
      if (Date.now() < t.exp) return t.access;
      try { await tokenCall({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: clientId() }); }
      catch { store.set("sp-token", null); throw new Error("Spotify logged out. Reconnect it in Settings."); }
      return tok().access;
    }
    async function api(path, opts = {}, retried) {
      const res = await fetch("https://api.spotify.com/v1" + path, { ...opts, headers: { Authorization: `Bearer ${await access()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });
      if (res.status === 401 && !retried) { const t = tok(); if (t) { t.exp = 0; store.set("sp-token", JSON.stringify(t)); } return api(path, opts, true); }
      if (!res.ok) { const j = await res.json().catch(() => ({})); const e = new Error(j.error?.message || `Spotify said ${res.status}`); e.status = res.status; throw e; }
      return res.status === 204 ? null : res.json().catch(() => null);
    }
    async function playlistId() {
      const cached = store.get("sp-playlist"); if (cached) return cached;
      let url = "/me/playlists?limit=50";
      while (url) {
        const page = await api(url);
        const hit = (page.items || []).find((p) => p && p.name === PLAYLIST_NAME);
        if (hit) { store.set("sp-playlist", hit.id); return hit.id; }
        url = page.next ? page.next.replace("https://api.spotify.com/v1", "") : null;
      }
      try {
        const made = await api("/me/playlists", { method: "POST", body: JSON.stringify({ name: PLAYLIST_NAME, public: false, description: "Kept in PS Spinz" }) });
        store.set("sp-playlist", made.id); return made.id;
      } catch (e) {
        throw new Error(`Spotify wouldn't create the playlist. Make one called "${PLAYLIST_NAME}" in Spotify and it will be used.`);
      }
    }
    async function playlistUris(pid) {
      const uris = new Set();
      let url = `/playlists/${pid}/items?limit=50`;
      while (url) {
        const page = await api(url);
        for (const it of page.items || []) { const t = it.item || it.track; if (t && t.uri) uris.add(t.uri); }
        url = page.next ? page.next.replace("https://api.spotify.com/v1", "") : null;
      }
      return uris;
    }
    async function add(ids) {
      const pid = await playlistId();
      const have = await playlistUris(pid).catch(() => new Set());
      const uris = ids.map((id) => `spotify:track:${id}`).filter((u) => !have.has(u));
      for (let i = 0; i < uris.length; i += 100) {
        try { await api(`/playlists/${pid}/items`, { method: "POST", body: JSON.stringify({ uris: uris.slice(i, i + 100) }) }); }
        catch (e) { if (e.status === 404) store.set("sp-playlist", null); throw e; }
      }
      return uris.length;
    }
    async function remove(id) {
      const pid = await playlistId();
      await api(`/playlists/${pid}/items`, { method: "DELETE", body: JSON.stringify({ items: [{ uri: `spotify:track:${id}` }] }) });
    }
    // Find a Spotify id for tracks that don't have one yet.
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    // Returns { id } when found, otherwise { why } saying what Spotify sent back.
    async function lookup(title, artists) {
      const core = title.replace(/\s*\(.*?\)\s*/g, " ").trim();
      const names = artists.split(",").map((a) => a.trim()).filter(Boolean);
      const want = norm(title), wantCore = norm(core);
      const versionWanted = /\((.*?)\)/.exec(title)?.[1];
      const artistHit = (t) => t.artists.some((a) => names.some((n) => norm(a.name) === norm(n) || norm(a.name).includes(norm(n)) || norm(n).includes(norm(a.name))));
      const queries = [`track:"${core}" artist:"${names[0]}"`, `${core} ${names[0]}`, ...names.slice(1, 3).map((n) => `${core} ${n}`), core];
      let closest = null, seen = 0;
      for (const q of queries) {
        const r = await api(`/search?type=track&limit=10&market=from_token&q=${encodeURIComponent(q)}`);
        const items = (r?.tracks?.items || []).filter(Boolean);
        seen += items.length;
        if (!closest && items[0]) closest = `${items[0].name} · ${items[0].artists.map((a) => a.name).join(", ")}`;
        const good = items.filter((t) => artistHit(t) && norm(t.name).includes(wantCore));
        if (!good.length) continue;
        const pick = good.find((t) => norm(t.name) === want)
          || (versionWanted && good.find((t) => norm(t.name).includes(norm(versionWanted))))
          || good.find((t) => !/remix|edit|mixed/i.test(t.name.replace(core, "")))
          || good[0];
        return { id: pick.id };
      }
      return { why: seen ? `Spotify's search didn't return it. Closest: ${closest}` : "Spotify's search returned nothing for it" };
    }
    // force: ignore the once-a-week limit and report every track (used by the Settings button).
    async function resolveMissing(force) {
      const tried = JSON.parse(store.get("sp-tried") || "{}");
      const weekAgo = Date.now() - 7 * 864e5;
      const todo = [...S.crate, ...S.inbox.flatMap((d) => d.picks)].filter((t) => !t.spotify && (force || !(tried[t.key] > weekAgo)));
      const found = {}, report = [];
      for (const t of todo) {
        try {
          const r = await lookup(t.title, t.artists);
          if (r.id) found[t.key] = r.id;
          report.push({ title: t.title, artists: t.artists, ok: !!r.id, why: r.why });
        } catch (e) {
          report.push({ title: t.title, artists: t.artists, ok: false, why: `Spotify error: ${e.message}` });
          if (e.status === 429) break;
        }
        tried[t.key] = Date.now();
      }
      store.set("sp-tried", JSON.stringify(tried));
      const n = Object.keys(found).length;
      if (n) {
        commit(`Spotify links for ${n} track${n > 1 ? "s" : ""}`, (st) => {
          for (const t of [...st.crate, ...st.inbox.flatMap((d) => d.picks)]) if (!t.spotify && found[t.key]) t.spotify = found[t.key];
        });
        render();
      }
      return report;
    }
    return {
      REDIRECT, login, finishLogin, add, remove, resolveMissing,
      connected: () => !!tok() && !!clientId(),
      disconnect() { store.set("sp-token", null); store.set("sp-playlist", null); },
      async syncCrate() { const ids = S.crate.map((c) => c.spotify).filter(Boolean); return add(ids); },
    };
  })();

  /* ---------- views ---------- */
  let openKey = null;            // expanded row in the crate
  const filters = { lane: null, role: null };
  const route = () => (location.hash === "#/crate" ? "crate" : "inbox");

  const spotifyUrl = (t) => t.spotify ? `https://open.spotify.com/track/${t.spotify}` : `https://open.spotify.com/search/${encodeURIComponent(`${t.title.replace(/\s*\(.*?\)/g, "")} ${t.artists.split(",")[0]}`)}`;
  const player = (t) => t.spotify
    ? `<div class="player"><iframe src="https://open.spotify.com/embed/track/${esc(t.spotify)}?utm_source=generator" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Play ${esc(t.title)}"></iframe></div>`
    : `<p class="nolink">No Spotify link yet. <a href="${spotifyUrl(t)}" target="_blank" rel="noopener">Find it on Spotify ↗</a>, tap Share → Copy link, then <button class="linkish" type="button" data-act="paste" data-key="${esc(t.key)}">paste the link</button>.</p>`;
  const laneChip = (l) => l ? `<span class="chip ${esc(l)}"><span class="dot"></span>${esc(LANES[l] || l)}</span>` : "";

  const gearSvg = `<svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
  const themeSvg = `<svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>`;

  function masthead() {
    const waiting = S.inbox.reduce((n, d) => n + d.picks.filter((p) => !pendingDrops.has(p.key)).length, 0);
    const r = route();
    const line = r === "inbox" ? (waiting ? `${waiting} to hear` : "All caught up") : `${S.crate.length} tracks in your crate`;
    return `<header class="masthead">
      <button class="icon-btn left" type="button" data-act="settings" aria-label="Settings">${gearSvg}</button>
      <h1 class="wordmark"><img src="brand/banner.webp" alt="PS Spinz" width="1200" height="400"></h1>
      <p class="dateline">${esc(line)}</p>
      <button class="icon-btn right" type="button" data-act="theme" aria-label="Switch light or dark mode">${themeSvg}</button>
      <nav class="tabs" role="tablist">
        <button class="tab" role="tab" data-go="#/" aria-selected="${r === "inbox"}">Inbox<span class="n">${waiting}</span></button>
        <button class="tab" role="tab" data-go="#/crate" aria-selected="${r === "crate"}">Crate<span class="n">${S.crate.length}</span></button>
      </nav>
    </header>`;
  }

  function banners() {
    if (!live) {
      return `<p class="banner">${ghKey() ? "Couldn't reach GitHub with your key, so this is read-only right now." : "Read-only on this device."} <button type="button" data-act="settings">Add your GitHub key</button> to save keeps and drops.</p>`;
    }
    if (!sp.connected() && !store.get("sp-banner-off")) {
      return `<p class="banner"><button type="button" data-act="settings">Connect Spotify</button> so every Keep lands in your PS Spinz playlist (and in rekordbox). <button type="button" data-act="banner-off" aria-label="Hide this">Hide</button></p>`;
    }
    return "";
  }

  function inboxView() {
    const days = [...S.inbox].map((d) => ({ ...d, picks: d.picks.filter((p) => !pendingDrops.has(p.key)) }))
      .filter((d) => d.picks.length).sort((a, b) => b.date.localeCompare(a.date));
    if (!days.length) return `<div class="empty"><b>All caught up</b>Tomorrow's three show up in the morning.</div>`;
    return days.map((d) => `<section class="day">
      <div class="day-head"><h2>${esc(niceDate(d.date))}</h2><span class="left">${d.picks.length} left</span></div>
      ${d.picks.map((p) => `<article class="pick" data-key="${esc(p.key)}">
        <h3 class="t-title">${esc(p.title)}</h3>
        <p class="t-artist">${esc(p.artists)}</p>
        <div class="chips">${laneChip(p.lane)}</div>
        ${p.why ? `<p class="why">${esc(p.why)}</p>` : ""}
        ${player(p)}
        <div class="row-actions">
          <button class="btn keep" type="button" data-act="keep" data-key="${esc(p.key)}">Keep</button>
          <button class="btn drop" type="button" data-act="drop" data-key="${esc(p.key)}">Drop</button>
          <a class="open-sp" href="${spotifyUrl(p)}" target="_blank" rel="noopener">Spotify ↗</a>
        </div>
      </article>`).join("")}
    </section>`).join("");
  }

  function crateView() {
    const seg = (group, val, label) => `<button class="filter" type="button" data-filter="${group}" data-val="${val}" aria-pressed="${filters[group] === val}">${label}</button>`;
    const list = S.crate.filter((c) => (!filters.lane || c.lane === filters.lane) && (!filters.role || (filters.role === "none" ? !c.role : c.role === filters.role)));
    const rows = list.map((c) => {
      const open = openKey === c.key;
      return `<div class="crow">
        <button class="crow-head" type="button" data-act="toggle" data-key="${esc(c.key)}" aria-expanded="${open}">
          <span class="lane-dot ${esc(c.lane || "")}"></span>
          <span class="txt"><p class="t-title">${esc(c.title)}</p><p class="t-artist">${esc(c.artists)}</p></span>
          ${c.role ? `<span class="role-tag">${esc(c.role)}</span>` : ""}
        </button>
        ${open ? `<div class="crow-body">
          ${c.why ? `<p class="why" style="margin-top:0">${esc(c.why)}</p>` : ""}
          ${player(c)}
          <div class="field" style="margin-top:12px"><div class="field-label">Lane</div><div class="seg">
            ${Object.entries(LANES).map(([k, v]) => `<button type="button" data-act="tag" data-key="${esc(c.key)}" data-lane="${k}" aria-pressed="${c.lane === k}">${v}</button>`).join("")}
          </div></div>
          <div class="field"><div class="field-label">Role</div><div class="seg">
            ${ROLES.map((r) => `<button type="button" data-act="tag" data-key="${esc(c.key)}" data-role="${r}" aria-pressed="${c.role === r}">${cap(r)}</button>`).join("")}
          </div></div>
          <div class="row-actions">
            <a class="open-sp" href="${spotifyUrl(c)}" target="_blank" rel="noopener">Open in Spotify ↗</a>
            <span style="flex:1"></span>
            <button class="btn drop small" type="button" data-act="remove" data-key="${esc(c.key)}">Remove</button>
          </div>
        </div>` : ""}
      </div>`;
    }).join("");
    return `<div class="filters">${seg("lane", null, "All")}${Object.entries(LANES).map(([k, v]) => seg("lane", k, v)).join("")}</div>
      <div class="filters" style="margin-top:0">${seg("role", null, "Any role")}${ROLES.map((r) => seg("role", r, cap(r))).join("")}${seg("role", "none", "Untagged")}</div>
      ${list.length ? `<div class="crate-list">${rows}</div>` : `<div class="empty"><b>Nothing here</b>No tracks match these filters.</div>`}`;
  }

  function render() {
    if (!S) return;
    const scroll = window.scrollY;
    app.innerHTML = masthead() + `<main class="wrap">${banners()}${route() === "crate" ? crateView() : inboxView()}</main>`;
    window.scrollTo(0, scroll);
  }

  /* ---------- sheets ---------- */
  function sheet(html, bind) {
    document.querySelector(".sheet")?.remove();
    const el = document.createElement("div");
    el.className = "sheet";
    el.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true">${html}</div>`;
    el.addEventListener("click", (e) => { if (e.target === el || e.target.closest("[data-close]")) el.remove(); });
    document.body.appendChild(el);
    bind && bind(el);
    return el;
  }

  function keepSheet(key) {
    const hit = findPick(S, key); if (!hit) return;
    let lane = hit.pick.lane || null, role = null;
    sheet(`<h3>Keep it</h3><p class="sub">${esc(hit.pick.title)} · ${esc(hit.pick.artists)}</p>
      <div class="field"><div class="field-label">Lane</div><div class="seg" data-g="lane">
        ${Object.entries(LANES).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${lane === k}">${v}</button>`).join("")}</div></div>
      <div class="field"><div class="field-label">Role (optional)</div><div class="seg" data-g="role">
        ${ROLES.map((r) => `<button type="button" data-v="${r}" aria-pressed="false">${cap(r)}</button>`).join("")}</div></div>
      <div class="sheet-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn keep" type="button" data-save>Keep it</button></div>`,
    (el) => {
      el.querySelectorAll(".seg").forEach((g) => g.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        const which = g.dataset.g, v = b.dataset.v;
        if (which === "lane") lane = v; else role = role === v ? null : v;
        g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === (which === "lane" ? lane : role))));
      }));
      el.querySelector("[data-save]").addEventListener("click", () => { el.remove(); doKeep(key, lane, role); });
    });
  }

  function settingsSheet() {
    const hasGh = !!ghKey();
    sheet(`<h3>Settings</h3><p class="sub">Saved on this device only.</p>
      <div class="field"><div class="field-label">GitHub key</div>
        <input type="password" id="gh" placeholder="${hasGh ? "Saved. Paste a new one to replace it" : "github_pat_…"}" autocomplete="off">
        <p class="help" id="gh-status">${live ? '<span class="ok">Connected. Keeps and drops save.</span>' : hasGh ? '<span class="bad">This key isn\'t working.</span>' : "Needed to save. Make one at GitHub → Settings → Developer settings → Fine-grained tokens: only the <b>ps-spinz</b> repo, <b>Contents: Read and write</b>."}</p>
        <div class="sheet-actions"><button class="btn small primary" type="button" data-act2="gh-save">Save key</button>${hasGh ? '<button class="btn small" type="button" data-act2="gh-clear">Forget key</button>' : ""}</div>
      </div>
      <hr class="sep">
      <div class="field"><div class="field-label">Spotify</div>
        ${sp.connected()
          ? `<p class="help" style="margin-top:0"><span class="ok">Connected.</span> Keeps go to your "${PLAYLIST_NAME}" playlist.</p>
             <div class="sheet-actions"><button class="btn small primary" type="button" data-act2="sp-sync">Add whole crate to playlist</button><button class="btn small" type="button" data-act2="sp-off">Disconnect</button></div>
             <div class="sheet-actions"><button class="btn small" type="button" data-act2="sp-find">Find missing Spotify links</button></div>`
          : `<input type="text" id="spc" placeholder="Client ID from developer.spotify.com" value="${esc(store.get("sp-client") || "")}" autocomplete="off" autocapitalize="off" spellcheck="false">
             <p class="help">In your Spotify app's settings, add this Redirect URI: <b>${esc(sp.REDIRECT)}</b></p>
             <div class="sheet-actions"><button class="btn small primary" type="button" data-act2="sp-connect">Connect Spotify</button></div>`}
        <p class="help" id="sp-status"></p>
      </div>
      ${standalone() ? "" : `<hr class="sep"><div class="field"><div class="field-label">App</div><div class="sheet-actions"><button class="btn small primary" type="button" data-act2="install">Install PS Spinz</button></div></div>`}
      <div class="sheet-actions" style="margin-top:14px"><button class="btn" type="button" data-close>Done</button></div>`,
    (el) => {
      el.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-act2]"); if (!b) return;
        const a = b.dataset.act2;
        const spStatus = el.querySelector("#sp-status");
        if (a === "gh-save") {
          const v = el.querySelector("#gh").value.trim(); if (!v) return;
          store.set("gh-token", v);
          el.querySelector("#gh-status").textContent = "Checking…";
          await load(); render();
          el.querySelector("#gh-status").innerHTML = live ? '<span class="ok">Connected. Keeps and drops save.</span>' : '<span class="bad">GitHub didn\'t accept that key. Check it has Contents: Read and write on ps-spinz.</span>';
          el.querySelector("#gh").value = "";
        } else if (a === "gh-clear") {
          store.set("gh-token", null); live = false; sha = null; el.remove(); render();
        } else if (a === "sp-connect") {
          const v = el.querySelector("#spc").value.trim();
          if (!v) { spStatus.innerHTML = '<span class="bad">Paste your Client ID first.</span>'; return; }
          store.set("sp-client", v);
          sp.login().catch((err) => { spStatus.innerHTML = `<span class="bad">${esc(err.message)}</span>`; });
        } else if (a === "sp-sync") {
          spStatus.textContent = "Adding…";
          try { const n = await sp.syncCrate(); spStatus.innerHTML = `<span class="ok">${n ? `Added ${n} track${n > 1 ? "s" : ""}.` : "Your playlist already has everything."}</span>`; }
          catch (err) { spStatus.innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
        } else if (a === "sp-find") {
          spStatus.textContent = "Searching Spotify…";
          try {
            const rep = await sp.resolveMissing(true);
            if (!rep.length) { spStatus.innerHTML = '<span class="ok">Every track already has a link.</span>'; return; }
            const ok = rep.filter((r) => r.ok).length;
            spStatus.innerHTML = `<b>Found ${ok} of ${rep.length}.</b>` + rep.filter((r) => !r.ok).map((r) => `<br>• <b>${esc(r.title)}</b>: ${esc(r.why)}`).join("")
              + (ok < rep.length ? "<br>For those, use “paste the link” on the track's card." : "");
          } catch (err) { spStatus.innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
        } else if (a === "install") {
          el.remove(); install();
        } else if (a === "sp-off") {
          sp.disconnect(); el.remove(); render();
        }
      });
    });
  }

  /* ---------- events ---------- */
  app.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { location.hash = go.dataset.go; return; }
    const f = e.target.closest("[data-filter]");
    if (f) { const g = f.dataset.filter, v = f.dataset.val === "null" ? null : f.dataset.val; filters[g] = filters[g] === v ? null : v; render(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const key = b.dataset.key;
    switch (b.dataset.act) {
      case "settings": settingsSheet(); break;
      case "theme": store.set("theme", themePref() === "dark" ? "light" : "dark"); applyTheme(); break;
      case "banner-off": store.set("sp-banner-off", "1"); render(); break;
      case "keep": if (!live) { toast("Add your GitHub key in Settings to save"); settingsSheet(); } else keepSheet(key); break;
      case "paste": pasteLink(key); break;
      case "drop": if (!live) { toast("Add your GitHub key in Settings to save"); settingsSheet(); } else doDrop(key); break;
      case "toggle": openKey = openKey === key ? null : key; render(); break;
      case "tag": {
        if (!live) { toast("Add your GitHub key in Settings to save"); return; }
        const c = S.crate.find((x) => x.key === key); if (!c) return;
        if (b.dataset.lane) setTags(key, { lane: b.dataset.lane });
        if (b.dataset.role) setTags(key, { role: c.role === b.dataset.role ? null : b.dataset.role });
        render(); break;
      }
      case "remove": if (!live) { toast("Add your GitHub key in Settings to save"); return; }
        if (b.dataset.confirm === "1") removeFromCrate(key);
        else { b.dataset.confirm = "1"; b.textContent = "Tap again to remove"; setTimeout(() => { if (b.isConnected) { b.dataset.confirm = ""; b.textContent = "Remove"; } }, 3000); }
        break;
    }
  });
  window.addEventListener("hashchange", () => { openKey = null; window.scrollTo(0, 0); render(); });

  /* ---------- install prompt (same pattern as the other PS apps) ---------- */
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const dismissed = () => Date.now() - Number(store.get("install-off2") || 0) < 3 * 864e5;
  // Once the app has been opened from the home screen (or Chrome reports it installed), never nag again.
  // Chrome on Android shares this storage between the browser and the installed app.
  if (standalone()) store.set("installed", "1");
  const installed = async () => {
    if (store.get("installed")) return true;
    try {
      if (navigator.getInstalledRelatedApps && (await navigator.getInstalledRelatedApps()).length) { store.set("installed", "1"); return true; }
    } catch { /* not supported */ }
    return false;
  };
  async function installBar(label, onGo) {
    if (standalone() || dismissed() || document.querySelector(".install-bar") || (await installed())) return;
    const bar = document.createElement("div");
    bar.className = "install-bar";
    bar.innerHTML = `<span class="install-text"><b>Get the PS Spinz app</b><span>Your daily three on your home screen</span></span>
      <button type="button" class="install-go">${label}</button><button type="button" class="install-x" aria-label="Not now">×</button>`;
    bar.querySelector(".install-go").addEventListener("click", onGo);
    bar.querySelector(".install-x").addEventListener("click", () => { store.set("install-off2", String(Date.now())); bar.remove(); });
    document.body.appendChild(bar);
  }
  // The bar shows on every browser visit (not inside the installed app). Install uses Chrome's
  // own install prompt when it offers one, otherwise shows the steps for this phone.
  let deferred = null;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  function installHelp() {
    sheet(isIOS
      ? `<h3>Add to Home Screen</h3><ol class="steps"><li>Tap the <b>Share</b> button in Safari</li><li>Tap <b>Add to Home Screen</b> (you may need <b>More</b> first)</li><li>Tap <b>Add</b></li></ol><button class="btn" type="button" data-close>Got it</button>`
      : `<h3>Install PS Spinz</h3><ol class="steps"><li>Tap <b>⋮</b> at the top right of Chrome</li><li>Tap <b>Add to Home screen</b> (or <b>Install app</b>)</li><li>Tap <b>Install</b>. PS Spinz shows up with your other apps</li></ol><p class="help" style="margin:-4px 0 12px">If Chrome shows <b>Open in app</b> instead, it's already installed: look for the PS Spinz icon.</p><button class="btn" type="button" data-close>Got it</button>`);
  }
  async function install() {
    if (deferred) {
      const d = deferred; deferred = null;
      d.prompt(); await d.userChoice.catch(() => {});
      document.querySelector(".install-bar")?.remove();
    } else installHelp();
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener("appinstalled", () => { store.set("installed", "1"); document.querySelector(".install-bar")?.remove(); });
  setTimeout(() => installBar("Install", install), 1200);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  /* ---------- start ---------- */
  (async () => {
    app.innerHTML = `<p class="status">Loading…</p>`;
    await sp.finishLogin();
    try { await load(); }
    catch (e) { app.innerHTML = `<p class="status">Couldn't load PS Spinz. Check your connection.</p>`; return; }
    render();
    if (live && sp.connected()) {
      await sp.resolveMissing().catch(() => {});
      // Crate tracks that got a Spotify link since last time (e.g. filled in by the daily run) go into the playlist.
      const linked = S.crate.filter((c) => c.spotify).length;
      if (String(linked) !== store.get("sp-synced")) {
        sp.syncCrate().then((n) => { store.set("sp-synced", String(linked)); if (n) toast(`Added ${n} track${n > 1 ? "s" : ""} to your PS Spinz playlist`); }).catch(() => {});
      }
    }
  })();
})();
