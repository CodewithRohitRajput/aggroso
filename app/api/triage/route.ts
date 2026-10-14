import { createTriage, listTriage, reviewTriage } from "@/lib/handlers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export function GET() {
  return listTriage();
}

export function POST(request: Request) {
  return createTriage(request);
}

export function PATCH(request: Request) {
  return reviewTriage(request);
}
