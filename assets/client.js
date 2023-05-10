function onSearch(event) {
  event.preventDefault();
  const query = event.target.querySelector("input").value;
  window.location.href = getArticleUrl(query);
}

function getArticleUrl(text) {
  return "/article/" + encodeURI(text.toLowerCase().trim().split(/\W/).filter(Boolean).join("_"))
}

function onAddSuggestion(event) {
  event.preventDefault();
  const form = document.querySelector("#suggestion form");
  const suggestion = form.querySelector("input").value;

  form.innerHTML = "Thank you!";
  fetch("/@suggestion" + location.pathname, { method: "POST", body: suggestion });
}

function onLoad() {
  document.querySelectorAll("article form, header form").forEach(f => f.addEventListener("submit", onSearch));

  const isHomePage = location.pathname === "/";
  if (!isHomePage) {
    showSuggestionsForm();
    renderArticle();
  }
}

function showSuggestionsForm() {
  const suggestions = document.querySelector("#suggestion");

  if (suggestions) {
    suggestions.classList.remove("hidden");
    suggestions.querySelector('form')?.addEventListener("submit", onAddSuggestion);
  }
}

async function renderArticle() {
  const article = document.querySelector('#content');
  const content = article.textContent;
  const response = await fetch('https://markdown.jsfn.run', { method: 'POST', mode: 'cors', body: content });

  if (!response.ok) {
    return;
  }

  const html = await response.text();

  updateArticleContent(article, html);
  updatePageTitle(article);
  fixCodeBlocks(article);
  fixLinks(article);
  linkHeadingsToArticles(article);
}

function updateArticleContent(article, content) {
  const tpl = document.createElement('template');
  tpl.innerHTML = content;
  tpl.content.querySelectorAll('script,style,link').forEach(t => t.remove());
  article.innerHTML = '';
  article.classList.remove('whitespace-pre-wrap');
  article.append(tpl.content.cloneNode(true));
}

function updatePageTitle(article) {
  const title = article.querySelector("h1");
  if (title) {
    window.title = title.textContent.trim();
  }
}

function fixCodeBlocks(article) {
  [...article.querySelectorAll('code')].forEach(c => {
    c.innerText = c.innerText.trim();

    if (c.parentNode.nodeName === 'PRE') {
      c.classList.add('bg-gray-800', 'text-white', 'rounded-lg', 'block');
    }
  });
}

function fixLinks(article) {
  [...article.querySelectorAll('a:not([href^=http])')].forEach(c => {
    const href = c.getAttribute('href');
    if (!href.startsWith('/article/')) {
      c.href = '/article/' + href;
    }
  });
}

function linkHeadingsToArticles(article) {
  [...article.querySelectorAll('h1, h2, h3, h4, h5, h6')].forEach(heading => {
    const text = heading.textContent.trim();
    const link = document.createElement('a');
    link.href = getArticleUrl(text);
    link.innerText = '🔗';
    link.title = 'Read more about ' + text;

    heading.append(link);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onLoad);
} else {
  setTimeout(onLoad);
}
