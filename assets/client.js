function onSearch(event) {
  event.preventDefault();
  const query = event.target.querySelector("input").value;

  window.location.href =
    "/article/" +
    encodeURI(query.toLowerCase().trim().split(/\W/).filter(Boolean).join("_"));
}

function onAddSuggestion(event) {
  event.preventDefault();
  const form = document.querySelector("#suggestion form");
  const suggestion = form.querySelector("input").value;

  form.innerHTML = "Thank you!";
  fetch("/@suggestion" + location.pathname, { method: "POST", body: suggestion });
}

function onLoad() {
  const isHomePage = location.pathname === "/";
  document.querySelector("article form, header form").forEacH(f => f.addEventListener("submit", onSearch));

  if (!isHomePage) {
    showSuggestionsForm();
  }
}

function showSuggestionsForm() {
  const suggestions = document.querySelector("#suggestion");

  if (suggestions) {
    suggestions.classList.remove("hidden");
    suggestions.querySelector('form')?.addEventListener("submit", onAddSuggestion);
  }
}

async function renderArticle(article, content) {
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
}

function updateArticleContent(article, content) {
  const tpl = document.createElement('template');
  tpl.innerHTML = content;
  tpl.content.querySelectorAll('script,style,link').forEach(t => t.remove());
  article.innerHTML = '';
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onLoad);
} else {
  setTimeout(onLoad);
}
