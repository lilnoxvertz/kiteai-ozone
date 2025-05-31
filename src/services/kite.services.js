const { HttpsProxyAgent } = require("https-proxy-agent")
const { parentPort, workerData } = require("worker_threads")
const { timestamp } = require("../utils/timestamp")
const { createPublicClient, http, keccak256, defineChain } = require("viem")
const { parseAbi } = require("viem")
const { log } = require("../config")
const chalk = require("chalk")
const GroqAi = require("./groq")
const { skibidi } = require("../utils/logger")

const smartAccountFactoryAbi = parseAbi([
    "function getAddress(address owner, uint256 salt) public view returns (address)"
])

const gokiteTestnet = defineChain({
    id: 2368,
    name: 'GoKite Testnet',
    nativeCurrency: {
        name: 'Kite',
        symbol: 'KITE',
        decimals: 18
    },
    rpcUrls: {
        default: {
            http: ['https://rpc-testnet.gokite.ai']
        },
        public: {
            http: ['https://rpc-testnet.gokite.ai']
        }
    }
})

class KiteClient {
    static async getSmartAccountAddress(eoaAddress) {
        const factoryAddress = "0x948f52524Bdf595b439e7ca78620A8f843612df3"
        const secretKey = "GoKiteTestnet"

        if (!eoaAddress) {
            throw new Error("SmartAccount Error: EOA address is empty")
        }

        const salt = keccak256(new TextEncoder().encode(secretKey))

        const publicClient = createPublicClient({
            chain: gokiteTestnet,
            transport: http()
        })

        const address = await publicClient.readContract({
            address: factoryAddress,
            abi: smartAccountFactoryAbi,
            functionName: "getAddress",
            args: [eoaAddress, salt]
        })

        return address
    }

    static async headerConfig(authToken, cookie) {
        const header = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
            "Authorization": `Bearer ${authToken}`,
            "Cache-Control": "no-cache",
            "Content-Type": "application/json",
            "Cookie": `${cookie}`,
            "Dnt": "1",
            "Origin": "https://testnet.gokite.ai",
            "Pragma": "no-cache",
            "Referer": "https://testnet.gokite.ai/",
            "Sec-Ch-Ua": '"Chromium";v="136", "Microsoft Edge";v="136", "Not.A/Brand";v="99"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": "Windows",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0"
        }

