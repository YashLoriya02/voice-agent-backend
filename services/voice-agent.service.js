import Groq from "groq-sdk";
import dotenv from "dotenv";
import { evaluate } from "mathjs";

dotenv.config();

const groq =
    new Groq({
        apiKey:
            process.env.GROQ_API_KEY,
    });

const tools = [
    {
        type: "function",

        function: {
            name: "call_contact",

            description:
                "Call or dial a named contact on the user's phone.",

            parameters: {
                type: "object",

                properties: {
                    name: {
                        type: "string",
                    },
                },

                required: ["name"],

                additionalProperties: false,
            },
        },
    },


    {
        type: "function",

        function: {
            name: "set_alarm",

            description:
                "Set an alarm at a specific clock time.",

            parameters: {
                type: "object",

                properties: {

                    hour: {
                        type: "integer",
                    },

                    minute: {
                        type: "integer",
                    },

                    label: {
                        type: "string",
                    },
                },

                required: [
                    "hour",
                    "minute",
                ],

                additionalProperties: false,
            },
        },
    },


    {
        type: "function",

        function: {
            name: "set_timer",

            description:
                "Start a countdown timer.",

            parameters: {
                type: "object",

                properties: {

                    seconds: {
                        type: "integer",
                    },

                    label: {
                        type: "string",
                    },
                },

                required: [
                    "seconds",
                ],

                additionalProperties: false,
            },
        },
    },


    {
        type: "function",

        function: {
            name: "open_app",

            description:
                "Open an application installed on the user's phone.",

            parameters: {
                type: "object",

                properties: {

                    app_name: {
                        type: "string",
                    },
                },

                required: [
                    "app_name",
                ],

                additionalProperties: false,
            },
        },
    },


    // ----------------------------------------------------------
    // CALCULATOR
    // ----------------------------------------------------------

    {
        type: "function",

        function: {
            name: "calculate",

            description:
                "Perform a mathematical calculation. Use this instead of estimating arithmetic yourself.",

            parameters: {
                type: "object",

                properties: {

                    expression: {
                        type: "string",

                        description:
                            "A mathematical expression such as 2+2 or (520*7)/4.",
                    },
                },

                required: [
                    "expression",
                ],

                additionalProperties: false,
            },
        },
    },


    // ----------------------------------------------------------
    // GENERAL AI
    // ----------------------------------------------------------

    {
        type: "function",

        function: {
            name: "answer_user",

            description:
                "Answer general knowledge, casual conversation, explanations, jokes, greetings, everyday advice, or other requests that do not require current internet information.",

            parameters: {
                type: "object",

                properties: {

                    message: {
                        type: "string",

                        description:
                            "A concise conversational response, preferably under 80 words.",
                    },
                },

                required: [
                    "message",
                ],

                additionalProperties: false,
            },
        },
    },


    // ----------------------------------------------------------
    // WEB
    // ----------------------------------------------------------

    {
        type: "function",

        function: {
            name: "search_web",

            description:
                "Search the live web when the request depends on current, recent, changing, or explicitly requested online information.",

            parameters: {
                type: "object",

                properties: {

                    query: {
                        type: "string",
                    },
                },

                required: [
                    "query",
                ],

                additionalProperties: false,
            },
        },
    },


    // ----------------------------------------------------------
    // CLARIFICATION
    // ----------------------------------------------------------

    {
        type: "function",

        function: {
            name: "ask_user",

            description:
                "Ask the user for essential missing information required to complete their request.",

            parameters: {
                type: "object",

                properties: {

                    message: {
                        type: "string",
                    },
                },

                required: [
                    "message",
                ],

                additionalProperties: false,
            },
        },
    },


    // ----------------------------------------------------------
    // TRUE FALLBACK
    // ----------------------------------------------------------

    {
        type: "function",

        function: {
            name: "unsupported",

            description:
                "Use ONLY when the request cannot be completed as a device action, calculation, conversational response, general answer, or web search.",

            parameters: {
                type: "object",

                properties: {

                    message: {
                        type: "string",
                    },
                },

                required: [
                    "message",
                ],

                additionalProperties: false,
            },
        },
    },
];


// ============================================================
// MAIN ROUTER
// ============================================================

