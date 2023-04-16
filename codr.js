function search(event) {
  event.preventDefault();
  const query = event.target.querySelector("input").value;

  window.location.href = encodeURI(
    query.toLowerCase().trim().split(/\W/).filter(Boolean).join("_")
  );
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
      const recents = document.querySelector("aside ul");
      recents.append(createLinksFromList(list));
    });
}

function createLinksFromList(list) {
  const underscore = /_/g;
  const frag = document.createDocumentFragment();

  list.forEach((link) => {
    const text = link.slice(1).replace(underscore, " ");
    const li = document.createElement("li");
    const anchor = document.createElement("a");
    li.append(anchor);
    anchor.href = link;
    anchor.innerText = text;
    anchor.className =
      'class="block px-4 py-2 border border-blue-200 rounded hover:border-blue-300"';
    frag.append(li);
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
