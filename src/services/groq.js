const groq = require("groq-sdk")
require("dotenv").config()

class Groq {
    static async getQuestion() {
        try {
            const client = new groq({
                apiKey: process.env.groq_api
            })

            const response = await client.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: "you are a friendly bot that always curious about everything about blockhain. you will always ask about kiteAI. for context, Kite AI is an EVM-compatible Layer 1 blockchain designed specifically for AI applications. It utilizes a unique consensus mechanism called Proof of AI (PoAI) to ensure fair and transparent attribution of contributions within the AI ecosystem. Kite AI includes tools for developers, data pools for advanced research, and an application marketplace, facilitating collaboration across industries and promoting the ownership and control of AI models and data."
                    },
                    {
                        role: "user",
                        content: "ask me something about kite ai"
                    }
                ],
                temperature: 1.3,
                max_tokens: 1024
            })

            const question = await response.choices[0].message.content
            return question
        } catch (error) {
            console.error(error)
        }
    }
}

module.exports = Groq