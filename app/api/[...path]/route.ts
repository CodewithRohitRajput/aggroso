export const dynamic = "force-dynamic";

function notFound() {
  return Response.json({ error: "Endpoint not found." }, { status: 404 });
}

export { notFound as GET, notFound as POST, notFound as PATCH, notFound as PUT, notFound as DELETE };
