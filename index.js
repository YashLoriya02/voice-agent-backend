import express from "express";
import dotenv from "dotenv";
import Groq from "groq-sdk";
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

app.get(
    "/deepgram/token",

    async (_, res) => {
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

        const params = new URLSearchParams({
            model: "aura-2-thalia-en",
            encoding: "mp3",
            speed: "1.1",
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

        const audioBuffer =
            Buffer.from(
                await deepgramResponse.arrayBuffer()
            );

        res.setHeader(
            "Content-Type",
            deepgramResponse.headers.get(
                "content-type"
            ) || "audio/mpeg"
        );

        res.setHeader(
            "Cache-Control",
            "no-store"
        );

        return res.send(audioBuffer);
    } catch (error) {
        console.error(
            "TTS ERROR:",
            error
        );

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
        const { text, currentDateTime } = req.body;

        if (
            typeof text !== "string" ||
            text.trim().length === 0
        ) {

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
        });


        console.log(
            "AGENT RESULT:",
            JSON.stringify(
                result,
                null,
                2
            )
        );

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
                error: error.message || "Unable to process voice command",
            });
    }
}
);


app.listen(8080, () => {
    console.log("Server running on port 8080");
});