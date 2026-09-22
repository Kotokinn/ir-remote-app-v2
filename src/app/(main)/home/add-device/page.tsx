"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useHubsStore } from "@/lib/store/hubs-store";
import { AddDeviceFlow } from "@/components/home/add-device/add-device-flow";

function AddDevicePageContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("room") ?? "all";
  const hubId = searchParams.get("hub");
  const initialHub = useHubsStore((s) => s.physicalDevices.find((d) => d.id === hubId));

  return <AddDeviceFlow roomId={roomId} initialHub={initialHub} />;
}

export default function AddDevicePage() {
  return (
    <Suspense fallback={null}>
      <AddDevicePageContent />
    </Suspense>
  );
}
