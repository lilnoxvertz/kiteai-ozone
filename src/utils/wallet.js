const chalk = require("chalk");
const { timestamp } = require("./timestamp");
const { ethers } = require("ethers");
const fs = require("fs");
const { log } = require("../config");

class Wallet {
    static async generate(amount) {
        console.log(timestamp(), log.processing, chalk.yellowBright(` generating ${amount} wallet`))
        for (let i = 0; i < amount; i++) {
            const wallet = ethers.Wallet.createRandom()
            fs.appendFileSync("wallet.txt", `${wallet.privateKey},${wallet.address}\n`)
        }
        console.log(timestamp(), log.success, chalk.greenBright(` successfully generated ${amount} wallet`))

        const wallets = await this.load()
        console.log(timestamp(), chalk.greenBright(`current wallet total: ${wallets.length}`))
    }

    static async load() {
        return fs.readFileSync("wallet.txt", "utf-8")
            .split("\n")
            .filter(line => line.trim())
            .map(line => line.split(",")[0].trim())
    }
}

module.exports = Wallet