import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { transcript } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Transcript string is required." },
        { status: 400 }
      );
    }

    // 1. Process transcript through Gemini 1.5 Flash
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in environment variables." },
        { status: 500 }
      );
    }

    const geminiPrompt = `
You are an executive assistant processing raw voice transcriptions recorded on the go.

YOUR GOAL:
Clean up the text into a structured, highly actionable note for a Trello card.

STRICT CONSTRAINTS:
1. Grounding: ONLY use facts provided in the raw transcript. Do NOT invent specific dates, vendor names, numbers, or details.
2. Noise Elimination: Strip out filler words ("uh", "um", "like", false starts, trailing thoughts that cut off).
3. Tone: Direct, concise, and operational. Avoid fluff, corporate jargon, or overly polished transformations.

TAG SELECTION RULES:
Select EXACTLY ONE category from this list that best matches the core intent:
- "Restaurant Ops" (Kitchen equipment, prep, inventory, physical maintenance, shift operations)
- "Restaurant Finance" (Menu costing, ingredient pricing, vendor SKUs, Toast POS fees, invoices)
- "Restaurant Marketing" (Promotions, customer feedback, online ordering features, website/PWA ideas)
- "Business Misc" (S-Corp corporate items, partner discussions, legal/compliance, general strategy)
- "Personal Misc" (Motorcycle/vehicle maintenance, errands, personal health/fitness, study topics)
- "General" (Use ONLY if the transcript is too vague or doesn't fit any bucket above)

If the user explicitly said "tag as X" or "category X", prioritize their explicit choice over context.

OUTPUT SCHEMA:
Return STRICT, VALID JSON ONLY (no markdown backticks, no code blocks) matching this structure:
{
  "title": "Concise 3-6 word summary title",
  "category": "One of the exact category strings listed above",
  "actionItems": ["Specific task 1", "Specific task 2"],
  "cleanNotes": "Cleaned version of the spoken context",
  "needsClarification": "Any vague/incomplete points that need user review (or empty string if clear)"
}

RAW TRANSCRIPT:
"${transcript}"
`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: geminiPrompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API Error:", errText);
      return NextResponse.json(
        { error: "Failed to parse transcript with Gemini." },
        { status: 500 }
      );
    }

    const geminiData = await geminiResponse.json();
    const rawJsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawJsonText) {
      return NextResponse.json(
        { error: "Empty response from Gemini." },
        { status: 500 }
      );
    }

    const parsedData = JSON.parse(rawJsonText);

    // 2. Format card description for Trello
    let cardDescription = `**Category:** ${parsedData.category}\n\n`;

    if (parsedData.needsClarification) {
      cardDescription += `⚠️ **Needs Clarification:** ${parsedData.needsClarification}\n\n`;
    }

    if (parsedData.actionItems && parsedData.actionItems.length > 0) {
      cardDescription += `**Action Items:**\n`;
      parsedData.actionItems.forEach((item: string) => {
        cardDescription += `- [ ] ${item}\n`;
      });
      cardDescription += `\n`;
    }

    if (parsedData.cleanNotes) {
      cardDescription += `**Notes:**\n${parsedData.cleanNotes}\n\n`;
    }

    cardDescription += `---\n*Raw Dump:* "${transcript}"`;

    // 3. Create Trello Card
    const trelloKey = process.env.TRELLO_API_KEY;
    const trelloToken = process.env.TRELLO_TOKEN;
    const trelloListId = process.env.TRELLO_LIST_ID;

    if (!trelloKey || !trelloToken || !trelloListId) {
      return NextResponse.json(
        { error: "Missing Trello environment variables." },
        { status: 500 }
      );
    }

    const trelloUrl = new URL("https://api.trello.com/1/cards");
    trelloUrl.searchParams.append("key", trelloKey);
    trelloUrl.searchParams.append("token", trelloToken);
    trelloUrl.searchParams.append("idList", trelloListId);
    trelloUrl.searchParams.append(
      "name",
      `[${parsedData.category}] ${parsedData.title}`
    );
    trelloUrl.searchParams.append("desc", cardDescription);
    trelloUrl.searchParams.append("pos", "top");

    const trelloResponse = await fetch(trelloUrl.toString(), {
      method: "POST",
      headers: { Accept: "application/json" },
    });

    if (!trelloResponse.ok) {
      const errText = await trelloResponse.text();
      console.error("Trello API Error:", errText);
      return NextResponse.json(
        { error: "Failed to create Trello card." },
        { status: 500 }
      );
    }

    const cardData = await trelloResponse.json();

    return NextResponse.json({
      success: true,
      cardUrl: cardData.shortUrl,
      title: parsedData.title,
      category: parsedData.category,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("Transcribe API Handler Error:", errorMessage);
    return NextResponse.json(
      { error: "Internal Server Error", details: errorMessage },
      { status: 500 }
    );
  }
}