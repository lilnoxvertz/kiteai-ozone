const groq = require("groq-sdk")
require("dotenv").config()

class Groq {
    static async getQuestion(data) {
        try {
            const client = new groq({
                apiKey: process.env.groq_api
            })

            const response = await client.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: "you are a friendly bot that know everything about crypto"
                    },
                    ...data
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