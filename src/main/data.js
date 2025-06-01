const { ethers } = require("ethers")
const Proxy = require("../utils/proxy")
const Wallet = require("../utils/wallet")
const Workers = require("../workers/worker")
const { skibidi } = require("../utils/logger")

async function main() {
    let maxWorker = 5

    try {
        console.clear()
        const wallets = await Wallet.load()
        const proxys = await Proxy.load()

        if (wallets.length === 0) {
            skibidi.failed("[NO PRIVATE KEYS FOUND]")
            process.exit(1)
        }

        if (proxys.length === 0) {
            maxWorker = 2
            skibidi.warn("[NO PROXY FOUND. USING CURRENT IP AND LIMITING WORKER]")
        }

        skibidi.success(`[LOADED ${wallets.length} WALLET]`)
        skibidi.success(`[LOADED ${proxys.length} PROXY]`)

        const authTask = []
        const authDataArr = []
        const dailyQuizTask = []

        for (let i = 0; i < wallets.length; i++) {
            const wallet = new ethers.Wallet(wallets[i])
            const proxy = await Proxy.getProxy(proxys, i)
            authTask.push(() => Workers.auth(wallet.address, proxy))
        }

        skibidi.processing("[GETTING AUTH DATA]")
        const authData = await Workers.limitTasks(authTask, maxWorker)

        wallets.forEach((address, index) => {
            authDataArr.push({
                walletAddress: authData[index].eoa,
                authToken: authData[index].authToken,
            })
        })

        for (let j = 0; j < authData.length; j++) {
            const walletAddress = authDataArr[j].walletAddress
            const authToken = authDataArr[j].authToken
            const proxy = await Proxy.getProxy(proxys, j)
            dailyQuizTask.push(() => Workers.points(walletAddress, authToken, proxy))
        }

        skibidi.processing("[GETTING POINTS AND RANK]")
        await Workers.limitTasks(dailyQuizTask, maxWorker)
    } catch (error) {
        skibidi.failed(error)
    }
}

main()