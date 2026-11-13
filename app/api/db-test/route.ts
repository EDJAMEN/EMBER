import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const steps: Record<string, unknown> = {};

  try {
    // 1. Connection & Ping Check
    const { data: list, error: listError } = await supabase
      .from("wildfire_hotspots")
      .select("id, source, confidence, brightness, acq_date, acq_time, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (listError) {
      return NextResponse.json(
        {
          success: false,
          error: listError.message,
          hint: "Ensure SUPABASE_URL and SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are set in environment variables.",
        },
        { status: 500 }
      );
    }
    steps.list = { success: true, count: list?.length ?? 0, records: list };

    // 2. CREATE Test Record
    const testHotspot = {
      source: "VIIRS",
      confidence: "high",
      brightness: 348.6,
      acq_date: "2026-11-13",
      acq_time: "12:00",
      location: "POINT(120.9842 14.5995)",
    };

    const { data: inserted, error: insertError } = await supabase
      .from("wildfire_hotspots")
      .insert([testHotspot])
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { success: false, step: "CREATE", error: insertError.message },
        { status: 500 }
      );
    }
    const testId = inserted.id;
    steps.create = { success: true, id: testId };

    // 3. READ Test Record
    const { data: readRecord, error: readError } = await supabase
      .from("wildfire_hotspots")
      .select("*")
      .eq("id", testId)
      .single();

    if (readError) {
      steps.read = { success: false, error: readError.message };
    } else {
      steps.read = { success: true, record: readRecord };
    }

    // 4. UPDATE Test Record
    const { data: updated, error: updateError } = await supabase
      .from("wildfire_hotspots")
      .update({ brightness: 355.0 })
      .eq("id", testId)
      .select()
      .single();

    if (updateError) {
      steps.update = { success: false, error: updateError.message };
    } else {
      steps.update = { success: true, updatedBrightness: updated.brightness };
    }

    // 5. DELETE Test Record
    const { error: deleteError } = await supabase
      .from("wildfire_hotspots")
      .delete()
      .eq("id", testId);

    if (deleteError) {
      steps.delete = { success: false, error: deleteError.message };
    } else {
      steps.delete = { success: true, cleanedUpId: testId };
    }

    return NextResponse.json({
      success: true,
      message: "Database connection and full LCRUD test verified successfully!",
      steps,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
