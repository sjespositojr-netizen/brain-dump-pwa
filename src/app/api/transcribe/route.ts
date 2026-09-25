import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided." }, { status: 400 });
    }

    // Convert file buffer for Gemini
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString("base64");

    // 1. Send Audio directly to Gemini Flash Lite for Transcription & Formatting
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: [
        {
          inlineData: {
            mimeType: audioFile.type || "audio/webm",
            data: base64Audio,
          },
        },
        {
          text: `You are an executive assistant intake system. Listen to this voice dump and return a JSON object with:
          1. "title": A concise, clear card title summarizing the task or thought.
          2. "description": Clean, bulleted text of the content, fixing stuttering or filler words.
          3. "category": Pick the best fit: ["Action", "Kitchen/Recipes", "Idea", "General"].
          Return ONLY valid JSON.`,
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const parsedData = JSON.parse(response.text || "{}");

    // 2. Post to Trello List
    const trelloRes = await fetch(
      `https://api.trello.com/1/cards?idList=${process.env.TRELLO_LIST_ID}&key=${process.env.TRELLO_API_KEY}&token=${process.env.TRELLO_TOKEN}&name=${encodeURIComponent(parsedData.title)}&desc=${encodeURIComponent(parsedData.description)}`,
      { method: "POST" }
    );

    const trelloData = await trelloRes.json();

    return NextResponse.json({
      success: true,
      cardUrl: trelloData.shortUrl,
      transcript: parsedData.description,
    });
  } catch (error: any) {
    console.error("Transcribe API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process audio" }, { status: 500 });
  }
}