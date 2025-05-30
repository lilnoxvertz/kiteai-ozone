const { Worker } = require("worker_threads")
const path = require("path")
const { timestamp } = require("../utils/timestamp")
const { log } = require("../config")
const chalk = require("chalk")
const { skibidi } = require("../utils/logger")

class Workers {
    static async auth(walletAddress, proxy) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.resolve(__dirname, "./task/auth.js"), {
                workerData: {
                    eoa: walletAddress,
                    proxy: proxy
                }
            })

            worker.on("message", (message) => {
                if (message.type === "success") {
                    resolve(message.data)
                }

                if (message.type === "done") {
                    resolve()
                }

                if (message.data === "failed") {
                    skibidi.failed(message.data)
                    resolve()
                }

                if (message.data === "error") {
                    console.log(message.data)
                    reject(new Error(message.data))
                }
            })

            worker.on("error", reject)
            worker.on("exit", (code) => {
                if (code !== 0) {
                    reject(new Error("WORKER STOPPED"))
                }
            })
        })
    }

    static async dailyQuiz(eoa, authToken, cookie, proxy) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.resolve(__dirname, "./task/dailyQuiz.js"), {
                workerData: {
                    eoa: eoa,
                    authToken: authToken,
                    cookie: cookie,
                    proxy: proxy
                }
            })

            worker.on("message", (message) => {
                if (message.type === "success") {
                    skibidi.success(message.data)
                    resolve()
                }

                if (message.type === "done") {
                    resolve()
                }

                if (message.type === "failed") {
                    skibidi.failed(message.data)
                    resolve()
                }

                if (message.type === "error") {
                    reject(new Error(message.data))
                }
            })

            worker.on("error", reject)
            worker.on("exit", (code) => {
                if (code !== 0) {
                    reject(new Error(`WORKER STOPPED`))
                }
            })
        })
    }

    static async dailyAgent(walletAddress, authToken, cookie, proxy) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.resolve(__dirname, "./task/dailyAgent.js"), {
                workerData: {
                    walletAddress: walletAddress,
                    authToken: authToken,
                    cookie: cookie,
                    proxy: proxy
                }
            })

            worker.on("message", (message) => {
                if (message.type === "success") {
                    resolve()
                }

                if (message.type === "done") {
                    resolve()
                }

                if (message.type === "failed") {
                    resolve()
                }

                if (message.type === "error") {
                    reject(new Error(message.data))
                }
            })

            worker.on("error", reject)
            worker.on("exit", (code) => {
                if (code !== 0) {
                    reject(new Error(`WORKER STOPPED`))
                }
            })
        })
    }

    static async limitTasks(tasks, limit) {
        const results = []
        let taskIndex = 0

        async function runner() {
            while (taskIndex < tasks.length) {
                const currentIndex = taskIndex++
                try {
                    const result = await tasks[currentIndex]()
                    results[currentIndex] = result
                } catch (error) {
                    results[currentIndex] = { error }
                }
            }
        }

        const workers = []
        for (let i = 0; i < Math.min(limit, tasks.length); i++) {
            workers.push(runner())
        }

        await Promise.all(workers)
        return results
    }
}

module.exports = Workers