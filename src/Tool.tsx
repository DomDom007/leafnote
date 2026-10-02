// Leafnote: a watering and light plan for each houseplant, adjusted for the window it faces and the season.
import { useEffect, useState } from "react";
import { idbGet, idbSet, shrinkImage } from "./lib/idb";
import { downloadIcs, localDate } from "./lib/ics";
import { uid, useStored } from "./lib/store";
import { addDays, prettyDate, todayISO } from "./lib/time";
import { Section, Stat, Stats } from "./ui/kit";

const T = "leafnote";
type Care = { days: number; light: "low" | "medium" | "bright" | "direct"; tip: string };
const CARE: Record<string, Care> = {
  "Monstera": { days: 9, light: "bright", tip: "Let the top few centimetres dry out. Wipe the leaves monthly." },
  "Pothos": { days: 8, light: "medium", tip: "Droopy leaves mean it is thirsty. Very forgiving." },
  "Snake plant": { days: 21, light: "low", tip: "Overwatering is the main way to kill it. Water less in winter." },
  "ZZ plant": { days: 21, light: "low", tip: "Stores water in its roots. Let it dry out completely." },
  "Peace lily": { days: 6, light: "medium", tip: "It wilts dramatically when dry and recovers within hours." },
  "Fiddle leaf fig": { days: 9, light: "bright", tip: "Hates being moved and hates draughts. Keep it in one spot." },
  "Spider plant": { days: 7, light: "medium", tip: "Brown tips often come from tap water. Let water sit overnight." },
  "Aloe vera": { days: 20, light: "direct", tip: "Treat it like a cactus. Sandy soil and full sun." },
  "Cactus": { days: 25, light: "direct", tip: "Almost no water in winter." },
  "Rubber plant": { days: 10, light: "bright", tip: "Water when the top half of the soil is dry." },
  "Calathea": { days: 5, light: "medium", tip: "Likes humidity and soft water. Curling leaves mean too dry." },
  "Philodendron": { days: 8, light: "medium", tip: "Yellow leaves usually mean too much water." },
  "Orchid": { days: 8, light: "bright", tip: "Soak the pot for ten minutes, then drain fully. Never leave it standing in water." },
  "Jasmine": { days: 5, light: "direct", tip: "Needs a sunny spot and a cool winter to flower." },
  "Basil": { days: 2, light: "direct", tip: "Pinch off flowers to keep leaves coming." },
  "Mint": { days: 2, light: "bright", tip: "Keep the soil moist. It spreads, so give it its own pot." },
  "Geranium": { days: 5, light: "direct", tip: "Let it dry slightly between waterings. Deadhead spent flowers." },
  "Olive tree (pot)": { days: 10, light: "direct", tip: "Drought tolerant, but pots dry out fast in summer." },
};
const WINDOW: Record<string, { factor: number; light: Care["light"]; label: string }> = {
  south: { factor: 0.8, light: "direct", label: "South (strong sun)" }, west: { factor: 0.9, light: "bright", label: "West (afternoon sun)" },
  east: { factor: 1, light: "bright", label: "East (morning sun)" }, north: { factor: 1.25, light: "medium", label: "North (no direct sun)" }, inside: { factor: 1.4, light: "low", label: "Away from windows" },
};
const LIGHTS: Care["light"][] = ["low", "medium", "bright", "direct"];
type Plant = { id: string; name: string; kind: string; window: string; last: string; fed: string; photo: boolean };
const season = () => { const m = new Date().getMonth(); return m >= 5 && m <= 8 ? { f: 0.75, name: "summer" } : m >= 10 || m <= 1 ? { f: 1.4, name: "winter" } : { f: 1, name: "spring or autumn" }; };

function Pic({ id }: { id: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { idbGet(`${T}:${id}`).then(v => setSrc(v ?? "")); }, [id]);
  return src ? <img src={src} alt="" className="ln-pic" /> : <div className="ln-pic ln-none" />;
}

