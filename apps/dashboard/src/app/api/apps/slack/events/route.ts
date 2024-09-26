import { config, handleSlackEvent } from "@midday/apps/slack";
import { createClient } from "@midday/supabase/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(15, "1m"),
  analytics: true,
});

export async function POST(req: Request) {
  const { challenge, team_id, event } = await req.json();

  const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
      },
    );
  }

  const supabase = createClient({ admin: true });

  const { data } = await supabase
    .from("apps")
    .select("team_id, settings")
    .eq("app_id", config.id)
    .eq("settings->>team_id", team_id)
    .single();

  if (!data) {
    console.error(`No team found for Slack team_id: ${team_id}`);
    return NextResponse.json(
      { error: "Unauthorized: No matching team found" },
      { status: 401 },
    );
  }

  const settings = data?.settings as {
    access_token: string;
    bot_user_id: string;
  };

  if (challenge) {
    return new NextResponse(challenge);
  }

  if (event) {
    await handleSlackEvent(event, {
      token: settings.access_token,
    });
  }

  return NextResponse.json({
    success: true,
  });
}
