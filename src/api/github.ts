import { Http } from './http';
import { map } from 'rxjs/operators';

const GITHUB_API = 'https://api.github.com';
const authHeaders = {
  'Authorization': `token ${process.env.GITHUB_TOKEN}`
};

interface GithubFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  download_url: string;
}

const README = /README\.md/i;
const skipReadme = (file: GithubFile) => !README.test(file.name);

export class GitHub {
  static ls(repository: string, filter?: RegExp) {

    const headers = {
      ...authHeaders,
      'Accept': 'application/vnd.github.v3.raw'
    };

    const url = `${GITHUB_API}/repos/${repository}/blog/contents`;

    return Http.get<GithubFile[]>(url, { headers }).pipe(
      map(files => {
        const filterFn = filter ?
          (file: GithubFile) => filter.test(file.name) :
          Boolean;

        return files
          .filter(filterFn)
          .filter(skipReadme)
          .map(o => ({
            size: o.size,
            sha: o.sha,
            path: o.path,
            url: o.download_url
          }));
      })
    );
  }

  static listPosts(repository: string) {
    return this.ls(repository, /\.md$/);
  }

  static cat(repository: string, path: string) {
    const headers = {
      ...authHeaders,
      'Accept': '*/*'
    };

    const url = `https://raw.githubusercontent.com/${repository}/blog/master/${path}`;
    return Http.get(url, { headers, json: false });
  }

  static getLatestHash({ owner, repo }) {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/master`;

    return Http.get(url, { headers: authHeaders }).pipe(
      map(({ object }) => object.sha.slice(0, 7))
    );
  }

  static toHTML(markdown: string) {
    const headers = {
      ...authHeaders,
      'Content-Type': 'text/plain'
    };

    const text = markdown.trim();
    const body = JSON.stringify({ text });

    console.log(`Format ${body}`);

    return Http.post(`${GITHUB_API}/markdown`, { headers, body });
  }
}

// GitHub.listPosts('darlanalves').subscribe(s => console.log(s));
GitHub.toHTML('## darlanalves').subscribe(s => console.log(s));
