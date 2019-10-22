
"use strict";

const fastify = require('fastify')({logger: {level: "error"}});
const scrape = require('./scrape');
const request = require('request');
const path = require('path');
const util = require('util');

// O Heroku configura a porta pela variável de ambiente PORT.
const PORT = process.env.PORT || 8333;


// Plugin que habilita o sistema de template EJS.
fastify.register(require('point-of-view'), {
    engine: {
      ejs: require('ejs')
    }
});

// Plugin que lida com conteúdo de HTML form em serviços de método post.
fastify.register(require('fastify-formbody'));

function scrapeError(s, req, more) {
    if (req) {
        req.log.error(`Error: ${s}${more}`);
    }
    return {scrapeError: s};
}

function addressError(err, req) {
    if (err.errno === "ENOTFOUND") {
        return scrapeError(`Address not found "${err.hostname}:${err.port}".`,
            req);
    }
    // Silent return.
}

fastify.post('/scrape', (req, reply) => {
    const b = req.body;
    if (b && b["url"]) {
        const targetUrl = b["url"].trim();
        let uo;
        try {
            // Normalize the URL so that it includes a trailing slash (/).
            // E.g. from http://pudim.com.br to http://pudim.com.br/
            // It's used when normalizing image src that demands joining paths.
            // This call can throw an exception for invalid URLs. We catch it.
            uo = new URL(targetUrl);
        } catch (e) {
            reply.send(scrapeError(`Invalid URL "${targetUrl}".`, req, 
                `\n ${e}`));
            return;
        }
        const url = uo.toString();
        request(url, (err, res, body) => {
            if (err) { 
                const ae = addressError(err, req);
                if (ae) {
                    reply.send(ae);
                } else {
                    reply.send(scrapeError(`${err}`, req));
                }
            } else if (res.statusCode === 200) {
                const mode = b["mode"];
                if (mode && mode !== "parse5" && mode !== "cheerio" && 
                    mode !== "loose") {
                    scrapeError(`Unknown scrape mode "${mode}".`, req);
                    return; // Unknown mode. So just return.
                }
                let results = scrape.scrape(body, url, mode);
                results["domain"] = uo.hostname;
                reply.send(results);
            } else {
                reply.send(scrapeError(
                    `Unexpected status code: ${res.statusCode}`, req));
            }
        });
    }
});
  
// Página inicial.
fastify.get('/index.html', (req, reply) => {
    reply.view('/templates/index.html.ejs')
});

fastify.get('/', (req, reply) => {
    reply.view('/templates/index.html.ejs')
});


// Página de interface simples para o serviço de scraper.
fastify.get('/scrape', (req, reply) => {
    reply.view('/templates/scrape.ejs')
});

// Página de exemplo com imagens.
fastify.get('/frutas', (req, reply) => {
    const frutas = [
        "Banana", "banana_150.png",
        "Melancia", "melancia_150.png",
        "Uva", "uva_150.png",
        ];
    reply.view('/templates/frutas.ejs', { frutas: frutas })
});

// Plugin que lida com arquivos estáticos como favicon.ico automaticamente.
fastify.register(require('fastify-static'), {
    root: path.join(__dirname, '../static')
});

// Função de exemplo. Responde com uma string.
fastify.get("/string", (req, reply) => {
    reply.send("string goes here.");
});

// Função de exemplo. Responde com um objeto JSON.
fastify.get("/json", (req, reply) => {
    reply.send({JSON: 123, params: req.params, name: req.params["name"], headers: req.headers, what: "what", query: req.query});
});

fastify.setErrorHandler((error, request, reply) => {
    request.log.error(`Error. Default error handler.\n${error}`);
});

// Em alguns exemplos, o IP "0.0.0.0" é omitido. Por padrão, o Fastify usa
// o IP "127.0.0.1". Isso porque é mais seguro por não abrir o IP para a
// Internet toda. Mas quando a gente manda o servidor para um serviço
// remoto como o Heroku, se não "abrir" o IP colocando o "0.0.0.0" ou o que
// seja, não vai funcionar.
fastify.listen(PORT, "0.0.0.0", err => {
    if (err) {
        throw err;
    }
    console.log(`Server listening on ${fastify.server.address().port}`);
});

