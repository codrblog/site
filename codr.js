function search() {
  const query = document.querySelector("#search").value;
  window.location.href = encodeURI(
    query.toLowerCase().trim().split(/\W/).filter(Boolean).join("_")
  );
}

function onLoad() {
  const article = document.querySelector("main article");
  article.innerHTML = "";
  article.append(document.querySelector("#content").content);

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
        const text = link.replace(underscore, " ");
        const li = document.createElement("li");
        const anchor = document.createElement("a");
        anchor.href = link;
        anchor.innerText = text;
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
