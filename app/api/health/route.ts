import { health } from "@/lib/handlers";

export const dynamic = "force-dynamic";

export function GET() {
  return health();
}
