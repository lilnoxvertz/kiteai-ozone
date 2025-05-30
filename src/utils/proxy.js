const fs = require("fs")
const { timestamp } = require("./timestamp")
const chalk = require("chalk")
const { log } = require("../config")

class Proxy {
    static async load() {
        return fs.readFileSync("proxy.txt", "utf-8")
            .split("\n")
            .filter(line => line.trim())
            .map(line => {
                const parts = line.trim().split(":")

                if (parts.length === 4) {
                    const [ip, port, username, password] = parts
                    return `https://${username}:${password}@${ip}:${port}`
                } else if (parts.length === 2) {
                    const [ip, port] = parts
                    return `https://${ip}:${port}`
                } else {
                    console.log(timestamp(), log.failed, chalk.redBright("WRONG PROXY FORMAT! e.g ip:port:username:password or ip:port"))
                    process.exit(1)
                }
            })
    }

    static async getProxy(array, index) {
        return array.length === 0 ? "" : array[index % array.length]
    }

}

module.exports = Proxy