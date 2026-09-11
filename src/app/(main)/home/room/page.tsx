"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RoomClient } from "@/components/home/room-client";

function RoomPageContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("id") ?? "";
  return <RoomClient roomId={roomId} />;
}

export default function RoomPage() {
  return (
    <Suspense fallback={null}>
      <RoomPageContent />
    </Suspense>
  );
}
