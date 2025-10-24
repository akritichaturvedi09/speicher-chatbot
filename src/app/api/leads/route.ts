import { NextRequest, NextResponse } from "next/server";
import clientPromise from "../../../lib/mongodb";
import { validateRequestBody, createLeadSchema, ValidationError } from "../../../lib/validation";

// Enhanced error handling wrapper
function withErrorHandling(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      return await handler(request);
    } catch (error) {
      console.error('API Error:', error);
      
      if (error instanceof ValidationError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Validation Error',
            message: error.message
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        {
          success: false,
          error: 'Internal Server Error',
          message: process.env.NODE_ENV === 'development' 
            ? error instanceof Error ? error.message : 'Unknown error'
            : 'An unexpected error occurred'
        },
        { status: 500 }
      );
    }
  };
}

export const POST = withErrorHandling(async (request: NextRequest) => {
  const body = await request.json();
  const leadData = validateRequestBody(createLeadSchema, body);

  const client = await clientPromise;
  const db = client.db("speicher-chatbot");
  const collection = db.collection("leads");

  // Check for duplicate email
  const existingLead = await collection.findOne({ email: leadData.email });
  if (existingLead) {
    return NextResponse.json({
      success: false,
      error: "Duplicate lead",
      message: "A lead with this email already exists"
    }, { status: 409 });
  }

  const lead = {
    ...leadData,
    company: leadData.company || "",
    questionAnswerPairs: leadData.questionAnswerPairs || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "new",
  };

  const result = await collection.insertOne(lead);

  return NextResponse.json({
    success: true,
    data: {
      leadId: result.insertedId.toString(),
      ...lead
    },
    message: "Lead saved successfully",
  }, { status: 201 });
});

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const skip = (page - 1) * limit;

  const client = await clientPromise;
  const db = client.db("speicher-chatbot");
  const collection = db.collection("leads");

  const [leads, total] = await Promise.all([
    collection
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
    collection.countDocuments({})
  ]);

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    success: true,
    data: leads,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
});
