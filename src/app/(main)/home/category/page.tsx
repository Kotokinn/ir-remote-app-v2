"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CategoryClient } from "@/components/home/category-client";

function CategoryPageContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get("room") ?? "";
  const categoryId = searchParams.get("category") ?? "";
  const deviceId = searchParams.get("device") ?? undefined;
  return (
    <CategoryClient
      roomId={roomId}
      categoryId={categoryId}
      initialDeviceId={deviceId}
    />
  );
}

export default function CategoryPage() {
  return (
    <Suspense fallback={null}>
      <CategoryPageContent />
    </Suspense>
  );
}
