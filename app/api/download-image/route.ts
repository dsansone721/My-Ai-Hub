import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Server-side image proxy. The browser cannot reliably download images
 * from third-party hosts (CORS, expiring signed URLs). The page POSTs the
 * image URL here and we stream the bytes back with a download disposition.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const url = (body as { url?: string } | null)?.url;
    const filename = (body as { filename?: string } | null)?.filename ?? "rendering.png";

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing 'url'." }, { status: 400 });
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
    }
    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        { error: "Only https URLs are allowed." },
        { status: 400 }
      );
    }

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `Upstream image fetch failed (${upstream.status}). The DALL-E URL may have expired — try regenerating.`,
        },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    const arrayBuffer = await upstream.arrayBuffer();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": String(arrayBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[download-image] unhandled:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
