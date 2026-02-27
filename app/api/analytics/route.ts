import { NextResponse } from "next/server";

const ANALYZR_API_URL = "https://getanalyzr.vercel.app/api/events";
const ANALYZR_API_KEY = process.env.ANALYZR_API_KEY;

export async function POST(request: Request) {
  if (!ANALYZR_API_KEY) {
    console.error("ANALYZR_API_KEY is not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const body = await request.json();

    const response = await fetch(ANALYZR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANALYZR_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Analyzr API error:", errorText);
      return NextResponse.json({ error: "Analyzr request failed" }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Analytics proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}