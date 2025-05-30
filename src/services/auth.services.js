const crypto = require("crypto")
const { HttpsProxyAgent } = require('https-proxy-agent')
const { workerData, parentPort } = require('worker_threads')
const { fetch } = require("undici")
const setCookie = require("set-cookie-parser")
const KiteClient = require('./kite.services')
const { skibidi } = require('../utils/logger')

class Auth {
    static async generateTempAuthorizationToken(address) {
        try {
            const keyHex = '6a1c35292b7c5b769ff47d89a17e7bc4f0adfe1b462981d28e0e9f7ff20b8f8a';
            const key = Buffer.from(keyHex, 'hex');
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

            let encrypted = cipher.update(address, 'utf8');
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const authTag = cipher.getAuthTag();

            const result = Buffer.concat([iv, encrypted, authTag]);
            return result.toString('hex');
        } catch (error) {
            skibidi.failed(`${address} FAILED GENERATING TEMPORARY AUTH TOKEN`)
            return null;
        }
    }

    static async getAuthToken() {
        const { eoa, proxy } = workerData

        const agent = proxy ? new HttpsProxyAgent(proxy) : undefined
        const url = "https://neo.prod.gokite.ai/v2/signin"

        let success = false
        let attempt = 0
        const maxAttempt = 3

        if (!success && attempt === maxAttempt) {
            parentPort.postMessage({
                type: "failed",
                data: `${eoa} REACHED MAX ATTEMPT. FAILED GETTING AUTH TOKEN`
            })
        }

        while (!success && attempt < maxAttempt) {
            attempt++
            const tempAuthToken = await this.generateTempAuthorizationToken(eoa)
            try {
                const header = {
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Encoding": "gzip, deflate, br, zstd",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Authorization": tempAuthToken,
                    "Cache-Control": "no-cache",
                    "Content-Type": "application/json",
                    "Dnt": "1",
                    "Origin": "https://testnet.gokite.ai",
                    "Pragma": "no-cache",
                    "Referer": "https://testnet.gokite.ai/",
                    "Sec-Ch-Ua": '"Chromium";v="136", "Microsoft Edge";v="136", "Not.A/Brand";v="99"',
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-site",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0"
                }

                const response = await fetch(url, {
                    method: "POST",
                    headers: header,
                    agent,
                    body: JSON.stringify({
                        eoa: eoa
                    })
                })

                const setCookieHeader = response.headers.getSetCookie?.()
                if (!setCookieHeader) {
                    throw new Error(`${eoa} DIDNT RETURN ANY COOKIE`)
                }

                const cookie = setCookie.parse(setCookieHeader, { map: true })
                const neo_session = cookie.neo_session?.value
                const refresh_token = cookie.refresh_token?.value

                const groupedCookie = `neo_session=${neo_session}; refresh_token=${refresh_token}`

                if (!neo_session || !refresh_token) {
                    skibidi.failed(`${eoa} FAILED GETTING ONE OF THE COOKIE. RETRYING (${attempt}/${maxAttempt})`)
                    await new Promise(resolve => setTimeout(resolve, 20000))
                    continue
                }

                if (!response.ok) {
                    skibidi.failed(`${eoa} FAILED GETTING AUTH TOKEN.RETRYING (${attempt}/${maxAttempt})`)
                    await new Promise(resolve => setTimeout(resolve, 20000))
                    continue
                }

                const result = await response.json()

                //await KiteClient.getUserData(eoa, result.data.access_token, proxy)

                success = true
                skibidi.success(`${eoa} SUCCESSFULLY RETRIEVED AUTH TOKEN`)

                parentPort.postMessage({
                    type: "success",
                    data: {
                        eoa: result.data.eoa,
                        authToken: result.data.access_token,
                        aa_address: result.data.aa_address,
                        cookie: groupedCookie
                    }
                })
            } catch (error) {
                parentPort.postMessage({
                    type: "failed",
                    data: error
                })
            }
        }

        parentPort.postMessage({
            type: "done"
        })
    }
}

module.exports = Auth