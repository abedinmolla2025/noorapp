import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  requireAdmin,
  httpErrorResponse,
  HttpError,
} from "../_shared/require-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // S-2 remediation candidate: admin-only. The only caller is the
    // admin SEO tab, whose functions.invoke already sends the admin's
    // session JWT, so gating breaks no authorized caller.
    await requireAdmin(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Rate limiting: check last ping in seo_index_log (max 1 per 10 minutes)
    const { data: recentPings } = await supabase
      .from("seo_index_log")
      .select("id, created_at")
      .in("action", ["google_ping", "bing_ping"])
      .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1);

    if (recentPings && recentPings.length > 0) {
      console.log("Rate limited: last ping was less than 10 minutes ago");
      return json(429, {
        success: false,
        reason: "rate_limited",
        message: "Last ping was less than 10 minutes ago. Try again later.",
      });
    }

    const sitemapUrl = `${supabaseUrl}/functions/v1/sitemap`;
    console.log("Notifying search engines about sitemap:", sitemapUrl);

    // Ping Google
    const googlePingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const googleResponse = await fetch(googlePingUrl);
    await googleResponse.text();
    const googleSuccess = googleResponse.ok;
    console.log("Google ping status:", googleResponse.status);

    // Ping Bing
    const bingPingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const bingResponse = await fetch(bingPingUrl);
    await bingResponse.text();
    const bingSuccess = bingResponse.ok;
    console.log("Bing ping status:", bingResponse.status);

    // Log results
    const logs = [
      {
        action: "google_ping",
        target_url: sitemapUrl,
        status_code: googleResponse.status,
        success: googleSuccess,
        metadata: {},
      },
      {
        action: "bing_ping",
        target_url: sitemapUrl,
        status_code: bingResponse.status,
        success: bingSuccess,
        metadata: {},
      },
    ];

    await supabase.from("seo_index_log").insert(logs);

    return json(200, {
      success: googleSuccess && bingSuccess,
      google: { success: googleSuccess, status: googleResponse.status },
      bing: { success: bingSuccess, status: bingResponse.status },
      sitemap_url: sitemapUrl,
    });
  } catch (err) {
    console.error("Search engine notification error:", err);
    if (err instanceof HttpError) return httpErrorResponse(err, corsHeaders);
    return json(500, {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
});
