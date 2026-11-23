import DailyBoard from "@/components/DailyBoard";
import { parseStatusFilter } from "@/lib/filter";
import { isValidDate } from "@/lib/week";

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string; status?: string }> }) {
  const { date, status } = await searchParams;
  // 날짜가 없으면 클라이언트가 브라우저의 로컬 날짜(오늘)를 사용한다. 허용되지 않은 status 는 "all".
  return <DailyBoard dateParam={isValidDate(date) ? date : undefined} filter={parseStatusFilter(status)} />;
}
