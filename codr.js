function search() {
  const query = document.querySelector("#search").value;
  window.location.href = encodeURI(
    query.toLowerCase().trim().split(/\W/).filter(Boolean).join("_")
  );
}

function onLoad() {
  const article = document.querySelector("main article");
  article.innerHTML = "";
  const template = document.querySelector("#content")
  article.append(template.content);
  template.remove();

  const title = article.querySelector("h1");
  if (title) {
    window.title = title.textContent.trim();
  }

  document.querySelector("header form").addEventListener("submit", (event) => {
    event.preventDefault();
    search();
  });

  fetch("/@recents")
    .then((x) => x.json())
    .then((list) => {
      const recents = document.querySelector("aside ul");
      const underscore = /_/g;
      const frag = document.createDocumentFragment();

      list.forEach((link) => {
        const text = link.slice(1).replace(underscore, " ");
        const li = document.createElement("li");
        const anchor = document.createElement("a");
        li.append(anchor);
        anchor.href = link;
        anchor.innerText = text.slice(1);
        anchor.className = 'class="block px-4 py-2 border border-blue-200 rounded hover:border-blue-300"'
        frag.append(li);
      });

      recents.append(frag);
    });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", onLoad);
} else {
  setTimeout(onLoad);
}
