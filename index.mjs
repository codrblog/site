import { createServer } from 'http';
import { request } from 'https';
import { join } from 'path';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Configuration, OpenAIApi } from 'openai';

const CWD = process.cwd();
const apiKey = String(process.env.API_KEY);
const useCache = !Boolean(process.env.NO_CACHE);
const configuration = new Configuration({ apiKey });
const openai = new OpenAIApi(configuration);
const index = readFileSync('./index.html', 'utf8');
const script = readFileSync('./codr.js', 'utf8');
const recents = [];
const pageEnd = '</body></html>';

async function serve(req, res) {
    console.log(req.url);

    if (req.url === '/') {
        return renderContent(res, '<h1 class="text-3xl my-10 font-bold mb-6">I know anything. Start your search above!</h1>');
    }

    if (req.url === '/codr.js') {
        res.end(script);
        return;
    }

    if (req.url === '/@recents') {
        res.end(recents.join('\n'));
        return;
    }

    const urlPath = req.url;
    recents.unshift(urlPath);

    if (recents.length > 100) {
        recents.pop();
    }
    
    renderContent(res, generate(urlPath));
}

async function renderContent(res, content) {
    res.write(index);
    const html = await content;
    res.end(`<template id="content">${html}</template>${pageEnd}`);
}

async function generate(urlPath) {
    const hash = sha256(urlPath);
    const cachePath = join(CWD, 'cache', hash);
    
    if (useCache && existsSync(cachePath)) {
        return readFileSync(cachePath, 'utf8');
    }

    const prompt = `Create an HTML article that matches the following URL path: "${urlPath}".
Add relative href links in the content that point to related topics or tags.
Use semantic and SEO optimized markup and format it using Tailwind typography styles.
Generate only the content, not the HTML page around it and be very brief about the content, but show coding blocks if needed.
At the end of the article, provide a list with links related to the current page and the sources from where the article was generated`
    const options = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
    };
    
    const completion = await openai.createChatCompletion(options);
    const responses = completion.data.choices.map((c) => c.message.content).join('\n');
    
    const article = `<!-- ${urlPath} -->\n\n${responses}`;

    if (useCache) {
        writeFileSync(cachePath, article);
    }

    return article;
}

createServer(serve).listen(process.env.PORT);

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
