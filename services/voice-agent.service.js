import Groq from "groq-sdk";
import dotenv from "dotenv";

dotenv.config();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const tools = [
    {
        type: "function",
        function: {
            name: "call_contact",
            description:
                "Find a contact on the user's phone and initiate a call or dial action.",

            parameters: {
                type: "object",

                properties: {
                    name: {
                        type: "string",
                        description: "The contact name spoken by the user.",
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
                "Set an alarm at a specific local time.",

            parameters: {
                type: "object",

                properties: {
                    hour: {
                        type: "integer",
                        description:
                            "Hour in 24-hour format from 0 to 23.",
                    },

                    minute: {
                        type: "integer",
                        description:
                            "Minute from 0 to 59.",
                    },

                    label: {
                        type: "string",
                        description:
                            "Optional alarm label.",
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
            description: "Start a countdown timer for a specified duration.",
            parameters: {
                type: "object",
                properties: {
                    seconds: {
                        type: "integer",
                        description: "Total timer duration in seconds.",
                    },
                    label: {
                        type: "string",
                        description: "Optional timer label.",
                    },
                },
                required: ["seconds"],
                additionalProperties: false,
            },
        },
    },
    {
        type: "function",
        function: {
            name: "open_app",
            description: "Open an installed application on the user's phone.",
            parameters: {
                type: "object",
                properties: {
                    app_name: {
                        type: "string",
                        description: "Human-readable app name such as YouTube, Spotify or WhatsApp.",
                    },
                },
                required: ["app_name"],
                additionalProperties: false,
            },
        },
    },

    {
        type: "function",
        function: {
            name: "ask_user",
            description: "Ask the user for information that is required before an action can be executed.",
            parameters: {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                    },
                },
                required: ["message"],
                additionalProperties: false,
            },
        },
    },

    {
        type: "function",
        function: {
            name: "unsupported",
            description: "Use when the user requests an action that this assistant does not currently support.",
            parameters: {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                    },
                },
                required: ["message"],
                additionalProperties: false,
            },
        },
    },
];

export async function routeVoiceCommand({
    text,
    currentDateTime,
}) {
    const now = currentDateTime || new Date().toISOString();

    const response =
        await groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            temperature: 0,
            messages: [
                {
                    role: "system",
                    content: `
You are the command router for an Android voice assistant.

You DO NOT execute actions yourself.

Your only responsibility is to understand the user's request and select exactly one available tool.

Current datetime:
${now}

IMPORTANT RULES:

1. Never claim that an action has already been completed.

2. Never invent contact information.

3. Never invent phone numbers.

4. Never invent Android package names.

5. Use call_contact when the user wants to call a named person.

6. Use set_alarm when the user asks for an alarm at a specific clock time.

7. Use set_timer when the user asks for a countdown duration.

8. Use open_app when the user asks to open an application.

9. If information required to execute the action is missing, use ask_user.

10. If the requested action is not currently supported, use unsupported.

11. Convert timer durations into total seconds.

12. Convert alarm times into 24-hour format.

13. Preserve contact names as closely as possible to what the user said.

14. Preserve application names as human-readable names.

15. Do not choose a supported tool if it does not actually match the user's request.

Examples:

User:
Call Akruti

Tool:
call_contact
name = Akruti


User:
Give Archie a call

Tool:
call_contact
name = Archie


User:
Call someone

Tool:
ask_user
message = Who would you like me to call?


User:
Set a timer for 10 minutes

Tool:
set_timer
seconds = 600


User:
Timer for two and a half minutes

Tool:
set_timer
seconds = 150


User:
Wake me up at 7:30 AM

Tool:
set_alarm
hour = 7
minute = 30


User:
Set an alarm for 11 PM called medicine

Tool:
set_alarm
hour = 23
minute = 0
label = medicine


User:
Open YouTube

Tool:
open_app
app_name = YouTube


User:
Set an alarm

Tool:
ask_user
message = What time should I set the alarm for?


User:
Send Akruti a WhatsApp message

Tool:
unsupported
message = Messaging is not currently supported.
`,
                },
                {
                    role: "user",
                    content: text,
                },
            ],
            tools: tools,
            tool_choice: "required",
        });


    const message = response.choices?.[0]?.message;
    const toolCall = message?.tool_calls?.[0];

    if (!toolCall) {
        throw new Error(
            "Model did not return a tool call."
        );
    }

    const toolName = toolCall.function.name;
    let args = {};

    try {
        args = JSON.parse(
            toolCall.function.arguments
        );

    } catch (error) {
        console.error(
            "Raw tool arguments:",
            toolCall.function.arguments
        );
        throw new Error(
            "Model returned invalid tool arguments."
        );
    }

    if (
        ![
            "call_contact",
            "set_alarm",
            "set_timer",
            "open_app",
            "ask_user",
            "unsupported",
        ].includes(toolName)
    ) {
        throw new Error(
            `Unknown tool returned: ${toolName}`
        );
    }


    if (toolName === "ask_user") {

        return {
            success: true,
            type: "ask_user",
            message:
                args.message ||
                "Could you provide more information?",
        };
    }


    if (toolName === "unsupported") {
        return {
            success: true,
            type: "unsupported",
            message:
                args.message ||
                "That action is not supported yet.",
        };
    }


    return {
        success: true,
        type: "tool_call",
        tool: toolName,
        arguments: args,
    };
}