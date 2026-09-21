import dotenv from "dotenv";
dotenv.config();

import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function testGroq() {
    const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",

        messages: [
            {
                role: "system",
                content: "You are a concise Android voice assistant.",
            },
            {
                role: "user",
                content: "Say exactly: Groq connection working",
            },
        ],

        temperature: 0,
    });

    return response.choices[0]?.message?.content;
}