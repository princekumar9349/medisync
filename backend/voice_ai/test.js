require('dotenv').config();
const http = require('http');
const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_AUTH_TOKEN);



const server = http.createServer((req, res) => {

    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {

        console.log(body);

        res.writeHead(200, {
            'Content-Type': 'text/xml'
        });

        res.end(`
            <Response>
                <Say>Hello from webhook</Say>
                <Hangup/>
            </Response>
        `);
    });
});

server.listen(3000, () => {
    console.log('Listening on 3000');
});


async function createCall() {
    const call = await twilio.calls.create({
    from: process.env.TWILIO_NUMBER,
    to: process.env.PHONE_NUMBER,

    twiml: `
    <Response>
    <Gather
        input="dtmf"
        numDigits="1"
        action="https://juliette-hokey-pacifically.ngrok-free.dev">

        <Say>Press 1 or 2 now</Say>

    </Gather>
    </Response>
    `
    });

    console.log(call);
}
createCall();
