"use client";

import { useRef, useState, type FormEvent } from "react";
import styles from "./ProviderMarketplace.module.css";

const providers = [
  { category: "photography", name: "Golden Hour Studio", offer: "Outdoor portraits and candid event photos", rate: "$240 / session", photo: "1452587925148-ce544e77e70d" },
  { category: "catering", name: "Picnic Table Kitchen", offer: "Seasonal grazing boards and picnic spreads", rate: "$24 / guest", photo: "1555244162-803834f70033" },
  { category: "music", name: "Garden Sessions", offer: "Acoustic guitar for garden parties", rate: "$180 / set", photo: "1510915361894-db8b60106cb1" },
  { category: "decor", name: "Wild Stem Workshop", offer: "Fresh floral centerpieces for outdoor tables", rate: "$65 / arrangement", photo: "1490750967868-88aa4486c946" },
  { category: "equipment", name: "Sunday Table Rentals", offer: "Tables, folding chairs and linen sets", rate: "$32 / table set", photo: "1519225421980-715cb0215aed" },
  { category: "photography", name: "Fern & Frame", offer: "Family portraits and group photos", rate: "$175 / session", photo: "1516035069371-29a1b244cc32" },
  { category: "catering", name: "Open Flame Supper Club", offer: "On-site grilling for backyard dinners", rate: "$38 / guest", photo: "1529193591184-b1d58069ecdd" },
  { category: "music", name: "Afterglow DJs", offer: "Custom playlists and a mobile DJ setup", rate: "$350 / event", photo: "1470229722913-7c0e2dbbafd3" },
  { category: "decor", name: "Petal & Paper", offer: "Colorful tablescapes and party styling", rate: "$150 / setup", photo: "1464366400600-7168b8af9bc3" },
  { category: "equipment", name: "Backyard Cinema Kit", offer: "Projector, screen and outdoor speakers", rate: "$110 / evening", photo: "1478720568477-152d9b164e26" },
];

export function hasExampleProviders(category: string) {
  return category === "all" || providers.some(provider => provider.category === category);
}

export default function ExampleProviders({ category }: { category: string }) {
  const visible = providers.filter(provider => category === "all" || category === provider.category);
  return <div className={styles.grid}>{visible.map(provider => <ExampleCard key={provider.name} provider={provider} />)}</div>;
}

function ExampleCard({ provider }: { provider: typeof providers[number] }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setSummary(`${fields.get("date")} · ${fields.get("guests")} guests · ${fields.get("location")}`);
    setOpen(false);
    trigger.current?.focus();
  }
  return <article className={styles.card}>
    <div className={styles.sample} aria-hidden="true" style={{ backgroundImage: `url("/service-examples/${provider.photo}.jpg")` }} />
    <div className={styles.cardBody}>
      <span className={styles.badge}>Example provider</span>
      <h3>{provider.name}</h3><p>{provider.offer}</p>
      <div className={styles.cardFooter}><span>Example pricing<strong>{provider.rate}</strong></span>
        <button ref={trigger} className={styles.primary} aria-expanded={open} onClick={() => { setOpen(!open); setSummary(""); }}>{open ? "Close form" : "Try a quote"}</button>
      </div>
      {open && <form className={styles.practice} onSubmit={finish}>
        <p>This is a practice request. Only you see the details.</p>
        <label>Event date<input type="date" name="date" required min={new Date().toLocaleDateString("en-CA")} /></label>
        <label>Guests<input type="number" name="guests" min="1" max="100000" defaultValue="10" required /></label>
        <label>Event location<input name="location" placeholder="City or venue" required maxLength={180} /></label>
        <label>What do you need?<textarea name="needs" placeholder="Tell us about your event" required maxLength={2000} /></label>
        <button className={styles.primary}>Submit practice request</button>
      </form>}
      {summary && <div role="status" className={styles.success}><strong>Practice request complete</strong><p>{provider.name} · {summary}</p></div>}
    </div>
  </article>;
}
