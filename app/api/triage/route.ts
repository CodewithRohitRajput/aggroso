import { createTriage } from "@/lib/handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function POST(request: Request) {
  return createTriage(request);
}
