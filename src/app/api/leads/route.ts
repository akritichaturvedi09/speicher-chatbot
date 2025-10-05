import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../lib/mongodb";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, company, questionAnswerPairs } = body;

    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: "Name, email, and phone are required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("speicher-chatbot");
    const collection = db.collection("leads");

    const lead = {
      name,
      email,
      phone,
      company: company || "",
      questionAnswerPairs: questionAnswerPairs || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "new",
    };

    const result = await collection.insertOne(lead);

    return NextResponse.json({
      success: true,
      leadId: result.insertedId,
      message: "Lead saved successfully",
    });
  } catch (error) {
    console.error("Error saving lead:", error);
    return NextResponse.json({ error: "Failed to save lead" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("speicher-chatbot");
    const collection = db.collection("leads");

    const leads = await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({
      success: true,
      leads: leads,
    });
  } catch (error) {
    console.error("Error fetching leads:", error);
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 }
    );
  }
}
