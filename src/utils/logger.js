const chalk = require("chalk")
const { timestamp } = require("./timestamp")

const skibidi = {
    success: (msg) => {
        console.log(timestamp(), chalk.greenBright(msg))
    },
    failed: (msg) => {
        console.log(timestamp(), chalk.redBright(msg))
    },
    processing: (msg) => {
        console.log(timestamp(), chalk.yellowBright(msg))
    },
    warn: (msg) => {
        console.log(timestamp(), chalk.rgb(255, 165, 0)(msg))
    }
}

module.exports = { skibidi }