import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json([{id:1, name:"דניאל", phone:"0501234567", class_name:"יוגה", class_date:"2025-08-23", class_time:"10:00"}]);
}
