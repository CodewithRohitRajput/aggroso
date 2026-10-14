import { getTriage, reviewTriage } from "@/lib/handlers";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export function GET(_request: Request, { params }: Context) {
  return getTriage(params.id);
}

export function PATCH(request: Request, { params }: Context) {
  return reviewTriage(request, params.id);
}