export async function routeVoiceCommand({
    text,
    currentDateTime,
    history = [],
}) {

    const now =
        currentDateTime ||
        new Date().toISOString();


    const cleanHistory =
        Array.isArray(history)
            ? history
                .slice(-8)
                .filter(
                    item =>
                        item &&
                        (
                            item.role ===
                            "user" ||
                            item.role ===
                            "assistant"
                        ) &&
                        typeof item.content ===
                        "string"
                )
            : [];


    const messages = [

        {
            role: "system",

            content: `
You are the brain of a fast voice-first AI agent running on an Android phone.

Current datetime:
${now}

Your job is to determine the BEST capability for the user's request.

CAPABILITY PRIORITY:

1. DEVICE ACTION
2. DETERMINISTIC CALCULATION
3. NORMAL AI RESPONSE
4. LIVE WEB SEARCH
5. UNSUPPORTED

DEVICE TOOLS:

- call_contact
- set_alarm
- set_timer
- open_app

Always prefer these tools whenever they match the user's intent.

Examples:

"Call Papa"
→ call_contact

"Ring Mrs Snow"
→ call_contact

"Wake me at 7 tomorrow"
→ set_alarm

"Timer for 10 minutes"
→ set_timer

"Open YouTube"
→ open_app


CALCULATIONS:

Use calculate for arithmetic.

Examples:

"What is 2 plus 2?"
→ calculate(expression="2+2")

"What's 17 percent of 520?"
→ calculate(expression="520*0.17")


GENERAL AI:

Use answer_user for:

- explanations
- definitions
- greetings
- jokes
- normal conversation
- brainstorming
- general knowledge
- evergreen facts
- simple advice
- "what can you do?"
- follow-up conversation

Examples:

"What is an IPO?"
→ answer_user

"Good morning"
→ answer_user

"Tell me a joke"
→ answer_user

"What can you do?"
→ answer_user

"Explain cloud computing simply"
→ answer_user


Keep voice answers concise.

Prefer under 80 words.

Sound natural when spoken aloud.

Do not use markdown formatting unless absolutely necessary.


WEB SEARCH:

Use search_web ONLY when fresh/current external information is materially required.

Examples:

"What's the latest AI news?"
→ search_web

"Which IPOs are open today?"
→ search_web

"Search the web for OpenAI news"
→ search_web

"What's happening in the stock market today?"
→ search_web

"What is an IPO?"
→ DO NOT search.
Use answer_user.

"What is Kubernetes?"
→ DO NOT search.
Use answer_user.

"Tell me a joke"
→ DO NOT search.
Use answer_user.


CLARIFICATION:

Use ask_user when essential information is missing.

Example:

"Call someone"
→ ask_user("Who would you like me to call?")


UNSUPPORTED:

Use unsupported ONLY when none of the other capabilities can reasonably help.

Never claim that a phone action happened yourself.
Actual device actions are executed by the Flutter app.

Never invent contacts or phone numbers.
`,
        },

        ...cleanHistory,

        {
            role: "user",
            content: text,
        },
    ];


    const response =
        await groq.chat.completions.create({

            model:
                "openai/gpt-oss-20b",

            temperature: 0,

            messages,

            tools,

            tool_choice: "required",
        });


    const toolCall =
        response
            .choices?.[0]
            ?.message
            ?.tool_calls?.[0];


    if (!toolCall) {

        throw new Error(
            "Agent returned no tool call"
        );
    }


    const toolName =
        toolCall.function.name;


    let args = {};

    try {

        args =
            JSON.parse(
                toolCall.function.arguments
            );

    } catch (_) {

        throw new Error(
            "Invalid agent tool arguments"
        );
    }


    // ==========================================================
    // GENERAL RESPONSE
    // ==========================================================

    if (
        toolName ===
        "answer_user"
    ) {

        return {

            success: true,

            type:
                "assistant_response",

            source:
                "llm",

            message:
                limitWords(
                    args.message,
                    90
                ),
        };
    }


    // ==========================================================
    // CALCULATOR
    // ==========================================================

    if (
        toolName ===
        "calculate"
    ) {

        const expression =
            String(
                args.expression || ""
            ).trim();


        if (
            expression.length === 0 ||
            expression.length > 100
        ) {

            return {

                success: true,

                type:
                    "unsupported",

                message:
                    "I couldn't understand that calculation.",
            };
        }


        /*
         * Only allow simple mathematical characters.
         *
         * Don't blindly execute arbitrary model output.
         */
        if (
            !/^[0-9+\-*/().%^,\s]+$/
                .test(expression)
        ) {

            return {

                success: true,

                type:
                    "unsupported",

                message:
                    "I couldn't safely evaluate that calculation.",
            };
        }


        try {

            const result =
                evaluate(expression);


            return {

                success: true,

                type:
                    "assistant_response",

                source:
                    "calculator",

                message:
                    `The answer is ${result}.`,
            };

        } catch (_) {

            return {

                success: true,

                type:
                    "unsupported",

                message:
                    "I couldn't calculate that.",
            };
        }
    }


    // ==========================================================
    // WEB SEARCH
    // ==========================================================

    if (
        toolName ===
        "search_web"
    ) {

        const query =
            String(
                args.query || text
            ).trim();


        return await searchWeb(
            query
        );
    }


    // ==========================================================
    // ASK USER
    // ==========================================================

    if (
        toolName ===
        "ask_user"
    ) {

        return {

            success: true,

            type:
                "ask_user",

            message:
                args.message ||
                "Could you tell me a little more?",
        };
    }


    // ==========================================================
    // UNSUPPORTED
    // ==========================================================

    if (
        toolName ===
        "unsupported"
    ) {

        return {

            success: true,

            type:
                "unsupported",

            message:
                args.message ||
                "I can't do that yet.",
        };
    }


    // ==========================================================
    // DEVICE TOOL
    // ==========================================================

    const deviceTools = [

        "call_contact",

        "set_alarm",

        "set_timer",

        "open_app",
    ];


    if (
        !deviceTools.includes(
            toolName
        )
    ) {

        throw new Error(
            `Unknown tool: ${toolName}`
        );
    }


    return {

        success: true,

        type:
            "tool_call",

        tool:
            toolName,

        arguments:
            args,
    };
}

