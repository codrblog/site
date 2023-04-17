function search(event) {
  event.preventDefault();
  const query = event.target.querySelector("input").value;

  window.location.href =
    "/article/" +
    encodeURI(query.toLowerCase().trim().split(/\W/).filter(Boolean).join("_"));
}

function addSuggestion(event) {
  event.preventDefault();
  const suggestion = document.querySelector("#suggestion input").value;
  fetch("/@suggestion" + location.pathname, {
    method: "POST",
    body: suggestion,
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
    anchor.className = "inline-block p-2";
    frag.append(anchor);
  });

  return frag;
}

function showArticleContent() {
  const article = document.querySelector("main article");
  const template = document.querySelector("#content");

  article.innerHTML = "";
  article.append(template.content);
  template.remove();

  const title = article.querySelector("h1");
  if (title) {
    window.title = title.textContent.trim();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onLoad);
} else {
  setTimeout(onLoad);
}
