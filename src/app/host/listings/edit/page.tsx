"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HostListingForm, { HostListingFormValues, HostListingSubmitResult } from "@/components/HostListingForm";
import HostNav from "@/components/HostNav";
import HostSignInRequired from "@/components/HostSignInRequired";
import { useStore } from "@/lib/store";

export default function EditHostListingPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted">Loading listing…</div>}>
      <EditContent />
    </Suspense>
  );
}

function EditContent() {
  const id = useSearchParams().get("id") ?? "";
  const { user, hostListings, hostDataLoading, updateHostListing } = useStore();

  if (!user) return <HostSignInRequired />;

  const listing = hostListings.find((item) => item.id === id);

  if (hostDataLoading && !listing) {
    return (
      <div className="min-h-screen bg-white">
        <HostNav />
        <div className="p-12 text-center text-muted" role="status">Loading listing…</div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-white">
        <HostNav />
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Listing not found</h1>
          <p className="mt-2 text-sm text-muted">It may have been removed, or it belongs to a different account.</p>
          <Link href="/host/listings" className="mt-6 inline-flex rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white">Back to listings</Link>
        </div>
      </div>
    );
  }

  const currentStatus = listing.status;

  const initialValues: HostListingFormValues = {
    spaceType: listing.spaceType,
    title: listing.title,
    location: listing.location,
    neighborhood: listing.neighborhood,
    description: listing.description,
    hourlyPrice: String(listing.hourlyPrice),
    minHours: String(listing.minHours),
    capacity: String(listing.capacity),
    latitude: listing.latitude === null ? "" : String(listing.latitude),
    longitude: listing.longitude === null ? "" : String(listing.longitude),
    timezone: listing.timezone,
    rules: listing.rules.join("\n"),
    amenities: listing.amenities,
  };

  async function handleSubmit(values: HostListingFormValues, photos: File[]): Promise<HostListingSubmitResult> {
    return updateHostListing(
      id,
      {
        title: values.title,
        location: values.location,
        neighborhood: values.neighborhood,
        timezone: values.timezone,
        spaceType: values.spaceType,
        hourlyPrice: Number(values.hourlyPrice),
        minHours: Number(values.minHours),
        capacity: Number(values.capacity),
        description: values.description,
        amenities: values.amenities,
        rules: values.rules.split("\n").map((rule) => rule.trim()).filter(Boolean),
        latitude: Number(values.latitude),
        longitude: Number(values.longitude),
        status: currentStatus,
      },
      photos,
    );
  }

  return (
    <HostListingForm
      mode="edit"
      initialValues={initialValues}
      existingImages={listing.images}
      submitLabel="Save changes"
      onSubmit={handleSubmit}
      buildRedirect={(result) => `/host/listings?updated=1${result.message ? "&photoWarning=1" : ""}`}
    />
  );
}
