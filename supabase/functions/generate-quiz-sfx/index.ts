import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  httpErrorResponse,
  requireAdmin,
} from "../_shared/require-admin.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // P0 remediation: quiz SFX spends ElevenLabs credits; only admins may invoke it.
    // (No callers in the frontend — quiz SFX is local Web Audio — so gating breaks nothing.)
    await requireAdmin(req);

    const { type } = await req.json();
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

    if (!ELEVENLABS_API_KEY) {
      throw new Error("ELEVENLABS_API_KEY not configured");
    }

    const sfxPrompts: Record<string, string> = {
      correct: "A bright, uplifting chime sound effect for a correct answer in an educational quiz, cheerful and rewarding",
      wrong: "A gentle, soft error buzz for an incorrect answer, not harsh, encouraging to try again",
      result: "A celebratory fanfare sound effect for showing final quiz results, triumphant yet brief, festive tone",
    };

    const prompt = sfxPrompts[type];
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Invalid SFX type. Use 'correct', 'wrong', or 'result'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Generating SFX for type: ${type}`);

    const response = await fetch(
      "https://api.elevenlabs.io/v1/sound-generation",
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: prompt,
          duration_seconds: type === "result" ? 3 : 1.5,
          prompt_influence: 0.3,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", response.status, errorText);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    console.error("Error in generate-quiz-sfx:", error);
    return httpErrorResponse(error, corsHeaders);
  }
});