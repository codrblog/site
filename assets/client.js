function onSearch(event) {
  event.preventDefault();
  const query = event.target.querySelector("input").value;
  window.location.href = getArticleUrl(query);
}

function getArticleUrl(text) {
  return (
    "/article/" +
    encodeURI(text.toLowerCase().trim().split(/\W/).filter(Boolean).join("_"))
  );
}

function onAddSuggestion(event) {
  event.preventDefault();
  const form = document.querySelector("#suggestion form");
  const suggestion = form.querySelector("input").value;

  form.innerHTML = "Thank you!";
  fetch("/@suggestion" + location.pathname, {
    method: "POST",
    body: suggestion,
  });
}

function onLoad() {
  document
    .querySelectorAll("#search")
    .forEach((f) => f.addEventListener("submit", onSearch));

  updatePrimaryColor();

  const isHomePage = location.pathname === "/";

  if (!isHomePage) {
    showSuggestionsForm();
    renderArticle();
  }
}

function updatePrimaryColor() {
  const colors = [
    "#F44336",
    "#E91E63",
    "#9C27B0",
    "#673AB7",
    "#3F51B5",
    "#2196F3",
    "#03A9F4",
    "#00BCD4",
    "#009688",
    "#4CAF50",
    "#8BC34A",
    "#CDDC39",
    "#FFC107",
    "#FF9800",
    "#FF5722",
    "#795548",
    "#607D8B",
  ];

  const index = 1 + (Math.floor(Math.random() * 1000) % colors.length) - 1;
  const color = colors[index];
  const style = document.createElement("style");
  style.textContent = ":root { --primary: " + color + "; }";
  document.head.appendChild(style);
}

function showSuggestionsForm() {
  const suggestions = document.querySelector("#suggestion");

  if (!suggestions) {
    return;
  }

  suggestions.classList.remove("hidden");
  suggestions.addEventListener("submit", onAddSuggestion);
}

async function renderArticle() {
  const article = document.querySelector("#content");
  const content = article.innerHTML;

  if (content.includes("<!-- html ready -->")) {
    return;
  }

  const response = await fetch("https://markdown.jsfn.run?html=1", {
    method: "POST",
    mode: "cors",
    body: content,
  });

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
  const tpl = document.createElement("template");
  tpl.innerHTML = content;
  tpl.content.querySelectorAll("script,style,link").forEach((t) => t.remove());
  article.innerHTML = "";
  article.classList.remove("whitespace-pre-wrap");
  article.append(tpl.content.cloneNode(true));
}

function updatePageTitle(article) {
  const title = article.querySelector("h1");
  if (title) {
    window.title = title.textContent.trim();
  }
}

function fixCodeBlocks(article) {
  [...article.querySelectorAll("code")].forEach((c) => {
    c.innerText = c.innerText.trim();
  });
}

function fixLinks(article) {
  [...article.querySelectorAll("a:not([href^=http])")].forEach((c) => {
    const href = c.getAttribute("href").replace("../", "");

    if (!href.startsWith("/article/")) {
      c.href = "/article/" + href;
    }
  });
}

function wrapTables(article) {
  [...article.querySelectorAll("table")].forEach((c) => {
    const wrapper = document.createElement("div");
    wrapper.className = "table";

    c.parentNode.insertBefore(wrapper, c);
    wrapper.appendChild(c);
  });
}

function linkHeadingsToArticles(article) {
  const ignoredTitles = [
    "example",
    "examples",
    "conclusion",
    "sources",
    "solution",
    "related links",
    "related content",
  ];
  [...article.querySelectorAll("h2, h3, h4, h5, h6")].forEach((heading) => {
    const text = heading.textContent.trim();

    if (ignoredTitles.includes(text.toLowerCase())) return;

    const link = document.createElement("a");
    link.href = getArticleUrl(text);
    link.innerText = text;
    link.title = "Read more about " + text;
    heading.innerHTML = "";
    heading.append(link);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onLoad);
} else {
  setTimeout(onLoad);
}
