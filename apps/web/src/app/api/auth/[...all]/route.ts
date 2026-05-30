import { NextResponse, type NextRequest } from "next/server";

const API_BASE_URL = firstConfigured(
  process.env.WORLD_DOCK_API_BASE_URL,
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NEXT_PUBLIC_WORLD_DOCK_API_BASE_URL,
) ?? "http://localhost:4000";

type RouteContext = {
  params: Promise<{ all: string[] }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const action = params.all.join("/");
  const body = await request.json().catch(() => ({}));

  if (action === "sign-up/email") {
    return proxyAuth("/v1/auth/register", {
      email: body.email,
      password: body.password,
      name: body.name ?? body.displayName,
    });
  }

  if (action === "sign-in/email") {
    return proxyAuth("/v1/auth/login", {
      email: body.email,
      password: body.password,
    });
  }

  return NextResponse.json({ code: "NOT_FOUND", message: "Auth route not found." }, { status: 404 });
}

async function proxyAuth(path: string, body: unknown) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  }).catch(() => null);
  if (!response) {
    return NextResponse.json({
      code: "API_UNAVAILABLE",
      message: "认证服务暂时不可用，请确认 API 服务已启动。",
    }, { status: 503 });
  }

  const payload = await response.json().catch(() => ({}));
  return NextResponse.json(payload, { status: response.status });
}

function firstConfigured(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0);
}
