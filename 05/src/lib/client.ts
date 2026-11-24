/** 클라이언트용 fetch 래퍼. 실패하면 서버가 준 한국어 오류 메시지로 Error를 던진다. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json === undefined ? rest.headers : { "content-type": "application/json", ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  // 세션이 없거나 만료되면 로그인 화면으로 보낸다 (이동 중에도 호출한 쪽은 오류를 받는다)
  // 일부러 전체 페이지 이동: React 밖의 함수라 useRouter 를 쓸 수 없고, 세션이 끝났으니 클라이언트 상태도 버려야 한다.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401 && typeof window !== "undefined") window.location.assign("/login");
  if (!res.ok) throw new Error(data?.error ?? "요청에 실패했습니다.");
  return data as T;
}