export default function Leafnote() {
  const [plants, setPlants] = useStored<Plant[]>(T, "plants", [
    { id: "p1", name: "Big Monty", kind: "Monstera", window: "east", last: addDays(todayISO(), -8), fed: addDays(todayISO(), -40), photo: false },
    { id: "p2", name: "Snakey", kind: "Snake plant", window: "north", last: addDays(todayISO(), -10), fed: addDays(todayISO(), -90), photo: false },
    { id: "p3", name: "Kitchen basil", kind: "Basil", window: "south", last: addDays(todayISO(), -2), fed: addDays(todayISO(), -20), photo: false },
    { id: "p4", name: "Calathea", kind: "Calathea", window: "inside", last: addDays(todayISO(), -9), fed: addDays(todayISO(), -35), photo: false },
  ]);
  const [d, setD] = useState({ name: "", kind: "Pothos", window: "east" });
  const s = season();
  const info = (p: Plant) => {
    const c = CARE[p.kind] ?? { days: 7, light: "medium" as const, tip: "" }, w = WINDOW[p.window];
    const every = Math.max(1, Math.round(c.days * w.factor * s.f));
    const next = addDays(p.last, every), left = Math.round((new Date(next).getTime() - new Date(todayISO()).getTime()) / 86400000);
    const lightGap = LIGHTS.indexOf(w.light) - LIGHTS.indexOf(c.light);
    const feedDue = s.name !== "winter" && (Date.now() - new Date(p.fed).getTime()) / 86400000 > 30;
    return { c, w, every, next, left, lightGap, feedDue };
  };
  const rows = plants.map(p => ({ p, i: info(p) })).sort((a, b) => a.i.left - b.i.left);
  const thirsty = rows.filter(r => r.i.left <= 0);
  const set = (id: string, patch: Partial<Plant>) => setPlants(plants.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const addPhoto = async (id: string, f?: File) => { if (!f) return; await idbSet(`${T}:${id}`, await shrinkImage(f, 600)); set(id, { photo: true }); };

  return (
    <div className="stack">
      <Section title="Your plants" aside={<button className="btn small" onClick={() => downloadIcs("plant-watering.ics", rows.map(r => ({ title: `Water ${r.p.name}`, start: localDate(r.i.next < todayISO() ? todayISO() : r.i.next), allDay: true, rrule: `FREQ=DAILY;INTERVAL=${r.i.every}` })), "Plant watering")}>Watering reminders</button>}>
        <Stats><Stat value={plants.length} label="Plants" /><Stat value={thirsty.length} label="Need water today" tone={thirsty.length ? "warn" : "good"} /><Stat value={rows.filter(r => r.i.lightGap < 0).length} label="Could use more light" /><Stat value={s.name} label="Season adjustment" /></Stats>
        {thirsty.length > 1 && <button className="btn primary" style={{ marginTop: 12 }} onClick={() => setPlants(plants.map(p => thirsty.some(r => r.p.id === p.id) ? { ...p, last: todayISO() } : p))}>I watered all {thirsty.length}</button>}
      </Section>
      <div className="ln-grid">{rows.map(({ p, i }) => (
        <article key={p.id} className="ln-card">
          <label className="ln-photo">{p.photo ? <Pic id={p.id} /> : <div className="ln-pic ln-none"><span>Add photo</span></div>}<input type="file" accept="image/*" hidden onChange={e => addPhoto(p.id, e.target.files?.[0])} /></label>
          <div className="ln-body">
            <div className="row" style={{ justifyContent: "space-between" }}><strong>{p.name}</strong><span className={"pill " + (i.left < 0 ? "bad" : i.left === 0 ? "warn" : "good")}>{i.left < 0 ? `${-i.left} day${i.left === -1 ? "" : "s"} late` : i.left === 0 ? "Water today" : `in ${i.left} day${i.left === 1 ? "" : "s"}`}</span></div>
            <p className="note">{p.kind} · {i.w.label} · every {i.every} days</p>
            {i.lightGap < 0 && <p className="note" style={{ color: "var(--warn)" }}>Likes {i.c.light} light. Move it closer to a window.</p>}
            {i.lightGap > 1 && <p className="note" style={{ color: "var(--warn)" }}>Too much direct sun can scorch it. Pull it back or add a sheer curtain.</p>}
            {i.feedDue && <p className="note">Due a feed with diluted fertiliser.</p>}
            <p style={{ fontSize: 14 }}>{i.c.tip}</p>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small primary" onClick={() => set(p.id, { last: todayISO() })}>Watered</button>
              {i.feedDue && <button className="btn small" onClick={() => set(p.id, { fed: todayISO() })}>Fed</button>}
              <select className="input" style={{ width: "auto", fontSize: 13 }} aria-label="Window" value={p.window} onChange={e => set(p.id, { window: e.target.value })}>{Object.entries(WINDOW).map(([k, w]) => <option key={k} value={k}>{w.label}</option>)}</select>
              <button className="btn ghost small danger" onClick={() => setPlants(plants.filter(x => x.id !== p.id))}>Remove</button>
            </div>
            <p className="note">Last watered {prettyDate(p.last)}</p>
          </div>
        </article>
      ))}</div>
      <Section title="Add a plant">
        <form className="row" style={{ alignItems: "flex-end" }} onSubmit={e => { e.preventDefault(); setPlants([...plants, { id: uid(), name: d.name.trim() || d.kind, kind: d.kind, window: d.window, last: todayISO(), fed: todayISO(), photo: false }]); setD({ ...d, name: "" }); }}>
          <label className="field"><span>Nickname</span><input id="ln-n" className="input" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></label>
          <label className="field"><span>Kind</span><select id="ln-k" className="input" value={d.kind} onChange={e => setD({ ...d, kind: e.target.value })}>{Object.keys(CARE).map(k => <option key={k}>{k}</option>)}</select></label>
          <label className="field"><span>Window it faces</span><select id="ln-w" className="input" value={d.window} onChange={e => setD({ ...d, window: e.target.value })}>{Object.entries(WINDOW).map(([k, w]) => <option key={k} value={k}>{w.label}</option>)}</select></label>
          <button className="btn primary" type="submit">Add plant</button>
        </form>
        <p className="note" style={{ marginTop: 8 }}>Directions are for the northern hemisphere. Always check the soil with a finger before watering.</p>
      </Section>
      <style>{`.ln-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}.ln-card{background:var(--surface);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;display:flex;flex-direction:column}
      .ln-photo{cursor:pointer}.ln-pic{width:100%;height:150px;object-fit:cover;display:block}.ln-none{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--good) 18%,transparent) 0 10px,transparent 10px 20px);display:grid;place-items:center;color:var(--muted);font-size:13px}
      .ln-body{padding:12px 14px;display:grid;gap:6px}`}</style>
    </div>
  );
}
