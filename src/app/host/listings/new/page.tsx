"use client";

import HostListingForm, { HostListingFormValues, HostListingSubmitResult } from "@/components/HostListingForm";
import HostSignInRequired from "@/components/HostSignInRequired";
import { useStore } from "@/lib/store";

export default function NewHostListingPage() {
  const { user, addHostListing } = useStore();

  if (!user) return <HostSignInRequired />;

  async function handleSubmit(values: HostListingFormValues, photos: File[]): Promise<HostListingSubmitResult> {
    return addHostListing(
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
        status: "draft",
      },
      photos,
    );
  }

  return (
    <HostListingForm
      mode="create"
      submitLabel="Save draft"
      onSubmit={handleSubmit}
      buildRedirect={(result) => `/host/listings?created=1${result.message ? "&photoWarning=1" : ""}`}
    />
  );
}
