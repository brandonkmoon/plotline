"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import JoinScreen from "@/components/screens/JoinScreen";

export default function JoinWithCodePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params?.code?.toUpperCase() ?? "";
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!code) { setChecked(true); return; }

    // If the player already has a stored identity for this room,
    // skip the join form and reconnect directly.
    try {
      const storedId =
        sessionStorage.getItem(`plotline.playerId.${code}`) ??
        localStorage.getItem(`plotline.rejoin.playerId`);
      const storedRoom = localStorage.getItem(`plotline.rejoin.roomCode`);

      if (storedId && storedRoom === code) {
        router.replace(`/room/${code}`);
        return;
      }
    } catch {}

    setChecked(true);
  }, [code, router]);

  if (!checked) return null;

  return <JoinScreen initialCode={code} />;
}
