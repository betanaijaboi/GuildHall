"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server component when the channel's SSE stream reports a new message. */
export function LiveRefresh({ channelId }: { channelId: string }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const source = new EventSource(`/api/channels/${channelId}/stream`);
    source.onmessage = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [channelId, router]);
  return null;
}
