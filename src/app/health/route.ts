export const dynamic = "force-dynamic";

// Liveness only: readiness of PostgreSQL and MinIO is checked separately.
export function GET() {
  return Response.json(
    { status: "ok", service: "closet-web" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
