import express from "express";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { routeVoiceCommand } from "./services/voice-agent.service.js";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/", (_, res) => {
    res.json({
        success: true,
        message: "Voice Agent server running",
    });
});

app.get("/test-groq", async (_, res) => {
    try {
        const groq = new Groq({
            apiKey: process.env.GROQ_API_KEY,
        });

        const response =
            await groq.chat.completions.create({
                model: "openai/gpt-oss-20b",
                messages: [
                    {
                        role: "user",
                        content: "Say exactly: Groq connection working",
                    },
                ],
                temperature: 0,
            });


        res.json({
            success: true,
            response: response.choices?.[0]?.message?.content,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
}
);

app.get("/deepgram/token", async (_, res) => {
    try {
        if (!process.env.DEEPGRAM_API_KEY) {
            return res.status(500).json({
                success: false,
                error: "DEEPGRAM_API_KEY is missing",
            });
        }

        const response = await fetch(
            "https://api.deepgram.com/v1/auth/grant",
            {
                method: "POST",

                headers: {
                    Authorization:
                        `Token ${process.env.DEEPGRAM_API_KEY}`,

                    "Content-Type":
                        "application/json",
                },

                body: JSON.stringify({
                    ttl_seconds: 300,
                }),
            },
        );

        const data =
            await response.json();

        if (!response.ok) {
            console.error(
                "Deepgram token error:",
                data,
            );

            return res.status(
                response.status,
            ).json({
                success: false,
                error:
                    data?.err_msg ||
                    "Unable to create Deepgram token",
            });
        }

        return res.json({
            success: true,

            accessToken:
                data.access_token,

            expiresIn:
                data.expires_in,
        });
    } catch (error) {
        console.error(
            "DEEPGRAM TOKEN ERROR:",
            error,
        );

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                "Unable to create Deepgram token",
        });
    }
},
);

app.post("/deepgram/tts", async (req, res) => {
    try {
        const { text } = req.body;

        if (
            typeof text !== "string" ||
            text.trim().length === 0
        ) {
            return res.status(400).json({
                success: false,
                error: "text is required",
            });
        }

        if (text.length > 400) {
            return res.status(400).json({
                success: false,
                error: "TTS text too long",
            });
        }

        // Raw PCM can be played while bytes are still arriving. The previous
        // MP3 path buffered the complete response before Flutter could start.
        const params = new URLSearchParams({
            model: "aura-2-thalia-en",
            encoding: "linear16",
            container: "none",
            sample_rate: "24000",
            speed: "1.1",
        });

        const abortController = new AbortController();

        res.once("close", () => {
            abortController.abort();
        });

        const deepgramResponse = await fetch(
            `https://api.deepgram.com/v1/speak?${params.toString()}`,
            {
                method: "POST",

                headers: {
                    Authorization:
                        `Token ${process.env.DEEPGRAM_API_KEY}`,

                    "Content-Type":
                        "application/json",
                },

                body: JSON.stringify({
                    text: text.trim(),
                }),

                signal: abortController.signal,
            }
        );

        if (!deepgramResponse.ok) {
            const errorBody =
                await deepgramResponse.text();

            console.error(
                "Deepgram TTS error:",
                errorBody
            );

            return res.status(
                deepgramResponse.status
            ).json({
                success: false,
                error: "Deepgram TTS failed",
            });
        }

        if (!deepgramResponse.body) {
            throw new Error("Deepgram TTS returned no audio stream");
        }

        res.setHeader(
            "Content-Type",
            deepgramResponse.headers.get(
                "content-type"
            ) || "audio/l16;rate=24000"
        );

        res.setHeader(
            "Cache-Control",
            "no-store"
        );

        res.setHeader("X-Audio-Encoding", "linear16");
        res.setHeader("X-Audio-Sample-Rate", "24000");
        res.flushHeaders();

        await pipeline(
            Readable.fromWeb(deepgramResponse.body),
            res,
        );

        return;
    } catch (error) {
        if (
            error?.name === "AbortError" ||
            error?.code === "ERR_STREAM_PREMATURE_CLOSE"
        ) {
            return;
        }

        console.error(
            "TTS ERROR:",
            error
        );

        if (res.headersSent) {
            res.end();
            return;
        }

        return res.status(500).json({
            success: false,
            error:
                error.message ||
                "Unable to generate speech",
        });
    }
});

app.post("/voice-agent/execute", async (req, res) => {
    try {
        const {
            text,
            currentDateTime,
            history,
        } = req.body;

        if (typeof text !== "string" || !text.trim()) {
            return res
                .status(400)
                .json({
                    success: false,
                    error: "text is required",
                });
        }

        const result = await routeVoiceCommand({
            text: text.trim(),
            currentDateTime,
            history: Array.isArray(history) ? history : [],
        });

        return res.json(result);
    } catch (error) {
        console.error(
            "VOICE AGENT ERROR:",
            error
        );

        return res
            .status(500)
            .json({
                success: false,
                error: "Unable to process voice command",
            });
    }
}
);

app.listen(8080, () => {
    console.log("Server running on port 8080");
});
