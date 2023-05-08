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

function showArticleContent() {
  const article = document.querySelector("main article");
  const aiContent = document.querySelector("#tpl");
  if (aiContent.content) {

    const t = document.createElement('div');
    [...aiContent.content.childNodes].forEach(c => t.appendChild(c));
    renderArticle(article, t.innerText);
    aiContent.remove();
    return;
  }

  renderArticle(article, '');
}

async function renderArticle(article, content) {
  const response = await fetch('https://markdown.jsfn.run', { method: 'POST', mode: 'cors', body: content });
  if (!response.ok) {
    article.innerText = content;
    return;
  }

  const html = await response.text();
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll('script,style,link').forEach(t => t.remove());
  const div = document.querySelector('#content');
  div.append(tpl.content.cloneNode(true));
  document.querySelector('#loading').classList.add('hidden');

  const title = article.querySelector("h1");
  if (title) {
    window.title = title.textContent.trim();
  }

  [...article.querySelectorAll('code')].forEach(c => {
    c.innerText = c.innerText.trim();

    if (c.parentNode.nodeName === 'PRE') {
      c.classList.add('bg-gray-800', 'text-white', 'rounded-lg', 'block');
    }
  });

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