        return header
    }

    static async createDailyQuiz(eoa, authToken, cookie, proxy) {
        const url = "https://neo.prod.gokite.ai/v2/quiz/create"
        const header = await this.headerConfig(authToken, cookie)
        const agent = proxy ? new HttpsProxyAgent(proxy) : undefined

        const today = new Date()
        const date = new Intl.DateTimeFormat("en-CA").format(today)

        let created = false
        let attempt = 0
        const maxAttempt = 3

        if (!created && attempt === maxAttempt) {
            return {
                status: false,
                msg: `${eoa} REACHED MAX ATTEMPT. FAILED CREATING QUIZ`
            }
        }

        while (!created && attempt < maxAttempt) {
            attempt++
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: header,
                    agent,
                    body: JSON.stringify({
                        eoa: eoa,
                        num: 1,
                        title: `daily_quiz_${date}`
                    })
                })

                if (!response.ok) {
                    skibidi.failed(`${eoa} FAILED CREATING QUIZ. RETRYING`)
                    await new Promise(resolve => setTimeout(resolve, 12000))
                    continue
                }

                const result = await response.json()

                created = true
                return {
                    status: true,
                    quiz_id: result.data.quiz_id
                }
            } catch (error) {
                console.error(error)
            }
        }
    }

    static async completeDailyQuiz() {
        const { eoa, authToken, cookie, proxy } = workerData

        const agent = proxy ? new HttpsProxyAgent(proxy) : undefined
        skibidi.processing(`${eoa} IS CREATING A QUIZ`)
        const dailyQuiz = await this.createDailyQuiz(eoa, authToken, cookie, proxy)

        if (!dailyQuiz.status) {
            console.log(timestamp(), dailyQuiz.msg)
            return
        }

        skibidi.success(`${eoa} SUCCESSFULLY CREATING A QUIZ! COMPLETING..`)

        const url = `https://neo.prod.gokite.ai/v2/quiz/get?id=${dailyQuiz.quiz_id}&eoa=${eoa}`
        const header = await this.headerConfig(authToken, cookie)
        let quiz = false
        let attempt = 0
        const maxAttempt = 3

        if (!quiz && attempt === maxAttempt) {
            parentPort.postMessage({
                type: "failed",
                data: `${eoa} REACHED MAX ATTEMPT. FAILED COMPLETING DAILY QUIZ`
            })
            return
        }

        while (!quiz && attempt < maxAttempt) {
            try {
                const response = await fetch(url, {
                    method: "GET",
                    headers: header,
                    agent
                })

                const result = await response.json()

                if (!response.ok) {
                    skibidi.failed(`${eoa}  FAILED COMPLETING DAILY QUIZ. RETRYING (${attempt}/${maxAttempt})`)
                    await new Promise(resolve => setTimeout(resolve, 15000))
                    continue
                }

                const quizId = result.data.quiz.quiz_id
                const questionId = result.data.question[0].question_id
                const answer = result.data.question[0].answer

                quiz = true
                skibidi.processing(`${eoa} IS TRYING TO SUBMIT ANSWER`)
                const submit = await this.submitDailyQuizAnswer(eoa, answer, questionId, quizId, authToken, cookie, proxy)

                if (!submit.status) {
                    parentPort.postMessage({
                        type: "failed",
                        data: submit.msg
                    })
                }

                parentPort.postMessage({
                    type: "success",
                    data: `${eoa} SUCCESSFULLY COMPLETED DAILY QUIZ`
                })
            } catch (error) {
                parentPort.postMessage({
                    type: "error",
                    data: chalk.red(error)
                })
            }
            attempt++
        }

        parentPort.postMessage({
            type: "done"
        })
    }

    static async submitDailyQuizAnswer(eoa, answer, questionId, quizId, authToken, cookie, proxy) {
        const url = `https://neo.prod.gokite.ai/v2/quiz/submit`
        const header = await this.headerConfig(authToken, cookie)
        const agent = proxy ? new HttpsProxyAgent(proxy) : undefined

        let submitted = false
        let attempt = 0
        const maxAttempt = 3

        if (!submitted && attempt === maxAttempt) {
            return {
                status: false,
                msg: `${log.failed} ${chalk.redBright(`${eoa} REACHED MAX ATTEMPT. FAILED SUBMITTING ANSWER`)}`
            }
        }

        while (!submitted && attempt < maxAttempt) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: header,
                    agent,
                    body: JSON.stringify({
                        answer: answer,
                        eoa: eoa,
                        finish: true,
                        question_id: questionId,
                        quiz_id: quizId
                    })
                })

                const result = await response.json()

                if (!response.ok) {
                    skibidi.failed(`${eoa}  FAILED SUBMITTING ANSWER. RETRYING (${attempt}/${maxAttempt})`)
                    await new Promise(resolve => setTimeout(resolve, 13000))
                    continue
                }

                const isCorrect = result.data.result

                if (!isCorrect) {
                    skibidi.warn(`${eoa} ANSWER IS FALSE`)
                }

                skibidi.success(`${eoa} ANSWER IS CORRECT`)
                return {
                    status: true
                }
            } catch (error) {
                skibidi.failed(`${eoa} ${error}`)
            }
            attempt++
        }
    }

    static async sendMessage() {
        const { walletAddress, authToken, cookie, proxy } = workerData

        const prompt = [
            "What is the difference between a blockchain and a traditional database?",
            "How does a blockchain ensure data integrity and immutability?",
            "What are the key components of a blockchain network?",
            "What is the role of consensus algorithms like Proof of Work or Proof of Stake?",
            "How do smart contracts work on Ethereum?",
            "What are gas fees in Ethereum and why do they fluctuate?",
            "What is a blockchain wallet and how does it work?",
            "What are the differences between custodial and non-custodial wallets?",
            "What is a token and how is it different from a coin?",
            "What is the purpose of a whitepaper in a crypto project?",
            "How do decentralized exchanges (DEXs) work?",
            "What are the risks of investing in cryptocurrencies?",
            "What is the difference between Layer 1 and Layer 2 blockchains?",
            "What is a hard fork in blockchain technology?",
            "How do NFTs work and what makes them unique?",
            "What is DeFi (Decentralized Finance) and how does it work?",
            "What is staking in crypto and how can users earn rewards?",
            "What is a blockchain oracle and why is it important?",
            "How do crypto mining and transaction validation work?",
            "What are the most common use cases for blockchain technology outside of cryptocurrency?"
        ]

        const randomPromptIndex = Math.floor(Math.random() * prompt.length)
        const groqApi = process.env.groq_api

        const url = "https://ozone-point-system.prod.gokite.ai/agent/inference"

        const header = {
            "Accept": "text/event-stream",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json",
            "Origin": "https://testnet.gokite.ai",
            "Pragma": "no-cache",
            "Referer": "https://testnet.gokite.ai/",
            "Sec-Ch-Ua": "\"Chromium\";v=\"136\", \"Microsoft Edge\";v=\"136\", \"Not:A-Brand\";v=\"99\"",
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": "\"Windows\"",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0"
        }

        const agent = proxy ? new HttpsProxyAgent(proxy) : undefined
        let cycle = 0

        while (cycle < 10) {
            cycle++
            const message = groqApi ? await GroqAi.getQuestion() : prompt[randomPromptIndex]
            try {
                skibidi.processing(`${walletAddress} IS SENDING A MESSAGE TO AGENT`)
                const response = await fetch(url, {
                    method: "POST",
                    headers: header,
                    agent,
                    body: JSON.stringify({
                        "service_id": "deployment_KiMLvUiTydioiHm7PWZ12zJU",
                        "subnet": "kite_ai_labs",
                        "stream": true,
                        "body": {
                            "message": message,
                            "stream": true
                        }
                    })
                })

                const reader = response.body.getReader()
                const decoder = new TextDecoder()

                let agentResponse = ""

                while (true) {
                    const { done, value } = await reader.read()

                    if (done) {
                        break
                    }

                    const chunk = decoder.decode(value, { stream: true })
                    const lines = chunk.split("\n").filter(line => line.trim() !== "")

                    for (const line of lines) {
                        try {
                            if (line.startsWith("data:")) {
                                const json_string = line.slice(5).trim()

                                if (json_string === "[DONE]") {
                                    break
                                }

                                const parsed = JSON.parse(json_string)
                                const content = parsed.choices[0]?.delta.content

                                if (content === "null" || content === null) {
                                    break
                                }

                                agentResponse += `${content}`
                            }
                        } catch (error) {
                            parentPort.postMessage({
                                type: "error",
                                data: `${walletAddress} FAILED PARSING AGENT RESPONSE`
                            })
                            return
                        }
                    }
                }

                skibidi.success(`${walletAddress} SUCCESSFULLY SENDING MESSAGE TO AGENT. SUBMITTING RECEIPT..   `)
                const receipt = await this.submitReceipt(walletAddress, message, agentResponse, authToken, cookie, proxy)

                if (!receipt.status) {
                    skibidi.failed(receipt.msg)
                    parentPort.postMessage({
                        type: "failed"
                    })
                }

                parentPort.postMessage({
                    type: "success"
                })
            } catch (error) {
                parentPort.postMessage({
                    type: "error",
                    data: error
                })
            }

            skibidi.warn(`${walletAddress} COMPLETED (${cycle}/10) CYCLES`)
            await new Promise(resolve => setTimeout(resolve, 15000))
        }

        skibidi.success(`${walletAddress} SUCCESSFULLY FINISHED (${cycle}/10) CYCLES`)
        parentPort.postMessage({
            type: "done"
        })
    }

    static async submitReceipt(walletAddress, message, responseMessage, authToken, cookie, proxy) {
        const agent = proxy ? new HttpsProxyAgent(proxy) : undefined
        const url = "https://neo.prod.gokite.ai/v2/submit_receipt"
        const header = await this.headerConfig(authToken, cookie)

        let submitted = false
        let attempt = 0
        const maxAttempt = 3

        if (!submitted && attempt === maxAttempt) {
            return {
                status: false,
                msg: `${walletAddress} FAILED SUBMITTING RECEIPT`
            }
        }

        while (!submitted && attempt < maxAttempt) {
            attempt++
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: header,
                    agent,
                    body: JSON.stringify({
                        address: walletAddress,
                        input: [{
                            type: "text/plain",
                            value: message
                        }],
                        output: [{
                            type: "text/plain",
                            value: responseMessage
                        }],
                        service_id: "deployment_KiMLvUiTydioiHm7PWZ12zJU"
                    })
                })

                const result = await response.json()

                if (!response.ok) {
                    skibidi.failed(`${walletAddress} FAILED SUBMITTING RECEIPT. RETRYING (${attempt}/${maxAttempt})`)
                    await new Promise(resolve => setTimeout(resolve, 12000))
                    continue
                }

                const chatId = result.data.id

                skibidi.processing(`${walletAddress} RECEIPT SUBMITTED. CONFIRMING..`)
                const confirm = await this.confirmReceipt(walletAddress, chatId, authToken, cookie, proxy)

                if (!confirm.status) {
                    return {
                        status: false,
                        msg: confirm.msg
                    }
                }

                skibidi.success(confirm.msg)
                return {
                    status: true
                }
            } catch (error) {
                skibidi.failed(`${walletAddress} ${error}`)
            }
        }

        return
    }

    static async confirmReceipt(walletAddress, id, authToken, cookie, proxy) {
        const agent = proxy ? new HttpsProxyAgent(proxy) : undefined
        const url = `https://neo.prod.gokite.ai/v1/inference?id=${id}`
        const header = this.headerConfig(authToken, cookie)

        let confirmed = false
        let attempt = 0
        const maxAttempt = 3

        if (!confirmed && attempt === maxAttempt) {
            return {
                status: false,
                msg: `${walletAddress} REACHED MAX ATTEMPT. FAILED CONFIRMING TX HASH`
            }
        }

        while (!confirmed && attempt < maxAttempt) {
            attempt++
            try {
                const response = await fetch(url, {
                    method: "GET",
                    headers: header,
                    agent,
                })

                const result = await response.json()
                const txhash = result.data.tx_hash

                if (txhash === "") {
                    skibidi.failed(`${walletAddress} FAILED CONFIRMING TX HASH. RETRYING (${attempt}/${maxAttempt})`)
                    await new Promise(resolve => setTimeout(resolve, 12000))
                    continue
                }

                confirmed = true
                return {
                    status: true,
                    msg: `${walletAddress} RECEIPT SUCCESSFULLY CONFIRMED`
                }
            } catch (error) {
                skibidi.failed(`${walletAddress} ${error}`)
            }
        }

        return
    }

    // static async getUserData(walletAddress, authToken, proxy) {
    //     const agent = proxy ? new HttpsProxyAgent(proxy) : undefined
    //     const url = "https://ozone-point-system.prod.gokite.ai/me"
    //     const header = {
    //         "Accept": "text/event-stream",
    //         "Accept-Encoding": "gzip, deflate, br, zstd",
    //         "Accept-Language": "en-US,en;q=0.9",
    //         "Authorization": `Bearer ${authToken} `,
    //         "Content-Type": "application/json",
    //         "Origin": "https://testnet.gokite.ai",
    //         "Pragma": "no-cache",
    //         "Referer": "https://testnet.gokite.ai/",
    //         "Sec-Ch-Ua": "\"Chromium\";v=\"136\", \"Microsoft Edge\";v=\"136\", \"Not:A-Brand\";v=\"99\"",
    //         "Sec-Ch-Ua-Mobile": "?0",
    //         "Sec-Ch-Ua-Platform": "\"Windows\"",
    //         "Sec-Fetch-Dest": "empty",
    //         "Sec-Fetch-Mode": "cors",
    //         "Sec-Fetch-Site": "same-site",
    //         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0"
    //     }

    //     let data = false
    //     let attempt = 0
    //     const maxAttempt = 3

    //     if (!data && attempt === maxAttempt) {
    //         return {
    //             status: false
    //         }
    //     }

    //     while (!data && attempt < maxAttempt) {
    //         attempt++
    //         try {
    //             const response = await fetch(url, {
    //                 method: "GET",
    //                 headers: header,
    //                 agent
    //             })

    //             const result = await response.text()

    //             if (!response.ok) {
    //                 console.log(timestamp(), log.failed, chalk.redBright(` ${walletAddress} FAILED GETTING USER DATA.RETRYING`))
    //                 await new Promise(resolve => setTimeout(resolve, 20000))
    //                 continue
    //             }


    //             const userId = result?.data?.profile?.user_id

    //             if (userId === "" || userId === null) {
    //                 console.log(timestamp(), log.failed, chalk.redBright(` ${walletAddress} USER NOT EXIST!`))
    //                 break
    //             }

    //             data = true
    //             console.log(timestamp(), log.success, chalk.redBright(` ${walletAddress} SUCCESSFULLY GETTING USER DATA`))

    //             return {
    //                 status: true
    //             }
    //         } catch (error) {
    //             console.error(timestamp(), chalk.redBright(` ${error} `))
    //         }
    //     }

    //     return
    // }
}

module.exports = KiteClient