"use client";

import { useCallback, useEffect, useState } from "react";

/** 3초 뒤 사라지는 알림. 반환된 node 를 화면 어딘가에 렌더링한다. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(t);
  }, [message]);

  const show = useCallback((m: string) => setMessage(m), []);

  const node = message ? (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
    >
      {message}
    </div>
  ) : null;

  return { show, node };
}
