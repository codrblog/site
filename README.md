# CODR.blog

This is an AI experiment to generate *infinite* web pages about anything.

The AI content is generated from the page's URL, with a short article about a subject and links for further reading.

## Disclaimer

This is, obviously, not a great source of 100% accurate information, as the pages are just generated from pre-trained AI knowledge.

So don't shoot me for giving you wrong information from time to time!

## Can I run this with my API key?

Of course! This is just an Node.js server, but it requires a few environment variables:

| Variable    | Description                                       |
| ----------- | --------------------------------------------------|
| PORT        | Number. HTTP port to use                          |
| API_MODEL   | String. OpenAI model to use                       |
| API_KEY     | String. OpenAI key                                |
| NO_CACHE    | Optional. Set it to skip file caching             |
| API_STREAM  | Optional. Set to stream content responses faster. |

## Can I use it with Docker?

Yup, you can pull the image from GitHub. Here's a minimal example:

```bash
docker run --detach --name codr -p80:1234 -e PORT=1234 -e API_MODEL='gpt-3.5-turbo' -e API_KEY='your-key' ghcr.io/codrblog/
site:latest

curl http://localhost:80/article/what_is_internet
```