// ============================================================
// WEB SEARCH
// ============================================================

async function searchWeb(
    query
) {

    /*
     * Allows us to disable paid/live
     * web tools without changing Flutter.
     */
    if (
        process.env
            .ENABLE_WEB_SEARCH ===
        "false"
    ) {

        return {

            success: true,

            type:
                "unsupported",

            message:
                "Live web search isn't enabled right now.",
        };
    }


    try {

        const response =
            await groq
                .chat
                .completions
                .create({

                    model:
                        "openai/gpt-oss-20b",

                    reasoning_effort:
                        "low",

                    max_completion_tokens:
                        350,

                    messages: [

                        {
                            role:
                                "system",

                            content: `
You are providing a short spoken answer for a mobile AI voice assistant.

Search the web for current information.

Answer the user's question directly.

Rules:

- Maximum 90 words.
- Prefer 2-4 sentences.
- No markdown headings.
- No long lists.
- Do not mention that you are an AI.
- Avoid reading URLs aloud.
- If reliable information cannot be found, say so.
`,
                        },

                        {
                            role:
                                "user",

                            content:
                                query,
                        },
                    ],

                    tools: [
                        {
                            type:
                                "browser_search",
                        },
                    ],

                    tool_choice:
                        "required",
                });


        const answer =
            response
                .choices?.[0]
                ?.message
                ?.content
                ?.trim();


        if (!answer) {

            throw new Error(
                "No search answer"
            );
        }


        return {

            success: true,

            type:
                "assistant_response",

            source:
                "web",

            message:
                limitWords(
                    answer,
                    90
                ),
        };

    } catch (error) {

        console.error(
            "WEB SEARCH ERROR:",
            error
        );


        return {

            success: true,

            type:
                "unsupported",

            message:
                "I couldn't access live web information right now.",
        };
    }
}

// ============================================================
// HELPERS
// ============================================================

function limitWords(
    value,
    maximum
) {

    const text =
        String(
            value || ""
        ).trim();


    const words =
        text.split(/\s+/);


    if (
        words.length <=
        maximum
    ) {

        return text;
    }


    return (
        words
            .slice(
                0,
                maximum
            )
            .join(" ") +
        "..."
    );
}
