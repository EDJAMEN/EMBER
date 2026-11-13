import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const log: string[] = [];

  try {
    // 1. CREATE test hotspot in Malaybalay
    const testHotspot = {
      source: "VIIRS_TEST",
      confidence: "high",
      brightness: 350.5,
      acq_date: "2026-11-13",
      acq_time: "0000",
      location: "POINT(125.1278 8.1575)",
    };

    const { data: created, error: insertError } = await supabaseAdmin
      .from("wildfire_hotspots")
      .insert(testHotspot)
      .select()
      .single();

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
    log.push(`[CREATE] ID: ${created.id}`);

    // 2. READ
    const { data: readData, error: readError } = await supabaseAdmin
      .from("wildfire_hotspots")
      .select("*")
      .eq("id", created.id)
      .single();

    if (readError) throw new Error(`Read failed: ${readError.message}`);
    log.push(`[READ] Found ID: ${readData.id}, Source: ${readData.source}`);

    // 3. UPDATE
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("wildfire_hotspots")
      .update({ brightness: 355.0 })
      .eq("id", created.id)
      .select()
      .single();

    if (updateError) throw new Error(`Update failed: ${updateError.message}`);
    log.push(`[UPDATE] New brightness: ${updated.brightness}`);

    // 4. LIST
    const { data: listData, error: listError } = await supabaseAdmin
      .from("wildfire_hotspots")
      .select("id, source, confidence, brightness")
      .order("created_at", { ascending: false })
      .limit(5);

    if (listError) throw new Error(`List failed: ${listError.message}`);
    log.push(`[LIST] Retrieved ${listData.length} records`);

    // 5. DELETE
    const { error: deleteError } = await supabaseAdmin
      .from("wildfire_hotspots")
      .delete()
      .eq("id", created.id);

    if (deleteError) throw new Error(`Delete failed: ${deleteError.message}`);
    log.push(`[DELETE] Removed ID: ${created.id}`);

    return NextResponse.json({
      status: "SUCCESS",
      message: "All LCRUD operations passed successfully against Supabase",
      log,
      timestamp: "2026-11-13T22:50:00Z",
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      {
        status: "FAILED",
        error: error.message,
        log,
      },
      { status: 500 }
    );
  }
}

