"use client";

import Link from "next/link";
import Image from "next/image";
import { useStore } from "@/lib/store";

const steps = [
  { number: "01", title: "Tell us about your space", text: "Add the essentials—space type, capacity, location, and what makes it special." },
  { number: "02", title: "Set your price and availability", text: "Choose an hourly rate and decide exactly when guests can book." },
  { number: "03", title: "Welcome your first guests", text: "Publish when you are ready, manage requests, and get paid through Yardly." },
];

export default function HostLandingPage() {
  const { user, hostListings, setAuthOpen } = useStore();
  const destination = hostListings.length ? "/host/dashboard" : "/host/listings/new";

  return (
    <div className="bg-white">
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-14 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-24">
        <div>
          <p className="text-sm font-semibold text-brand-dark">Host on Yardly</p>
          <h1 className="mt-4 max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-6xl">
            Your outdoor space can do more.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted">
            Share your backyard, pool, patio, or garden by the hour. You control the schedule, the house rules, and who gets to visit.
          </p>
          {user ? (
            <Link href={destination} className="mt-8 inline-flex rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark">
              {hostListings.length ? "Open host dashboard" : "Create your listing"}
            </Link>
          ) : (
            <button type="button" onClick={() => setAuthOpen(true)} className="mt-8 rounded-xl bg-brand px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark">
              Get started
            </button>
          )}
          <p className="mt-3 text-xs text-muted">Create a listing at your own pace. You will review everything before it goes live.</p>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] bg-[#dfe8d7] p-6 sm:p-10">
          <div className="aspect-[4/3] overflow-hidden rounded-[1.4rem] bg-[#8caa82]">
            <Image src="https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=85" alt="Welcoming backyard set up for guests" width={1400} height={1050} priority className="h-full w-full object-cover" />
          </div>
          <div className="absolute bottom-10 left-10 rounded-2xl bg-white p-4 shadow-xl shadow-black/10 sm:bottom-14 sm:left-14">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Potential monthly earnings</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">$1,240</p>
            <p className="mt-1 text-xs text-muted">Based on 8 bookings near you</p>
          </div>
        </div>
      </section>

      <section className="border-y border-border-soft bg-surface-soft/60">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <p className="text-sm font-semibold text-brand-dark">Simple from day one</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Start hosting in three steps</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <article key={step.number} className="rounded-2xl border border-border-soft bg-white p-6">
                <span className="text-xs font-bold tracking-[0.15em] text-brand">{step.number}</span>
                <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
