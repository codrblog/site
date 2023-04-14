import { createServer } from 'http';
import { request } from 'https';
import { join } from 'path';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Configuration, OpenAIApi } from 'openai';

const apiKey = String(process.env.API_KEY);
const configuration = new Configuration({ apiKey });
const openai = new OpenAIApi(configuration);
const index = readFileSync('./index.html', 'utf8');
const CWD = process.cwd();
const recents = [];

async function serve(req, res) {
    if (req.url === '/') {
        res.end(index
            .replace('{content}', '<h1 class="text-3xl font-bold mb-6">Start your search here</h1>')
            .replace('{recents}', generateRecents())
        );
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

    const hash = sha256(urlPath);
    const cachePath = join(CWD, 'cache', hash);

    if (existsSync(cachePath)) {
        const cached = readFileSync(cachePath, 'utf8');
        res.end(cached);
        return;
    }

    const article = await generate(urlPath);
    const newContent = `<!-- ${urlPath} -->\n\n${article}`;
 
    writeFileSync(cachePath, newContent);
    
    res.end(index
        .replace('{content}', newContent)
        .replace('{recents}', generateRecents())
    );
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function generateRecents() {
    return recents.map(next => `<li>${next}</li>`);
}

async function generate(urlPath) {
    const prompt = `Create an HTML article that matches the following URL path: "${urlPath}".
Add relative href links in the content that point to related topics or tags.
Use semantic and SEO optimized markup and format it using Tailwind typography styles.
Generate only the content, not the HTML page around it.
At the end of the article, provide a list with links related to the current page and the sources from where the article was generated`
    const options = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
    };
    
    const completion = await openai.createChatCompletion(options);
    const responses = completion.data.choices.map((c) => c.message.content).join('\n');
    
    return responses;
}

createServer(serve).listen(process.env.PORT);
