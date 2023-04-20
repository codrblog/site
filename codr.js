function search(event) {
  event.preventDefault();
  const query = event.target.querySelector("input").value;

  window.location.href =
    "/article/" +
    encodeURI(query.toLowerCase().trim().split(/\W/).filter(Boolean).join("_"));
}

function addSuggestion(event) {
  event.preventDefault();
  const form = document.querySelector("#suggestion");
  const suggestion = form.querySelector("input").value;

  fetch("/@suggestion" + location.pathname, {
    method: "POST",
    body: suggestion,
  }).then(() => {
    form.innerHTML = "Thank you!";
  });
}

function onLoad() {
  showArticleContent();

  const isHomePage = location.pathname === "/";
  const headerForm = document.querySelector("header form");

  headerForm.addEventListener("submit", search);
  if (!isHomePage) {
    headerForm.classList.remove("hidden");
  }

  fetch(isHomePage ? "/@index" : "/@recents")
    .then((x) => x.json())
    .then((list) => {
      const recents = document.querySelector("aside nav");
      recents.append(createLinksFromList(list));
    });

  if (isHomePage) {
    document.querySelector("article form").addEventListener("submit", search);
  } else {
    const form = document.querySelector("#suggestion");
    if (form) {
      form.classList.remove("hidden");
      form.addEventListener("submit", addSuggestion);
    }
  }
}

function createLinksFromList(list) {
  const underscore = /_/g;
  const frag = document.createDocumentFragment();

  list.forEach((link) => {
    const text = link.replace("/article/", "").replace(underscore, " ");
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.innerText = text;
    frag.append(anchor);
  });

  return frag;
}

function showArticleContent() {
  const article = document.querySelector("main article");
  const template = document.querySelector("#content");
  const t = document.createElement('div');
  [...template.content.childNodes].forEach(c => t.appendChild(c));
  renderArticle(article, t.innerText);
  template.remove();
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
  article.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'prose lg:prose-lg';
  article.append(div);
  div.append(tpl.content.cloneNode(true));

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
